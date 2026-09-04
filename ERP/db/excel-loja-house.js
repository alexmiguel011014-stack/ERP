// Loader nativo do arquivo Loja House.xlsx: lê a planilha exportada pelo dono
// da loja e produz exatamente o shape de 8 arrays que
// `db/importacoes.js:executarImportacaoLojHouse` já consome quando recebe
// uma pasta com os 8 JSONs numerados (01_categorias.json, etc.) — ver
// GOALS.md, seção "1. Native Excel → JSON Parser". Não altera nada do motor
// de importação em si: este módulo só produz o mesmo `dados` que os JSONs
// já produziam.
//
// Escopo explícito: este parser conhece o layout de UMA planilha específica
// (blocos-matriz de produto/estoque lado a lado, uma aba "Financeiro
// Loja<MÊS>" por mês, uma aba "Valores" com tabelas de preço, etc.). Uma
// exportação de outra loja precisaria do próprio módulo, não de mudanças
// aqui dentro.
const fs = require("fs");
const crypto = require("crypto");
const XLSX = require("xlsx");

// 14 categorias reais da Loja House (mesma taxonomia de 01_categorias.json
// da migração original) — não derivadas do nome da aba: nome de aba não bate
// 1:1 com a categoria real (aba "Kimono Draken" -> categoria "Kimonos"; a
// aba "Rashcojuntos" sozinha contém produtos de 4 categorias diferentes).
const CATEGORIAS_LOJA_HOUSE = [
	{ nome: "Kimonos", pai: null },
	{ nome: "No Gi", pai: null },
	{ nome: "Conjuntos No Gi", pai: "No Gi" },
	{ nome: "Shorts No Gi", pai: "No Gi" },
	{ nome: "Rashguards", pai: "No Gi" },
	{ nome: "Camisas", pai: null },
	{ nome: "Faixas", pai: null },
	{ nome: "Acessórios", pai: null },
	{ nome: "Mochilas", pai: "Acessórios" },
	{ nome: "Protetores Bucais", pai: "Acessórios" },
	{ nome: "Agasalhos", pai: null },
	{ nome: "Corta-ventos", pai: "Agasalhos" },
	{ nome: "Moletons", pai: "Agasalhos" },
	{ nome: "Puffers", pai: "Agasalhos" },
];

// Marca de cada aba de kimono (nome da aba menos o prefixo "Kimono ").
const ABAS_KIMONO = [
	"Kimono Draken",
	"Kimono Integuard",
	"Kimono Brazil Combat",
];

// Abas cujos blocos viram produtos "Camisa X" (categoria fixa "Camisas") —
// mesmos produtos podem, em teoria, se repetir entre as duas abas, por isso
// são processadas com um único mapa de dedup compartilhado.
const ABAS_CAMISA = ["Camisas", "Coleção House"];

const ROTULOS_VALORES = [
	"MODELO",
	"MARCA",
	"TAMNHO", // erro de digitação real da planilha ("Tamnho"), não corrigir aqui
	"QUANTIDADE",
	"VALOR COMPRA",
	"VALOR VENDA",
	"TOTAL",
];

const ROTULOS_FINANCEIRO = ["DATA", "DESCRICAO", "ENTRADA", "SAIDA", "TOTAL"];
const ROTULOS_CREDIARIO = ["NOME", "DATA", "VALOR"];
const ROTULOS_CONTAS_PAGAR = ["DATA", "DESCRICAO", "VALOR"];
const ROTULOS_CUSTOS_FIXOS = ["DATA", "DESCRICAO", "VALOR"];
const ROTULOS_INVESTIMENTO = ["NOME DO ITEM", "VALOR"];

// ---------------------------------------------------------------------------
// Utilitários de célula/texto
// ---------------------------------------------------------------------------

function normalizarTexto(valor) {
	if (valor === null || valor === undefined) return "";
	return String(valor)
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "") // remove acentos (marcas diacríticas combinantes)
		.trim()
		.toUpperCase();
}

function celulaTexto(valor) {
	if (valor === null || valor === undefined) return null;
	const texto = String(valor).trim();
	return texto === "" ? null : texto;
}

function ehVazia(valor) {
	return celulaTexto(valor) === null;
}

// Confere se a linha tem, a partir de `coluna`, exatamente a sequência de
// rótulos esperada (já normalizados) — usado para achar cabeçalhos de bloco
// em qualquer posição da grade, sem assumir uma coluna fixa.
function linhaComecaCom(linha, coluna, rotulos) {
	for (let i = 0; i < rotulos.length; i++) {
		if (normalizarTexto((linha || [])[coluna + i]) !== rotulos[i]) return false;
	}
	return true;
}

// Varre toda a grade (todas as linhas x todas as colunas) procurando onde a
// sequência de rótulos aparece — cobre "múltiplos blocos por linha de
// cabeçalho, offset em colunas" sem precisar assumir posição fixa.
function encontrarCabecalhos(linhas, rotulos) {
	const achados = [];
	for (let r = 0; r < linhas.length; r++) {
		const linha = linhas[r] || [];
		for (let c = 0; c < linha.length; c++) {
			if (linhaComecaCom(linha, c, rotulos)) {
				achados.push({ linha: r, coluna: c });
			}
		}
	}
	return achados;
}

// Título do bloco: célula não-vazia na linha imediatamente acima do
// cabeçalho, na mesma coluna ou em alguma coluna dentro da largura do bloco
// (cobre título "mesclado" que o SheetJS só reporta na célula superior-
// esquerda da mesclagem, que pode não coincidir exatamente com a coluna do
// TAMANHO/MODELO).
function acharTitulo(linhas, linhaCabecalho, coluna, largura) {
	if (linhaCabecalho === 0) return null;
	const linhaAcima = linhas[linhaCabecalho - 1] || [];
	for (let i = 0; i < largura; i++) {
		const texto = celulaTexto(linhaAcima[coluna + i]);
		if (texto) return texto;
	}
	return null;
}

// Números vêm como texto (raw:false) e podem estar em formato brasileiro
// ("1.234,56") ou já com prefixo "R$ ". Também tolera formato já numérico
// (caso raw:true seja usado em algum ponto).
function paraNumero(valor) {
	if (valor === null || valor === undefined) return null;
	if (typeof valor === "number") return Number.isNaN(valor) ? null : valor;
	let texto = String(valor).trim();
	if (texto === "") return null;
	texto = texto.replace(/R\$\s*/gi, "").trim();
	if (texto === "") return null;
	if (/,\d{1,2}$/.test(texto)) {
		// vírgula decimal: remove separador de milhar (ponto) e troca vírgula por ponto
		texto = texto.replace(/\./g, "").replace(",", ".");
	} else {
		texto = texto.replace(/,/g, "");
	}
	const numero = Number(texto);
	return Number.isNaN(numero) ? null : numero;
}

// "R$558,80 à vista ou 3xR$210,90 no cartão" -> 558.80 — mesma regra de
// extração já aplicada na exportação original (99_pendencias.json /
// 02_produtos_variacoes.json vêm com o valor "à vista" já isolado).
function extrairValorAVista(texto) {
	if (!texto) return null;
	const match = String(texto).match(/R\$\s*([\d.,]+)\s*(?:à|a)\s*vista/i);
	if (!match) return paraNumero(texto);
	return paraNumero(match[1]);
}

