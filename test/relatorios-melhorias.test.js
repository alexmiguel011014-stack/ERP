/* Bloco 2 da "Module Improvement Pass" (GOALS.md) — segmentação de clientes,
   produtos parados, sazonalidade, conversão de orçamentos, aging de
   recebíveis, e o comparativo de período anterior em getRelatorioVendas.
   Roda contra um SQLCipher temporário e descartável (mesmo padrão de
   test/negocio.test.js). */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-relatorios2-"));
const db = require("../database");
const { runAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-teste-123");
	await db.abrirCaixa(0, null);
});

after(async () => {
	await db.bloquearBanco();
});

async function criarVariacao(estoque) {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto Relatorios " + Math.random().toString(36).slice(2, 8),
	]);
	const sku = "SKU-" + Math.random().toString(36).slice(2, 10);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, quantidade_estoque) VALUES (?, ?, ?, ?)",
		[produto.lastID, sku, 100, estoque],
	);
	return { variacaoId: variacao.lastID, produtoId: produto.lastID };
}

async function criarVendaFinalizadaEm(dataIso, total) {
	await runAsync(
		"INSERT INTO Vendas (total, forma_pagamento, data_venda, status, origem) VALUES (?, 'Dinheiro', ?, 'finalizada', 'pdv')",
		[total, dataIso],
	);
}

test("getRelatorioVendas compara com o período anterior de igual duração", async () => {
	// Período de teste: 2026-01-10 a 2026-01-11 (2 dias) — anterior deveria
	// ser 2026-01-08 a 2026-01-09.
	await criarVendaFinalizadaEm("2026-01-10T10:00:00.000Z", 100);
	await criarVendaFinalizadaEm("2026-01-11T10:00:00.000Z", 100);
	await criarVendaFinalizadaEm("2026-01-08T10:00:00.000Z", 50);

	const resultado = await db.getRelatorioVendas("2026-01-10", "2026-01-11");
	assert.strictEqual(resultado.resumo.vendas, 2);
	assert.strictEqual(resultado.resumo.faturamento, 200);
	assert.deepStrictEqual(resultado.resumo.periodoAnterior, {
		inicio: "2026-01-08",
		fim: "2026-01-09",
	});
	// anterior: 1 venda de 50 -> atual 2 vendas de 200: (2-1)/1=100%, (200-50)/50=300%
	assert.strictEqual(resultado.resumo.vendasVariacao, 100);
	assert.strictEqual(resultado.resumo.faturamentoVariacao, 300);
});

test("getSegmentacaoClientes classifica por recência e frequência", async () => {
	const clienteFrequente = await runAsync(
		"INSERT INTO Clientes (nome) VALUES (?)",
		["Cliente Frequente"],
	);
	const agora = new Date().toISOString();
	for (let i = 0; i < 3; i++) {
		await runAsync(
			"INSERT INTO Vendas (cliente_id, total, data_venda, status, origem) VALUES (?, 100, ?, 'finalizada', 'pdv')",
			[clienteFrequente.lastID, agora],
		);
	}

	const clienteInativo = await runAsync(
		"INSERT INTO Clientes (nome) VALUES (?)",
		["Cliente Inativo"],
	);
	const hasMuitoTempo = new Date(Date.now() - 200 * 86400000).toISOString();
	await runAsync(
		"INSERT INTO Vendas (cliente_id, total, data_venda, status, origem) VALUES (?, 100, ?, 'finalizada', 'pdv')",
		[clienteInativo.lastID, hasMuitoTempo],
	);

	await runAsync("INSERT INTO Clientes (nome) VALUES (?)", [
		"Cliente Nunca Comprou",
	]);

	const resultado = await db.getSegmentacaoClientes();
	const frequente = resultado.find((c) => c.nome === "Cliente Frequente");
	const inativo = resultado.find((c) => c.nome === "Cliente Inativo");
	const nunca = resultado.find((c) => c.nome === "Cliente Nunca Comprou");

	assert.strictEqual(frequente.segmento, "Frequente");
	assert.strictEqual(frequente.frequencia, 3);
	assert.strictEqual(inativo.segmento, "Inativo");
	assert.strictEqual(nunca.segmento, "Nunca comprou");
	assert.strictEqual(nunca.diasDesdeUltimaCompra, null);
});

