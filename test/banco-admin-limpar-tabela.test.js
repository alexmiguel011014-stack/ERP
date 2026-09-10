/* Cobertura de db.limparTabela (feature pedida em 2026-09-03: "Limpar tabela"
   dentro de Banco de Dados, pra corrigir uma migração que importou parte
   errada sem precisar apagar o banco inteiro). Banco novo por teste — mesmo
   padrão de test/usuarios-hierarquia.test.js (um before() de arquivo aqui
   dispararia de novo a cada teste e o segundo autenticarUsuario deixaria de
   ser bootstrap). */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const db = require("../database");
const { runAsync, getAsync } = require("../db/conexao");

function novoBancoTemp() {
	const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-limpar-tabela-"));
	db.setDBPath(TMP);
}

test("limparTabela recusa a tabela Usuarios (travaria o acesso ao app)", async () => {
	novoBancoTemp();
	await db.autenticarUsuario("dona-loja", "senhaDaLoja123");

	await assert.rejects(() => db.limparTabela("Usuarios"), /não pode ser limpa/);

	const restante = await getAsync("SELECT COUNT(*) AS n FROM Usuarios", []);
	assert.ok(Number(restante.n) > 0, "Usuarios não deveria ter sido esvaziada");
});

test("limparTabela recusa nome de tabela que não existe", async () => {
	novoBancoTemp();
	await db.autenticarUsuario("dona-loja", "senhaDaLoja123");

	await assert.rejects(
		() => db.limparTabela("TabelaQueNaoExiste"),
		/Tabela não existe/,
	);
});

test("limparTabela apaga todas as linhas de uma tabela normal e retorna a contagem removida", async () => {
	novoBancoTemp();
	await db.autenticarUsuario("dona-loja", "senhaDaLoja123");
	await runAsync("INSERT INTO Categorias (nome) VALUES ('CategoriaA')", []);
	await runAsync("INSERT INTO Categorias (nome) VALUES ('CategoriaB')", []);

	const res = await db.limparTabela("Categorias");
	assert.strictEqual(res.tabela, "Categorias");
	assert.strictEqual(res.registrosRemovidos, 2);

	const depois = await getAsync("SELECT COUNT(*) AS n FROM Categorias", []);
	assert.strictEqual(Number(depois.n), 0);
});

test("limparTabela numa tabela já vazia remove zero registros sem erro", async () => {
	novoBancoTemp();
	await db.autenticarUsuario("dona-loja", "senhaDaLoja123");

	const res = await db.limparTabela("Categorias");
	assert.strictEqual(res.registrosRemovidos, 0);
});
