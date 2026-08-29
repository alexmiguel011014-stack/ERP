/* Cobertura do "Backup local" (GOALS.md, correção pedida em 2026-08-29):
   exportarBancoJSON() passou a gravar um arquivo JSON por tabela numa
   subpasta com carimbo de data/hora, na pasta do executável (não userData)
   — antes gravava um único JSON combinado dentro de userData/exports.
   Mesmo padrão de banco temporário descartável de test/backup.test.js. */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP_DB = fs.mkdtempSync(path.join(os.tmpdir(), "erp-export-db-"));
const TMP_EXE = fs.mkdtempSync(path.join(os.tmpdir(), "erp-export-exe-"));
const db = require("../database");
const { runAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP_DB);
	db.setPastaExecutavel(TMP_EXE);
	await db.desbloquearBanco("senha-teste-123");
	await runAsync(
		"INSERT INTO Categorias (nome) VALUES ('CategoriaExport')",
		[],
	);
});

after(async () => {
	await db.bloquearBanco();
});

test("exportarBancoJSON cria Backup local/backup-DD-MM-AAAA-HH na pasta do executável, não em userData", async () => {
	const res = await db.exportarBancoJSON();

	assert.ok(fs.existsSync(res.caminho));
	assert.ok(
		res.caminho.startsWith(path.join(TMP_EXE, "Backup local")),
		"deveria ficar dentro de <pastaExecutavel>/Backup local, não em userData",
	);
	assert.match(
		path.basename(res.caminho),
		/^backup-\d{2}-\d{2}-\d{4}-\d{2}$/,
		"nome da subpasta deveria seguir backup-DD-MM-AAAA-HH",
	);
});

test("exportarBancoJSON grava um arquivo .json por tabela, mais _info.json com o resumo", async () => {
	const res = await db.exportarBancoJSON();

	const arquivos = fs.readdirSync(res.caminho);
	assert.ok(arquivos.includes("Categorias.json"));
	assert.ok(arquivos.includes("_info.json"));

	const categorias = JSON.parse(
		fs.readFileSync(path.join(res.caminho, "Categorias.json"), "utf8"),
	);
	assert.ok(Array.isArray(categorias));
	assert.ok(categorias.some((c) => c.nome === "CategoriaExport"));

	const info = JSON.parse(
		fs.readFileSync(path.join(res.caminho, "_info.json"), "utf8"),
	);
	assert.strictEqual(info.tabelas, res.tabelas);
	assert.strictEqual(info.registros, res.registros);
	assert.ok(info.exportadoEm);
});

test("duas exportações na mesma hora reusam a mesma subpasta (não duplicam nem quebram)", async () => {
	const primeira = await db.exportarBancoJSON();
	const segunda = await db.exportarBancoJSON();
	assert.strictEqual(primeira.caminho, segunda.caminho);
	assert.ok(fs.existsSync(path.join(segunda.caminho, "Categorias.json")));
});
