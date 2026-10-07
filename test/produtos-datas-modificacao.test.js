/* GOALS 30 — "Última modificação" de Produtos e Categorias, carimbada por
   triggers (db/datas-modificacao.js). Roda contra um SQLCipher temporário e
   descartável (mesmo padrão de test/categorias-editar.test.js). */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-datas-modificacao-"));
const db = require("../database");
const {
	runAsync,
	getAsync,
	allAsync,
	getConexao,
} = require("../db/conexao");
const {
	migrarDatasModificacao,
	preencherDatasProdutosDoLog,
} = require("../db/datas-modificacao");

const FORMATO_ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-teste-123");
	await db.abrirCaixa(0, null);
});

after(async () => {
	await db.bloquearBanco();
});

async function criarProduto(estoque = 10) {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto Datas " + Math.random().toString(36).slice(2, 8),
	]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, quantidade_estoque) VALUES (?, ?, ?, ?)",
		[
			produto.lastID,
			"SKU-" + Math.random().toString(36).slice(2, 10),
			100,
			estoque,
		],
	);
	return { produtoId: produto.lastID, variacaoId: variacao.lastID };
}

const datasProduto = (id) =>
	getAsync("SELECT criado_em, atualizado_em FROM Produtos WHERE id = ?", [id]);
const datasCategoria = (id) =>
	getAsync("SELECT criado_em, atualizado_em FROM Categorias WHERE id = ?", [
		id,
	]);

// Espera o relógio andar (ms) e devolve as datas antes da operação, pra
// comparar "carimbou" (maior) e "não carimbou" (igual) sem depender de sleep
// longo.
async function antes(id) {
	const d = await datasProduto(id);
	await esperar(15);
	return d;
}

test("produto novo recebe criado_em = atualizado_em em ISO UTC com ms e Z", async () => {
	// Só a linha de Produtos: inserir uma variação depois é uma modificação
	// legítima do cadastro e carimba atualizado_em de novo.
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto Datas Solo",
	]);
	const d = await datasProduto(produto.lastID);
	assert.match(d.criado_em, FORMATO_ISO_UTC);
	assert.strictEqual(d.criado_em, d.atualizado_em);
});

test("categoria nova recebe criado_em = atualizado_em", async () => {
	const cat = await db.salvarCategoria("Cat Datas Nova", null);
	const d = await datasCategoria(cat.id);
	assert.match(d.criado_em, FORMATO_ISO_UTC);
	assert.strictEqual(d.criado_em, d.atualizado_em);
});

test("atualizarProduto carimba atualizado_em e preserva criado_em", async () => {
	const { produtoId } = await criarProduto();
	const a = await antes(produtoId);
	await db.atualizarProduto(
		produtoId,
		{ nome: "Renomeado pelo teste", categoriasSelecionadas: [] },
		[],
	);
	const d = await datasProduto(produtoId);
	assert.strictEqual(d.criado_em, a.criado_em);
	assert.ok(d.atualizado_em > a.atualizado_em);
});

test("mudar o preço pela precificação carimba o produto", async () => {
	const { produtoId } = await criarProduto();
	const a = await antes(produtoId);
	await db.saveProductPrice(produtoId, 250);
	assert.ok((await datasProduto(produtoId)).atualizado_em > a.atualizado_em);
});

test("mudar o custo pela precificação carimba o produto", async () => {
	const { produtoId } = await criarProduto();
	const a = await antes(produtoId);
	await db.saveProductCost(produtoId, 40);
	assert.ok((await datasProduto(produtoId)).atualizado_em > a.atualizado_em);
});

test("adicionar e remover uma variação carimba o produto", async () => {
	const { produtoId } = await criarProduto();
	let a = await antes(produtoId);
	const nova = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, quantidade_estoque) VALUES (?, ?, 1, 0)",
		[produtoId, "SKU-NOVA-" + Math.random().toString(36).slice(2, 8)],
	);
	let d = await datasProduto(produtoId);
	assert.ok(d.atualizado_em > a.atualizado_em, "inserção deveria carimbar");

	a = await antes(produtoId);
	await runAsync("DELETE FROM Variacoes WHERE id = ?", [nova.lastID]);
	d = await datasProduto(produtoId);
	assert.ok(d.atualizado_em > a.atualizado_em, "remoção deveria carimbar");
});

