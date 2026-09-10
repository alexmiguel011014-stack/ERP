/* Cobertura do parser nativo de Excel (db/excel-loja-house.js): lê o
   fixture sintético (test/fixtures/loja-house-sintetico.xlsx, gerado por
   scripts/gerar-fixture-xlsx.js — nenhum dado real da Loja House é usado
   aqui, é tudo inventado) e confere que o shape de saída bate exatamente
   com o que db/importacoes.js:executarImportacaoLojHouse já espera, que os
   números batem com o layout conhecido do fixture — inclusive as
   excentricidades reais confirmadas contra a exportação original (folga de
   coluna nos kimonos, produto identificado por prefixo textual em vez de
   posição de coluna, cor+tamanho combinados numa única célula, escopo de
   dedup entre blocos que reusam o mesmo rótulo de tamanho) — e que
   reprocessar o mesmo arquivo duas vezes gera as mesmas chaves
   (determinismo, essencial pro dedup por chave_externa funcionar). Também
   roda uma importação de ponta a ponta (dry-run + commit) pra provar que o
   resultado do parser é aceito pelo motor de importação sem nenhuma
   mudança nele. */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FIXTURE = path.join(__dirname, "fixtures", "loja-house-sintetico.xlsx");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-excel-import-"));

const db = require("../database");
const {
	parseExcelLojaHouse,
	paraNumero,
	extrairValorAVista,
	paraDataISO,
	hashChave,
} = require("../db/excel-loja-house");
const { executarImportacaoLojHouse } = require("../db/importacoes");
const { getAsync } = require("../db/conexao");
const { gerarPastaRevisada } = require("../scripts/exportar-produtos-loja-house");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-teste-123");
});

after(async () => {
	await db.bloquearBanco();
	try {
		fs.rmSync(TMP, { recursive: true });
	} catch {
		/* ignora erro de limpeza */
	}
});

function paraArquivos(dados) {
	return [
		{ arquivo: "01_categorias.json", conteudo: dados.categorias },
		{
			arquivo: "02_produtos_variacoes.json",
			conteudo: dados.produtosVariacoes,
		},
		{ arquivo: "03_estoque_inicial.json", conteudo: dados.estoqueInicial },
		{ arquivo: "04_clientes.json", conteudo: dados.clientes },
		{
			arquivo: "05_financeiro_historico.json",
			conteudo: dados.financeiroHistorico,
		},
		{ arquivo: "06_contas_abertas.json", conteudo: dados.contasAbertas },
		{ arquivo: "07_vendas_historicas.json", conteudo: dados.vendasHistoricas },
		{ arquivo: "99_pendencias.json", conteudo: dados.pendenciasOrigem },
	];
}

function porNome(produtos) {
	return Object.fromEntries(produtos.map((p) => [p.nome, p]));
}

// -----------------------------------------------------------------------
// Helpers puros
// -----------------------------------------------------------------------

test("paraNumero converte formato brasileiro (vírgula decimal, ponto de milhar)", () => {
	assert.strictEqual(paraNumero("180,00"), 180);
	assert.strictEqual(paraNumero("1.234,56"), 1234.56);
	assert.strictEqual(paraNumero("R$ 300,00"), 300);
	assert.strictEqual(paraNumero("5"), 5);
	assert.strictEqual(paraNumero(null), null);
	assert.strictEqual(paraNumero(""), null);
	assert.strictEqual(paraNumero("  "), null);
});

test("extrairValorAVista pega o valor antes de 'à vista', ignora o parcelado", () => {
	assert.strictEqual(
		extrairValorAVista("R$558,80 à vista ou 3xR$210,90 no cartão"),
		558.8,
	);
	assert.strictEqual(extrairValorAVista(null), null);
});

test("paraDataISO aceita DD/MM/AAAA (ano com 2 ou 4 dígitos) e AAAA-MM-DD", () => {
	assert.strictEqual(paraDataISO("05/01/2026"), "2026-01-05");
	assert.strictEqual(paraDataISO("20/2/26"), "2026-02-20");
	assert.strictEqual(paraDataISO("2026-03-01"), "2026-03-01");
	assert.strictEqual(paraDataISO(null), null);
	assert.strictEqual(paraDataISO("texto qualquer"), null);
});

