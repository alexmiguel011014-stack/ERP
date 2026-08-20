/* Cobertura das métricas financeiras adicionadas via /repertoire (GOALS.md,
   seção "Financial/Accounting Depth"): margem de contribuição, ponto de
   equilíbrio, giro de estoque, provisão de DAS. Roda contra um SQLCipher
   temporário e descartável (mesmo padrão de test/negocio.test.js). */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-relfin-"));
const db = require("../database");
const { runAsync, getAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-teste-123");
});

after(async () => {
	await db.bloquearBanco();
});

// Produto com custo=50, vendido a 100 x2 unidades, vendedor com 5% de
// comissão, taxa de adquirente 3%, impostos_extras 2/unidade:
// receita=200, cmv=100, comissão=10, taxa=6, impostos=4 -> margem=80.
async function criarCenarioVenda(estoqueInicial) {
	const usuario = await runAsync(
		"INSERT INTO Usuarios (login, nome, comissao_percentual) VALUES (?, ?, ?)",
		["vendedor-" + Math.random().toString(36).slice(2, 8), "Vendedor Teste", 5],
	);
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto Financeiro " + Math.random().toString(36).slice(2, 8),
	]);
	const sku = "SKU-FIN-" + Math.random().toString(36).slice(2, 10);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque) VALUES (?, ?, ?, ?, ?)",
		[produto.lastID, sku, 100, 50, estoqueInicial],
	);
	await runAsync(
		"INSERT INTO Precificacao (produto_id, preco_custo, impostos_extras, preco_venda, status) VALUES (?, ?, ?, ?, 'definido')",
		[produto.lastID, 50, 2, 100],
	);
	await db.saveTaxaAdquirente(3);

	await db.finalizarVenda(
		{
			itens: [
				{ variacao_id: variacao.lastID, quantidade: 2, preco_unitario: 100 },
			],
			total: 200,
			forma_pagamento: "Dinheiro",
		},
		usuario.lastID,
	);

	return { produtoId: produto.lastID, variacaoId: variacao.lastID };
}

test("getMargemContribuicao: desconta CMV + comissão + taxa de adquirente + impostos", async () => {
	const { produtoId } = await criarCenarioVenda(10);
	const resultado = await db.getMargemContribuicao();
	const linha = resultado.porProduto.find((p) => p.produto_id === produtoId);

	assert.ok(
		linha,
		"produto de teste deveria aparecer na margem de contribuição",
	);
	assert.strictEqual(linha.receita, 200);
	assert.strictEqual(
		linha.margemContribuicao,
		80,
		"200 - 100(cmv) - 10(comissão) - 6(taxa) - 4(impostos) = 80",
	);
	assert.strictEqual(linha.margemContribuicaoUnitaria, 40);
	assert.strictEqual(linha.margemContribuicaoPercentual, 40);
});

test("getPontoDeEquilibrio: quantidade e faturamento necessários batem com a fórmula", async () => {
	await criarCenarioVenda(10);
	await db.saveCustoFixoConfig(400);
	const resultado = await db.getPontoDeEquilibrio();

	// margemContribuicaoUnitariaMedia pode incluir produtos de outros testes
	// deste arquivo (mesmo banco temporário) — recalcula a expectativa a
	// partir do próprio resultado, não de um valor fixo hardcoded.
	const esperadoQuantidade = 400 / resultado.margemContribuicaoUnitariaMedia;
	const esperadoFaturamento =
		400 / (resultado.margemContribuicaoPercentualMedia / 100);

	assert.ok(
		Math.abs(resultado.quantidadeNecessaria - esperadoQuantidade) < 0.0001,
	);
	assert.ok(
		Math.abs(resultado.faturamentoNecessario - esperadoFaturamento) < 0.0001,
	);
});

test("getGiroEstoque: giro = vendido/estoque atual, dias = 365/giro", async () => {
	const { produtoId, variacaoId } = await criarCenarioVenda(10);
	const estoqueAtual = await getAsync(
		"SELECT quantidade_estoque FROM Variacoes WHERE id = ?",
		[variacaoId],
	);
	assert.strictEqual(
		estoqueAtual.quantidade_estoque,
		8,
		"10 iniciais - 2 vendidos = 8",
	);

	const resultado = await db.getGiroEstoque();
	const linha = resultado.find((p) => p.produto_id === produtoId);

	assert.ok(linha, "produto de teste deveria aparecer no giro de estoque");
	assert.strictEqual(linha.quantidadeVendida, 2);
	assert.strictEqual(linha.estoqueAtual, 8);
	assert.strictEqual(linha.giro, 0.25, "2 vendidos / 8 em estoque = 0.25");
	assert.strictEqual(linha.diasParaReposicao, 1460, "365 / 0.25 = 1460");
});

test("getGiroEstoque: estoque zerado não quebra (não divide por zero)", async () => {
	const { produtoId } = await criarCenarioVenda(2);
	// Zera o estoque manualmente pra forçar o caso extremo.
	await runAsync(
		"UPDATE Variacoes SET quantidade_estoque = 0 WHERE produto_id = ?",
		[produtoId],
	);
	const resultado = await db.getGiroEstoque();
	const linha = resultado.find((p) => p.produto_id === produtoId);

	assert.strictEqual(linha.estoqueAtual, 0);
	assert.strictEqual(
		linha.giro,
		null,
		"sem estoque, giro não é calculável (não Infinity/NaN)",
	);
	assert.strictEqual(linha.diasParaReposicao, null);
});

test("getProvisaoDAS: usa dinheiro RECEBIDO, não faturado — Fiado não entra na base", async () => {
	await db.saveAliquotaDAS(6);

	const antes = await db.getProvisaoDAS();
	const recebidoAntes = antes.totalRecebido;

	const cliente = await runAsync("INSERT INTO Clientes (nome) VALUES (?)", [
		"Cliente DAS Teste " + Math.random().toString(36).slice(2, 8),
	]);

	// Venda à vista (Dinheiro): entra no fluxo de caixa recebido.
	await runAsync(
		"INSERT INTO Vendas (cliente_id, total, forma_pagamento, data_venda, status) VALUES (?, ?, ?, datetime('now'), 'finalizada')",
		[cliente.lastID, 1000, "Dinheiro"],
	);
	// Venda Fiado (a receber, ainda não recebida): NÃO deve entrar na base do DAS.
	await runAsync(
		"INSERT INTO Vendas (cliente_id, total, forma_pagamento, data_venda, status) VALUES (?, ?, ?, datetime('now'), 'finalizada')",
		[cliente.lastID, 5000, "Fiado"],
	);

	const depois = await db.getProvisaoDAS();
	const deltaRecebido = depois.totalRecebido - recebidoAntes;

	assert.strictEqual(
		deltaRecebido,
		1000,
		"só a venda à vista (1000) deveria contar — a Fiado (5000) fica de fora até ser recebida",
	);
	assert.strictEqual(
		depois.valorProvisionado,
		depois.totalRecebido * 0.06,
		"provisão = total recebido x alíquota, sempre — a asserção acima já provou que o total recebido exclui o Fiado",
	);
});
