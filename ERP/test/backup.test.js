/* Cobertura de backup/restore e do marcador de versão de schema (GOALS.md,
   seções Backend/Database: "adicionar PRAGMA user_version" e "confirmar
   retenção de backups + restore testado ponta a ponta").
   Roda contra um SQLCipher temporário e descartável (mesmo padrão de
   test/negocio.test.js). */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-backup-"));
const db = require("../database");
const { runAsync, getAsync } = require("../db/conexao");
const sistema = require("../db/sistema");
const { VERSAO_SCHEMA } = require("../db/schema");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-teste-123");
});

after(async () => {
	await db.bloquearBanco();
});

test("PRAGMA user_version é gravado no boot e reflete VERSAO_SCHEMA", async () => {
	const versao = await db.obterVersaoSchema();
	assert.strictEqual(versao, VERSAO_SCHEMA);
	assert.ok(VERSAO_SCHEMA >= 1);
});

test("exportBackup cria um arquivo .sqlite não vazio em backups/", () => {
	const destino = db.exportBackup();
	assert.ok(fs.existsSync(destino));
	assert.ok(fs.statSync(destino).size > 0);
	assert.match(path.basename(destino), /^backup_\d+\.sqlite$/);
});

test("backupAutomatico é idempotente no mesmo dia (não duplica)", () => {
	const backupDir = path.join(TMP, "backups");
	db.backupAutomatico();
	const apos1a = fs.readdirSync(backupDir).length;
	db.backupAutomatico();
	const apos2a = fs.readdirSync(backupDir).length;
	assert.strictEqual(
		apos2a,
		apos1a,
		"uma segunda chamada no mesmo dia não deveria criar outro arquivo",
	);
});

test("importBackup restaura o estado exato de um backup anterior", async () => {
	await runAsync("INSERT INTO Categorias (nome) VALUES ('AntesDoBackup')", []);
	const antes = await getAsync(
		"SELECT COUNT(*) AS n FROM Categorias WHERE nome = 'AntesDoBackup'",
		[],
	);
	assert.strictEqual(antes.n, 1);

	const backupPath = db.exportBackup();

	await runAsync("INSERT INTO Categorias (nome) VALUES ('DepoisDoBackup')", []);
	const comAmbas = await getAsync(
		"SELECT COUNT(*) AS n FROM Categorias WHERE nome IN ('AntesDoBackup', 'DepoisDoBackup')",
		[],
	);
	assert.strictEqual(comAmbas.n, 2);

	await db.importBackup(backupPath);

	const restaurado = await getAsync(
		"SELECT COUNT(*) AS n FROM Categorias WHERE nome IN ('AntesDoBackup', 'DepoisDoBackup')",
		[],
	);
	// Depois de restaurar o backup tirado antes do segundo insert, só o
	// primeiro registro deve existir — prova que o restore volta ao estado
	// exato do momento do backup, não um merge/soma.
	assert.strictEqual(restaurado.n, 1);
});

test("podarBackupsAutomaticosAntigos remove só os diários vencidos, nunca os manuais", () => {
	const backupDir = path.join(TMP, "backups");
	fs.mkdirSync(backupDir, { recursive: true });

	const antigo = path.join(backupDir, "backup_2000-01-01.sqlite");
	const recente = path.join(
		backupDir,
		"backup_" + new Date().toISOString().slice(0, 10) + ".sqlite",
	);
	const manualAntigo = path.join(backupDir, "backup_946684800000.sqlite");
	fs.writeFileSync(antigo, "x");
	fs.writeFileSync(recente, "x");
	fs.writeFileSync(manualAntigo, "x");

	sistema.podarBackupsAutomaticosAntigos(backupDir);

	assert.strictEqual(
		fs.existsSync(antigo),
		false,
		"backup diário de 2000 deveria ter sido removido",
	);
	assert.strictEqual(
		fs.existsSync(recente),
		true,
		"backup diário de hoje não deveria ser removido",
	);
	assert.strictEqual(
		fs.existsSync(manualAntigo),
		true,
		"backup manual (nome com epoch) nunca deve ser removido pela poda automática",
	);

	fs.unlinkSync(recente);
	fs.unlinkSync(manualAntigo);
});