test("enviar pra Lixeira e restaurar carimbam o produto", async () => {
	const { produtoId } = await criarProduto();
	let a = await antes(produtoId);
	await db.removerProduto(produtoId);
	let d = await datasProduto(produtoId);
	assert.ok(d.atualizado_em > a.atualizado_em, "remover deveria carimbar");

	a = await antes(produtoId);
	await db.restaurarProduto(produtoId);
	d = await datasProduto(produtoId);
	assert.ok(d.atualizado_em > a.atualizado_em, "restaurar deveria carimbar");
});

test("renomear, inativar e reativar uma categoria carimbam só a categoria", async () => {
	const cat = await db.salvarCategoria("Cat Datas Edicao", null);
	const base = await datasCategoria(cat.id);

	await esperar(15);
	await db.atualizarCategoria(cat.id, {
		nome: "Cat Datas Renomeada",
		categoriaPaiId: null,
	});
	const renomeada = await datasCategoria(cat.id);
	assert.strictEqual(renomeada.criado_em, base.criado_em);
	assert.ok(renomeada.atualizado_em > base.atualizado_em);

	await esperar(15);
	await db.inativarCategoria(cat.id);
	const inativada = await datasCategoria(cat.id);
	assert.ok(inativada.atualizado_em > renomeada.atualizado_em);

	await esperar(15);
	await db.reativarCategoria(cat.id);
	const reativada = await datasCategoria(cat.id);
	assert.ok(reativada.atualizado_em > inativada.atualizado_em);
});

test("atribuirCategoriaEmLote carimba só quem ganhou vínculo novo", async () => {
	const cat = await db.salvarCategoria("Cat Datas Lote", null);
	const { produtoId: jaTinha } = await criarProduto();
	const { produtoId: ganhou } = await criarProduto();
	await db.atribuirCategoriaEmLote([jaTinha], cat.id);

	const aJaTinha = await antes(jaTinha);
	const aGanhou = await datasProduto(ganhou);
	await db.atribuirCategoriaEmLote([jaTinha, ganhou], cat.id);

	assert.strictEqual(
		(await datasProduto(jaTinha)).atualizado_em,
		aJaTinha.atualizado_em,
		"par produto×categoria que já existia (INSERT OR IGNORE) não é modificação",
	);
	assert.ok(
		(await datasProduto(ganhou)).atualizado_em > aGanhou.atualizado_em,
		"produto que ganhou a categoria deveria ser carimbado",
	);
});

test("NÃO carimba: venda, entrada de estoque e ajuste manual (só movimentam saldo)", async () => {
	const { produtoId, variacaoId } = await criarProduto(10);
	const a = await antes(produtoId);

	const venda = await db.finalizarVenda(
		{
			itens: [{ variacao_id: variacaoId, quantidade: 2, preco_unitario: 100 }],
			total: 200,
		},
		null,
	);
	assert.ok(venda.success);
	assert.strictEqual((await datasProduto(produtoId)).atualizado_em, a.atualizado_em, "venda");

	// A entrada muda quantidade_estoque E preco_custo (custo médio) no mesmo
	// UPDATE — o guard do trigger precisa deixá-la de fora.
	await db.registrarEntradaEstoque({
		itens: [{ variacao_id: variacaoId, quantidade: 5, custo_unitario: 33 }],
	});
	assert.strictEqual(
		(await datasProduto(produtoId)).atualizado_em,
		a.atualizado_em,
		"entrada de estoque",
	);

	await db.ajustarEstoqueManual({ variacao_id: variacaoId, quantidade: 1 });
	assert.strictEqual(
		(await datasProduto(produtoId)).atualizado_em,
		a.atualizado_em,
		"ajuste manual",
	);
});

