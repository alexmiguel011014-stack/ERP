/* Cobertura de db.atualizarCategoria (feature pedida em 2026-09-03: não
   existia nenhuma forma de editar uma categoria/subcategoria já criada — só
   inativar/reativar/remover. Faltava, em especial, desvincular uma
   subcategoria do grupo pai). Mesmo padrão de banco temporário descartável
   de test/produtos-financeiro-melhorias.test.js. */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-categorias-editar-"));
const db = require("../database");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-teste-123");
});

after(async () => {
	await db.bloquearBanco();
});

test("atualizarCategoria renomeia uma categoria existente", async () => {
	const criada = await db.salvarCategoria("Camisas", null);
	await db.atualizarCategoria(criada.id, {
		nome: "Camisetas",
		categoriaPaiId: null,
	});

	const lista = await db.getCategorias();
	const alvo = lista.find((c) => c.id === criada.id);
	assert.strictEqual(alvo.nome, "Camisetas");
});

test("atualizarCategoria desvincula uma subcategoria do grupo pai (paiId nulo vira grupo principal)", async () => {
	const grupo = await db.salvarCategoria("Tamanhos1", null);
	const sub = await db.salvarCategoria("A1x", grupo.id);

	await db.atualizarCategoria(sub.id, { nome: "A1x", categoriaPaiId: null });

	const lista = await db.getCategorias();
	const gruposPrincipais = lista.map((c) => c.id);
	assert.ok(
		gruposPrincipais.includes(sub.id),
		"a subcategoria desvinculada deveria aparecer como grupo principal",
	);
});

test("atualizarCategoria move uma subcategoria de um grupo para outro", async () => {
	const grupoA = await db.salvarCategoria("GrupoA1", null);
	const grupoB = await db.salvarCategoria("GrupoB1", null);
	const sub = await db.salvarCategoria("Filho1", grupoA.id);

	await db.atualizarCategoria(sub.id, {
		nome: "Filho1",
		categoriaPaiId: grupoB.id,
	});

	const lista = await db.getCategorias();
	const novoGrupoB = lista.find((c) => c.id === grupoB.id);
	assert.ok(
		novoGrupoB.subcategorias.some((s) => s.id === sub.id),
		"a subcategoria deveria ter migrado para o grupo B",
	);
	const grupoAAtualizado = lista.find((c) => c.id === grupoA.id);
	assert.ok(
		!grupoAAtualizado.subcategorias.some((s) => s.id === sub.id),
		"a subcategoria não deveria mais estar no grupo A",
	);
});

test("atualizarCategoria recusa transformar em subcategoria uma categoria que já tem filhos (máx. 2 níveis)", async () => {
	const grupo = await db.salvarCategoria("GrupoComFilho1", null);
	await db.salvarCategoria("Filho2", grupo.id);
	const outroGrupo = await db.salvarCategoria("OutroGrupo1", null);

	await assert.rejects(
		() =>
			db.atualizarCategoria(grupo.id, {
				nome: "GrupoComFilho1",
				categoriaPaiId: outroGrupo.id,
			}),
		/subcategorias vinculadas/,
	);
});

test("atualizarCategoria recusa uma categoria como pai dela mesma", async () => {
	const cat = await db.salvarCategoria("Autoreferencia1", null);
	await assert.rejects(
		() =>
			db.atualizarCategoria(cat.id, {
				nome: "Autoreferencia1",
				categoriaPaiId: cat.id,
			}),
		/pai dela mesma/,
	);
});

test("atualizarCategoria recusa nome duplicado no mesmo nível", async () => {
	await db.salvarCategoria("Duplicada1", null);
	const outra = await db.salvarCategoria("NomeLivre1", null);

	await assert.rejects(
		() =>
			db.atualizarCategoria(outra.id, {
				nome: "Duplicada1",
				categoriaPaiId: null,
			}),
		/já cadastrada/,
	);
});
