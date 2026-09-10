/* Cobertura do endpoint de faturamento por período do dashboard (GOALS.md,
   seção "Dashboard — Faturamento Chart Redesign"): validação de escopo e
   granularidade de agregação (dia/semana/mês) por range. Roda contra um
   SQLCipher temporário e descartável (mesmo padrão de
   test/relatorios-financeiro.test.js), inserindo vendas diretamente via SQL
   (sem passar por finalizarVenda, que exige caixa aberto e itens reais). */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-fatperiodo-"));
const db = require("../database");
const { runAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-teste-123");
});

after(async () => {
	await db.bloquearBanco();
});

function isoData(offsetDias = 0) {
	return new Date(Date.now() + offsetDias * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10);
}

async function inserirVenda(dataISO, total) {
	await runAsync(
		"INSERT INTO Vendas (total, forma_pagamento, data_venda, status, origem) VALUES (?, NULL, ?, 'finalizada', 'teste')",
		[total, dataISO],
	);
}

test("getFaturamentoPorPeriodo: rejeita escopo inválido", async () => {
	await assert.rejects(() => db.getFaturamentoPorPeriodo("3 meses"));
});

test("getFaturamentoPorPeriodo 7d: granularidade diária, zero-preenche dias sem venda", async () => {
	await inserirVenda(isoData(0), 111);
	const resultado = await db.getFaturamentoPorPeriodo("7d");

	assert.strictEqual(resultado.granularidade, "dia");
	assert.strictEqual(resultado.dados.length, 7);

	const hoje = resultado.dados[resultado.dados.length - 1];
	assert.strictEqual(hoje.periodo, isoData(0));
	assert.ok(hoje.faturamento >= 111);

	const semVenda = resultado.dados.find((p) => p.periodo === isoData(-3));
	assert.ok(semVenda, "deveria existir um bucket pro dia sem venda");
	assert.strictEqual(semVenda.faturamento, 0);
});

test("getFaturamentoPorPeriodo 6m: agrega em buckets semanais cobrindo ~183 dias", async () => {
	const resultado = await db.getFaturamentoPorPeriodo("6m");

	assert.strictEqual(resultado.granularidade, "semana");
	assert.ok(
		resultado.dados.length >= 24 && resultado.dados.length <= 28,
		`esperava ~27 buckets semanais, achou ${resultado.dados.length}`,
	);
	const somaTotal = resultado.dados.reduce((acc, p) => acc + p.faturamento, 0);
	assert.ok(
		somaTotal >= 111,
		"a venda de hoje (7d test) deve estar contida em algum bucket semanal",
	);
});

test("getFaturamentoPorPeriodo 1a: agrega em buckets mensais somando vendas do mesmo mês", async () => {
	const mesAtual = isoData(0).slice(0, 7);
	await inserirVenda(`${mesAtual}-01`, 50);
	const resultado = await db.getFaturamentoPorPeriodo("1a");

	assert.strictEqual(resultado.granularidade, "mes");
	const bucketMesAtual = resultado.dados.find((p) =>
		p.periodo.startsWith(mesAtual),
	);
	assert.ok(bucketMesAtual, "deveria existir um bucket pro mês atual");
	assert.ok(
		bucketMesAtual.faturamento >= 161,
		"111 (venda de hoje) + 50 (venda no dia 1 do mês) somados no mesmo bucket mensal",
	);
});

test("getFaturamentoPorPeriodo tudo: não quebra e cobre desde a primeira venda registrada", async () => {
	const resultado = await db.getFaturamentoPorPeriodo("tudo");

	assert.strictEqual(resultado.granularidade, "mes");
	assert.ok(resultado.dados.length >= 1);
});
