/* Campos fiscais (NCM/CFOP/CSOSN) em Produtos e rastreamento de nota fiscal
   por venda — funciona hoje sem nenhuma integração externa (ver GOALS.md). */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-fiscal-"));
const db = require("../database");
const { runAsync, getAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-teste-123");
});

after(async () => {
	await db.bloquearBanco();
});

test("Produtos: campos fiscais existem com defaults seguros", async () => {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto Fiscal",
	]);
	const p = await getAsync(
		"SELECT ncm, cfop_padrao, csosn, unidade_fiscal, origem_mercadoria FROM Produtos WHERE id = ?",
		[produto.lastID],
	);
	assert.strictEqual(p.unidade_fiscal, "UN");
	assert.strictEqual(p.origem_mercadoria, "0");
	assert.strictEqual(p.ncm, null);
	assert.strictEqual(p.csosn, null);
});

test("Vendas: nota_status começa como 'nao_emitida'", async () => {
	const cliente = await runAsync("INSERT INTO Clientes (nome) VALUES (?)", [
		"Cliente Fiscal",
	]);
	const venda = await runAsync(
		"INSERT INTO Vendas (cliente_id, total, data_venda) VALUES (?, ?, datetime('now'))",
		[cliente.lastID, 50],
	);
	const v = await getAsync(
		"SELECT nota_status, nota_numero FROM Vendas WHERE id = ?",
		[venda.lastID],
	);
	assert.strictEqual(v.nota_status, "nao_emitida");
	assert.strictEqual(v.nota_numero, null);
});

test("atualizarNotaFiscal: grava status e número (funciona sem integração)", async () => {
	const cliente = await runAsync("INSERT INTO Clientes (nome) VALUES (?)", [
		"Cliente Fiscal 2",
	]);
	const venda = await runAsync(
		"INSERT INTO Vendas (cliente_id, total, data_venda) VALUES (?, ?, datetime('now'))",
		[cliente.lastID, 80],
	);
	await db.atualizarNotaFiscal(venda.lastID, {
		status: "emitida_externa",
		numero: "12345",
	});
	const v = await getAsync(
		"SELECT nota_status, nota_numero FROM Vendas WHERE id = ?",
		[venda.lastID],
	);
	assert.strictEqual(v.nota_status, "emitida_externa");
	assert.strictEqual(v.nota_numero, "12345");
});

test("atualizarNotaFiscal: status inválido não grava lixo, cai no default seguro", async () => {
	const cliente = await runAsync("INSERT INTO Clientes (nome) VALUES (?)", [
		"Cliente Fiscal 3",
	]);
	const venda = await runAsync(
		"INSERT INTO Vendas (cliente_id, total, data_venda) VALUES (?, ?, datetime('now'))",
		[cliente.lastID, 30],
	);
	await db.atualizarNotaFiscal(venda.lastID, { status: "algo-invalido" });
	const v = await getAsync("SELECT nota_status FROM Vendas WHERE id = ?", [
		venda.lastID,
	]);
	assert.strictEqual(v.nota_status, "nao_emitida");
});

test("atualizarNotaFiscal: rejeita venda inexistente", async () => {
	await assert.rejects(
		() => db.atualizarNotaFiscal(999999, { status: "cancelada" }),
		/não encontrada/,
	);
});