// Aceita "DD/MM/AAAA", "DD-MM-AAAA" (com ano de 2 ou 4 dígitos) e "AAAA-MM-DD".
// Retorna null quando a célula está vazia ou não bate com nenhum formato
// conhecido — nunca lança, porque data ausente é o caso normal em várias
// abas (Crediário, Contas a Pagar, Custos Fixos).
function paraDataISO(valor) {
	const texto = celulaTexto(valor);
	if (!texto) return null;

	let m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
	if (m) {
		return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
	}

	m = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
	if (m) {
		let [, dia, mes, ano] = m;
		if (ano.length === 2) ano = `20${ano}`;
		return `${ano.padStart(4, "0")}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
	}

	return null;
}

// ---------------------------------------------------------------------------
// Chaves determinísticas (hash estável, não aleatório) — reprocessar o
// mesmo Excel duas vezes precisa gerar exatamente as mesmas chaves, para o
// dedup por chave_externa em db/importacoes.js:checarDuplicacao funcionar.
// ---------------------------------------------------------------------------

function hashChave(prefixo, ...partes) {
	const texto = partes
		.map((p) => (p === null || p === undefined ? "" : String(p)))
		.join("|");
	const hash = crypto
		.createHash("sha1")
		.update(texto)
		.digest("hex")
		.slice(0, 16);
	return `${prefixo}-${hash}`;
}

// SKU legível e determinístico: <abreviação da aba>-<tamanho>-<hash curto>.
// A planilha não traz SKU nenhum para essas linhas — é inteiramente
// inventado aqui, mas de forma estável (mesmo bloco/tamanho/cor sempre gera
// o mesmo SKU).
function gerarSku(nomeAba, titulo, tamanho, descricao, cor) {
	const hash = crypto
		.createHash("sha1")
		.update(
			[nomeAba, titulo, tamanho, descricao, cor].map((p) => p || "").join("|"),
		)
		.digest("hex")
		.slice(0, 10)
		.toUpperCase();
	const prefixoAba =
		normalizarTexto(nomeAba)
			.replace(/[^A-Z0-9]/g, "")
			.slice(0, 4) || "SKU";
	const tam =
		normalizarTexto(tamanho)
			.replace(/[^A-Z0-9]/g, "")
			.slice(0, 4) || "NA";
	return `${prefixoAba}-${tam}-${hash}`;
}

// Formato aceito por db/importacoes.js:importarPendencias — inclui as duas
// variantes de vocabulário que a função já entende (id/tipo/descricao E
// chave_externa/tipo_entidade/motivo_rejeicao/sugestao). A segunda é a que
// efetivamente fica gravada (tem prioridade nos `||` de importarPendencias);
// a primeira só existe para satisfazer validarStructura, que checa
// literalmente id/tipo/descricao no arquivo 99_pendencias.json.
function criarPendencia({
	tipo,
	partesChave,
	descricao,
	valor,
	motivo,
	sugestao,
}) {
	const chave = hashChave("PEND", tipo, ...partesChave);
	return {
		id: chave,
		tipo,
		descricao,
		chave_externa: chave,
		tipo_entidade: tipo,
		valor: valor ?? null,
		motivo_rejeicao: motivo,
		sugestao,
	};
}

// ---------------------------------------------------------------------------
// Categorias (taxonomia fixa, não derivada de nome de aba — ver
// CATEGORIAS_LOJA_HOUSE acima)
// ---------------------------------------------------------------------------

function construirCategorias() {
	const categorias = [];
	const chavePorNome = new Map();
	for (const c of CATEGORIAS_LOJA_HOUSE) {
		const chave = hashChave("CAT", c.nome);
		chavePorNome.set(c.nome, chave);
	}
	for (const c of CATEGORIAS_LOJA_HOUSE) {
		categorias.push({
			chave_externa: chavePorNome.get(c.nome),
			nome: c.nome,
			categoria_pai: c.pai,
		});
	}
	return categorias;
}

// ---------------------------------------------------------------------------
// Abas de produto/estoque (blocos-matriz lado a lado) — helpers genéricos
// ---------------------------------------------------------------------------

// Como encontrarCabecalhos, mas tolera até `folgaMax` colunas em branco entre
// o primeiro e o segundo rótulo — cobre o padrão real das abas de kimono,
// onde "TAMANHO"/"CORES" e "Quantidade" têm uma coluna vazia no meio
// (resquício de célula mesclada no Excel original: o layout visual tinha
// "TAMANHO" ocupando 2 colunas, mas só a primeira carrega o texto).
function encontrarCabecalhosComFolga(linhas, rotulo1, rotulo2, folgaMax) {
	const achados = [];
	for (let r = 0; r < linhas.length; r++) {
		const linha = linhas[r] || [];
		for (let c = 0; c < linha.length; c++) {
			if (normalizarTexto(linha[c]) !== rotulo1) continue;
			for (let folga = 0; folga <= folgaMax; folga++) {
				if (normalizarTexto(linha[c + 1 + folga]) === rotulo2) {
					achados.push({
						linha: r,
						coluna: c,
						colunaValor: c + 1 + folga,
						largura: folga + 2,
					});
					break;
				}
			}
		}
	}
	return achados;
}

// Bloco de rótulo único (kimono: tamanho ou cor) + quantidade, colunas dadas
// explicitamente (já resolvida a folga por encontrarCabecalhosComFolga).
function coletarDadosBlocoRotuloUnico(
	linhas,
	linhaCabecalho,
	colunaRotulo,
	colunaValor,
) {
	const dados = [];
	for (let r = linhaCabecalho + 1; r < linhas.length; r++) {
		const linha = linhas[r] || [];
		const rotulo = celulaTexto(linha[colunaRotulo]);
		const quantidadeBruta = linha[colunaValor];
		if (!rotulo && ehVazia(quantidadeBruta)) break; // linha em branco == fim do bloco
		const rotuloNorm = normalizarTexto(rotulo);
		if (rotuloNorm === "TOTAL" || rotuloNorm === "TOTAIS") break;
		if (!rotulo) continue;
		dados.push({ rotulo, quantidade: paraNumero(quantidadeBruta) ?? 0 });
	}
	return dados;
}

function coletarDadosBlocoTamanho(linhas, linhaCabecalho, coluna, largura) {
	const dados = [];
	for (let r = linhaCabecalho + 1; r < linhas.length; r++) {
		const linha = linhas[r] || [];
		const tamanho = celulaTexto(linha[coluna]);
		let descricao = null;
		let cor = null;
		let quantidadeBruta;

		if (largura === 4) {
			descricao = celulaTexto(linha[coluna + 1]);
			cor = celulaTexto(linha[coluna + 2]);
			quantidadeBruta = linha[coluna + 3];
		} else {
			quantidadeBruta = linha[coluna + 1];
		}

		const linhaVazia =
			!tamanho && !descricao && !cor && ehVazia(quantidadeBruta);
		if (linhaVazia) break; // linha em branco == fim do bloco

		const tamanhoNorm = normalizarTexto(tamanho);
		if (tamanhoNorm === "TOTAL" || tamanhoNorm === "TOTAIS") break; // linha de resumo, não é dado

		if (!tamanho) continue; // linha estranha sem tamanho no meio do bloco: ignora e segue

		dados.push({
			tamanho,
			descricao,
			cor,
			quantidade: paraNumero(quantidadeBruta) ?? 0,
		});
	}
	return dados;
}

function encontrarLinhaComTexto(linhas, regex) {
	for (let r = 0; r < linhas.length; r++) {
		const linha = linhas[r] || [];
		for (const celula of linha) {
			const texto = celulaTexto(celula);
			if (texto && regex.test(texto)) return r;
		}
	}
	return -1;
}

function capitalizarPalavra(palavra) {
	if (!palavra) return palavra;
	return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
}

// "AZUL P" -> {cor:"Azul", tamanho:"P"} (último token = tamanho, resto =
// cor); "Preta " sozinho (sem tamanho junto na mesma célula) ->
// {cor:"Preta", tamanho:null}. Usado só no bloco "Rashguard Brazil Combat",
// onde cor+tamanho às vezes vêm combinados numa única célula.
function dividirCorETamanho(texto) {
	if (!texto) return { cor: null, tamanho: null };
	const partes = texto.trim().split(/\s+/);
	if (partes.length === 1) {
		return { cor: capitalizarPalavra(partes[0]), tamanho: null };
	}
	const tamanho = partes[partes.length - 1];
	const cor = capitalizarPalavra(partes.slice(0, -1).join(" "));
	return { cor, tamanho };
}

function pendenciaVariacaoDuplicada(origem, nomeProduto, tamanho, cor) {
	return criarPendencia({
		tipo: "variacao_duplicada",
		partesChave: [origem, nomeProduto, tamanho, cor],
		descricao: `${nomeProduto} — tamanho ${tamanho || "-"} / cor ${cor || "-"} aparece mais de uma vez na planilha`,
		valor: null,
		motivo:
			"Mesma combinação tamanho+cor aparece em mais de um bloco/linha da planilha",
		sugestao: "Somar as quantidades ou descartar a repetição manualmente",
	});
}

// ---------------------------------------------------------------------------
// Abas "Kimono <Marca>" — blocos de 2 colunas com folga (TAMANHO/Quantidade),
// título indica público, cor e estilo (ex.: "KIMONOS ADULTOS - BRANCO
// LIGHT"). Cada combinação é um produto próprio e o tamanho é a variação:
// "Kimono adulto - Branco Light - Draken" com tamanhos P/M/G. Isso conserva
// a forma como o cadastro de produtos do ERP é usado pela Loja House. Também
// cobre o bloco de acessório embutido em "Kimono Brazil Combat" (Mochilas,
// colunas CORES/Quantidade).
// ---------------------------------------------------------------------------

const ESTILOS_KIMONO_CONHECIDOS = ["DRAGON", "LIGHT"];

function parseAbaKimono(linhas, nomeAba, saida) {
	const marca = nomeAba.replace(/^Kimono\s+/i, "").trim();
	const produtosPorNome = new Map(); // nome -> { chave, variacoes, vistos }

	function obterEntry(nomeProduto, detalhes) {
		let entry = produtosPorNome.get(nomeProduto);
		if (!entry) {
			entry = {
				chave: hashChave("PROD", nomeAba, nomeProduto),
				variacoes: [],
				vistos: new Set(),
				...detalhes,
			};
			produtosPorNome.set(nomeProduto, entry);
		}
		return entry;
	}

	function adicionarVariacao(
		entry,
		nomeProduto,
		tamanho,
		cor,
		quantidade,
		origemAba,
	) {
		const chaveDup = normalizarTexto(tamanho) + "|" + normalizarTexto(cor);
		if (entry.vistos.has(chaveDup)) {
			saida.pendenciasOrigem.push(
				pendenciaVariacaoDuplicada(origemAba, nomeProduto, tamanho, cor),
			);
			return;
		}
		entry.vistos.add(chaveDup);
		const varChave = hashChave("VAR", entry.chave, tamanho, cor);
		const sku = gerarSku(origemAba, nomeProduto, tamanho, null, cor);
		entry.variacoes.push({
			chave_externa: varChave,
			sku,
			tamanho: tamanho || null,
			cor: cor || null,
			preco: 0,
			preco_custo: 0,
			pronto_para_importacao: true,
		atributos: {
			marca: entry.marca,
			publico: entry.publico,
			linha: entry.estilo,
		},
		});
		saida.estoqueInicial.push({
			chave_externa: hashChave("EST", varChave),
			sku,
			produto: nomeProduto,
			quantidade_saldo: quantidade,
			custo_unitario: 0,
		});
	}

	// Blocos de kimono propriamente ditos.
	const blocosTamanho = encontrarCabecalhosComFolga(
		linhas,
		"TAMANHO",
		"QUANTIDADE",
		1,
	);
	for (const bloco of blocosTamanho) {
		const titulo = acharTitulo(
			linhas,
			bloco.linha,
			bloco.coluna,
			bloco.largura,
		);
		if (!titulo) continue;
		const tituloPublico = titulo.match(/^KIMONOS\s+(ADULTOS?|KIDS)\s*-?\s*/i);
		const publico = tituloPublico && /^KIDS$/i.test(tituloPublico[1])
			? "Kids"
			: "Adulto";
		const semPrefixo = titulo
			.replace(/^KIMONOS\s+(ADULTOS?|KIDS)\s*-?\s*/i, "")
			.trim();
		const tituloNorm = normalizarTexto(semPrefixo);
		const estilo =
			ESTILOS_KIMONO_CONHECIDOS.find((e) => tituloNorm.includes(e)) || "LIGHT";
		const cor = capitalizarPalavra(
			celulaTexto(semPrefixo.replace(new RegExp(estilo, "i"), "").trim()),
		);
		const descricaoModelo = cor
			? `${cor} ${capitalizarPalavra(estilo)}`
			: capitalizarPalavra(estilo);
		const nomeProduto = `Kimono ${publico.toLowerCase()} - ${descricaoModelo} - ${marca}`;

		const dados = coletarDadosBlocoRotuloUnico(
			linhas,
			bloco.linha,
			bloco.coluna,
			bloco.colunaValor,
		);
		if (dados.length === 0) continue;
		const entry = obterEntry(nomeProduto, {
			marca,
			publico,
			cor,
			estilo: capitalizarPalavra(estilo),
		});
		for (const linhaDado of dados) {
			adicionarVariacao(
				entry,
				nomeProduto,
				linhaDado.rotulo,
				cor,
				linhaDado.quantidade,
				nomeAba,
			);
		}
	}

	for (const [nomeProduto, entry] of produtosPorNome) {
		if (entry.variacoes.length === 0) continue;
		saida.produtosVariacoes.push({
			chave_externa: entry.chave,
			nome: nomeProduto,
			categoria: "Kimonos",
			marca: entry.marca,
			atributos_produto: {
				publico: entry.publico,
				cor: entry.cor,
				linha: entry.estilo,
				tamanhos: true,
			},
			pronto_para_importacao: true,
			variacoes: entry.variacoes,
		});
	}

	// Acessório embutido (ex.: "Mochilas" — colunas CORES/Quantidade, mesma
	// folga de coluna dos blocos de kimono).
	const blocosCores = encontrarCabecalhosComFolga(
		linhas,
		"CORES",
		"QUANTIDADE",
		1,
	);
	for (const bloco of blocosCores) {
		const tituloBruto = acharTitulo(
			linhas,
			bloco.linha,
			bloco.coluna,
			bloco.largura,
		);
		const nomeSingular = tituloBruto
			? tituloBruto.trim().replace(/s$/i, "")
			: "Acessório";
		const nomeProduto = `${nomeSingular} ${marca}`;
		const dados = coletarDadosBlocoRotuloUnico(
			linhas,
			bloco.linha,
			bloco.coluna,
			bloco.colunaValor,
		);
		if (dados.length === 0) continue;

		const produtoChave = hashChave("PROD", nomeAba, nomeProduto);
		const variacoes = [];
		const vistos = new Set();
		for (const linhaDado of dados) {
			const corNorm = normalizarTexto(linhaDado.rotulo);
			if (vistos.has(corNorm)) {
				saida.pendenciasOrigem.push(
					pendenciaVariacaoDuplicada(
						nomeAba,
						nomeProduto,
						null,
						linhaDado.rotulo,
					),
				);
				continue;
			}
			vistos.add(corNorm);
			const varChave = hashChave("VAR", produtoChave, linhaDado.rotulo);
			const sku = gerarSku(nomeAba, nomeProduto, null, null, linhaDado.rotulo);
			variacoes.push({
				chave_externa: varChave,
				sku,
				tamanho: null,
				cor: linhaDado.rotulo,
				preco: 0,
				preco_custo: 0,
				pronto_para_importacao: true,
				atributos: null,
			});
			saida.estoqueInicial.push({
				chave_externa: hashChave("EST", varChave),
				sku,
				produto: nomeProduto,
				quantidade_saldo: linhaDado.quantidade,
				custo_unitario: 0,
			});
		}
		if (variacoes.length === 0) continue;
		saida.produtosVariacoes.push({
			chave_externa: produtoChave,
			nome: nomeProduto,
			categoria: "Acessórios",
			pronto_para_importacao: true,
			variacoes,
		});
	}
}

// ---------------------------------------------------------------------------
// Abas "Camisas" / "Coleção House" — blocos de 4 colunas (TAMANHO/DESCRIÇÃO/
// COR/Quantidade), sempre adjacentes (sem folga). O texto do título do bloco
// às vezes vem no plural ("Camisas Over - Oss") mesmo indicando um único
// modelo — normalizado para singular ("Camisa Over - Oss"), igual a
// exportação original já fazia. O mesmo modelo pode se repetir em mais de um
// bloco/aba (cores diferentes) — blocos com o mesmo título normalizado são
// mesclados num único produto, não duplicados.
// ---------------------------------------------------------------------------

function normalizarNomeProdutoCamisa(tituloBruto) {
	return tituloBruto
		.trim()
		.replace(/\s+/g, " ")
		.replace(/^Camisas\b/i, "Camisa");
}

function parseAbaCamisa(linhas, nomeAba, produtosPorChaveNorm, saida) {
	const blocos4 = encontrarCabecalhos(linhas, [
		"TAMANHO",
		"DESCRICAO",
		"COR",
		"QUANTIDADE",
	]);

	for (const bloco of blocos4) {
		const tituloBruto = acharTitulo(linhas, bloco.linha, bloco.coluna, 4);
		if (!tituloBruto) continue;
		const nomeProduto = normalizarNomeProdutoCamisa(tituloBruto);
		const chaveNorm = normalizarTexto(nomeProduto);

		let entry = produtosPorChaveNorm.get(chaveNorm);
		if (!entry) {
			entry = {
				nome: nomeProduto,
				chave: hashChave("PROD", "Camisas", chaveNorm),
				variacoes: [],
				vistos: new Set(),
			};
			produtosPorChaveNorm.set(chaveNorm, entry);
		}

		const dados = coletarDadosBlocoTamanho(
			linhas,
			bloco.linha,
			bloco.coluna,
			4,
		);
		for (const linhaDado of dados) {
			const chaveDup =
				normalizarTexto(linhaDado.tamanho) +
				"|" +
				normalizarTexto(linhaDado.cor);
			if (entry.vistos.has(chaveDup)) {
				saida.pendenciasOrigem.push(
					pendenciaVariacaoDuplicada(
						nomeAba,
						nomeProduto,
						linhaDado.tamanho,
						linhaDado.cor,
					),
				);
				continue;
			}
			entry.vistos.add(chaveDup);

			const varChave = hashChave(
				"VAR",
				entry.chave,
				linhaDado.tamanho,
				linhaDado.cor,
			);
			const sku = gerarSku(
				nomeAba,
				nomeProduto,
				linhaDado.tamanho,
				linhaDado.descricao,
				linhaDado.cor,
			);
			entry.variacoes.push({
				chave_externa: varChave,
				sku,
				tamanho: linhaDado.tamanho || null,
				cor: linhaDado.cor || null,
				preco: 0,
				preco_custo: 0,
				pronto_para_importacao: true,
				atributos: linhaDado.descricao
					? { descricao: linhaDado.descricao }
					: null,
			});
			saida.estoqueInicial.push({
				chave_externa: hashChave("EST", varChave),
				sku,
				produto: nomeProduto,
				quantidade_saldo: linhaDado.quantidade,
				custo_unitario: 0,
			});
		}
	}
}

// ---------------------------------------------------------------------------
// Aba "Estoque faixa" — layout único (COR/Modalidade/Tamanho/Quantidade,
// sem folga). A planilha não informa a marca de cada linha. Para permitir o
// cadastro, cada cor vira um produto com a marca-padrão Draken; uma pendência
// explícita acompanha cada cor para o dono confirmar se alguma é Brazil
// Combat antes do uso definitivo.
// ---------------------------------------------------------------------------

function parseAbaEstoqueFaixa(linhas, saida) {
	const cabecalhos = encontrarCabecalhos(linhas, [
		"COR",
		"MODALIDADE",
		"TAMANHO",
		"QUANTIDADE",
	]);
	if (cabecalhos.length === 0) return;

	const marcaPadrao = "Draken";
	const produtosPorCor = new Map();

	function obterEntry(cor) {
		const corNome = capitalizarPalavra(cor);
		const nomeProduto = `Faixa ${corNome} ${marcaPadrao}`;
		let entry = produtosPorCor.get(normalizarTexto(cor));
		if (!entry) {
			entry = {
				cor: corNome,
				nome: nomeProduto,
				chave: hashChave("PROD", "Faixas", corNome, marcaPadrao),
				variacoes: [],
				vistos: new Set(),
			};
			produtosPorCor.set(normalizarTexto(cor), entry);
		}
		return entry;
	}

	for (const cab of cabecalhos) {
		for (let r = cab.linha + 1; r < linhas.length; r++) {
			const linha = linhas[r] || [];
			const cor = celulaTexto(linha[cab.coluna]);
			const tamanho = celulaTexto(linha[cab.coluna + 2]);
			const quantidadeBruta = linha[cab.coluna + 3];

			if (!cor && !tamanho && ehVazia(quantidadeBruta)) break;
			if (!cor && !tamanho) continue;

			const entry = obterEntry(cor);
			const chaveDup = normalizarTexto(tamanho);
			if (entry.vistos.has(chaveDup)) {
				saida.pendenciasOrigem.push(
					pendenciaVariacaoDuplicada(
						"Estoque faixa",
						entry.nome,
						tamanho,
						entry.cor,
					),
				);
				continue;
			}
			entry.vistos.add(chaveDup);

			const varChave = hashChave("VAR", entry.chave, entry.cor, tamanho);
			const sku = gerarSku(
				"Estoque faixa",
				entry.nome,
				tamanho,
				null,
				entry.cor,
			);
			entry.variacoes.push({
				chave_externa: varChave,
				sku,
				tamanho: tamanho || null,
				cor: entry.cor,
				preco: 0,
				preco_custo: 0,
				pronto_para_importacao: true,
				atributos: {
					marca: marcaPadrao,
					marca_inferida: true,
				},
			});
			saida.estoqueInicial.push({
				chave_externa: hashChave("EST", varChave),
				sku,
				produto: entry.nome,
				quantidade_saldo: paraNumero(quantidadeBruta) ?? 0,
				custo_unitario: 0,
			});
		}
	}

	for (const entry of produtosPorCor.values()) {
		if (entry.variacoes.length === 0) continue;
		saida.produtosVariacoes.push({
			chave_externa: entry.chave,
			nome: entry.nome,
			categoria: "Faixas",
			marca: marcaPadrao,
			marca_inferida: true,
			atributos_produto: {
				cor: entry.cor,
				marca: marcaPadrao,
				tamanhos: true,
			},
			pronto_para_importacao: true,
			variacoes: entry.variacoes,
		});
		saida.pendenciasOrigem.push(
			criarPendencia({
				tipo: "marca_faixa_inferida",
				partesChave: [entry.cor],
				descricao: `${entry.nome}: a planilha não informa se esta faixa é Draken ou Brazil Combat`,
				valor: null,
				motivo:
					"A coluna Modalidade está vazia e não há outra coluna de marca na aba Estoque faixa",
				sugestao:
					"Confirmar a marca; se for Brazil Combat, renomear o produto antes de usar o estoque",
			}),
		);
	}
}

// ---------------------------------------------------------------------------
// Aba "Rashcojuntos" — a mais irregular da planilha: 11 produtos de 4
// categorias diferentes, cada um numa região de linhas/colunas com
// semântica própria (mapeado à mão contra a saída original já conhecida
// correta, ver GOALS.md seção 1 e o histórico desta sessão — não é
// heurística genérica, é conhecimento específico desta aba).
// ---------------------------------------------------------------------------

function parseAbaRashcojuntos(linhas, saida) {
	const produtosPorNome = new Map(); // nome -> { chave, categoria, variacoes, vistos }

	function obterEntry(nomeProduto, categoria) {
		let entry = produtosPorNome.get(nomeProduto);
		if (!entry) {
			entry = {
				chave: hashChave("PROD", "Rashcojuntos", nomeProduto),
				categoria,
				variacoes: [],
				vistos: new Set(),
			};
			produtosPorNome.set(nomeProduto, entry);
		}
		return entry;
	}

	function adicionarVariacao(
		entry,
		nomeProduto,
		tamanho,
		cor,
		quantidade,
		escopo,
	) {
		// `escopo` distingue ocorrências que legitimamente repetem o mesmo
		// tamanho+cor em blocos físicos diferentes da planilha (ex.: bloco
		// ADULTO e bloco KIDS de "RASH NO GI - EQUIPE" usam os mesmos rótulos
		// de tamanho — "P", "M", "G" — para itens realmente distintos; sem
		// `escopo` o segundo bloco seria descartado como "duplicata").
		const chaveDup =
			normalizarTexto(tamanho) +
			"|" +
			normalizarTexto(cor) +
			"|" +
			(escopo || "");
		if (entry.vistos.has(chaveDup)) {
			saida.pendenciasOrigem.push(
				pendenciaVariacaoDuplicada("Rashcojuntos", nomeProduto, tamanho, cor),
			);
			return;
		}
		entry.vistos.add(chaveDup);
		// `escopo` entra na chave/sku pelo mesmo motivo que entra no dedup
		// acima: duas variações com tamanho+cor idênticos mas de blocos
		// físicos diferentes (Adulto/Kids) são itens distintos e não podem
		// compartilhar chave_externa/sku (violaria a UNIQUE de Variacoes.sku).
		const varChave = hashChave("VAR", entry.chave, tamanho, cor, escopo);
		const sku = gerarSku("Rashcojuntos", nomeProduto, tamanho, escopo, cor);
		entry.variacoes.push({
			chave_externa: varChave,
			sku,
			tamanho: tamanho || null,
			cor: cor || null,
			preco: 0,
			preco_custo: 0,
			pronto_para_importacao: true,
			atributos: null,
		});
		saida.estoqueInicial.push({
			chave_externa: hashChave("EST", varChave),
			sku,
			produto: nomeProduto,
			quantidade_saldo: quantidade,
			custo_unitario: 0,
		});
	}

	// --- Regiões "RASH NO GI - ADULTO/KIDS EQUIPE": 4 colunas de produto
	// lado a lado (Conjunto/Shorts/Blusa Manga Curta/Blusa Manga Longa),
	// tamanho na 1ª coluna. Célula vazia numa coluna-produto = esse produto
	// não existe nesse tamanho (não é dado, não vira variação com qtd 0).
	const blocosEquipe = encontrarCabecalhos(linhas, [
		"TAMANHO",
		"DESCRICAO",
		"CONJUNTO",
		"SHORTS",
	]);
	for (const bloco of blocosEquipe) {
		for (let r = bloco.linha + 1; r < linhas.length; r++) {
			const linha = linhas[r] || [];
			const tamanho = celulaTexto(linha[bloco.coluna]);
			const quantConjunto = linha[bloco.coluna + 2];
			const quantShort = linha[bloco.coluna + 3];
			const quantBlusaCurta = linha[bloco.coluna + 4];
			const quantBlusaLonga = linha[bloco.coluna + 5];

			const linhaVazia =
				!tamanho &&
				ehVazia(quantConjunto) &&
				ehVazia(quantShort) &&
				ehVazia(quantBlusaCurta) &&
				ehVazia(quantBlusaLonga);
			if (linhaVazia) break;
			if (!tamanho) continue;

			const colunasProduto = [
				{ valor: quantConjunto, nome: "Conjunto No Gi Equipe" },
				{ valor: quantShort, nome: "Short No Gi Equipe" },
				{ valor: quantBlusaCurta, nome: "Blusa No Gi Manga Curta Equipe" },
				{ valor: quantBlusaLonga, nome: "Blusa No Gi Manga Longa Equipe" },
			];
			for (const col of colunasProduto) {
				const qtd = paraNumero(col.valor);
				if (qtd === null) continue; // célula vazia: produto não existe nesse tamanho
				const entry = obterEntry(col.nome, "No Gi");
				// escopo = coluna do bloco: distingue o bloco ADULTO do bloco
				// KIDS, que reaproveitam os mesmos rótulos de tamanho.
				adicionarVariacao(
					entry,
					col.nome,
					tamanho,
					null,
					qtd,
					String(bloco.coluna),
				);
			}
		}
	}

	// --- Região "CONJUNTO NO GI - Brazil Combat": col0 = nome do item por
	// prefixo textual ("Short "/"Conjunto "), col1 = tamanho, col2 = qtd.
	const linhaTituloBC = encontrarLinhaComTexto(
		linhas,
		/CONJUNTO NO GI.*BRAZIL COMBAT/i,
	);
	if (linhaTituloBC !== -1) {
		for (let r = linhaTituloBC + 2; r < linhas.length; r++) {
			const linha = linhas[r] || [];
			const itemTexto = celulaTexto(linha[0]);
			const tamanho = celulaTexto(linha[1]);
			const quantidadeBruta = linha[2];
			if (!itemTexto && !tamanho && ehVazia(quantidadeBruta)) break;
			if (!itemTexto) continue;

			// col0 é "<Short|Conjunto> <Cor>" (ex.: "Short Azul", "Conjunto
			// Roxo") — a cor faz parte da identidade da variação (dois
			// "Short" de cores diferentes não são a mesma peça), não pode ser
			// descartada, senão duas linhas de cores diferentes mas mesmo
			// tamanho colidem como falsa duplicata.
			const prefixoMatch = itemTexto.match(/^(short|conjunto)\s*(.*)$/i);
			const nomeProduto = /^short/i.test(itemTexto)
				? "Short No Gi Brazil Combat"
				: "Conjunto No Gi Brazil Combat";
			const cor = prefixoMatch ? celulaTexto(prefixoMatch[2]) : null;
			const entry = obterEntry(nomeProduto, "No Gi");
			adicionarVariacao(
				entry,
				nomeProduto,
				tamanho,
				cor,
				paraNumero(quantidadeBruta) ?? 0,
			);
		}
	}

	// --- Região "RASHGUARD - BRAZIL COMBAT": repete-se várias vezes na
	// mesma aba (uma cor por ocorrência) — cor+tamanho às vezes combinados
	// numa célula só ("AZUL P"), às vezes em colunas separadas.
	const nomeRashguard = "Rashguard Brazil Combat";
	const entryRashguard = obterEntry(nomeRashguard, "No Gi");
	for (let r = 0; r < linhas.length; r++) {
		const linha = linhas[r] || [];
		for (let c = 0; c < linha.length; c++) {
			if (normalizarTexto(linha[c]) !== "TAMANHO") continue;
			if (normalizarTexto(linha[c + 1]) !== "DESCRICAO") continue;
			if (normalizarTexto(linha[c + 2]) !== "QUANTIDADE") continue;
			const tituloAcima = acharTitulo(linhas, r, c, 3);
			if (!tituloAcima || !/RASHGUARD/i.test(tituloAcima)) continue;

			for (let dr = r + 1; dr < linhas.length; dr++) {
				const linhaDado = linhas[dr] || [];
				const col0 = celulaTexto(linhaDado[c]);
				const col1 = celulaTexto(linhaDado[c + 1]);
				const quantidadeBruta = linhaDado[c + 2];
				if (!col0 && !col1 && ehVazia(quantidadeBruta)) break;
				if (!col0) continue;

				let cor, tamanho;
				if (col1) {
					cor = col0;
					tamanho = col1;
				} else {
					({ cor, tamanho } = dividirCorETamanho(col0));
				}
				adicionarVariacao(
					entryRashguard,
					nomeRashguard,
					tamanho,
					cor,
					paraNumero(quantidadeBruta) ?? 0,
				);
			}
		}
	}

	// --- Mini-tabelas de produto único (cor na 1ª coluna, tamanho na 2ª —
	// exceto Protetor Bucal, que não tem tamanho: coluna do meio é
	// DESCRIÇÃO, sempre vazia).
	const MINI_TABELAS = [
		{
			regex: /^CORTA VENTO$/i,
			nome: "Corta Vento",
			categoria: "Agasalhos",
			temTamanho: true,
		},
		{
			regex: /^MOLETOM$/i,
			nome: "Moletom",
			categoria: "Agasalhos",
			temTamanho: true,
		},
		{
			regex: /^PAFFER$/i,
			nome: "Puffer",
			categoria: "Agasalhos",
			temTamanho: true,
		},
		{
			regex: /^Protetor Bucal$/i,
			nome: "Protetor Bucal",
			categoria: "Acessórios",
			temTamanho: false,
		},
	];

	for (const config of MINI_TABELAS) {
		const linhaTitulo = encontrarLinhaComTexto(linhas, config.regex);
		if (linhaTitulo === -1) continue;
		const colunaTitulo = (linhas[linhaTitulo] || []).findIndex((c) =>
			config.regex.test(celulaTexto(c) || ""),
		);
		if (colunaTitulo === -1) continue;

		const entry = obterEntry(config.nome, config.categoria);
		for (let r = linhaTitulo + 2; r < linhas.length; r++) {
			const linhaDado = linhas[r] || [];
			const cor = celulaTexto(linhaDado[colunaTitulo]);
			const tamanho = config.temTamanho
				? celulaTexto(linhaDado[colunaTitulo + 1])
				: null;
			const quantidadeBruta = linhaDado[colunaTitulo + 2];
			if (!cor && !tamanho && ehVazia(quantidadeBruta)) break;
			if (!cor) continue;
			adicionarVariacao(
				entry,
				config.nome,
				tamanho,
				cor,
				paraNumero(quantidadeBruta) ?? 0,
			);
		}
	}

	for (const [nomeProduto, entry] of produtosPorNome) {
		if (entry.variacoes.length === 0) continue;
		saida.produtosVariacoes.push({
			chave_externa: entry.chave,
			nome: nomeProduto,
			categoria: entry.categoria,
			pronto_para_importacao: true,
			variacoes: entry.variacoes,
		});
	}
}

// ---------------------------------------------------------------------------
// Aba "Valores" (4 tabelas de preço) — usada para preencher preco/preco_custo
// dos produtos já montados acima.
// ---------------------------------------------------------------------------

function parseAbaValores(linhas) {
	const cabecalhos = encontrarCabecalhos(linhas, ROTULOS_VALORES);
	const precos = [];

	for (const cab of cabecalhos) {
		for (let r = cab.linha + 1; r < linhas.length; r++) {
			const linha = linhas[r] || [];
			const modelo = celulaTexto(linha[cab.coluna]);
			const marca = celulaTexto(linha[cab.coluna + 1]);
			const tamanho = celulaTexto(linha[cab.coluna + 2]);
			const quantidadeBruta = linha[cab.coluna + 3];
			const valorCompraBruto = linha[cab.coluna + 4];
			const valorVendaBruto = linha[cab.coluna + 5];

			const linhaVazia =
				!modelo &&
				!marca &&
				ehVazia(quantidadeBruta) &&
				ehVazia(valorCompraBruto) &&
				ehVazia(valorVendaBruto);
			if (linhaVazia) break;
			if (normalizarTexto(modelo) === "TOTAL") break;
			if (!modelo) continue;

			precos.push({
				modelo,
				marca,
				tamanho,
				quantidade: paraNumero(quantidadeBruta),
				valorCompra: paraNumero(valorCompraBruto),
				valorVenda: extrairValorAVista(valorVendaBruto),
			});
		}
	}

	return precos;
}

// Só aplica um preço quando existe correspondência de modelo (nome do
// produto contém o modelo da tabela de preço, ou vice-versa) E o tamanho da
// linha de preço bate com o da variação (ou a linha de preço não tem
// tamanho, ou seja, vale para todos). Sem essa dupla checagem um tamanho
// sem preço próprio (ex.: "G" sem linha em Valores) herdaria por engano o
// preço de outro tamanho do mesmo modelo.
function aplicarPrecos(produtosVariacoes, precos) {
	for (const produto of produtosVariacoes) {
		const nomeNorm = normalizarTexto(produto.nome);
		const candidatos = precos.filter((p) => {
			const modeloNorm = normalizarTexto(p.modelo);
			const palavrasModelo = modeloNorm
				.split(/\s+/)
				.filter((palavra) => palavra.length >= 3);
			const palavrasNome = new Set(nomeNorm.split(/\s+/));
			return (
				modeloNorm &&
				(nomeNorm.includes(modeloNorm) ||
					modeloNorm.includes(nomeNorm) ||
					palavrasModelo.length > 0 &&
						palavrasModelo.every((palavra) => palavrasNome.has(palavra)))
			);
		});
		if (candidatos.length === 0) continue;

		for (const variacao of produto.variacoes) {
			const candidato = candidatos.find(
				(p) =>
					!p.tamanho ||
					normalizarTexto(p.tamanho) === normalizarTexto(variacao.tamanho),
			);
			if (!candidato) continue;
			if (candidato.valorVenda != null) variacao.preco = candidato.valorVenda;
			if (candidato.valorCompra != null)
				variacao.preco_custo = candidato.valorCompra;
		}
	}
}

// ---------------------------------------------------------------------------
// Abas "Financeiro Loja<MÊS>" (9 abas, JANEIRO–SETEMBRO)
// ---------------------------------------------------------------------------

function parseAbaFinanceiroMes(linhas, nomeAba, financeiroHistorico) {
	const cabecalhos = encontrarCabecalhos(linhas, ROTULOS_FINANCEIRO);

	for (const cab of cabecalhos) {
		for (let r = cab.linha + 1; r < linhas.length; r++) {
			const linha = linhas[r] || [];
			const dataBruta = linha[cab.coluna];
			const descricao = celulaTexto(linha[cab.coluna + 1]);
			const entradaBruta = linha[cab.coluna + 2];
			const saidaBruta = linha[cab.coluna + 3];
			// coluna TOTAL (cab.coluna + 4) é corrida/acumulada — nunca lida

			const linhaVazia =
				ehVazia(dataBruta) &&
				!descricao &&
				ehVazia(entradaBruta) &&
				ehVazia(saidaBruta);
			if (linhaVazia) break;

			if (normalizarTexto(descricao) === "SALDO ANTERIOR") continue; // acumulado, não é transação

			const dataISO = paraDataISO(dataBruta);
			// Linha sem data usável: confirmado contra a exportação original
			// (0 das 264 transações corretas ficam sem data_vencimento) que
			// isso nunca é uma transação real nova — é o mesmo lançamento
			// reaparecendo sem data no fim de um mês, já corretamente contado
			// com data no início do mês seguinte (cópia de virada de mês para
			// manter o saldo corrido visível na planilha), não um dado
			// genuinamente ausente.
			if (!dataISO) continue;
			const valorEntrada = paraNumero(entradaBruta);
			const valorSaida = paraNumero(saidaBruta);
			const descricaoFinal = descricao || "(sem descrição)";

			if (valorEntrada) {
				financeiroHistorico.push({
					chave_externa: hashChave("FIN", nomeAba, r, "receber"),
					tipo: "receber",
					descricao: descricaoFinal,
					valor: valorEntrada,
					data_vencimento: dataISO,
					data_pagamento: dataISO,
					status: "pago",
				});
			}
			if (valorSaida) {
				financeiroHistorico.push({
					chave_externa: hashChave("FIN", nomeAba, r, "pagar"),
					tipo: "pagar",
					descricao: descricaoFinal,
					valor: valorSaida,
					data_vencimento: dataISO,
					data_pagamento: dataISO,
					status: "pago",
				});
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Abas que viram pendência (Crediário, Contas a Pagar, Custos Fixos +
// Investimento Loja, Consignado, analise2025)
// ---------------------------------------------------------------------------

function parseAbaCrediario(linhas, pendencias) {
	const cabecalhos = encontrarCabecalhos(linhas, ROTULOS_CREDIARIO);
	for (const cab of cabecalhos) {
		for (let r = cab.linha + 1; r < linhas.length; r++) {
			const linha = linhas[r] || [];
			const nome = celulaTexto(linha[cab.coluna]);
			const dataBruta = linha[cab.coluna + 1];
			const valorBruto = linha[cab.coluna + 2];

			if (!nome && ehVazia(dataBruta) && ehVazia(valorBruto)) break;
			if (!nome) continue;

			const valor = paraNumero(valorBruto);
			pendencias.push(
				criarPendencia({
					tipo: "crediario_sem_produto_identificavel",
					partesChave: ["Crediario", r, nome],
					descricao: `${nome} — valor: ${valor != null ? valor : "não informado"}`,
					valor,
					motivo:
						"Lançamento de Crediário sem SKU/produto identificável (planilha não relaciona a um item do estoque)",
					sugestao:
						"Revisar manualmente e vincular a um cliente/produto do ERP",
				}),
			);
		}
	}
}

function parseAbaContasPagar(linhas, contasAbertas, pendencias) {
	const cabecalhos = encontrarCabecalhos(linhas, ROTULOS_CONTAS_PAGAR);
	for (const cab of cabecalhos) {
		for (let r = cab.linha + 1; r < linhas.length; r++) {
			const linha = linhas[r] || [];
			const dataBruta = linha[cab.coluna];
			const descricao = celulaTexto(linha[cab.coluna + 1]);
			const valorBruto = linha[cab.coluna + 2];

			if (ehVazia(dataBruta) && !descricao && ehVazia(valorBruto)) break;
			if (!descricao) continue;

			const valor = paraNumero(valorBruto);
			const dataISO = paraDataISO(dataBruta);

			if (dataISO) {
				contasAbertas.push({
					chave_externa: hashChave("FIN", "ContasAPagar", r, descricao),
					tipo: "pagar",
					descricao,
					valor,
					data_vencimento: dataISO,
					data_pagamento: null,
					status: "aberto",
				});
			} else {
				pendencias.push(
					criarPendencia({
						tipo: "conta_a_pagar_sem_data",
						partesChave: ["ContasAPagar", r, descricao],
						descricao: `${descricao} — valor: ${valor != null ? valor : "não informado"}`,
						valor,
						motivo: "Conta a pagar sem data de vencimento na planilha",
						sugestao: "Informar a data de vencimento e reimportar",
					}),
				);
			}
		}
	}
}

function parseAbaCustosFixos(linhas, pendencias) {
	// Bloco principal (Data/Descrição/Valor) — sempre pendência: mesmo quando
	// a coluna Data existe, os dados reais não trazem valor usável nela (ver
	// GOALS.md, seção 1) — diferente de Contas a Pagar, aqui não há um
	// caminho "com data vira lançamento normal".
	const cabecalhosPrincipal = encontrarCabecalhos(linhas, ROTULOS_CUSTOS_FIXOS);
	for (const cab of cabecalhosPrincipal) {
		for (let r = cab.linha + 1; r < linhas.length; r++) {
			const linha = linhas[r] || [];
			const dataBruta = linha[cab.coluna];
			const descricao = celulaTexto(linha[cab.coluna + 1]);
			const valorBruto = linha[cab.coluna + 2];

			if (ehVazia(dataBruta) && !descricao && ehVazia(valorBruto)) break;
			if (!descricao) continue;

			const valor = paraNumero(valorBruto);
			pendencias.push(
				criarPendencia({
					tipo: "custo_fixo_sem_mes_ano",
					partesChave: ["CustosFixos", r, descricao],
					descricao: `${descricao} — valor: ${valor != null ? valor : "não informado"}`,
					valor,
					motivo: "Custo fixo sem mês/ano de referência usável na planilha",
					sugestao: "Informar o mês/ano de referência e lançar manualmente",
				}),
			);
		}
	}

	// Bloco lateral "Investimento Loja" (Nome do item/Valor, sem coluna de
	// data nenhuma) — sempre pendência.
	const cabecalhosInvestimento = encontrarCabecalhos(
		linhas,
		ROTULOS_INVESTIMENTO,
	);
	for (const cab of cabecalhosInvestimento) {
		for (let r = cab.linha + 1; r < linhas.length; r++) {
			const linha = linhas[r] || [];
			const nome = celulaTexto(linha[cab.coluna]);
			const valorBruto = linha[cab.coluna + 1];

			if (!nome && ehVazia(valorBruto)) break;
			if (!nome) continue;

			const valor = paraNumero(valorBruto);
			pendencias.push(
				criarPendencia({
					tipo: "investimento_sem_data",
					partesChave: ["InvestimentoLoja", r, nome],
					descricao: `${nome} — valor: ${valor != null ? valor : "não informado"}`,
					valor,
					motivo: "Investimento (capex) sem data de aquisição na planilha",
					sugestao: "Informar a data e lançar como categoria Investimento",
				}),
			);
		}
	}
}

function parseAbaConsignado(linhas, pendencias) {
	for (let r = 0; r < linhas.length; r++) {
		const linha = linhas[r] || [];
		const celulas = linha.map((c) => celulaTexto(c)).filter(Boolean);
		if (celulas.length === 0) continue;
		if (celulas.length === 1 && normalizarTexto(celulas[0]) === "CONSIGNADO")
			continue; // título da aba

		const textoLinha = celulas.join(" — ");
		pendencias.push(
			criarPendencia({
				tipo: "consignacao_sem_modelo_no_erp",
				partesChave: ["Consignado", r],
				descricao: textoLinha,
				valor: null,
				motivo:
					"Texto livre não permite identificar modelos/SKUs do ERP automaticamente",
				sugestao:
					"Cadastrar a consignação manualmente após identificar os itens com o dono",
			}),
		);
	}
}

function parseAbaAnalise(linhas, pendencias) {
	const linhasComConteudo = linhas.filter((linha) =>
		(linha || []).some((c) => !ehVazia(c)),
	);
	if (linhasComConteudo.length === 0) return;

	pendencias.push(
		criarPendencia({
			tipo: "resumo_analitico_nao_transacional",
			partesChave: ["analise2025"],
			descricao: `Aba "analise2025" contém relatório de análise/repasse (${linhasComConteudo.length} linha(s) com conteúdo) — não é dado transacional bruto`,
			valor: null,
			motivo:
				"Conteúdo é um relatório analítico/repasse, não um dado transacional linha-a-linha",
			sugestao:
				"Revisar manualmente; não é importável como categoria/produto/financeiro",
		}),
	);
}

// ---------------------------------------------------------------------------

function lerAba(workbook, nomeAba) {
	const planilha = workbook.Sheets[nomeAba];
	if (!planilha) return [];
	return XLSX.utils.sheet_to_json(planilha, {
		header: 1,
		raw: false,
		defval: null,
	});
}

function parseExcelLojaHouse(caminhoXlsx) {
	if (!caminhoXlsx || !fs.existsSync(caminhoXlsx)) {
		throw new Error("Arquivo Excel não encontrado: " + caminhoXlsx);
	}

	const workbook = XLSX.readFile(caminhoXlsx);

	const categorias = construirCategorias();
	const produtosVariacoes = [];
	const estoqueInicial = [];
	const financeiroHistorico = [];
	const contasAbertas = [];
	const pendenciasOrigem = [];
	const saidaProduto = { produtosVariacoes, estoqueInicial, pendenciasOrigem };

	for (const nomeAba of ABAS_KIMONO) {
		if (!workbook.SheetNames.includes(nomeAba)) continue;
		parseAbaKimono(lerAba(workbook, nomeAba), nomeAba, saidaProduto);
	}

	const produtosCamisaPorChaveNorm = new Map();
	for (const nomeAba of ABAS_CAMISA) {
		if (!workbook.SheetNames.includes(nomeAba)) continue;
		parseAbaCamisa(
			lerAba(workbook, nomeAba),
			nomeAba,
			produtosCamisaPorChaveNorm,
			saidaProduto,
		);
	}
	for (const entry of produtosCamisaPorChaveNorm.values()) {
		if (entry.variacoes.length === 0) continue;
		produtosVariacoes.push({
			chave_externa: entry.chave,
			nome: entry.nome,
			categoria: "Camisas",
			pronto_para_importacao: true,
			variacoes: entry.variacoes,
		});
	}

	if (workbook.SheetNames.includes("Estoque faixa")) {
		parseAbaEstoqueFaixa(lerAba(workbook, "Estoque faixa"), saidaProduto);
	}

	if (workbook.SheetNames.includes("Rashcojuntos")) {
		parseAbaRashcojuntos(lerAba(workbook, "Rashcojuntos"), saidaProduto);
	}

	if (workbook.SheetNames.includes("Valores")) {
		const precos = parseAbaValores(lerAba(workbook, "Valores"));
		aplicarPrecos(produtosVariacoes, precos);
	}

	for (const nomeAba of workbook.SheetNames) {
		if (/^financeiro\s*loja/i.test(nomeAba)) {
			parseAbaFinanceiroMes(
				lerAba(workbook, nomeAba),
				nomeAba,
				financeiroHistorico,
			);
		}
	}

	if (workbook.SheetNames.includes("Crediário")) {
		parseAbaCrediario(lerAba(workbook, "Crediário"), pendenciasOrigem);
	}
	if (workbook.SheetNames.includes("Contas a Pagar")) {
		parseAbaContasPagar(
			lerAba(workbook, "Contas a Pagar"),
			contasAbertas,
			pendenciasOrigem,
		);
	}
	if (workbook.SheetNames.includes("Custos Fixos")) {
		parseAbaCustosFixos(lerAba(workbook, "Custos Fixos"), pendenciasOrigem);
	}
	if (workbook.SheetNames.includes("Consignado")) {
		parseAbaConsignado(lerAba(workbook, "Consignado"), pendenciasOrigem);
	}
	if (workbook.SheetNames.includes("analise2025")) {
		parseAbaAnalise(lerAba(workbook, "analise2025"), pendenciasOrigem);
	}

	return {
		categorias,
		produtosVariacoes,
		estoqueInicial,
		// Não há aba de clientes cadastrados na planilha — nenhum dado
		// diretamente identificável como cliente foi encontrado.
		clientes: [],
		financeiroHistorico,
		contasAbertas,
		// Sem dado pronto para isso ainda (mesma decisão já documentada para
		// 07_vendas_historicas.json — ver db/importacoes.js).
		vendasHistoricas: [],
		pendenciasOrigem,
	};
}

module.exports = {
	parseExcelLojaHouse,
	// Exportados só para teste unitário direto dos helpers puros.
	paraNumero,
	extrairValorAVista,
	paraDataISO,
	hashChave,
	gerarSku,
	normalizarTexto,
};