test("listProdutosDetalhados e getListCategoriasWithUsage devolvem as datas", async () => {
	const { produtoId } = await criarProduto();
	const cat = await db.salvarCategoria("Cat Datas Lista", null);

	const produtos = await db.listProdutosDetalhados(false);
	const p = produtos.find((x) => x.id === produtoId);
	assert.match(p.criado_em, FORMATO_ISO_UTC);
	assert.match(p.atualizado_em, FORMATO_ISO_UTC);

	const categorias = await db.getListCategoriasWithUsage(true);
	const c = categorias.find((x) => x.id === cat.id);
	assert.match(c.criado_em, FORMATO_ISO_UTC);
	assert.match(c.atualizado_em, FORMATO_ISO_UTC);
});

test("backfill: usa só o log como evidência; sem log fica NULL; é idempotente", async () => {
	const { produtoId: comLog } = await criarProduto();
	const { produtoId: semLog } = await criarProduto();
	// Simula um produto de antes dos triggers: datas nulas.
	await runAsync(
		"UPDATE Produtos SET criado_em = NULL, atualizado_em = NULL WHERE id IN (?, ?)",
		[comLog, semLog],
	);
	for (const [acao, data] of [
		["criar-produto", "2026-01-10T12:00:00.000Z"],
		["editar-produto", "2026-03-05T09:30:00.000Z"],
		["alterar-imagem-produto", "2026-02-01T08:00:00.000Z"],
	]) {
		await runAsync(
			"INSERT INTO LogAtividades (acao, entidade, entidade_id, data) VALUES (?, 'Produtos', ?, ?)",
			[acao, comLog, data],
		);
	}

	await preencherDatasProdutosDoLog(getConexao());
	let d = await datasProduto(comLog);
	assert.strictEqual(d.criado_em, "2026-01-10T12:00:00.000Z");
	assert.strictEqual(d.atualizado_em, "2026-03-05T09:30:00.000Z");
	d = await datasProduto(semLog);
	assert.strictEqual(d.criado_em, null);
	assert.strictEqual(d.atualizado_em, null);

	await preencherDatasProdutosDoLog(getConexao());
	assert.deepStrictEqual(await datasProduto(comLog), {
		criado_em: "2026-01-10T12:00:00.000Z",
		atualizado_em: "2026-03-05T09:30:00.000Z",
	});
	assert.strictEqual((await datasProduto(semLog)).atualizado_em, null);
});

// SQLite embutido (3.33) não tem ALTER TABLE DROP COLUMN, então o "banco do
// schema anterior" é montado à mão numa conexão em memória só com as tabelas
// que a migração toca.
function execOn(conn, sql, params = []) {
	return new Promise((resolver, rejeitar) =>
		conn.run(sql, params, function (erro) {
			if (erro) return rejeitar(erro);
			resolver(this);
		}),
	);
}
function umaLinha(conn, sql, params = []) {
	return new Promise((resolver, rejeitar) =>
		conn.get(sql, params, (erro, linha) =>
			erro ? rejeitar(erro) : resolver(linha),
		),
	);
}

