const { test } = require("node:test");
const assert = require("node:assert");
const {
	hashSenhaUsuario,
	hashSenhaUsuarioLegado,
	verificarHashSenha,
} = require("../database.js");

test("scrypt: senha correta valida sem precisar migrar", () => {
	const hash = hashSenhaUsuario("segredo123");
	const r = verificarHashSenha("user", "segredo123", hash);
	assert.strictEqual(r.ok, true);
	assert.strictEqual(r.precisaMigrar, false);
});

test("scrypt: senha errada não valida", () => {
	const hash = hashSenhaUsuario("segredo123");
	const r = verificarHashSenha("user", "errada", hash);
	assert.strictEqual(r.ok, false);
});

test("legado: hash SHA-256 antigo ainda autentica e sinaliza migração", () => {
	const hashAntigo = hashSenhaUsuarioLegado("admin", "senhaAntiga");
	const r = verificarHashSenha("admin", "senhaAntiga", hashAntigo);
	assert.strictEqual(r.ok, true);
	assert.strictEqual(r.precisaMigrar, true);
});

test("legado: senha errada contra hash antigo não valida", () => {
	const hashAntigo = hashSenhaUsuarioLegado("admin", "senhaAntiga");
	const r = verificarHashSenha("admin", "errada", hashAntigo);
	assert.strictEqual(r.ok, false);
	assert.strictEqual(r.precisaMigrar, false);
});

test("hashes gerados para a mesma senha não colidem (salt aleatório)", () => {
	const h1 = hashSenhaUsuario("mesmaSenha");
	const h2 = hashSenhaUsuario("mesmaSenha");
	assert.notStrictEqual(h1, h2);
});
