const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-custo-venda-snapshot-"));
const db = require("../database");
const { finalizarVendaPDV02 } = require("../db/vendas");
const { runAsync, getAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-custo-venda-snapshot");
	await db.abrirCaixa(0, null);
});

after(async () => {
	await db.bloquearBanco();
});

async function criarVariacao(sku, precoCusto, estoque = 5) {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [sku]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque) VALUES (?, ?, ?, ?, ?)",
		[produto.lastID, sku, 150, precoCusto, estoque],
	);
	return variacao.lastID;
}

test("venda normal congela o custo mesmo após alteração da variação", async () => {
	const variacaoId = await criarVariacao("SNAP-NORMAL", 100, 2);
	const venda = await db.finalizarVenda(
		{
			itens: [{ variacao_id: variacaoId, quantidade: 1 }],
			forma_pagamento: "Dinheiro",
			valor_recebido: 150,
		},
		null,
	);

	const antes = await getAsync(
		"SELECT custo_unitario FROM ItensVenda WHERE venda_id = ?",
		[venda.vendaId],
	);
	assert.equal(antes.custo_unitario, 100);
	await runAsync("UPDATE Variacoes SET preco_custo = 999 WHERE id = ?", [
		variacaoId,
	]);

	const depois = await getAsync(
		"SELECT custo_unitario FROM ItensVenda WHERE venda_id = ?",
		[venda.vendaId],
	);
	assert.equal(depois.custo_unitario, 100);
});

test("caminho legado usa custo, não preço de venda, no item e no estoque", async () => {
	const variacaoId = await criarVariacao("SNAP-LEGACY", 80, 2);
	const resultado = await finalizarVendaPDV02({
		requestId: "snapshot-legacy-1",
		itens: [{ variacaoId, quantidade: 1 }],
		formaPagamento: "Dinheiro",
	});
	const item = await getAsync(
		"SELECT custo_unitario FROM ItensVenda WHERE venda_id = ?",
		[resultado.vendaId],
	);
	const movimento = await getAsync(
		"SELECT custo_unitario FROM MovimentacoesEstoque WHERE referencia_id = ? AND origem = 'venda'",
		[resultado.vendaId],
	);
	assert.equal(item.custo_unitario, 80);
	assert.equal(movimento.custo_unitario, 80);
});

test("importação histórica preserva custo informado e mantém desconhecido como NULL", async () => {
	const variacaoId = await criarVariacao("SNAP-IMPORT", 70, 0);
	const conhecido = await db.importarVendasHistoricas([
		{
			sku: "SNAP-IMPORT",
			quantidade: 1,
			valorUnitario: 150,
			custoUnitario: 55,
			data: "2024-01-10",
		},
	]);
	const desconhecido = await db.importarVendasHistoricas([
		{
			sku: "SNAP-IMPORT",
			quantidade: 1,
			valorUnitario: 150,
			data: "2024-01-11",
		},
	]);
	assert.equal(conhecido.importadas, 1);
	assert.equal(desconhecido.importadas, 1);
	const itens = await require("../db/conexao").allAsync(
		"SELECT custo_unitario FROM ItensVenda WHERE variacao_id = ? ORDER BY id",
		[variacaoId],
	);
	assert.deepEqual(
		itens.map((item) => item.custo_unitario),
		[55, null],
	);
	const dre = await db.getDRE("2024-01-01", "2024-01-31");
	assert.equal(dre.cmv, 55);
	assert.equal(dre.quantidadeCustoDesconhecido, 1);
	assert.equal(dre.receitaSemCMV, 150);
	assert.equal(dre.custoDesconhecido, true);
});