test("hashChave é determinístico (mesma entrada -> mesma chave)", () => {
	assert.strictEqual(
		hashChave("CAT", "Kimono Draken"),
		hashChave("CAT", "Kimono Draken"),
	);
	assert.notStrictEqual(
		hashChave("CAT", "Kimono Draken"),
		hashChave("CAT", "Kimono Integuard"),
	);
});

// -----------------------------------------------------------------------
// parseExcelLojaHouse contra o fixture sintético
// -----------------------------------------------------------------------

test("parseExcelLojaHouse lança erro claro quando o arquivo não existe", () => {
	assert.throws(
		() => {
			parseExcelLojaHouse(path.join(TMP, "nao-existe.xlsx"));
		},
		{
			message: /não encontrado/,
		},
	);
});

test("parseExcelLojaHouse devolve exatamente as 8 chaves que executarImportacaoLojHouse espera", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	assert.deepStrictEqual(Object.keys(dados).sort(), [
		"categorias",
		"clientes",
		"contasAbertas",
		"estoqueInicial",
		"financeiroHistorico",
		"pendenciasOrigem",
		"produtosVariacoes",
		"vendasHistoricas",
	]);
});

test("categorias: taxonomia fixa de 14 (não derivada de nome de aba)", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	assert.strictEqual(dados.categorias.length, 14);
	const nomes = dados.categorias.map((c) => c.nome).sort();
	assert.deepStrictEqual(nomes, [
		"Acessórios",
		"Agasalhos",
		"Camisas",
		"Conjuntos No Gi",
		"Corta-ventos",
		"Faixas",
		"Kimonos",
		"Mochilas",
		"Moletons",
		"No Gi",
		"Protetores Bucais",
		"Puffers",
		"Rashguards",
		"Shorts No Gi",
	]);
	const porNomeCat = Object.fromEntries(
		dados.categorias.map((c) => [c.nome, c]),
	);
	assert.strictEqual(porNomeCat["Rashguards"].categoria_pai, "No Gi");
	assert.strictEqual(porNomeCat["Mochilas"].categoria_pai, "Acessórios");
	assert.strictEqual(porNomeCat["Kimonos"].categoria_pai, null);
	dados.categorias.forEach((c) => assert.match(c.chave_externa, /^CAT-/));
});

test("total: 16 produtos, 27 variações/registros de estoque, no fixture completo", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	assert.strictEqual(dados.produtosVariacoes.length, 16);
	const totalVariacoes = dados.produtosVariacoes.reduce(
		(acc, p) => acc + p.variacoes.length,
		0,
	);
	assert.strictEqual(totalVariacoes, 27);
	assert.strictEqual(dados.estoqueInicial.length, 27);
});

// -----------------------------------------------------------------------
// Aba "Kimono <Marca>": folga de coluna (TAMANHO,null,Quantidade), estilo
// (Light/Dragon) detectado no título, um produto por cor/público/linha, e o acessório
// embutido (Mochilas, CORES/Quantidade).
// -----------------------------------------------------------------------

test("Kimono: cor, público e linha viram produto; tamanho continua variação", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	const produtos = porNome(dados.produtosVariacoes);

	const light = produtos["Kimono adulto - Branco Light - Draken"];
	assert.ok(light, "Kimono adulto - Branco Light - Draken deveria existir");
	assert.strictEqual(light.categoria, "Kimonos");
	assert.strictEqual(light.variacoes.length, 3);
	const porTamanho = Object.fromEntries(
		light.variacoes.map((v) => [v.tamanho, v]),
	);
	assert.strictEqual(porTamanho.P.cor, "Branco");
	const estoquePorSku = Object.fromEntries(
		dados.estoqueInicial.map((e) => [e.sku, e.quantidade_saldo]),
	);
	assert.strictEqual(estoquePorSku[porTamanho.P.sku], 5);
	assert.strictEqual(estoquePorSku[porTamanho.M.sku], 3);
	assert.strictEqual(estoquePorSku[porTamanho.G.sku], 0); // estoque zero ainda vira registro (o motor decide pular)
	assert.deepStrictEqual(porTamanho.P.atributos, {
		marca: "Draken",
		publico: "Adulto",
		linha: "Light",
	});

	const dragon = produtos["Kimono kids - Preto Dragon - Draken"];
	assert.ok(dragon, "Kimono kids - Preto Dragon - Draken deveria existir");
	assert.strictEqual(dragon.categoria, "Kimonos");
	assert.strictEqual(dragon.variacoes.length, 1);
	assert.strictEqual(dragon.variacoes[0].tamanho, "P");
	assert.strictEqual(dragon.variacoes[0].cor, "Preto");
});

