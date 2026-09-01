/* Conta de suporte do desenvolvedor (db/usuarios.js:garantirContaSuporte) — ver
   GOALS.md, seção "Developer Support Admin Account". Cada teste usa seu
   próprio banco SQLCipher temporário e descartável (mesmo padrão de
   test/negocio.test.js), porque o comportamento depende de
   ERP_SUPORTE_LOGIN/ERP_SUPORTE_SENHA, que muda de teste pra teste. */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const db = require("../database");
const conexao = require("../db/conexao");

function novoBancoTemp() {
	const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-suporte-"));
	db.setDBPath(TMP);
}

test("conta de suporte funciona depois de QUALQUER login bem-sucedido, não só o primeiro", async () => {
	novoBancoTemp();
	process.env.ERP_SUPORTE_LOGIN = "adm";
	process.env.ERP_SUPORTE_SENHA = "senha-suporte-teste";
	try {
		// Login normal da loja — banco vazio, vira o primeiro admin (bootstrap
		// já existente). Login diferente de "adm" de propósito, pra provar que
		// a conta de suporte não depende de ser a primeira a logar.
		await db.autenticarUsuario("dona-da-loja", "senhaDaLoja123");

		// Agora a conta de suporte deve conseguir logar nesta MESMA instalação,
		// mesmo sem nunca ter sido criada explicitamente.
		const resultado = await db.autenticarUsuario("adm", "senha-suporte-teste");
		assert.strictEqual(resultado.success, true);
		assert.strictEqual(resultado.usuario.login, "adm");
	} finally {
		await db.bloquearBanco();
		delete process.env.ERP_SUPORTE_LOGIN;
		delete process.env.ERP_SUPORTE_SENHA;
	}
});

test("listarUsuarios nunca inclui a conta de suporte", async () => {
	novoBancoTemp();
	process.env.ERP_SUPORTE_LOGIN = "adm";
	process.env.ERP_SUPORTE_SENHA = "senha-suporte-teste";
	try {
		await db.autenticarUsuario("dona-da-loja", "senhaDaLoja123");
		const usuarios = await db.listarUsuarios();
		const logins = usuarios.map((u) => u.login);
		assert.ok(logins.includes("dona-da-loja"));
		assert.ok(!logins.includes("adm"));
	} finally {
		await db.bloquearBanco();
		delete process.env.ERP_SUPORTE_LOGIN;
		delete process.env.ERP_SUPORTE_SENHA;
	}
});

test("removerUsuario recusa remover a conta de suporte", async () => {
	novoBancoTemp();
	process.env.ERP_SUPORTE_LOGIN = "adm";
	process.env.ERP_SUPORTE_SENHA = "senha-suporte-teste";
	try {
		await db.autenticarUsuario("dona-da-loja", "senhaDaLoja123");
		const linha = await conexao.getAsync(
			"SELECT id FROM Usuarios WHERE login = 'adm'",
			[],
		);
		assert.ok(linha, "conta de suporte deveria ter sido criada");
		await assert.rejects(() => db.removerUsuario(linha.id));
	} finally {
		await db.bloquearBanco();
		delete process.env.ERP_SUPORTE_LOGIN;
		delete process.env.ERP_SUPORTE_SENHA;
	}
});

test("sem as env vars configuradas, nenhuma conta de suporte é criada (opt-in de verdade)", async () => {
	novoBancoTemp();
	delete process.env.ERP_SUPORTE_LOGIN;
	delete process.env.ERP_SUPORTE_SENHA;
	try {
		await db.autenticarUsuario("dona-da-loja", "senhaDaLoja123");
		const usuarios = await db.listarUsuarios();
		assert.strictEqual(usuarios.length, 1);
		assert.strictEqual(usuarios[0].login, "dona-da-loja");
	} finally {
		await db.bloquearBanco();
	}
});

test("bootstrap com o login reservado é recusado ANTES de criar/chavear o banco", async () => {
	const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-suporte-"));
	db.setDBPath(TMP);
	process.env.ERP_SUPORTE_LOGIN = "adm";
	process.env.ERP_SUPORTE_SENHA = "senha-suporte-teste";
	try {
		// Decisão do dono (2026-08-31): "adm" nunca pode virar o bootstrap de
		// uma loja nova quando ERP_SUPORTE_LOGIN já está configurado nesta
		// instalação — reservado só pro mecanismo automático de suporte.
		await assert.rejects(() =>
			db.autenticarUsuario("adm", "senhaQualquerDaLoja"),
		);

		// A recusa acontece ANTES de abrir o banco de propósito — senão o
		// arquivo .sqlite ficaria chaveado com essa senha rejeitada e zero
		// usuários, pior que deixar passar (ver comentário em
		// autenticarUsuario). Prova indireta: um bootstrap normal LOGO DEPOIS,
		// com outro login, ainda funciona nesta mesma instalação.
		const resultado = await db.autenticarUsuario(
			"dona-da-loja",
			"senhaDaLojaDeVerdade",
		);
		assert.strictEqual(resultado.success, true);
		assert.strictEqual(resultado.usuario.login, "dona-da-loja");
	} finally {
		await db.bloquearBanco();
		delete process.env.ERP_SUPORTE_LOGIN;
		delete process.env.ERP_SUPORTE_SENHA;
	}
});

test("salvarUsuario recusa criar um usuário novo com o login reservado", async () => {
	const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-suporte-"));
	db.setDBPath(TMP);
	process.env.ERP_SUPORTE_LOGIN = "adm";
	process.env.ERP_SUPORTE_SENHA = "senha-suporte-teste";
	try {
		await db.autenticarUsuario("dona-da-loja", "senhaDaLojaDeVerdade");
		await assert.rejects(() =>
			db.salvarUsuario({
				login: "adm",
				nome: "Tentativa de recriar adm",
				senha: "outraSenhaQualquer",
			}),
		);
	} finally {
		await db.bloquearBanco();
		delete process.env.ERP_SUPORTE_LOGIN;
		delete process.env.ERP_SUPORTE_SENHA;
	}
});

test("colisão: login que já pertence a uma conta real nunca é sobrescrito pela conta de suporte", async () => {
	novoBancoTemp();
	try {
		// A própria dona da loja escolhe "adm" como login, ANTES de
		// ERP_SUPORTE_LOGIN/SENHA existirem nesta instalação.
		delete process.env.ERP_SUPORTE_LOGIN;
		delete process.env.ERP_SUPORTE_SENHA;
		await db.autenticarUsuario("adm", "senhaEscolhidaPelaLoja");

		// Só agora a conta de suporte passa a existir como conceito.
		process.env.ERP_SUPORTE_LOGIN = "adm";
		process.env.ERP_SUPORTE_SENHA = "senha-suporte-teste";
		await db.autenticarUsuario("adm", "senhaEscolhidaPelaLoja"); // login normal de novo

		// A senha de suporte NUNCA deve abrir essa conta — ela pertence à loja.
		await assert.rejects(() =>
			db.autenticarUsuario("adm", "senha-suporte-teste"),
		);
		// E a loja continua entrando normalmente com a senha dela.
		const resultado = await db.autenticarUsuario(
			"adm",
			"senhaEscolhidaPelaLoja",
		);
		assert.strictEqual(resultado.success, true);
	} finally {
		await db.bloquearBanco();
		delete process.env.ERP_SUPORTE_LOGIN;
		delete process.env.ERP_SUPORTE_SENHA;
	}
});
