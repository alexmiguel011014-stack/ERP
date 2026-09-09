/* Regressão: operações paralelas da tela de Precificação compartilham uma
   única conexão SQLCipher. A fila do módulo impede BEGINs concorrentes sem
   depender de dados reais da loja. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-precificacao-fila-"));
const db = require("../database");
const { getAsync, runAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-precificacao-fila");
});

after(async () => {
	await db.bloquearBanco();
});

async function criarProdutoParaPrecificacao() {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto Precificação " + Math.random().toString(36).slice(2, 8),
	]);
	await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque) VALUES (?, ?, ?, ?, ?)",
		[
			produto.lastID,
			"PREC-" + Math.random().toString(36).slice(2, 10),
			100,
			50,
			1,
		],
	);
	return produto.lastID;
}

test("carregamento e edição paralelos não abrem transações concorrentes", async () => {
	const produtoId = await criarProdutoParaPrecificacao();

	await Promise.all([
		db.getPricingData(),
		db.saveProductMargin(produtoId, 50),
		db.saveProductPrice(produtoId, 150),
		db.getPricingData(),
	]);

	const precificacao = await getAsync(
		"SELECT margem_percentual, preco_venda, status FROM Precificacao WHERE produto_id = ?",
		[produtoId],
	);
	const variacao = await getAsync(
		"SELECT preco FROM Variacoes WHERE produto_id = ?",
		[produtoId],
	);
	assert.deepEqual(precificacao, {
		margem_percentual: 50,
		preco_venda: 150,
		status: "definido",
	});
	assert.equal(variacao.preco, 150);
});

test("operações transacionais simultâneas permanecem atômicas por produto", async () => {
	const produtoId = await criarProdutoParaPrecificacao();
	await db.getPricingData();

	await Promise.all([
		db.saveProductPrice(produtoId, 160),
		db.saveProductCost(produtoId, 75),
		db.massUpdateMargem([produtoId], 30),
		db.getPricingData(),
	]);

	const precificacao = await getAsync(
		"SELECT margem_percentual, preco_custo, preco_venda FROM Precificacao WHERE produto_id = ?",
		[produtoId],
	);
	const variacao = await getAsync(
		"SELECT preco_custo, preco FROM Variacoes WHERE produto_id = ?",
		[produtoId],
	);
	assert.deepEqual(precificacao, {
		margem_percentual: 30,
		preco_custo: 75,
		preco_venda: 160,
	});
	assert.deepEqual(variacao, { preco_custo: 75, preco: 160 });
});