test("Kimono: acessório embutido (Mochilas) vira produto próprio, categoria Acessórios, sem tamanho", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	const mochila = porNome(dados.produtosVariacoes)["Mochila Draken"];
	assert.ok(mochila, "Mochila Draken deveria existir");
	assert.strictEqual(mochila.categoria, "Acessórios");
	assert.strictEqual(mochila.variacoes.length, 2);
	assert.ok(mochila.variacoes.every((v) => v.tamanho === null));
	assert.deepStrictEqual(mochila.variacoes.map((v) => v.cor).sort(), [
		"Bege",
		"Preta",
	]);
});

test("aba Valores: preenche preco/preco_custo por modelo+tamanho, mantém 0 sem correspondência", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	const light = porNome(dados.produtosVariacoes)[
		"Kimono adulto - Branco Light - Draken"
	];
	const p = light.variacoes.find((v) => v.tamanho === "P");
	const m = light.variacoes.find((v) => v.tamanho === "M");

	// "R$558,80 à vista ou 3xR$210,90 no cartão" -> 558.80 (ignora o parcelado)
	assert.strictEqual(p.preco, 558.8);
	assert.strictEqual(p.preco_custo, 300);
	// M não tem linha de preço própria no fixture (só existe linha para P) —
	// não deve herdar o preço de outro tamanho do mesmo modelo.
	assert.strictEqual(m.preco, 0);
	assert.strictEqual(m.preco_custo, 0);
});

// -----------------------------------------------------------------------
// Abas "Camisas" / "Coleção House": título normalizado (plural -> singular),
// blocos com o mesmo título mesclados num único produto, duplicata
// tamanho+cor vira pendência em vez de 2ª variação.
// -----------------------------------------------------------------------

test("Camisas: blocos com o mesmo título normalizado são mesclados, não duplicados", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	const produtos = porNome(dados.produtosVariacoes);

	// "Camisas Over - Teste" (1º bloco) e "Camisas Over - TESTE" (2º bloco,
	// caixa diferente) mesclam em "Camisa Over - Teste" (singular): P+M do
	// 1º bloco, G do 2º (a repetição de P/Preta no 2º bloco é a duplicata
	// testada separadamente abaixo, não conta como 4ª variação).
	const teste = produtos["Camisa Over - Teste"];
	assert.ok(teste, "Camisa Over - Teste deveria existir (mesclado)");
	assert.strictEqual(teste.categoria, "Camisas");
	assert.strictEqual(teste.variacoes.length, 3);
	assert.deepStrictEqual(teste.variacoes.map((v) => v.tamanho).sort(), [
		"G",
		"M",
		"P",
	]);

	const solo = produtos["Camisa Over - Solo"];
	assert.ok(solo, "Camisa Over - Solo deveria existir");
	assert.strictEqual(solo.variacoes.length, 1);
});

test("Camisas: tamanho+cor repetido vira pendência 'variacao_duplicada', não uma 2ª variação", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	const pend = dados.pendenciasOrigem.filter(
		(p) => p.tipo_entidade === "variacao_duplicada",
	);
	assert.ok(
		pend.some(
			(p) =>
				/camisa over - teste/i.test(p.descricao) &&
				/tamanho P/.test(p.descricao),
		),
		"deveria haver uma pendência de duplicata para Camisa Over - Teste tamanho P",
	);
});

test("Coleção House: produto próprio, mesma categoria Camisas", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	const extra = porNome(dados.produtosVariacoes)["Camisa Extra"];
	assert.ok(extra, "Camisa Extra deveria existir");
	assert.strictEqual(extra.categoria, "Camisas");
	assert.strictEqual(extra.variacoes.length, 1);
});

