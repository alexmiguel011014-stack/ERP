/* IPC de ipc/imagens.js (registrado via modules/banco/modulo.json — "Gerenciar
   Imagens" vive dentro de /banco, não é módulo próprio, ver GOALS.md "Image
   Database & Management"): toda a autorização é exigirSessao("admin") — mesmo gate que /banco já usa
   — mais a reautenticação por senha do lado do frontend (verificar-senha-
   admin, ipc/banco-admin.js), não uma trava nova aqui. Cobertura de
   CRUD/migração fica em scripts/test-imagens.js (rodado via
   test/integration.test.js); este arquivo cobre só a camada de permissão da
   ponte ipc/imagens.js, no mesmo estilo de
   financeiro-fluxo-consolidado.test.js. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-imagens-ipc-"));
const db = require("../database");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-imagens-ipc");
});

after(async () => {
	await db.bloquearBanco();
	try {
		fs.rmSync(TMP, { recursive: true, force: true });
	} catch {
		/* ignora */
	}
});

function registrarComDeps(deps) {
	const { registrar } = require("../ipc/imagens");
	const handlers = {};
	registrar(
		{
			handle(nome, handler) {
				handlers[nome] = handler;
			},
		},
		deps,
	);
	return handlers;
}

const CANAIS_ESPERADOS = [
	"listar-imagens",
	"listar-imagens-orfas",
	"obter-imagem-por-id",
	"excluir-imagem-por-id",
	"excluir-imagens-em-lote",
];

test("registra exatamente os 5 canais esperados", () => {
	const handlers = registrarComDeps({ exigirSessao() {}, log() {} });
	assert.deepEqual(Object.keys(handlers).sort(), [...CANAIS_ESPERADOS].sort());
});

test("todo canal exige sessão admin — nega quando exigirSessao rejeita", async () => {
	const handlers = registrarComDeps({
		exigirSessao(perfil) {
			assert.equal(perfil, "admin");
			throw new Error("Acesso permitido somente ao administrador.");
		},
		log() {},
	});

	for (const canal of CANAIS_ESPERADOS) {
		await assert.rejects(
			() => handlers[canal]({}, canal === "excluir-imagens-em-lote" ? [] : 1),
			/administrador/,
			canal + " deveria negar sem sessão admin",
		);
	}
});

test("com sessão admin, listar/obter/excluir funcionam contra dados reais", async () => {
	const logs = [];
	const handlers = registrarComDeps({
		exigirSessao(perfil) {
			assert.equal(perfil, "admin");
		},
		log(...args) {
			logs.push(args);
		},
	});

	const produto = await db.salvarProduto(
		{
			nome: "Produto IPC Imagens",
			categoriasSelecionadas: [],
			variacoes: [
				{
					sku: "IPCIMG01",
					preco: 10,
					preco_custo: 0,
					quantidade_estoque: 1,
					atributos: [{ chave: "Unidade", valor: "Padrão" }],
				},
			],
		},
		[
			{
				sku: "IPCIMG01",
				preco: 10,
				preco_custo: 0,
				quantidade_estoque: 1,
				atributos: [{ chave: "Unidade", valor: "Padrão" }],
			},
		],
	);
	const arquivo = path.join(TMP, "ipc-teste.png");
	fs.writeFileSync(
		arquivo,
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	);
	const salva = await db.salvarImagemProduto(produto.produtoId, arquivo);
	assert.ok(salva.success);
	const imagemId = Number(salva.imagem);

	const lista = await handlers["listar-imagens"](
		{},
		{ entidadeTipo: "produto" },
	);
	assert.equal(lista.total, 1);
	assert.equal(lista.linhas[0].entidade_nome, "Produto IPC Imagens");

	const dataUrl = await handlers["obter-imagem-por-id"]({}, imagemId);
	assert.match(dataUrl, /^data:image\/png;base64,/);

	const orfasAntes = await handlers["listar-imagens-orfas"]({});
	assert.equal(orfasAntes.length, 0);

	const exclusao = await handlers["excluir-imagem-por-id"]({}, imagemId);
	assert.ok(exclusao.success);
	assert.ok(
		logs.some(([acao]) => acao === "excluir-imagem"),
		"excluir-imagem-por-id deveria registrar no log de auditoria",
	);

	const listaDepois = await handlers["listar-imagens"](
		{},
		{
			entidadeTipo: "produto",
		},
	);
	assert.equal(listaDepois.total, 0);

	const nula = await handlers["obter-imagem-por-id"]({}, imagemId);
	assert.equal(nula, null);
});

test("excluir-imagens-em-lote registra a contagem removida no log", async () => {
	const logs = [];
	const handlers = registrarComDeps({
		exigirSessao() {},
		log(...args) {
			logs.push(args);
		},
	});

	const produto = await db.salvarProduto(
		{
			nome: "Produto IPC Imagens Lote",
			categoriasSelecionadas: [],
			variacoes: [
				{
					sku: "IPCIMG02",
					preco: 10,
					preco_custo: 0,
					quantidade_estoque: 1,
					atributos: [{ chave: "Unidade", valor: "Padrão" }],
				},
			],
		},
		[
			{
				sku: "IPCIMG02",
				preco: 10,
				preco_custo: 0,
				quantidade_estoque: 1,
				atributos: [{ chave: "Unidade", valor: "Padrão" }],
			},
		],
	);
	const arquivo = path.join(TMP, "ipc-teste-lote.png");
	fs.writeFileSync(
		arquivo,
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	);
	const salva = await db.salvarImagemProduto(produto.produtoId, arquivo);
	const imagemId = Number(salva.imagem);

	// Órfã de verdade: apaga o produto sem passar por excluirProdutoPermanente
	// (que já limpa Imagens sozinho) — precisa sobrar uma linha órfã pra
	// exercitar o bulk-delete da tela de administração.
	const { runAsync } = require("../db/conexao");
	await runAsync("DELETE FROM Produtos WHERE id = ?", [produto.produtoId]);

	const orfas = await handlers["listar-imagens-orfas"]({});
	assert.equal(orfas.length, 1);
	assert.equal(orfas[0].id, imagemId);

	const resultado = await handlers["excluir-imagens-em-lote"](
		{},
		orfas.map((o) => o.id),
	);
	assert.equal(resultado.removidas, 1);
	assert.ok(
		logs.some(
			([acao, , , detalhe]) =>
				acao === "excluir-imagens-em-lote" && /1 imagem/.test(detalhe),
		),
	);

	const orfasDepois = await handlers["listar-imagens-orfas"]({});
	assert.equal(orfasDepois.length, 0);
});
