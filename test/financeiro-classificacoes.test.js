const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-financeiro-classificacoes-"));
const db = require("../database");
const { runAsync, getAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-financeiro-classificacoes");
});

after(async () => {
	await db.bloquearBanco();
});

test("classifica pessoal, preserva competência e propaga recorrência", async () => {
	const criado = await db.criarLancamento({
		tipo: "pagar",
		descricao: "Pró-labore setembro",
		valor: 800,
		data_vencimento: "2026-09-10",
		parcelas: 2,
		categoria: "Folha/Comissão",
		subtipo: "pro_labore",
		competencia_mes: "2026-09",
	});
	const parcelas = await db.getLancamentos({ categoria: "Folha/Comissão" });
	const doGrupo = parcelas.filter((linha) => linha.grupo_id);
	assert.equal(doGrupo.length, 2);
	assert.deepEqual(
		[...new Set(doGrupo.map((linha) => linha.subtipo))],
		["pro_labore"],
	);
	assert.deepEqual(
		[...new Set(doGrupo.map((linha) => linha.competencia_mes))],
		["2026-09"],
	);
	assert.equal(criado.success, true);

	const recorrente = await db.criarLancamentoRecorrente({
		tipo: "pagar",
		descricao: "Salário mensal",
		valor: 1000,
		dia_mes: 15,
		categoria: "Folha/Comissão",
		subtipo: "salario",
		competencia_mes: "2026-09",
	});
	const template = await getAsync(
		"SELECT subtipo, competencia_mes FROM LancamentosRecorrentes WHERE id = ?",
		[recorrente.id],
	);
	assert.equal(template.subtipo, "salario");
	assert.equal(template.competencia_mes, "2026-09");
});

test("DRE separa pessoal e não trata investimento como despesa operacional", async () => {
	const inserirPago = async (descricao, valor, categoria, subtipo) => {
		const agora = "2026-09-20T12:00:00Z";
		await runAsync(
			`INSERT INTO LancamentosFinanceiros
			 (tipo, descricao, valor, data_vencimento, data_pagamento, status, categoria, subtipo, competencia_mes, data_criacao)
			 VALUES ('pagar', ?, ?, '2026-09-20', ?, 'pago', ?, ?, '2026-09', ?)`,
			[descricao, valor, agora, categoria, subtipo || null, agora],
		);
	};
	await inserirPago("Salário", 100, "Folha/Comissão", "salario");
	await inserirPago("Encargos", 25, "Folha/Comissão", "encargos");
	await inserirPago("Investimento", 500, "Investimento", null);
	await inserirPago("Investimento classificado", 75, "Outros", "investimento");
	await runAsync(
		`INSERT INTO LancamentosFinanceiros
		 (tipo, descricao, valor, data_vencimento, status, categoria, subtipo, competencia_mes, data_criacao)
		 VALUES ('pagar', 'Pró-labore aberto', 75, '2026-09-25', 'aberto', 'Folha/Comissão', 'pro_labore', '2026-09', '2026-09-01')`,
	);

	const dre = await db.getDRE("2026-09-01", "2026-09-30");
	assert.equal(dre.despesas, 125);
	assert.equal(dre.investimentosPagos, 575);
	assert.equal(dre.salariosPagos, 100);
	assert.equal(dre.encargosPagos, 25);
	assert.equal(dre.proLaborePago, 0);
	// apenas a primeira parcela do primeiro cenário vence em setembro (400) + 75.
	assert.equal(dre.proLaboreAberto, 475);
});

test("recusa subtipo em recebimento e competência malformada", async () => {
	await assert.rejects(
		() =>
			db.criarLancamento({
				tipo: "receber",
				descricao: "Entrada inválida",
				valor: 10,
				subtipo: "salario",
			}),
		/Subtipo só pode/,
	);
	await assert.rejects(
		() =>
			db.criarLancamento({
				tipo: "pagar",
				descricao: "Competência inválida",
				valor: 10,
				competencia_mes: "09/2026",
			}),
		/Competência inválida/,
	);
});
