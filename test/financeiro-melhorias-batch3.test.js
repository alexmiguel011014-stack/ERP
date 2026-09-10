/* Bloco 3 da "Module Improvement Pass" (GOALS.md) — fluxo de caixa
   projetado, taxa de adquirente por forma de pagamento, e lançamento
   recorrente (CRUD + gerador idempotente). Roda contra um SQLCipher
   temporário e descartável (mesmo padrão de test/negocio.test.js). */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-financeiro3-"));
const db = require("../database");
const { runAsync, getAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-teste-123");
	await db.abrirCaixa(0, null);
});

after(async () => {
	await db.bloquearBanco();
});

test("getFluxoCaixaProjetado só considera lançamentos ABERTOS, por data_vencimento", async () => {
	const futuro = new Date(Date.now() + 5 * 86400000).toISOString();
	await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, status, data_criacao) VALUES ('receber', 'Em aberto', 500, ?, 'aberto', ?)",
		[futuro, new Date().toISOString()],
	);
	await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, data_pagamento, status, data_criacao) VALUES ('receber', 'Já pago', 999, ?, ?, 'pago', ?)",
		[futuro, futuro, new Date().toISOString()],
	);

	const resultado = await db.getFluxoCaixaProjetado(null, null);
	assert.strictEqual(resultado.totalEntradas, 500);
});

test("criarLancamentoRecorrente valida dia_mes e campos obrigatórios", async () => {
	await assert.rejects(() =>
		db.criarLancamentoRecorrente({
			tipo: "pagar",
			descricao: "Aluguel",
			valor: 1500,
			dia_mes: 40,
		}),
	);
	const resultado = await db.criarLancamentoRecorrente({
		tipo: "pagar",
		descricao: "Aluguel",
		valor: 1500,
		dia_mes: 5,
		categoria: "Aluguel",
	});
	assert.strictEqual(resultado.success, true);
});

test("listarLancamentosRecorrentes, alternar e remover", async () => {
	const criado = await db.criarLancamentoRecorrente({
		tipo: "pagar",
		descricao: "Internet",
		valor: 150,
		dia_mes: 10,
	});
	let lista = await db.listarLancamentosRecorrentes();
	let item = lista.find((l) => l.id === criado.id);
	assert.strictEqual(item.ativo, 1);

	await db.alternarLancamentoRecorrente(criado.id, false);
	lista = await db.listarLancamentosRecorrentes();
	item = lista.find((l) => l.id === criado.id);
	assert.strictEqual(item.ativo, 0);

	await db.removerLancamentoRecorrente(criado.id);
	lista = await db.listarLancamentosRecorrentes();
	assert.ok(!lista.find((l) => l.id === criado.id));
});

test("gerarLancamentosRecorrentesDoMes é idempotente — rodar duas vezes não duplica", async () => {
	const criado = await db.criarLancamentoRecorrente({
		tipo: "pagar",
		descricao: "Aluguel Idempotente",
		valor: 2000,
		dia_mes: 5,
	});

	const r1 = await db.gerarLancamentosRecorrentesDoMes();
	assert.ok(r1.gerados >= 1);
	const r2 = await db.gerarLancamentosRecorrentesDoMes();
	assert.strictEqual(
		r2.gerados,
		0,
		"segunda chamada não deveria gerar de novo",
	);

	const linhas = await getAsync(
		"SELECT COUNT(*) AS n FROM LancamentosFinanceiros WHERE origem = 'recorrente' AND referencia_id = ?",
		[criado.id],
	);
	assert.strictEqual(linhas.n, 1);
});

test("gerarLancamentosRecorrentesDoMes ignora templates pausados (ativo=0)", async () => {
	const criado = await db.criarLancamentoRecorrente({
		tipo: "pagar",
		descricao: "Pausado",
		valor: 100,
		dia_mes: 5,
	});
	await db.alternarLancamentoRecorrente(criado.id, false);

	await db.gerarLancamentosRecorrentesDoMes();

	const linha = await getAsync(
		"SELECT COUNT(*) AS n FROM LancamentosFinanceiros WHERE origem = 'recorrente' AND referencia_id = ?",
		[criado.id],
	);
	assert.strictEqual(linha.n, 0);
});

test("taxa de adquirente por método sobrepõe a média só quando configurada, senão cai pro fallback", async () => {
	const usuario = await runAsync(
		"INSERT INTO Usuarios (login, nome, comissao_percentual) VALUES (?, ?, 0)",
		["vendedor-taxa-" + Math.random().toString(36).slice(2, 8), "Vendedor"],
	);
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto Taxa " + Math.random().toString(36).slice(2, 8),
	]);
	const variacaoPix = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque) VALUES (?, ?, 100, 50, 10)",
		[produto.lastID, "SKU-TAXA-PIX-" + Math.random().toString(36).slice(2, 8)],
	);
	const variacaoCartao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque) VALUES (?, ?, 100, 50, 10)",
		[
			produto.lastID,
			"SKU-TAXA-CARTAO-" + Math.random().toString(36).slice(2, 8),
		],
	);

	await db.saveTaxaAdquirente(3); // flat/fallback: 3%

	await db.finalizarVenda(
		{
			itens: [
				{
					variacao_id: variacaoPix.lastID,
					quantidade: 1,
					preco_unitario: 100,
				},
			],
			total: 100,
			forma_pagamento: "PIX",
		},
		usuario.lastID,
	);
	await db.finalizarVenda(
		{
			itens: [
				{
					variacao_id: variacaoCartao.lastID,
					quantidade: 1,
					preco_unitario: 100,
				},
			],
			total: 100,
			forma_pagamento: "Cartão",
		},
		usuario.lastID,
	);

	// Sem taxa por método configurada: ambos usam a média de 3% -> margem = 100-50-3 = 47.
	let resultado = await db.getMargemContribuicao();
	let linhaPix = resultado.porProduto.find(
		(p) => p.produto_id === produto.lastID,
	);
	assert.strictEqual(linhaPix.margemContribuicao, 94); // 47 (pix) + 47 (cartão)

	// Configura taxa específica pro Pix (0.5%) — só a venda Pix muda.
	await db.saveTaxaAdquirentePorMetodo("pix", 0.5);
	resultado = await db.getMargemContribuicao();
	linhaPix = resultado.porProduto.find((p) => p.produto_id === produto.lastID);
	// pix: 100-50-0.5=49.5 ; cartão continua na média 3%: 100-50-3=47 -> total 96.5
	assert.strictEqual(linhaPix.margemContribuicao, 96.5);
});
