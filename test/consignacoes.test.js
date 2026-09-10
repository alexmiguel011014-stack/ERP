/* Cobertura do módulo de Consignação: reserva de estoque via
   quantidade_reservada (mesmo mecanismo de orçamento), guard de estoque
   insuficiente, liberação em devolução/perda, e baixa atômica + criação de
   Venda quando a consignação vira venda de fato.
   Roda contra um SQLCipher temporário e descartável (mesmo padrão de
   test/negocio.test.js). */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-consignacoes-"));
const db = require("../database");
const { runAsync, getAsync } = require("../db/conexao");
const {
	registrarConsignacao,
	marcarDevolvida,
	marcarPerdida,
	marcarVendida,
	listarConsignacoes,
} = require("../db/consignacoes");

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

async function criarVariacao(estoque) {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto Consignação " + Math.random().toString(36).slice(2, 8),
	]);
	const sku = "CONS-" + Math.random().toString(36).slice(2, 10);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, quantidade_estoque) VALUES (?, ?, ?, ?)",
		[produto.lastID, sku, 100, estoque],
	);
	return variacao.lastID;
}

async function criarCliente() {
	const cliente = await runAsync("INSERT INTO Clientes (nome) VALUES (?)", [
		"Cliente Consignação " + Math.random().toString(36).slice(2, 8),
	]);
	return cliente.lastID;
}

async function estoqueAtual(variacaoId) {
	return getAsync(
		"SELECT quantidade_estoque, quantidade_reservada FROM Variacoes WHERE id = ?",
		[variacaoId],
	);
}

test("registrarConsignacao recusa quando quantidade_disponivel é insuficiente (rollback atômico)", async () => {
	const variacaoId = await criarVariacao(3);
	const clienteId = await criarCliente();

	await assert.rejects(
		() =>
			registrarConsignacao({
				cliente_id: clienteId,
				variacao_id: variacaoId,
				quantidade: 5,
			}),
		/[Ee]stoque disponível insuficiente/,
	);

	const depois = await estoqueAtual(variacaoId);
	assert.strictEqual(
		depois.quantidade_estoque,
		3,
		"saldo real não pode mudar numa consignação rejeitada",
	);
	assert.strictEqual(
		depois.quantidade_reservada,
		0,
		"nada pode ficar reservado numa consignação rejeitada (rollback)",
	);

	const linhas = await listarConsignacoes({ cliente_id: clienteId });
	assert.strictEqual(
		linhas.length,
		0,
		"o INSERT em Consignacoes também precisa ser desfeito pelo rollback",
	);
});

test("emprestado reserva a quantidade (reduz disponível) sem baixar quantidade_estoque", async () => {
	const variacaoId = await criarVariacao(10);
	const clienteId = await criarCliente();

	const resultado = await registrarConsignacao({
		cliente_id: clienteId,
		variacao_id: variacaoId,
		quantidade: 4,
		data_prevista_retorno: "2026-09-20",
		observacao: "Mostruário",
	});
	assert.ok(resultado.success);
	assert.ok(Number.isInteger(resultado.consignacaoId));

	const depois = await estoqueAtual(variacaoId);
	assert.strictEqual(
		depois.quantidade_estoque,
		10,
		"consignação não pode baixar estoque real na saída",
	);
	assert.strictEqual(
		depois.quantidade_reservada,
		4,
		"consignação precisa reservar a quantidade emprestada",
	);
	assert.strictEqual(
		depois.quantidade_estoque - depois.quantidade_reservada,
		6,
	);

	const linhas = await listarConsignacoes({ cliente_id: clienteId });
	assert.strictEqual(linhas.length, 1);
	assert.strictEqual(linhas[0].status, "emprestado");
	assert.strictEqual(linhas[0].quantidade, 4);
});

test("devolvido restaura quantidade_disponivel sem tocar quantidade_estoque", async () => {
	const variacaoId = await criarVariacao(10);
	const { consignacaoId } = await registrarConsignacao({
		cliente_id: null,
		variacao_id: variacaoId,
		quantidade: 3,
	});

	const resultado = await marcarDevolvida(consignacaoId);
	assert.ok(resultado.success);

	const depois = await estoqueAtual(variacaoId);
	assert.strictEqual(
		depois.quantidade_estoque,
		10,
		"devolução não mexe no estoque real",
	);
	assert.strictEqual(
		depois.quantidade_reservada,
		0,
		"devolução libera a reserva inteira",
	);

	const linhas = await listarConsignacoes({ status: "devolvido" });
	const linha = linhas.find((l) => l.id === consignacaoId);
	assert.ok(
		linha,
		"consignação precisa aparecer no filtro por status devolvido",
	);
	assert.strictEqual(linha.status, "devolvido");
});