// -----------------------------------------------------------------------
// Aba "Estoque faixa": layout único (COR/Modalidade/Tamanho/Quantidade),
// gera um produto por cor e usa Draken como marca provisória, pois a planilha
// não informa a distribuição entre Draken e Brazil Combat.
// -----------------------------------------------------------------------

test("Estoque faixa: produto por cor com marca provisória Draken e pendência de revisão", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	const produtos = dados.produtosVariacoes.filter(
		(p) => p.categoria === "Faixas",
	);
	assert.strictEqual(produtos.length, 2);
	const branca = porNome(produtos)["Faixa Branca Draken"];
	assert.ok(branca);
	assert.strictEqual(branca.variacoes.length, 2);
	assert.strictEqual(branca.marca_inferida, true);
	assert.deepStrictEqual(
		branca.variacoes.map((v) => v.tamanho).sort(),
		["M0", "M1"],
	);
	assert.ok(porNome(produtos)["Faixa Preta Draken"]);

	const pend = dados.pendenciasOrigem.filter(
		(p) =>
			p.tipo_entidade === "variacao_duplicada" && /Faixa Branca/.test(p.descricao),
	);
	assert.strictEqual(pend.length, 1);
	assert.strictEqual(
		dados.pendenciasOrigem.filter(
			(p) => p.tipo_entidade === "marca_faixa_inferida",
		).length,
		2,
	);
});

// -----------------------------------------------------------------------
// Aba "Rashcojuntos": as 4 regiões de layout distinto mapeadas contra a
// exportação original — cada uma testada isoladamente.
// -----------------------------------------------------------------------

test("Rashcojuntos: região Equipe (4 colunas-produto lado a lado) — Adulto e Kids não colidem no dedup", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	const produtos = porNome(dados.produtosVariacoes);

	// Adulto (P) e Kids (P) reusam o mesmo rótulo de tamanho em blocos de
	// coluna diferentes — sem o escopo de dedup por coluna, o 2º viraria
	// falsa duplicata (bug real encontrado e corrigido nesta sessão).
	const conjunto = produtos["Conjunto No Gi Equipe"];
	assert.ok(conjunto);
	assert.strictEqual(conjunto.variacoes.length, 2);
	assert.strictEqual(conjunto.categoria, "No Gi");

	const blusaCurta = produtos["Blusa No Gi Manga Curta Equipe"];
	assert.ok(blusaCurta);
	assert.strictEqual(blusaCurta.variacoes.length, 1); // só existe no bloco Adulto

	const shorts = produtos["Short No Gi Equipe"];
	assert.ok(shorts);
	assert.strictEqual(shorts.variacoes.length, 1); // só existe no bloco Kids

	// Blusa Manga Longa não tem nenhuma célula preenchida no fixture — não
	// deve gerar produto nenhum (célula vazia != variação com qtd 0).
	assert.ok(!produtos["Blusa No Gi Manga Longa Equipe"]);
});

test("Rashcojuntos: região 'CONJUNTO NO GI - Brazil Combat' — produto por prefixo textual, cor extraída do texto", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	const produtos = porNome(dados.produtosVariacoes);

	const conjunto = produtos["Conjunto No Gi Brazil Combat"];
	assert.ok(conjunto);
	assert.strictEqual(conjunto.variacoes.length, 1);
	assert.strictEqual(conjunto.variacoes[0].tamanho, "EG");
	assert.strictEqual(conjunto.variacoes[0].cor, "Roxo");

	const short = produtos["Short No Gi Brazil Combat"];
	assert.ok(short);
	// 2 linhas "Short" com o MESMO tamanho "G" mas cores diferentes (Azul,
	// Preto) — sem extrair a cor do texto, colidiriam como falsa duplicata
	// (bug real encontrado e corrigido nesta sessão).
	assert.strictEqual(short.variacoes.length, 2);
	assert.deepStrictEqual(short.variacoes.map((v) => v.cor).sort(), [
		"Azul",
		"Preto",
	]);
});

test("Rashcojuntos: região 'RASHGUARD - BRAZIL COMBAT' — cor+tamanho combinados numa célula, blocos repetidos acumulam", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	const rashguard = porNome(dados.produtosVariacoes)["Rashguard Brazil Combat"];
	assert.ok(rashguard);
	// 2 do 1º bloco ("Azul P", "Azul M") + 1 do 2º bloco ("Roxa P") = 3.
	assert.strictEqual(rashguard.variacoes.length, 3);
	const porTamanhoCor = rashguard.variacoes
		.map((v) => `${v.tamanho}/${v.cor}`)
		.sort();
	assert.deepStrictEqual(porTamanhoCor, ["M/Azul", "P/Azul", "P/Roxa"]);
});

