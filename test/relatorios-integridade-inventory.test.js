const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-relatorios-integridade-"));
const db = require("../database");
const { runAsync, allAsync, getAsync } = require("../db/conexao");
const {
	criarCenarioIntegridade,
	capturarRelatorios,
} = require("./fixtures/relatorios-integridade");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-relatorios-integridade");
});

after(async () => {
	await db.bloquearBanco();
});

test("inventário captura fontes, relatórios e discrepâncias atuais", async () => {
	const inventario = await criarCenarioIntegridade({ runAsync, allAsync });
	const relatorios = await capturarRelatorios(
		db,
		inventario.periodo.inicio,
		inventario.periodo.fim,
	);

	assert.equal(inventario.fontes.vendas.length, 2);
	assert.equal(inventario.fontes.itensVenda.length, 2);
	assert.equal(inventario.fontes.devolucoes.length, 1);
	assert.equal(inventario.fontes.itensDevolucao.length, 1);
	assert.ok(
		inventario.fontes.lancamentos.some(
			(lancamento) => lancamento.categoria === "Custo Fixo",
		),
		"o baseline precisa conter um pagamento real de custo fixo",
	);
	assert.equal(inventario.fontes.fechamentos[0].valor_abertura, 3000);
	assert.equal(relatorios.dre.receitaBruta, 350);
	assert.equal(relatorios.dre.receitaLiquida, 190);
	assert.equal(relatorios.composto.dre.periodo.inicio, "2026-01-01");
	assert.ok(Array.isArray(relatorios.curvaABC));
	assert.ok(Array.isArray(relatorios.margemContribuicao.porProduto));
	assert.ok(Array.isArray(relatorios.fluxo.eventos));
	assert.ok(Array.isArray(relatorios.projetado.eventos));
	assert.equal(
		Object.keys(inventario.classificacaoAtual).length,
		11,
		"o baseline precisa manter todas as classes de discrepância registradas",
	);

	const custoAntes = relatorios.dre.cmv;
	await runAsync("UPDATE Variacoes SET preco_custo = 130 WHERE id = ?", [
		inventario.ids.variacaoId,
	]);
	const custoDepois = (await capturarRelatorios(
		db,
		inventario.periodo.inicio,
		inventario.periodo.fim,
	)).dre.cmv;
	if (inventario.classificacaoAtual.custoSnapshotAusente) {
		assert.notEqual(
			custoDepois,
			custoAntes,
			"baseline confirma o P0: CMV histórico hoje depende do custo mutável",
		);
	} else {
		assert.equal(
			custoDepois,
			custoAntes,
			"com snapshot, alterar o custo atual não muda CMV histórico",
		);
	}

	const fontesNovas = await allAsync(
		"SELECT id, preco_custo FROM Variacoes WHERE id = ?",
		[inventario.ids.variacaoId],
	);
	assert.equal(fontesNovas[0].preco_custo, 130);
	assert.equal((await getAsync("SELECT COUNT(*) AS n FROM Vendas")).n, 2);
});
