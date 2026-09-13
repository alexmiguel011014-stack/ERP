const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-relatorio-lucratividade-"));
const db = require("../database");
const { runAsync, getAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-relatorio-lucratividade");
});

after(async () => {
	await db.bloquearBanco();
});

test("DRE calcula lucro bruto e desconta custo fixo passivamente", async () => {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto margem",
	]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque, atributos) VALUES (?, ?, ?, ?, ?, ?)",
		[produto.lastID, "MARGEM-E2E", 150, 100, 1, "[]"],
	);
	const venda = await runAsync(
		"INSERT INTO Vendas (total, forma_pagamento, data_venda, status, desconto) VALUES (?, ?, ?, 'finalizada', 0)",
		[150, "Dinheiro", "2026-01-15T12:00:00Z"],
	);
	await runAsync(
		"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario, custo_unitario) VALUES (?, ?, 1, 150, 100)",
		[venda.lastID, variacao.lastID],
	);
	await db.saveCustoFixoConfig(30);

	const dre = await db.getDRE("2026-01-01", "2026-01-31");
	assert.equal(dre.receitaBruta, 150);
	assert.equal(dre.cmv, 100);
	assert.equal(dre.lucroBruto, 50);
	assert.equal(dre.custoFixoProvisionado, 30);
	assert.equal(dre.lucroLiquido, 20);
});

test("custo fixo mensal é provisionado uma vez por relatório", async () => {
	await db.saveCustoFixoConfig(10);

	const dre = await db.getDRE("2026-08-01", "2026-09-12");
	assert.equal(dre.custoFixoProvisionado, 10);
	assert.equal(dre.mesesProvisionados, 1);
	assert.equal(dre.provisaoDeclarada, 10);
	assert.deepEqual(dre.pagamentosFixosPorMes, { "2026-09": 0 });
	assert.equal(dre.lucroLiquido, dre.lucroBruto - dre.despesas - 10);
});

test("custo fixo não altera preço persistido e cartão duplicado entra uma vez na projeção", async () => {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto preço estável",
	]);
	await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque, atributos) VALUES (?, ?, ?, ?, ?, ?)",
		[produto.lastID, "PRECO-E2E", 140, 100, 1, "[]"],
	);
	await runAsync(
		"INSERT INTO Precificacao (produto_id, preco_custo, preco_venda, status, aplicar_custo_fixo) VALUES (?, 100, 140, 'pendente', 1)",
		[produto.lastID],
	);
	await db.saveCustoFixoConfig(1000);
	await db.getPricingData();
	const preco = await getAsync("SELECT preco FROM Variacoes WHERE produto_id = ?", [
		produto.lastID,
	]);
	assert.equal(preco.preco, 140);

	const venda = await runAsync(
		"INSERT INTO Vendas (total, forma_pagamento, data_venda, status, desconto) VALUES (?, 'Cartão', ?, 'finalizada', 0)",
		[150, "2026-01-20T12:00:00Z"],
	);
	const campos =
		"(tipo, descricao, valor, data_vencimento, status, origem, referencia_id, forma_pagamento, venda_id, grupo_id, parcela_num, parcela_total, categoria)";
	for (let i = 0; i < 2; i += 1) {
		await runAsync(
			`INSERT INTO LancamentosFinanceiros ${campos} VALUES ('pagar', 'Taxa cartão', 10, '2026-01-25', 'aberto', 'venda', ?, NULL, ?, 'cartao-1', 1, 1, 'Pagamento de cartão')`,
			[venda.lastID, venda.lastID],
		);
	}
	const projetado = await db.getFluxoCaixaProjetado("2026-01-01", "2026-01-31");
	assert.equal(projetado.totalSaidas, 10);
});

test("pagamento classificado por subtipo reduz apenas a provisão fixa do mesmo mês", async () => {
	await db.saveCustoFixoConfig(100);
	await runAsync(
		`INSERT INTO LancamentosFinanceiros
     (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, categoria, subtipo)
     VALUES ('pagar', 'Custo fixo por subtipo', 30, '2030-01-15', '2030-01-15T12:00:00Z', 'pago', 'manual', 'Outros', 'custo_fixo')`,
	);

	const janeiro = await db.getDRE("2030-01-01", "2030-01-31");
	const fevereiro = await db.getDRE("2030-02-01", "2030-02-28");
	assert.equal(janeiro.despesasFixasPagas, 30);
	assert.equal(janeiro.custoFixoProvisionado, 70);
	assert.equal(fevereiro.despesasFixasPagas, 0);
	assert.equal(fevereiro.custoFixoProvisionado, 100);
});

