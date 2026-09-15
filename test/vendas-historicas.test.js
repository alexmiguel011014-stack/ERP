const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-vendas-historicas-"));
const db = require("../database");
const { allAsync, getAsync, runAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-vendas-historicas");
});

after(async () => {
	await db.bloquearBanco();
	try {
		fs.rmSync(TMP, { recursive: true });
	} catch {
		/* ignora erro de limpeza */
	}
});

test("registra venda histórica genérica sem item, estoque ou recebível duplicado", async () => {
	const resultado = await db.registrarVendaHistorica({
		nome: "Vendas de janeiro — balcão",
		total: 125.5,
		data_venda: "2020-01-10",
		cliente_id: null,
		forma_pagamento: "Genérico",
		request_id: "historica-generica-1",
	});

	const venda = await getAsync("SELECT * FROM Vendas WHERE id = ?", [
		resultado.vendaId,
	]);
	assert.equal(venda.total, 125.5);
	assert.equal(venda.forma_pagamento, "Genérico");
	assert.equal(venda.origem, "venda_historica_manual");
	assert.equal(venda.observacao, "Vendas de janeiro — balcão");
	assert.equal((await allAsync("SELECT * FROM ItensVenda WHERE venda_id = ?", [
		resultado.vendaId,
	])).length, 0);
	assert.equal((await allAsync(
		"SELECT * FROM LancamentosFinanceiros WHERE venda_id = ?",
		[resultado.vendaId],
	)).length, 0);

	const fluxo = await db.getFluxoCaixa("2020-01-10", "2020-01-10");
	assert.equal(fluxo.totalEntradas, 125.5);
	assert.equal(fluxo.totalSaidas, 0);
	assert.deepEqual(fluxo.eventos[0], {
		data: "2020-01-10",
		tipo: "entrada",
		origem: "venda_historica_manual",
		descricao: "Vendas de janeiro — balcão",
		categoria: "Vendas históricas",
		valor: 125.5,
		referenciaId: resultado.vendaId,
		formaPagamento: "Genérico",
	});

	const relatorio = await db.getRelatorioVendas("2020-01-10", "2020-01-10");
	assert.equal(relatorio.resumo.vendas, 1);
	assert.equal(relatorio.resumo.faturamento, 125.5);
	assert.deepEqual(relatorio.porPagamento, [
		{ forma_pagamento: "Genérico", vendas: 1, faturamento: 125.5 },
	]);
});

test("request_id torna o lançamento histórico idempotente", async () => {
	const dados = {
		nome: "Venda repetida",
		total: 40,
		data_venda: "2020-01-11",
		cliente_id: null,
		forma_pagamento: "PIX",
		request_id: "historica-idempotente-1",
	};
	const primeiro = await db.registrarVendaHistorica(dados);
	const segundo = await db.registrarVendaHistorica(dados);

	assert.equal(segundo.vendaId, primeiro.vendaId);
	assert.equal(segundo.idempotente, true);
	const linhas = await allAsync(
		"SELECT id FROM Vendas WHERE request_id = ?",
		[dados.request_id],
	);
	assert.equal(linhas.length, 1);
});

test("Fiado histórico cria um único recebível aberto e não entra no realizado", async () => {
	const cliente = await runAsync(
		"INSERT INTO Clientes (nome, ativo) VALUES (?, 1)",
		["Cliente histórico"],
	);
	const resultado = await db.registrarVendaHistorica({
		nome: "Fiado de janeiro",
		total: 80,
		data_venda: "2020-01-12",
		cliente_id: cliente.lastID,
		forma_pagamento: "Fiado",
		status_recebivel: "aberto",
		data_primeiro_vencimento: "2020-02-01",
		request_id: "historica-fiado-aberto-1",
	});
	const recebiveis = await allAsync(
		"SELECT * FROM LancamentosFinanceiros WHERE venda_id = ?",
		[resultado.vendaId],
	);
	assert.equal(recebiveis.length, 1);
	assert.equal(recebiveis[0].status, "aberto");
	assert.equal(recebiveis[0].origem, "venda_historica_manual");
	assert.equal(recebiveis[0].cliente_id, cliente.lastID);

	const realizado = await db.getFluxoCaixa("2020-01-12", "2020-01-12");
	assert.equal(realizado.totalEntradas, 0);
	const projetado = await db.getFluxoCaixaProjetado("2020-02-01", "2020-02-01");
	assert.equal(projetado.totalEntradas, 80);
	const parcelas = await db.getParcelasVenda(resultado.vendaId);
	assert.equal(parcelas.length, 1);
});

test("Fiado histórico já recebido aparece uma única vez no realizado", async () => {
	const cliente = await runAsync(
		"INSERT INTO Clientes (nome, ativo) VALUES (?, 1)",
		["Cliente quitado"],
	);
	const resultado = await db.registrarVendaHistorica({
		nome: "Fiado quitado antigo",
		total: 90,
		data_venda: "2020-01-13",
		cliente_id: cliente.lastID,
		forma_pagamento: "Fiado",
		status_recebivel: "pago",
		request_id: "historica-fiado-pago-1",
	});
	const fluxo = await db.getFluxoCaixa("2020-01-13", "2020-01-13");
	assert.equal(fluxo.totalEntradas, 90);
	assert.equal(fluxo.eventos.length, 1);
	assert.equal(fluxo.eventos[0].origem, "venda_historica_manual");
	assert.equal(fluxo.eventos[0].referenciaId, resultado.vendaId);
});

test("rejeita dados incompletos, data futura e Fiado sem cliente", async () => {
	await assert.rejects(
		() =>
			db.registrarVendaHistorica({
				nome: "",
				total: 10,
				data_venda: "2020-01-01",
			}),
		/Nome.*obrigatório/,
	);
	await assert.rejects(
		() =>
			db.registrarVendaHistorica({
				nome: "Futuro",
				total: 10,
				data_venda: "2099-01-01",
			}),
		/futuro/i,
	);
	await assert.rejects(
		() =>
			db.registrarVendaHistorica({
				nome: "Fiado sem cliente",
				total: 10,
				data_venda: "2020-01-01",
				forma_pagamento: "Fiado",
				status_recebivel: "pago",
			}),
		/cliente.*obrigatório/i,
	);
});
