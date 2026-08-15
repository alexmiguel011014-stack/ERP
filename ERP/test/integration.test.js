const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");

function rodarScript(nome) {
	try {
		const saida = execFileSync(process.execPath, [path.join("scripts", nome)], {
			cwd: RAIZ,
			encoding: "utf8",
		});
		return { saida };
	} catch (e) {
		return { saida: (e.stdout || "") + (e.stderr || ""), erro: e };
	}
}

test("scripts/test-db.js: CRUD produtos/categorias em banco temporário", () => {
	const { saida, erro } = rodarScript("test-db.js");
	if (erro) assert.fail(saida || erro.message);
});

test("scripts/test-migracao.js: migração de banco de schema antigo", () => {
	const { saida, erro } = rodarScript("test-migracao.js");
	if (erro) assert.fail(saida || erro.message);
});