test("faturamento bruto recompõe o desconto sem subtraí-lo duas vezes", async () => {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto com desconto",
	]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque, atributos) VALUES (?, ?, ?, ?, ?, ?)",
		[produto.lastID, "DESCONTO-E2E", 150, 100, 1, "[]"],
	);
	const venda = await runAsync(
		"INSERT INTO Vendas (total, forma_pagamento, data_venda, status, desconto) VALUES (140, 'Dinheiro', '2026-03-15T12:00:00Z', 'finalizada', 10)",
	);
	await runAsync(
		"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario, custo_unitario) VALUES (?, ?, 1, 150, 100)",
		[venda.lastID, variacao.lastID],
	);
	const dre = await db.getDRE("2026-03-01", "2026-03-31");
	assert.equal(dre.receitaBruta, 150);
	assert.equal(dre.receitaLiquida, 140);
	assert.equal(dre.lucroBruto, 40);
});

test("lucro líquido estimado desconta cartão em aberto uma vez", async () => {
	await db.saveCustoFixoConfig(0);
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto cartão em aberto",
	]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque, atributos) VALUES (?, ?, ?, ?, ?, ?)",
		[produto.lastID, "CARTAO-E2E", 1000, 800, 1, "[]"],
	);
	const venda = await runAsync(
		"INSERT INTO Vendas (total, forma_pagamento, data_venda, status, desconto) VALUES (1000, 'Cartão', '2026-04-15T12:00:00Z', 'finalizada', 0)",
	);
	await runAsync(
		"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario, custo_unitario) VALUES (?, ?, 1, 1000, 800)",
		[venda.lastID, variacao.lastID],
	);
	await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, status, origem, referencia_id, forma_pagamento, venda_id, grupo_id, parcela_num, parcela_total) VALUES ('pagar', 'Taxa cartão', 100, '2026-04-30', 'aberto', 'venda', ?, 'Cartão', ?, 'cartao-lucro-1', 1, 1)",
		[venda.lastID, venda.lastID],
	);

	const relatorio = await db.getRelatorioFluxoCaixa(
		"2026-04-01",
		"2026-04-30",
	);
	assert.equal(relatorio.dre.lucroBruto, 200);
	assert.equal(relatorio.despesasCartaoAbertas, 100);
	assert.equal(relatorio.lucroLiquidoEstimado, 100);
});

test("saldo final estimado parte da abertura de caixa e termina em 300", async () => {
	await runAsync(
		`INSERT INTO FechamentosCaixa
     (data_abertura, valor_abertura, status)
     VALUES ('2027-01-01T08:00:00Z', 3000, 'aberto')`,
	);
	await runAsync(
		`INSERT INTO LancamentosFinanceiros
     (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem)
     VALUES ('pagar', 'Saída do caixa', 2700, '2027-01-15', '2027-01-15T12:00:00Z', 'pago', 'manual')`,
	);

	const relatorio = await db.getRelatorioFluxoCaixa(
		"2027-01-01",
		"2027-01-31",
	);
	assert.equal(relatorio.saldoInicial, 3000);
	assert.equal(relatorio.saldoFinalRealizado, 300);
	assert.equal(relatorio.saldoFinalEstimado, 300);
});

test("saldo inicial é zero quando não existe sessão de caixa anterior", async () => {
	const relatorio = await db.getRelatorioFluxoCaixa(
		"2025-01-01",
		"2025-01-31",
	);
	assert.equal(relatorio.saldoInicial, 0);
	assert.equal(relatorio.saldoFinalRealizado, 0);
	assert.equal(relatorio.saldoFinalEstimado, 0);
});

test("fechamento não duplica o saldo já movimentado no período", async () => {
	await runAsync("DELETE FROM FechamentosCaixa");
	await runAsync(
		`INSERT INTO FechamentosCaixa
     (data_abertura, valor_abertura, data_fechamento, valor_informado, valor_esperado, status)
     VALUES ('2028-01-01T08:00:00Z', 0, '2028-01-31T18:00:00Z', 300, 300, 'fechado')`,
	);
	await runAsync(
		`INSERT INTO Vendas (total, forma_pagamento, data_venda, status, desconto)
     VALUES (300, 'Dinheiro', '2028-01-20T12:00:00Z', 'finalizada', 0)`,
	);
	const relatorio = await db.getRelatorioFluxoCaixa(
		"2028-01-01",
		"2028-01-31",
	);
	assert.equal(relatorio.saldoInicial, 0);
	assert.equal(relatorio.saldoFinalRealizado, 300);
});