test("Rashcojuntos: mini-tabelas de produto único — com tamanho (Corta Vento) e sem tamanho (Protetor Bucal)", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	const produtos = porNome(dados.produtosVariacoes);

	const cortaVento = produtos["Corta Vento"];
	assert.ok(cortaVento);
	assert.strictEqual(cortaVento.categoria, "Agasalhos");
	assert.strictEqual(cortaVento.variacoes.length, 1);
	assert.strictEqual(cortaVento.variacoes[0].cor, "Preto");
	assert.strictEqual(cortaVento.variacoes[0].tamanho, "M");

	const protetor = produtos["Protetor Bucal"];
	assert.ok(protetor);
	assert.strictEqual(protetor.categoria, "Acessórios");
	assert.strictEqual(protetor.variacoes.length, 2);
	assert.ok(protetor.variacoes.every((v) => v.tamanho === null));
	assert.deepStrictEqual(protetor.variacoes.map((v) => v.cor).sort(), [
		"Azul",
		"Vermelho",
	]);
});

// -----------------------------------------------------------------------
// Financeiro / Contas a Pagar / pendências de texto livre
// -----------------------------------------------------------------------

test("Financeiro Loja<MÊS>: pula 'Saldo Anterior', a coluna TOTAL e linha sem data (carryover)", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	assert.strictEqual(dados.financeiroHistorico.length, 2);
	assert.ok(
		!dados.financeiroHistorico.some((l) => l.descricao === "Saldo Anterior"),
	);
	assert.ok(
		!dados.financeiroHistorico.some((l) => /carryover/i.test(l.descricao)),
		"linha sem data não deveria virar transação (confirmado contra a exportação original: 0/264 sem data)",
	);

	const porDescricao = Object.fromEntries(
		dados.financeiroHistorico.map((l) => [l.descricao, l]),
	);
	assert.strictEqual(porDescricao["Venda balcão"].tipo, "receber");
	assert.strictEqual(porDescricao["Venda balcão"].valor, 150);
	assert.strictEqual(porDescricao["Venda balcão"].status, "pago");
	assert.strictEqual(porDescricao["Venda balcão"].data_pagamento, "2026-01-05");
	assert.strictEqual(porDescricao["Pagamento fornecedor"].tipo, "pagar");
	assert.strictEqual(porDescricao["Pagamento fornecedor"].valor, 80);
});

test("Contas a Pagar: linha com data vira contasAbertas, linha sem data vira pendência", () => {
	const dados = parseExcelLojaHouse(FIXTURE);

	assert.strictEqual(dados.contasAbertas.length, 1);
	assert.strictEqual(dados.contasAbertas[0].descricao, "Aluguel fevereiro");
	assert.strictEqual(dados.contasAbertas[0].status, "aberto");
	assert.strictEqual(dados.contasAbertas[0].data_vencimento, "2026-02-20");

	const pendenciaContaPagar = dados.pendenciasOrigem.filter(
		(p) => p.tipo_entidade === "conta_a_pagar_sem_data",
	);
	assert.strictEqual(pendenciaContaPagar.length, 1);
	assert.match(pendenciaContaPagar[0].descricao, /Conta de luz/);
});

