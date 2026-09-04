/* Bloco 1 da "Module Improvement Pass" (GOALS.md) — código de barras/EAN em
   Produtos, categoria + meta financeira + alerta de vencimento em Financeiro.
   Roda contra um SQLCipher temporário e descartável (mesmo padrão de
   test/negocio.test.js). */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-melhorias-"));
const db = require("../database");
const { runAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-teste-123");
});

after(async () => {
	await db.bloquearBanco();
});

async function criarVariacaoComBarras(codigoBarras) {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto Barras " + Math.random().toString(36).slice(2, 8),
	]);
	const sku = "SKU-" + Math.random().toString(36).slice(2, 10);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, codigo_barras, preco, quantidade_estoque) VALUES (?, ?, ?, ?, ?)",
		[produto.lastID, sku, codigoBarras, 100, 5],
	);
	return { variacaoId: variacao.lastID, sku };
}

test("buscarSKU encontra a variação pelo código de barras, não só pelo SKU", async () => {
	const { sku } = await criarVariacaoComBarras("7891234567890");
	const porSku = await db.buscarSKU(sku);
	assert.ok(porSku, "deveria achar pelo SKU normalmente");
	const porBarras = await db.buscarSKU("7891234567890");
	assert.ok(porBarras, "deveria achar pelo código de barras");
	assert.strictEqual(porBarras.sku, sku);
});

test("buscarProdutosPorTermo encontra pelo código de barras", async () => {
	await criarVariacaoComBarras("7899999999999");
	const resultado = await db.buscarProdutosPorTermo("7899999999999");
	assert.strictEqual(resultado.length, 1);
	assert.strictEqual(resultado[0].codigo_barras, "7899999999999");
});

test("criarLancamento aceita categoria da lista fechada", async () => {
	const resultado = await db.criarLancamento({
		tipo: "pagar",
		descricao: "Aluguel de setembro",
		valor: 1500,
		categoria: "Aluguel",
	});
	assert.strictEqual(resultado.success, true);
});

test("criarLancamento aceita categoria Investimento (capex, distinto de despesa recorrente)", async () => {
	const resultado = await db.criarLancamento({
		tipo: "pagar",
		descricao: "Reforma da loja - tintas e cortinas",
		valor: 830.29,
		categoria: "Investimento",
	});
	assert.strictEqual(resultado.success, true);
});

test("criarLancamento recusa categoria fora da lista fechada", async () => {
	await assert.rejects(() =>
		db.criarLancamento({
			tipo: "pagar",
			descricao: "Categoria inventada",
			valor: 100,
			categoria: "Categoria Que Não Existe",
		}),
	);
});

test("criarLancamento sem categoria continua funcionando (campo opcional)", async () => {
	const resultado = await db.criarLancamento({
		tipo: "receber",
		descricao: "Venda avulsa",
		valor: 50,
	});
	assert.strictEqual(resultado.success, true);
});

test("meta de faturamento mensal: salva e recupera", async () => {
	assert.strictEqual(await db.getMetaFaturamentoMensal(), 0);
	await db.saveMetaFaturamentoMensal(30000);
	assert.strictEqual(await db.getMetaFaturamentoMensal(), 30000);
});

test("getLancamentosVencendoHoje só retorna lançamentos abertos vencendo hoje", async () => {
	const hoje = new Date().toISOString();
	const ontem = new Date(Date.now() - 86400000).toISOString();
	await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, status, data_criacao) VALUES ('pagar', 'Vence hoje', 200, ?, 'aberto', ?)",
		[hoje, hoje],
	);
	await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, status, data_criacao) VALUES ('pagar', 'Venceu ontem', 200, ?, 'aberto', ?)",
		[ontem, ontem],
	);
	const vencendoHoje = await db.getLancamentosVencendoHoje();
	assert.ok(vencendoHoje.some((l) => l.descricao === "Vence hoje"));
	assert.ok(!vencendoHoje.some((l) => l.descricao === "Venceu ontem"));
});