test("perdido restaura quantidade_disponivel sem tocar quantidade_estoque", async () => {
	const variacaoId = await criarVariacao(6);
	const { consignacaoId } = await registrarConsignacao({
		cliente_id: null,
		variacao_id: variacaoId,
		quantidade: 2,
	});

	const resultado = await marcarPerdida(consignacaoId);
	assert.ok(resultado.success);

	const depois = await estoqueAtual(variacaoId);
	assert.strictEqual(
		depois.quantidade_estoque,
		6,
		"perda não é baixa de estoque real",
	);
	assert.strictEqual(
		depois.quantidade_reservada,
		0,
		"perda libera a reserva inteira",
	);
});

test("uma consignação já encerrada não pode ser encerrada de novo", async () => {
	const variacaoId = await criarVariacao(6);
	const { consignacaoId } = await registrarConsignacao({
		cliente_id: null,
		variacao_id: variacaoId,
		quantidade: 1,
	});
	await marcarDevolvida(consignacaoId);

	await assert.rejects(() => marcarPerdida(consignacaoId), /já foi encerrada/);
});

test("vendido decrementa quantidade_estoque e quantidade_reservada atomicamente, e cria a Venda", async () => {
	const variacaoId = await criarVariacao(8);
	const clienteId = await criarCliente();
	const { consignacaoId } = await registrarConsignacao({
		cliente_id: clienteId,
		variacao_id: variacaoId,
		quantidade: 3,
	});

	const apósEmprestimo = await estoqueAtual(variacaoId);
	assert.strictEqual(apósEmprestimo.quantidade_estoque, 8);
	assert.strictEqual(apósEmprestimo.quantidade_reservada, 3);

	const resultado = await marcarVendida(consignacaoId, {
		preco_unitario: 150,
		forma_pagamento: "PIX",
	});
	assert.ok(resultado.success);
	assert.ok(Number.isInteger(resultado.vendaId));

	const apósVenda = await estoqueAtual(variacaoId);
	assert.strictEqual(
		apósVenda.quantidade_estoque,
		5,
		"vender a consignação baixa o estoque real (8 - 3)",
	);
	assert.strictEqual(
		apósVenda.quantidade_reservada,
		0,
		"vender a consignação libera a reserva que existia",
	);

	const venda = await getAsync("SELECT * FROM Vendas WHERE id = ?", [
		resultado.vendaId,
	]);
	assert.ok(venda, "a Venda correspondente precisa existir");
	assert.strictEqual(venda.cliente_id, clienteId);
	assert.strictEqual(venda.total, 450); // 150 * 3
	assert.strictEqual(venda.forma_pagamento, "PIX");
	assert.strictEqual(venda.status, "finalizada");
	assert.strictEqual(venda.origem, "consignacao");

	const itens = await getAsync("SELECT * FROM ItensVenda WHERE venda_id = ?", [
		resultado.vendaId,
	]);
	assert.ok(itens, "o ItensVenda correspondente precisa existir");
	assert.strictEqual(itens.variacao_id, variacaoId);
	assert.strictEqual(itens.quantidade, 3);
	assert.strictEqual(itens.preco_unitario, 150);

	const linhas = await listarConsignacoes({ status: "vendido" });
	const linha = linhas.find((l) => l.id === consignacaoId);
	assert.ok(linha);
	assert.strictEqual(linha.status, "vendido");
});

test("vendido sem forma de pagamento informada grava forma_pagamento null (não inventa um valor obrigatório)", async () => {
	const variacaoId = await criarVariacao(5);
	const { consignacaoId } = await registrarConsignacao({
		cliente_id: null,
		variacao_id: variacaoId,
		quantidade: 1,
	});

	const resultado = await marcarVendida(consignacaoId, { preco_unitario: 80 });
	const venda = await getAsync("SELECT * FROM Vendas WHERE id = ?", [
		resultado.vendaId,
	]);
	assert.strictEqual(venda.forma_pagamento, null);
});
