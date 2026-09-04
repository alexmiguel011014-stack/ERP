/* getDRE (db/relatorios.js) só somava Receita Bruta a partir de Vendas —
   lançamentos de histórico importado (Loja House) nunca viram uma Venda de
   verdade, só um LancamentosFinanceiros tipo='receber'. Resultado real
   encontrado pelo dono: mês fechava como prejuízo no DRE mesmo com saldo
   positivo, porque a Despesa aparecia (vem de LancamentosFinanceiros) mas a
   Receita correspondente não. Corrigido somando também
   LancamentosFinanceiros tipo='receber' com origem='importacao_migracao' —
   só os de importação, pra não contar vendas normais em dobro (essas já
   entram via Vendas). Mesmo banco temporário descartável de
   test/relatorios-financeiro.test.js. */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-dre-migrada-"));
const db = require("../database");
const { runAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-teste-123");
});

after(async () => {
	await db.bloquearBanco();
});

test("getDRE soma lançamentos receber de importação migrada à Receita Bruta, sem contar vendas normais em dobro", async () => {
	await runAsync(
		"INSERT INTO Vendas (total, desconto, status, data_venda) VALUES (200, 0, 'finalizada', '2026-08-05')",
		[],
	);
	await runAsync(
		`INSERT INTO LancamentosFinanceiros
		 (tipo, descricao, valor, status, data_pagamento, origem)
		 VALUES ('receber', 'Camisa Equipe', 300, 'pago', '2026-08-06', 'importacao_migracao')`,
		[],
	);
	await runAsync(
		`INSERT INTO LancamentosFinanceiros
		 (tipo, descricao, valor, status, data_pagamento, origem)
		 VALUES ('pagar', 'Cartão', 150, 'pago', '2026-08-10', 'importacao_migracao')`,
		[],
	);
	// Lançamento manual (não migração) do dia a dia: NÃO deve entrar na
	// Receita Bruta, senão dobraria a receita de uma venda normal do PDV.
	await runAsync(
		`INSERT INTO LancamentosFinanceiros
		 (tipo, descricao, valor, status, data_pagamento, origem)
		 VALUES ('receber', 'Recebível avulso', 999, 'pago', '2026-08-12', 'manual')`,
		[],
	);

	const dre = await db.getDRE("2026-08-01", "2026-08-31");

	assert.strictEqual(
		dre.receitaBruta,
		500,
		"200 da Venda + 300 do lançamento migrado",
	);
	assert.strictEqual(dre.despesas, 150);
	assert.strictEqual(dre.lucroLiquido, 350);
});

test("getDRE ignora lançamento receber de importação migrada com status aberto (não pago)", async () => {
	await runAsync(
		`INSERT INTO LancamentosFinanceiros
		 (tipo, descricao, valor, status, data_pagamento, origem)
		 VALUES ('receber', 'Ainda não recebido', 500, 'aberto', '2026-09-06', 'importacao_migracao')`,
		[],
	);

	const dre = await db.getDRE("2026-09-01", "2026-09-30");
	assert.strictEqual(dre.receitaBruta, 0);
});