test("migrar um banco do schema anterior (sem as colunas): backfill pelo log, triggers ativos, idempotente", async () => {
	const sqlcipher = require("@journeyapps/sqlcipher");
	const conn = new sqlcipher.Database(":memory:");
	try {
		await execOn(conn, "PRAGMA foreign_keys = ON");
		await execOn(
			conn,
			"CREATE TABLE Categorias (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, categoria_pai_id INTEGER)",
		);
		await execOn(
			conn,
			"CREATE TABLE Produtos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, imagem_id INTEGER)",
		);
		await execOn(
			conn,
			"CREATE TABLE Variacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, produto_id INTEGER NOT NULL, sku TEXT, codigo_barras TEXT, tamanho TEXT, cor TEXT, preco REAL, preco_custo REAL, quantidade_estoque INTEGER, atributos TEXT, estoque_minimo INTEGER)",
		);
		await execOn(
			conn,
			"CREATE TABLE ProdutoCategorias (produto_id INTEGER NOT NULL, categoria_id INTEGER NOT NULL, PRIMARY KEY (produto_id, categoria_id))",
		);
		await execOn(
			conn,
			"CREATE TABLE LogAtividades (id INTEGER PRIMARY KEY AUTOINCREMENT, acao TEXT NOT NULL, entidade TEXT, entidade_id INTEGER, data TEXT NOT NULL)",
		);
		await execOn(conn, "INSERT INTO Produtos (id, nome) VALUES (1, 'Com log')");
		await execOn(conn, "INSERT INTO Produtos (id, nome) VALUES (2, 'Sem log')");
		await execOn(conn, "INSERT INTO Categorias (id, nome) VALUES (1, 'Antiga')");
		await execOn(
			conn,
			"INSERT INTO LogAtividades (acao, entidade, entidade_id, data) VALUES ('criar-produto', 'Produtos', 1, '2026-02-02T02:02:02.000Z')",
		);
		await execOn(
			conn,
			"INSERT INTO LogAtividades (acao, entidade, entidade_id, data) VALUES ('editar-produto', 'Produtos', 1, '2026-04-04T04:04:04.000Z')",
		);

		await migrarDatasModificacao(conn);

		const consulta = (id) =>
			umaLinha(
				conn,
				"SELECT criado_em, atualizado_em FROM Produtos WHERE id = ?",
				[id],
			);
		assert.deepStrictEqual(await consulta(1), {
			criado_em: "2026-02-02T02:02:02.000Z",
			atualizado_em: "2026-04-04T04:04:04.000Z",
		});
		assert.deepStrictEqual(
			await consulta(2),
			{ criado_em: null, atualizado_em: null },
			"sem evidência no log: continua desconhecido, nunca inventado",
		);
		assert.deepStrictEqual(
			await umaLinha(
				conn,
				"SELECT criado_em, atualizado_em FROM Categorias WHERE id = 1",
			),
			{ criado_em: null, atualizado_em: null },
		);

		// Triggers ativos depois da migração.
		await esperar(15);
		await execOn(conn, "UPDATE Produtos SET nome = 'Editado' WHERE id = 2");
		assert.match((await consulta(2)).atualizado_em, FORMATO_ISO_UTC);
		await execOn(conn, "INSERT INTO Categorias (nome) VALUES ('Nova')");
		assert.match(
			(await umaLinha(conn, "SELECT criado_em FROM Categorias WHERE id = 2"))
				.criado_em,
			FORMATO_ISO_UTC,
		);

		// Rodar de novo não muda nada (a coluna já existe: sem backfill, sem
		// recarimbo, CREATE TRIGGER IF NOT EXISTS).
		const antesDeNovo = await consulta(1);
		await migrarDatasModificacao(conn);
		assert.deepStrictEqual(await consulta(1), antesDeNovo);
	} finally {
		await new Promise((resolver) => conn.close(() => resolver()));
	}
});

test("trancar e destrancar o banco (reboot de iniciarBanco) não recarimba nada", async () => {
	const { produtoId } = await criarProduto();
	const cat = await db.salvarCategoria("Cat Datas Reboot", null);
	const p = await datasProduto(produtoId);
	const c = await datasCategoria(cat.id);
	const nTriggers = (
		await allAsync(
			"SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_%_datas_%'",
		)
	).length;
	assert.strictEqual(nTriggers, 9);

	await db.bloquearBanco();
	await db.desbloquearBanco("senha-teste-123");

	assert.deepStrictEqual(await datasProduto(produtoId), p);
	assert.deepStrictEqual(await datasCategoria(cat.id), c);
	assert.strictEqual(
		(
			await allAsync(
				"SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_%_datas_%'",
			)
		).length,
		nTriggers,
	);
});