test("Crediário, Custos Fixos + Investimento Loja, Consignado e analise2025 viram pendências com o vocabulário esperado", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	const porTipo = {};
	for (const p of dados.pendenciasOrigem) {
		porTipo[p.tipo_entidade] = (porTipo[p.tipo_entidade] || 0) + 1;
	}

	assert.strictEqual(dados.pendenciasOrigem.length, 13);
	assert.strictEqual(porTipo.variacao_duplicada, 2); // Camisa Teste + Faixa
	assert.strictEqual(porTipo.marca_faixa_inferida, 2);
	assert.strictEqual(porTipo.crediario_sem_produto_identificavel, 2);
	assert.strictEqual(porTipo.conta_a_pagar_sem_data, 1);
	assert.strictEqual(porTipo.custo_fixo_sem_mes_ano, 1);
	assert.strictEqual(porTipo.investimento_sem_data, 2);
	assert.strictEqual(porTipo.consignacao_sem_modelo_no_erp, 2);
	assert.strictEqual(porTipo.resumo_analitico_nao_transacional, 1);

	// Toda pendência precisa satisfazer o formato que
	// db/importacoes.js:validarStructura exige de 99_pendencias.json
	// (id/tipo/descricao) e o formato mais rico que importarPendencias
	// prioriza (chave_externa/tipo_entidade/motivo_rejeicao/sugestao).
	for (const p of dados.pendenciasOrigem) {
		assert.ok(p.id && p.tipo && p.descricao, "faltam campos id/tipo/descricao");
		assert.ok(
			p.chave_externa && p.tipo_entidade && p.motivo_rejeicao,
			"faltam campos chave_externa/tipo_entidade/motivo_rejeicao",
		);
	}
});

test("clientes e vendasHistoricas ficam vazios (sem dado correspondente na planilha)", () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	assert.deepStrictEqual(dados.clientes, []);
	assert.deepStrictEqual(dados.vendasHistoricas, []);
});

test("reprocessar o mesmo Excel duas vezes gera exatamente as mesmas chave_externa/sku (determinismo)", () => {
	const d1 = parseExcelLojaHouse(FIXTURE);
	const d2 = parseExcelLojaHouse(FIXTURE);

	assert.deepStrictEqual(
		d1.categorias.map((c) => c.chave_externa).sort(),
		d2.categorias.map((c) => c.chave_externa).sort(),
	);

	const skus1 = d1.produtosVariacoes
		.flatMap((p) => p.variacoes.map((v) => v.sku))
		.sort();
	const skus2 = d2.produtosVariacoes
		.flatMap((p) => p.variacoes.map((v) => v.sku))
		.sort();
	assert.deepStrictEqual(skus1, skus2);

	const chavesPend1 = d1.pendenciasOrigem.map((p) => p.chave_externa).sort();
	const chavesPend2 = d2.pendenciasOrigem.map((p) => p.chave_externa).sort();
	assert.deepStrictEqual(chavesPend1, chavesPend2);
});

test("exportador cria nova pasta e reorganiza kimono/faixa sem liberar bloqueios", () => {
	const fonte = path.join(TMP, "json-origem-sintetica");
	const destino = path.join(TMP, "json-revisado");
	fs.mkdirSync(fonte);
	const variacaoKimono = {
		chave_externa: "VAR-KIMONO",
		sku: "SKU-KIMONO",
		tamanho: "A1",
		cor: "Azul",
		preco: null,
		pronto_para_importacao: false,
		bloqueios: ["preco_venda_ausente"],
		atributos: [
			{ chave: "Marca", valor: "Draken" },
			{ chave: "Linha", valor: "Light" },
			{ chave: "Publico", valor: "Adulto" },
			{ chave: "Cor", valor: "Azul" },
		],
	};
	const variacaoFaixa = {
		chave_externa: "VAR-FAIXA",
		sku: "SKU-FAIXA",
		tamanho: "M0",
		cor: "Branca",
		preco: null,
		pronto_para_importacao: false,
		bloqueios: ["preco_venda_ausente"],
		atributos: [
			{ chave: "Cor", valor: "Branca" },
			{ chave: "Tamanho", valor: "M0" },
		],
	};
	fs.writeFileSync(
		path.join(fonte, "02_produtos_variacoes.json"),
		JSON.stringify([
			{ chave_externa: "PROD-K", nome: "Kimono Draken Light", variacoes: [variacaoKimono] },
			{ chave_externa: "PROD-F", nome: "Faixa", variacoes: [variacaoFaixa] },
		]),
	);
	fs.writeFileSync(
		path.join(fonte, "03_estoque_inicial.json"),
		JSON.stringify([
			{ sku: "SKU-KIMONO", produto: "Kimono Draken Light" },
			{ sku: "SKU-FAIXA", produto: "Faixa" },
		]),
	);
	fs.writeFileSync(path.join(fonte, "00_manifesto.json"), JSON.stringify({}));
	fs.writeFileSync(path.join(fonte, "09_relatorio_validacao.json"), JSON.stringify({ resumo: {} }));
	fs.writeFileSync(path.join(fonte, "99_pendencias.json"), JSON.stringify([]));

	const resultado = gerarPastaRevisada({ fonte, destino });
	assert.deepStrictEqual(
		{
			produtos: resultado.produtos,
			variacoes: resultado.variacoes,
			faixasComMarcaInferida: resultado.faixasComMarcaInferida,
		},
		{ produtos: 2, variacoes: 2, faixasComMarcaInferida: 1 },
	);
	const produtos = JSON.parse(
		fs.readFileSync(path.join(destino, "02_produtos_variacoes.json"), "utf8"),
	);
	assert.ok(
		produtos.some((produto) => produto.nome === "Kimono adulto - Azul Light - Draken"),
	);
	const faixa = produtos.find((produto) => produto.nome === "Faixa Branca Draken");
	assert.ok(faixa?.marca_inferida);
	assert.strictEqual(faixa.variacoes[0].pronto_para_importacao, false);
	assert.ok(
		faixa.variacoes[0].atributos.some(
			(atributo) => atributo.chave === "Marca" && atributo.valor === "Draken",
		),
	);
	const estoque = JSON.parse(
		fs.readFileSync(path.join(destino, "03_estoque_inicial.json"), "utf8"),
	);
	assert.strictEqual(estoque[1].produto, "Faixa Branca Draken");
});

