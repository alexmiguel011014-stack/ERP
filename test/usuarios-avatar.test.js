/* Avatar do usuário logado — cor + foto (db/usuarios.js, ver GOALS.md "Avatar do
   Usuário Logado"). Cobre só a parte de cor aqui: salvarFotoUsuario/removerFotoUsuario
   chamam app.getPath("userData") (electron) igual db/produtos.js's
   salvarImagemProduto/removerImagemProduto já fazem — mesmo padrão deste projeto,
   nenhum dos dois é exercitado sob `node --test` puro (electron fora do processo
   principal não expõe `app`), só via e2e real (Playwright + Electron), ver
   e2e/meu-perfil.spec.ts. */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const db = require("../database");
const conexao = require("../db/conexao");

function novoBancoTemp() {
	const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-avatar-"));
	db.setDBPath(TMP);
}

async function idDoUsuario(login) {
	const linha = await conexao.getAsync(
		"SELECT id FROM Usuarios WHERE login = ?",
		[login],
	);
	return linha.id;
}

test("atualizarCorAvatar rejeita uma chave fora da whitelist", async () => {
	novoBancoTemp();
	try {
		await db.autenticarUsuario("dona-loja", "senhaDaLoja123");
		const id = await idDoUsuario("dona-loja");
		await assert.rejects(() => db.atualizarCorAvatar(id, "#ff0000"));
		await assert.rejects(() => db.atualizarCorAvatar(id, "azul"));
	} finally {
		await db.bloquearBanco();
	}
});

test("atualizarCorAvatar persiste uma chave válida", async () => {
	novoBancoTemp();
	try {
		await db.autenticarUsuario("dona-loja", "senhaDaLoja123");
		const id = await idDoUsuario("dona-loja");
		const resultado = await db.atualizarCorAvatar(id, "cyan");
		assert.strictEqual(resultado.success, true);
		const linha = await conexao.getAsync(
			"SELECT cor_avatar FROM Usuarios WHERE id = ?",
			[id],
		);
		assert.strictEqual(linha.cor_avatar, "cyan");
	} finally {
		await db.bloquearBanco();
	}
});

test("login retorna corAvatar e foto (null por padrão, cor depois de definida)", async () => {
	novoBancoTemp();
	try {
		const primeiro = await db.autenticarUsuario("dona-loja", "senhaDaLoja123");
		assert.strictEqual(primeiro.usuario.corAvatar, null);
		assert.strictEqual(primeiro.usuario.foto, null);

		const id = await idDoUsuario("dona-loja");
		await db.atualizarCorAvatar(id, "purple");
		await db.bloquearBanco();

		const segundo = await db.autenticarUsuario("dona-loja", "senhaDaLoja123");
		assert.strictEqual(segundo.usuario.corAvatar, "purple");
	} finally {
		await db.bloquearBanco();
	}
});