test("saldo inicial usa o valor contado de um fechamento anterior", async () => {
	await runAsync(
		`INSERT INTO FechamentosCaixa
     (data_abertura, valor_abertura, data_fechamento, valor_informado, valor_esperado, status)
     VALUES ('2028-02-01T08:00:00Z', 100, '2028-02-10T18:00:00Z', 150, 150, 'fechado')`,
	);
	const relatorio = await db.getRelatorioFluxoCaixa(
		"2028-02-11",
		"2028-02-28",
	);
	assert.equal(relatorio.saldoInicial, 150);
});

test("devolução reduz receita líquida e CMV uma única vez; cancelada fica fora", async () => {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto devolução",
	]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque, atributos) VALUES (?, ?, ?, ?, ?, ?)",
		[produto.lastID, "DEVOLUCAO-E2E", 150, 100, 2, "[]"],
	);
	const venda = await runAsync(
		"INSERT INTO Vendas (total, forma_pagamento, data_venda, desconto, status) VALUES (150, 'Dinheiro', '2030-01-10T12:00:00Z', 0, 'finalizada')",
	);
	const item = await runAsync(
		"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario, custo_unitario) VALUES (?, ?, 1, 150, 100)",
		[venda.lastID, variacao.lastID],
	);
	await runAsync(
		"INSERT INTO Vendas (total, forma_pagamento, data_venda, desconto, status) VALUES (90, 'Dinheiro', '2030-01-11T12:00:00Z', 0, 'cancelado')",
	);
	const devolucao = await runAsync(
		"INSERT INTO Devolucoes (venda_id, motivo, valor_total, data) VALUES (?, 'arrependimento', 150, '2030-01-20T12:00:00Z')",
		[venda.lastID],
	);
	await runAsync(
		"INSERT INTO ItensDevolucao (devolucao_id, item_venda_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, ?, 1, 150)",
		[devolucao.lastID, item.lastID, variacao.lastID],
	);

	const dre = await db.getDRE("2030-01-01", "2030-01-31");
	const vendas = await db.getRelatorioVendas("2030-01-01", "2030-01-31");
	assert.equal(dre.receitaBruta, 150);
	assert.equal(dre.devolucoes, 150);
	assert.equal(dre.receitaLiquida, 0);
	assert.equal(dre.cmv, 0);
	assert.equal(dre.lucroBruto, 0);
	assert.equal(vendas.resumo.faturamento, 150);
	assert.equal(vendas.resumo.devolucoes, 150);
	assert.equal(vendas.resumo.faturamentoLiquido, 0);
});

test("devolução em dia sem venda aparece no detalhamento diário", async () => {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto retorno isolado",
	]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque, atributos) VALUES (?, ?, ?, ?, ?, ?)",
		[produto.lastID, "DEVOLUCAO-ISOLADA", 80, 50, 1, "[]"],
	);
	const venda = await runAsync(
		"INSERT INTO Vendas (total, forma_pagamento, data_venda, desconto, status) VALUES (80, 'Cartão', '2031-01-02T12:00:00Z', 0, 'finalizada')",
	);
	const item = await runAsync(
		"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario, custo_unitario) VALUES (?, ?, 1, 80, 50)",
		[venda.lastID, variacao.lastID],
	);
	const devolucao = await runAsync(
		"INSERT INTO Devolucoes (venda_id, motivo, valor_total, data) VALUES (?, 'troca', 80, '2031-02-05T12:00:00Z')",
		[venda.lastID],
	);
	await runAsync(
		"INSERT INTO ItensDevolucao (devolucao_id, item_venda_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, ?, 1, 80)",
		[devolucao.lastID, item.lastID, variacao.lastID],
	);

	const vendas = await db.getRelatorioVendas("2031-02-01", "2031-02-28");
	assert.equal(vendas.porDia.length, 1);
	assert.equal(vendas.porDia[0].dia, "2031-02-05");
	assert.equal(vendas.porDia[0].vendas, 0);
	assert.equal(vendas.porDia[0].faturamentoLiquido, -80);
	assert.equal(vendas.porPagamento[0].forma_pagamento, "Cartão");
	assert.equal(vendas.porPagamento[0].faturamentoLiquido, -80);
});