// -----------------------------------------------------------------------
// Ponta a ponta: resultado do parser aceito por executarImportacaoLojHouse
// sem nenhuma mudança no motor (array de {arquivo, conteudo}, mesmo formato
// que ipc/importacoes.js usa internamente pro modo "excel").
// -----------------------------------------------------------------------

test("dry-run do resultado do parser: preview bate com os números do fixture", async () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	const resultado = await executarImportacaoLojHouse(
		paraArquivos(dados),
		null,
		{
			dryRun: true,
		},
	);

	assert.strictEqual(resultado.dryRun, true);
	assert.strictEqual(resultado.preview.categorias, 14);
	assert.strictEqual(resultado.preview.produtos, 16);
	assert.strictEqual(resultado.preview.variacoes, 27);
	assert.strictEqual(resultado.preview.estoque, 27);
	assert.strictEqual(resultado.preview.clientes, 0);
	assert.strictEqual(resultado.preview.lancamentosHistoricos, 2);
	assert.strictEqual(resultado.preview.contasAbertas, 1);
	assert.strictEqual(resultado.preview.pendenciasOrigem, 13);
});

test("commit do resultado do parser: importa sem erros e cria as pendências esperadas", async () => {
	const dados = parseExcelLojaHouse(FIXTURE);
	const resultado = await executarImportacaoLojHouse(
		paraArquivos(dados),
		null,
		{
			dryRun: false,
			dataMovimentacao: "2026-09-03",
		},
	);

	assert.ok(resultado.batchId);
	assert.deepStrictEqual(resultado.erros, []);
	assert.strictEqual(resultado.importadas.categorias, 14);
	assert.strictEqual(resultado.importadas.produtos, 16);
	assert.strictEqual(resultado.importadas.variacoes, 27);
	// estoque: registros com saldo > 0 de fato movimentados — o motor pula
	// saldo=0 (sem zero movements) sem contar como erro. O fixture tem 3
	// variações com saldo 0 (Kimono Draken Light/G, Rashguard/Azul M,
	// Protetor Bucal/Azul) — 27 - 3 = 24.
	assert.strictEqual(resultado.importadas.estoque, 24);
	// lançamentos: 2 do financeiro histórico + 1 de contas abertas
	assert.strictEqual(resultado.importadas.lancamentos, 3);
	assert.strictEqual(resultado.pendencias, 13);

	const faixa = await getAsync(
		`SELECT Produtos.nome, Categorias.nome AS categoria
		 FROM Produtos
		 JOIN Categorias ON Categorias.id = Produtos.categoria_id
		 WHERE Produtos.nome = ?`,
		["Faixa Branca Draken"],
	);
	assert.deepStrictEqual(faixa, {
		nome: "Faixa Branca Draken",
		categoria: "Faixas",
	});
});
