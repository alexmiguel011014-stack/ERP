/* Hierarquia de perfis (db/usuarios.js:salvarUsuario) — achado real (2026-09-02):
   logado como "dono", a tela de Gerenciar Acessos oferecia a opção "Adm" no
   formulário de novo usuário, e o backend não barrava isso (pior: qualquer
   perfil não reconhecido virava "admin" por padrão). Regra correta: só quem
   já é admin cria ou promove outro admin; dono pode criar/editar dono e
   vendedor livremente, e continua podendo editar o resto do cadastro do
   admin (nome, ativo) sem alterar o perfil dele — pedido explícito anterior. */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const db = require("../database");
const conexao = require("../db/conexao");

function novoBancoTemp() {
	const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-hierarquia-"));
	db.setDBPath(TMP);
}

async function idDoUsuario(login) {
	const linha = await conexao.getAsync(
		"SELECT id FROM Usuarios WHERE login = ?",
		[login],
	);
	return linha.id;
}

test("dono não consegue criar uma conta admin", async () => {
	novoBancoTemp();
	try {
		await db.autenticarUsuario("dona-loja", "senhaDaLoja123");
		await assert.rejects(() =>
			db.salvarUsuario(
				{ login: "novoadm", nome: "Tentativa", perfil: "admin", senha: "1234" },
				{ perfil: "dono" },
			),
		);
	} finally {
		await db.bloquearBanco();
	}
});

test("admin consegue criar outra conta admin", async () => {
	novoBancoTemp();
	try {
		await db.autenticarUsuario("dona-loja", "senhaDaLoja123");
		const resultado = await db.salvarUsuario(
			{ login: "gerente-adm", nome: "Gerente", perfil: "admin", senha: "1234" },
			{ perfil: "admin" },
		);
		assert.strictEqual(resultado.success, true);
		const linha = await conexao.getAsync(
			"SELECT perfil FROM Usuarios WHERE login = 'gerente-adm'",
			[],
		);
		assert.strictEqual(linha.perfil, "admin");
	} finally {
		await db.bloquearBanco();
	}
});

test("dono consegue criar conta dono e conta vendedor normalmente", async () => {
	novoBancoTemp();
	try {
		await db.autenticarUsuario("dona-loja", "senhaDaLoja123");
		const dono = await db.salvarUsuario(
			{ login: "socio", nome: "Sócio", perfil: "dono", senha: "1234" },
			{ perfil: "dono" },
		);
		assert.strictEqual(dono.success, true);
		const vendedor = await db.salvarUsuario(
			{
				login: "vendedora1",
				nome: "Vendedora",
				perfil: "vendedor",
				senha: "1234",
			},
			{ perfil: "dono" },
		);
		assert.strictEqual(vendedor.success, true);
	} finally {
		await db.bloquearBanco();
	}
});

test("dono não consegue promover um vendedor existente a admin", async () => {
	novoBancoTemp();
	try {
		await db.autenticarUsuario("dona-loja", "senhaDaLoja123");
		await db.salvarUsuario(
			{
				login: "vendedora2",
				nome: "Vendedora",
				perfil: "vendedor",
				senha: "1234",
			},
			{ perfil: "admin" },
		);
		const id = await idDoUsuario("vendedora2");
		await assert.rejects(() =>
			db.salvarUsuario(
				{ id, login: "vendedora2", nome: "Vendedora", perfil: "admin" },
				{ perfil: "dono" },
			),
		);
	} finally {
		await db.bloquearBanco();
	}
});

test("dono continua podendo editar o resto do cadastro do admin sem mudar o perfil dele", async () => {
	novoBancoTemp();
	try {
		await db.autenticarUsuario("dona-loja", "senhaDaLoja123");
		const idAdmin = await idDoUsuario("dona-loja");
		const resultado = await db.salvarUsuario(
			{
				id: idAdmin,
				login: "dona-loja",
				nome: "Novo Nome do Admin",
				perfil: "admin",
				ativo: true,
			},
			{ perfil: "dono" },
		);
		assert.strictEqual(resultado.success, true);
		const linha = await conexao.getAsync(
			"SELECT nome, perfil FROM Usuarios WHERE login = 'dona-loja'",
			[],
		);
		assert.strictEqual(linha.nome, "Novo Nome do Admin");
		assert.strictEqual(linha.perfil, "admin");
	} finally {
		await db.bloquearBanco();
	}
});

test("perfil não reconhecido cai pra vendedor (padrão seguro), nunca admin", async () => {
	novoBancoTemp();
	try {
		await db.autenticarUsuario("dona-loja", "senhaDaLoja123");
		await db.salvarUsuario(
			{ login: "usuario-x", nome: "X", perfil: "chefe", senha: "1234" },
			{ perfil: "admin" },
		);
		const linha = await conexao.getAsync(
			"SELECT perfil FROM Usuarios WHERE login = 'usuario-x'",
			[],
		);
		assert.strictEqual(linha.perfil, "vendedor");
	} finally {
		await db.bloquearBanco();
	}
});