test("devolução integral recompõe o desconto original sem criar estorno maior", async () => {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto desconto devolução",
	]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque, atributos) VALUES (?, ?, ?, ?, ?, ?)",
		[produto.lastID, "DEVOLUCAO-DESCONTO", 150, 100, 1, "[]"],
	);
	const venda = await runAsync(
		"INSERT INTO Vendas (total, forma_pagamento, data_venda, desconto, status) VALUES (140, 'Dinheiro', '2032-01-10T12:00:00Z', 10, 'finalizada')",
	);
	const item = await runAsync(
		"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario, custo_unitario) VALUES (?, ?, 1, 150, 100)",
		[venda.lastID, variacao.lastID],
	);
	await db.registrarDevolucao({
		venda_id: venda.lastID,
		itens: [{ item_venda_id: item.lastID, quantidade: 1 }],
		motivo: "desconto",
	});
	const devolucao = (await db.getDevolucoes({ vendaId: venda.lastID }))[0];
	assert.equal(devolucao.valor_total, 140);
});

test("retorno com desconto em período posterior mantém Curva ABC e margem no valor líquido", async () => {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto retorno posterior",
	]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque, atributos) VALUES (?, ?, ?, ?, ?, ?)",
		[produto.lastID, "DEVOLUCAO-POSTERIOR", 150, 100, 1, "[]"],
	);
	const venda = await runAsync(
		"INSERT INTO Vendas (total, forma_pagamento, data_venda, desconto, status) VALUES (140, 'Dinheiro', '2033-01-10T12:00:00Z', 10, 'finalizada')",
	);
	const item = await runAsync(
		"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario, custo_unitario) VALUES (?, ?, 1, 150, 100)",
		[venda.lastID, variacao.lastID],
	);
	const devolucao = await runAsync(
		"INSERT INTO Devolucoes (venda_id, motivo, valor_total, data) VALUES (?, 'posterior', 140, '2033-02-05T12:00:00Z')",
		[venda.lastID],
	);
	await runAsync(
		"INSERT INTO ItensDevolucao (devolucao_id, item_venda_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, ?, 1, 140)",
		[devolucao.lastID, item.lastID, variacao.lastID],
	);
	const curva = await db.getCurvaABC("2033-02-01", "2033-02-28");
	const margem = await db.getMargemContribuicao("2033-02-01", "2033-02-28");
	assert.equal(curva[0].receita, -140);
	assert.equal(margem.porProduto[0].receita, -140);
});

test("período todo provisiona apenas o mês final, não todo o histórico", async () => {
	await db.saveCustoFixoConfig(123);
	const dre = await db.getDRE("1900-01-01", "2040-01-31");
	assert.equal(dre.mesesProvisionados, 1);
	assert.equal(dre.provisaoDeclarada, 123);
	assert.equal(dre.custoFixoProvisionado, 123);
	assert.deepEqual(dre.pagamentosFixosPorMes, { "2040-01": 0 });
});

test("taxa Pix ausente é zero e taxa do cartão usa específica ou média", async () => {
	await db.saveTaxaAdquirente(4);
	await db.saveTaxaAdquirentePorMetodo("cartao", 3);
	await runAsync("DELETE FROM Configuracao WHERE chave = 'taxa_adquirente_pix'");

	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto taxas por forma",
	]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque, atributos) VALUES (?, ?, ?, ?, ?, ?)",
		[produto.lastID, "TAXA-FORMA-E2E", 100, 0, 3, "[]"],
	);
	for (const forma of ["PIX", "Cartão", "Dinheiro"]) {
		const venda = await runAsync(
			"INSERT INTO Vendas (total, forma_pagamento, data_venda, status, desconto) VALUES (100, ?, '2041-01-15T12:00:00Z', 'finalizada', 0)",
			[forma],
		);
		await runAsync(
			"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario, custo_unitario) VALUES (?, ?, 1, 100, 0)",
			[venda.lastID, variacao.lastID],
		);
	}
	const vendaMista = await runAsync(
		"INSERT INTO Vendas (total, forma_pagamento, data_venda, status, desconto) VALUES (100, 'Misto', '2041-01-15T12:00:00Z', 'finalizada', 0)",
	);
	await runAsync(
		"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario, custo_unitario) VALUES (?, ?, 1, 100, 0)",
		[vendaMista.lastID, variacao.lastID],
	);
	await runAsync(
		"INSERT INTO VendaPagamentos (venda_id, forma_pagamento, valor, criado_em) VALUES (?, 'PIX', 60, '2041-01-15T12:00:00Z'), (?, 'Cartão', 40, '2041-01-15T12:00:00Z')",
		[vendaMista.lastID, vendaMista.lastID],
	);

	const margem = await db.getMargemContribuicao(
		"2041-01-01",
		"2041-01-31",
	);
	assert.equal(margem.taxaAdquirenteUsada, 4);
	assert.equal(margem.margemContribuicaoTotal, 395.8);
});