test("getProdutosParados só lista SKU com estoque e zero venda no período", async () => {
	const parado = await criarVariacao(10);
	const vendido = await criarVariacao(10);
	const semEstoque = await criarVariacao(0);

	const venda = await runAsync(
		"INSERT INTO Vendas (total, data_venda, status, origem) VALUES (100, '2026-02-15T10:00:00.000Z', 'finalizada', 'pdv')",
	);
	await runAsync(
		"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, 1, 100)",
		[venda.lastID, vendido.variacaoId],
	);

	const resultado = await db.getProdutosParados("2026-02-01", "2026-02-28");
	const produtoIds = resultado.map((r) => r.produto_id);
	assert.ok(produtoIds.includes(parado.produtoId));
	assert.ok(!produtoIds.includes(vendido.produtoId));
	assert.ok(!produtoIds.includes(semEstoque.produtoId));
});

test("getSazonalidade agrupa por dia da semana e por hora", async () => {
	// 2026-01-14 é uma quarta-feira (dia_semana=3 no strftime %w, 0=domingo).
	await criarVendaFinalizadaEm("2026-01-14T15:30:00.000Z", 100);

	const resultado = await db.getSazonalidade();
	const quarta = resultado.porDiaSemana.find((d) => d.diaSemana === 3);
	assert.ok(quarta, "deveria ter uma entrada pra quarta-feira");
	assert.ok(quarta.vendas >= 1);
	const hora15 = resultado.porHora.find((h) => h.hora === 15);
	assert.ok(hora15, "deveria ter uma entrada pras 15h");
	assert.ok(hora15.vendas >= 1);
});

test("getConversaoOrcamentos conta convertidos, cancelados e abertos", async () => {
	const { variacaoId } = await criarVariacao(20);

	async function criarOrcamento() {
		return db.finalizarVenda(
			{
				itens: [
					{ variacao_id: variacaoId, quantidade: 1, preco_unitario: 100 },
				],
				total: 100,
				status: "orcamento",
			},
			null,
		);
	}

	const convertido = await criarOrcamento();
	await db.converterOrcamento(convertido.vendaId);

	const cancelado = await criarOrcamento();
	await db.cancelarOrcamento(cancelado.vendaId);

	await criarOrcamento(); // fica aberto

	const hoje = new Date().toISOString().slice(0, 10);
	const resultado = await db.getConversaoOrcamentos(hoje, hoje);
	assert.ok(resultado.convertidas >= 1);
	assert.ok(resultado.canceladas >= 1);
	assert.ok(resultado.abertas >= 1);
	assert.ok(
		resultado.taxaConversaoPercentual !== null &&
			resultado.taxaConversaoPercentual > 0,
	);
});

test("getAgingRecebiveis bucketiza por dias de atraso", async () => {
	const hoje = Date.now();
	const dataAtraso = (dias) => new Date(hoje - dias * 86400000).toISOString();

	await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, status, data_criacao) VALUES ('receber', 'A vencer', 10, ?, 'aberto', ?)",
		[dataAtraso(-5), new Date().toISOString()],
	);
	await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, status, data_criacao) VALUES ('receber', '10 dias atraso', 20, ?, 'aberto', ?)",
		[dataAtraso(10), new Date().toISOString()],
	);
	await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, status, data_criacao) VALUES ('receber', '100 dias atraso', 30, ?, 'aberto', ?)",
		[dataAtraso(100), new Date().toISOString()],
	);

	const resultado = await db.getAgingRecebiveis();
	assert.ok(resultado.aVencer.itens.some((i) => i.descricao === "A vencer"));
	assert.ok(
		resultado.atraso0a30.itens.some((i) => i.descricao === "10 dias atraso"),
	);
	assert.ok(
		resultado.atraso90mais.itens.some((i) => i.descricao === "100 dias atraso"),
	);
	assert.strictEqual(resultado.totalGeral >= 60, true);
});
