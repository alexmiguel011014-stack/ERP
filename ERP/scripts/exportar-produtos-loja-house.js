/*
 * Reorganiza SOMENTE os dados de produto da pasta de migração Loja House,
 * sem tocar na pasta de origem. A saída é uma cópia completa e independente:
 * - Kimono: um produto por público + cor + linha + marca; tamanhos são variações.
 * - Faixa: um produto por cor; a marca Draken é provisória e fica registrada.
 *
 * Uso:
 * node scripts/exportar-produtos-loja-house.js --fonte <pasta-json-atual> --destino <nova-pasta>
 */
const fs = require("fs");
const path = require("path");
const { hashChave } = require("../db/excel-loja-house");

function lerArgumento(nome) {
	const indice = process.argv.indexOf(nome);
	return indice >= 0 ? process.argv[indice + 1] : null;
}

function lerJson(caminho) {
	return JSON.parse(fs.readFileSync(caminho, "utf8"));
}

function escreverJson(caminho, valor) {
	fs.writeFileSync(caminho, `${JSON.stringify(valor, null, 2)}\n`, "utf8");
}

function copiar(valor) {
	return JSON.parse(JSON.stringify(valor));
}

function capitalizar(valor) {
	if (!valor) return null;
	const texto = String(valor).trim();
	return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

function atributo(variacao, nome) {
	if (Array.isArray(variacao.atributos)) {
		return variacao.atributos.find((item) => item.chave === nome)?.valor || null;
	}
	return variacao.atributos?.[nome.toLowerCase()] || null;
}

function definirAtributo(variacao, chave, valor) {
	if (!Array.isArray(variacao.atributos)) variacao.atributos = [];
	const existente = variacao.atributos.find((item) => item.chave === chave);
	if (existente) existente.valor = valor;
	else variacao.atributos.push({ chave, valor });
}

function detalhesKimono(produto, variacao) {
	const marca = atributo(variacao, "Marca") || produto.marca;
	const linha = atributo(variacao, "Linha");
	const publico = atributo(variacao, "Publico");
	const cor = atributo(variacao, "Cor") || variacao.cor;
	if (!marca || !linha || !publico || !cor) return null;

	return {
		marca: String(marca).trim(),
		linha: capitalizar(linha),
		publico: capitalizar(publico),
		cor: capitalizar(cor),
	};
}

function nomeKimono({ marca, linha, publico, cor }) {
	return `Kimono ${publico.toLowerCase()} - ${cor} ${linha} - ${marca}`;
}

function nomeFaixa(cor) {
	return `Faixa ${capitalizar(cor)} Draken`;
}

function chaveProdutoRevisado(tipo, ...partes) {
	return hashChave("PROD", "revisao-produtos", tipo, ...partes);
}

function reorganizarProdutos(produtos) {
	const resultado = [];
	const grupos = new Map();
	const produtoPorSku = new Map();

	function obterGrupo(chave, criar) {
		let grupo = grupos.get(chave);
		if (!grupo) {
			grupo = criar();
			grupos.set(chave, grupo);
			resultado.push(grupo);
		}
		return grupo;
	}

	for (const produtoOriginal of produtos) {
		const produto = copiar(produtoOriginal);
		if (/^Kimono\b/i.test(produto.nome)) {
			for (const variacaoOriginal of produto.variacoes || []) {
				const variacao = copiar(variacaoOriginal);
				const detalhes = detalhesKimono(produto, variacao);
				if (!detalhes) {
					throw new Error(
						`Kimono sem marca, linha, público ou cor: SKU ${variacao.sku || "(sem SKU)"}`,
					);
				}
				const nome = nomeKimono(detalhes);
				const chave = `kimono|${nome}`;
				const grupo = obterGrupo(chave, () => ({
					...copiar(produto),
					chave_externa: chaveProdutoRevisado(
						"kimono",
						detalhes.marca,
						detalhes.publico,
						detalhes.cor,
						detalhes.linha,
					),
					nome,
					categoria: "Kimonos",
					subcategoria: null,
					marca: detalhes.marca,
					atributos_produto: {
						publico: detalhes.publico,
						cor: detalhes.cor,
						linha: detalhes.linha,
						tamanhos: true,
					},
					variacoes: [],
				}));
				grupo.variacoes.push(variacao);
				produtoPorSku.set(variacao.sku, nome);
			}
			continue;
		}

		if (/^Faixa$/i.test(produto.nome)) {
			for (const variacaoOriginal of produto.variacoes || []) {
				const variacao = copiar(variacaoOriginal);
				const cor = atributo(variacao, "Cor") || variacao.cor;
				if (!cor) {
					throw new Error(`Faixa sem cor: SKU ${variacao.sku || "(sem SKU)"}`);
				}
				const nome = nomeFaixa(cor);
				const chave = `faixa|${nome}`;
				const grupo = obterGrupo(chave, () => ({
					...copiar(produto),
					chave_externa: chaveProdutoRevisado("faixa", cor, "Draken"),
					nome,
					categoria: "Faixas",
					subcategoria: null,
					marca: "Draken",
					marca_inferida: true,
					avisos: [
						"Marca Draken aplicada provisoriamente: a planilha não identifica a marca das faixas.",
					],
					atributos_produto: {
						cor: capitalizar(cor),
						marca: "Draken",
						tamanhos: true,
					},
					variacoes: [],
				}));
				definirAtributo(variacao, "Marca", "Draken");
				definirAtributo(variacao, "Marca inferida", "Sim");
				variacao.avisos = [
					...(variacao.avisos || []),
					"Marca Draken aplicada provisoriamente; confirmar se a faixa é Brazil Combat.",
				];
				grupo.variacoes.push(variacao);
				produtoPorSku.set(variacao.sku, nome);
			}
			continue;
		}

		resultado.push(produto);
		for (const variacao of produto.variacoes || []) {
			produtoPorSku.set(variacao.sku, produto.nome);
		}
	}

	return { produtos: resultado, produtoPorSku };
}

function pendenciasMarcaFaixa(produtos) {
	return produtos
		.filter((produto) => produto.marca_inferida === true)
		.map((produto) => ({
			id: hashChave("PEND", "marca_faixa_inferida", produto.nome),
			tipo: "marca_faixa_inferida",
			severidade: "atencao",
			origem: {
				arquivo: "Loja House.xlsx",
				aba: "Estoque faixa",
				observacao: "A planilha não possui coluna de marca preenchida.",
			},
			descricao: `${produto.nome}: confirmar se a marca é Draken ou Brazil Combat antes do uso definitivo.`,
			acao_sugerida:
				"Confirmar a marca com o dono; se for Brazil Combat, renomear o produto antes da importação final.",
			dados: {
				produto: produto.nome,
				marca_aplicada: "Draken",
				marca_inferida: true,
			},
		}));
}

function resumirPendencias(pendencias) {
	const quantidades = new Map();
	for (const pendencia of pendencias) {
		quantidades.set(pendencia.tipo, (quantidades.get(pendencia.tipo) || 0) + 1);
	}
	return [...quantidades.entries()].map(([tipo, quantidade]) => ({ tipo, quantidade }));
}

function validarSaida(produtos, estoque) {
	const skus = new Set();
	for (const variacao of produtos.flatMap((produto) => produto.variacoes || [])) {
		if (!variacao.sku) throw new Error("Variação sem SKU na saída revisada.");
		if (skus.has(variacao.sku)) throw new Error(`SKU repetido: ${variacao.sku}`);
		skus.add(variacao.sku);
	}
	for (const registro of estoque) {
		if (!skus.has(registro.sku)) {
			throw new Error(`Estoque referencia SKU inexistente: ${registro.sku}`);
		}
	}
}

function gerarPastaRevisada({ fonte, destino }) {
	if (!fonte || !fs.existsSync(fonte)) {
		throw new Error(`Pasta de origem não encontrada: ${fonte || "(não informada)"}`);
	}
	if (!destino) throw new Error("Informe a pasta de destino.");
	if (fs.existsSync(destino)) {
		throw new Error(`A pasta de destino já existe e não será sobrescrita: ${destino}`);
	}

	fs.cpSync(fonte, destino, { recursive: true, errorOnExist: true });
	const arquivo = (nome) => path.join(destino, nome);
	const produtosOriginais = lerJson(arquivo("02_produtos_variacoes.json"));
	const estoque = lerJson(arquivo("03_estoque_inicial.json"));
	const manifest = lerJson(arquivo("00_manifesto.json"));
	const relatorio = lerJson(arquivo("09_relatorio_validacao.json"));
	const pendenciasAntigas = lerJson(arquivo("99_pendencias.json"));
	if (!Array.isArray(produtosOriginais) || !Array.isArray(estoque)) {
		throw new Error("02_produtos_variacoes.json e 03_estoque_inicial.json devem ser arrays.");
	}

	const { produtos, produtoPorSku } = reorganizarProdutos(produtosOriginais);
	const estoqueRevisado = estoque.map((registro) => ({
		...registro,
		produto: produtoPorSku.get(registro.sku) || registro.produto,
	}));
	const novasPendencias = pendenciasMarcaFaixa(produtos);
	const pendencias = [
		...pendenciasAntigas.filter(
			(pendencia) => pendencia.tipo !== "marca_faixa_inferida",
		),
		...novasPendencias,
	];
	validarSaida(produtos, estoqueRevisado);

	const variacoes = produtos.flatMap((produto) => produto.variacoes || []);
	const variacoesProntas = variacoes.filter(
		(variacao) => variacao.pronto_para_importacao !== false,
	).length;
	const estoquePronto = estoqueRevisado.filter(
		(registro) => registro.pronto_para_importacao !== false,
	).length;
	const agora = new Date().toISOString();

	manifest.gerado_em = agora;
	manifest.arquivos = [...new Set([...(manifest.arquivos || []), "10_revisao_produtos.json"])];
	manifest.contagens = {
		...manifest.contagens,
		produtos: produtos.length,
		variacoes: variacoes.length,
		variacoes_prontas: variacoesProntas,
		variacoes_bloqueadas: variacoes.length - variacoesProntas,
		skus_unicos: new Set(variacoes.map((variacao) => variacao.sku)).size,
		estoque_registros: estoqueRevisado.length,
		estoque_registros_prontos: estoquePronto,
		pendencias: pendencias.length,
	};
	manifest.revisao_produtos = {
		gerada_em: agora,
		regra_kimono:
			"Um produto por público, cor, linha e marca; tamanhos são variações.",
		regra_faixa:
			"Um produto por cor; Draken foi aplicado provisoriamente por falta de marca na planilha.",
		origem_preservada: path.basename(fonte),
	};

	relatorio.resumo = {
		...relatorio.resumo,
		produtos: produtos.length,
		variacoes: variacoes.length,
		variacoes_prontas: variacoesProntas,
		variacoes_bloqueadas: variacoes.length - variacoesProntas,
		skus_unicos: new Set(variacoes.map((variacao) => variacao.sku)).size,
		estoque_registros: estoqueRevisado.length,
		estoque_registros_prontos: estoquePronto,
		pendencias: pendencias.length,
	};
	relatorio.pendencias_por_tipo = resumirPendencias(pendencias);
	relatorio.revisao_produtos = manifest.revisao_produtos;

	escreverJson(arquivo("02_produtos_variacoes.json"), produtos);
	escreverJson(arquivo("03_estoque_inicial.json"), estoqueRevisado);
	escreverJson(arquivo("99_pendencias.json"), pendencias);
	escreverJson(arquivo("00_manifesto.json"), manifest);
	escreverJson(arquivo("09_relatorio_validacao.json"), relatorio);
	escreverJson(arquivo("10_revisao_produtos.json"), {
		gerado_em: agora,
		alteracoes: {
			produtos_antes: produtosOriginais.length,
			produtos_depois: produtos.length,
			variacoes: variacoes.length,
			faixas_com_marca_inferida: novasPendencias.length,
		},
		informacoes_ausentes: novasPendencias.map((pendencia) => pendencia.descricao),
		nao_alterado: [
			"Preços, custos, bloqueios e pendências anteriores foram preservados.",
			"Arquivos de clientes e financeiro foram copiados sem modificação.",
		],
	});

	return {
		destino,
		produtos: produtos.length,
		variacoes: variacoes.length,
		pendencias: pendencias.length,
		faixasComMarcaInferida: novasPendencias.length,
	};
}

if (require.main === module) {
	try {
		const resultado = gerarPastaRevisada({
			fonte: lerArgumento("--fonte"),
			destino: lerArgumento("--destino"),
		});
		console.log(JSON.stringify(resultado, null, 2));
	} catch (erro) {
		console.error(erro.message);
		process.exitCode = 1;
	}
}

module.exports = { gerarPastaRevisada, reorganizarProdutos };
