/* Cobertura de importação Loja House: validação de JSON malformado,
   deduplicação, regras de negócio, operações atômicas de estoque, e dry-run.
   Roda contra um SQLCipher temporário e descartável. */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-import-"));
const db = require("../database");
const {
	validarStructura,
	checarDuplicacao,
	executarImportacaoLojHouse,
	obterHistoricoLotes,
	normalizarConteudoArquivo,
} = require("../db/importacoes");
const { getAsync, allAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-teste-123");
});

after(async () => {
	await db.bloquearBanco();
	try {
		fs.rmSync(TMP, { recursive: true });
	} catch {
		/* ignora erro de limpeza */
	}
});

test("validarStructura lança TypeError com nome do arquivo quando malformado", () => {
	assert.throws(
		() => {
			validarStructura("não é um array", "01_categorias.json");
		},
		{
			name: "TypeError",
			message: /01_categorias\.json/,
		},
	);
});

test("validarStructura lança TypeError quando campo obrigatório falta", () => {
	assert.throws(
		() => {
			validarStructura(
				[
					{
						chave_externa: "CAT-123",
						// falta 'nome'
					},
				],
				"01_categorias.json",
			);
		},
		{
			name: "TypeError",
			message: /nome/,
		},
	);
});

test("checarDuplicacao detecta chaves que já existem no banco", async () => {
	// Criar um batch primeiro
	await new Promise((resolve, reject) => {
		const conn = db.getConexao();
		conn.run(
			"INSERT INTO ImportacaoBatch (id, origem, status) VALUES (?, ?, ?)",
			["batch-teste", "loja_house", "sucesso"],
			function (erro) {
				if (erro) return reject(erro);
				resolve();
			},
		);
	});

	// Inserir uma chave no banco
	await new Promise((resolve, reject) => {
		const conn = db.getConexao();
		conn.run(
			"INSERT INTO MapeamentoChaveExterna (chave_externa, entidade_tipo, entidade_id, batch_id) VALUES (?, ?, ?, ?)",
			["CHAVE-EXISTENTE", "categoria", 1, "batch-teste"],
			function (erro) {
				if (erro) return reject(erro);
				resolve();
			},
		);
	});

	const { existentes, novas } = await checarDuplicacao([
		"CHAVE-EXISTENTE",
		"CHAVE-NOVA",
	]);

	assert.deepStrictEqual(existentes, ["CHAVE-EXISTENTE"]);
	assert.deepStrictEqual(novas, ["CHAVE-NOVA"]);
});

test("importação com pronto_para_importacao=false vai para Pendencias", async () => {
	const pasta = path.join(TMP, "importacao-teste-1");
	fs.mkdirSync(pasta, { recursive: true });

	fs.writeFileSync(
		path.join(pasta, "01_categorias.json"),
		JSON.stringify([{ chave_externa: "CAT-1", nome: "Categoria 1" }]),
	);

	fs.writeFileSync(
		path.join(pasta, "02_produtos_variacoes.json"),
		JSON.stringify([
			{
				chave_externa: "PROD-BLOQUEADO",
				nome: "Produto Bloqueado",
				categoria: "Categoria 1",
				pronto_para_importacao: false,
				variacoes: [],
			},
		]),
	);

	const resultado = await executarImportacaoLojHouse(pasta, null, {
		dryRun: false,
	});

	// Verificar se o batch foi criado
	assert.ok(resultado.batchId, "batch deveria ter um ID");
	console.log("Resultado da importação:", {
		batchId: resultado.batchId,
		importadas: resultado.importadas,
		pendencias: resultado.pendencias, // agora é um número
		erros: resultado.erros,
	});

	const pendencias = await allAsync(
		"SELECT * FROM Pendencias WHERE batch_id = ?",
		[resultado.batchId],
	);

	// Se não houver pendências no banco, verificar em todo lugar
	if (pendencias.length === 0) {
		const todasPendencias = await allAsync(
			"SELECT * FROM Pendencias ORDER BY data_criacao DESC LIMIT 10",
			[],
		);
		const batch = await getAsync("SELECT * FROM ImportacaoBatch WHERE id = ?", [
			resultado.batchId,
		]);
		console.log("Batch no banco:", batch);
		console.log("Batchid procurado:", resultado.batchId);
		console.log("Todas as pendências:", todasPendencias);
	}

	assert.ok(
		pendencias.length > 0,
		"deveria haver pelo menos uma pendência para o batch",
	);
	assert.strictEqual(
		pendencias[0].motivo_rejeicao,
		"pronto_para_importacao = false",
	);
});

test("quantidade_estoque=0 é skipped (sem zero movements)", async () => {
	const pasta = path.join(TMP, "importacao-teste-2");
	fs.mkdirSync(pasta, { recursive: true });

	fs.writeFileSync(
		path.join(pasta, "01_categorias.json"),
		JSON.stringify([{ chave_externa: "CAT-2", nome: "Cat 2" }]),
	);

	fs.writeFileSync(
		path.join(pasta, "02_produtos_variacoes.json"),
		JSON.stringify([
			{
				chave_externa: "PROD-2",
				nome: "Produto 2",
				variacoes: [
					{
						chave_externa: "VAR-2",
						sku: "SKU-ZERO",
						preco: 100,
						pronto_para_importacao: true,
					},
				],
			},
		]),
	);

	fs.writeFileSync(
		path.join(pasta, "03_estoque_inicial.json"),
		JSON.stringify([
			{
				chave_externa: "EST-ZERO",
				sku: "SKU-ZERO",
				quantidade_saldo: 0,
			},
		]),
	);

	await executarImportacaoLojHouse(pasta, null, {
		dryRun: false,
	});

	const movimentos = await allAsync(
		"SELECT * FROM MovimentacoesEstoque WHERE quantidade = 0",
		[],
	);

	assert.strictEqual(
		movimentos.length,
		0,
		"não deve haver movimentos com quantidade zero",
	);
});

test("estoque: UPDATE + INSERT succedem ou ambos rollback (atomic)", async () => {
	const pasta = path.join(TMP, "importacao-teste-3");
	fs.mkdirSync(pasta, { recursive: true });

	fs.writeFileSync(
		path.join(pasta, "01_categorias.json"),
		JSON.stringify([{ chave_externa: "CAT-3", nome: "Cat 3" }]),
	);

	fs.writeFileSync(
		path.join(pasta, "02_produtos_variacoes.json"),
		JSON.stringify([
			{
				chave_externa: "PROD-3",
				nome: "Produto 3",
				variacoes: [
					{
						chave_externa: "VAR-3",
						sku: "SKU-ATOMIC",
						preco: 50,
						pronto_para_importacao: true,
					},
				],
			},
		]),
	);

	fs.writeFileSync(
		path.join(pasta, "03_estoque_inicial.json"),
		JSON.stringify([
			{
				chave_externa: "EST-ATOMIC",
				sku: "SKU-ATOMIC",
				quantidade_saldo: 100,
			},
		]),
	);

	await executarImportacaoLojHouse(pasta, null, {
		dryRun: false,
	});

	const variacao = await getAsync(
		"SELECT quantidade_estoque FROM Variacoes WHERE sku = ?",
		["SKU-ATOMIC"],
	);

	assert.strictEqual(variacao.quantidade_estoque, 100);

	const movimentacoes = await allAsync(
		"SELECT * FROM MovimentacoesEstoque WHERE origem = 'importacao_migracao'",
		[],
	);

	assert.ok(movimentacoes.length > 0);
});

test("dry-run não toca no DB, preview está correto", async () => {
	const pasta = path.join(TMP, "importacao-teste-4");
	fs.mkdirSync(pasta, { recursive: true });

	fs.writeFileSync(
		path.join(pasta, "01_categorias.json"),
		JSON.stringify([
			{ chave_externa: "CAT-4-1", nome: "Cat 4-1" },
			{ chave_externa: "CAT-4-2", nome: "Cat 4-2" },
		]),
	);

	fs.writeFileSync(
		path.join(pasta, "02_produtos_variacoes.json"),
		JSON.stringify([
			{
				chave_externa: "PROD-4",
				nome: "Produto 4",
				variacoes: [
					{
						chave_externa: "VAR-4-1",
						sku: "SKU-4-1",
						preco: 100,
						pronto_para_importacao: true,
					},
					{
						chave_externa: "VAR-4-2",
						sku: "SKU-4-2",
						preco: 200,
						pronto_para_importacao: true,
					},
				],
			},
		]),
	);

	fs.writeFileSync(
		path.join(pasta, "04_clientes.json"),
		JSON.stringify([{ chave_externa: "CLI-4", nome: "Cliente 4" }]),
	);

	const resultado = await executarImportacaoLojHouse(pasta, 1, {
		dryRun: true,
	});

	assert.strictEqual(resultado.dryRun, true);
	assert.strictEqual(resultado.preview.categorias, 2);
	assert.strictEqual(resultado.preview.produtos, 1);
	assert.strictEqual(resultado.preview.variacoes, 2);
	assert.strictEqual(resultado.preview.clientes, 1);

	// Verificar que nada foi inserido — pode haver categorias padrão do setup,
	// mas nenhuma com nome Cat 4-*
	const novasCategorias = await allAsync(
		"SELECT COUNT(*) as n FROM Categorias WHERE nome LIKE 'Cat 4-%'",
		[],
	);
	assert.strictEqual(novasCategorias[0].n, 0);
});

test("obterHistoricoLotes lista lotes criados", async () => {
	const pasta = path.join(TMP, "importacao-teste-5");
	fs.mkdirSync(pasta, { recursive: true });

	fs.writeFileSync(
		path.join(pasta, "01_categorias.json"),
		JSON.stringify([{ chave_externa: "CAT-5", nome: "Cat 5" }]),
	);

	const resultado = await executarImportacaoLojHouse(pasta, null, {
		dryRun: false,
	});

	const lotes = await obterHistoricoLotes();

	assert.ok(Array.isArray(lotes));
	assert.ok(lotes.length > 0);
	assert.ok(lotes.some((l) => l.id === resultado.batchId));
});

test("normalizarConteudoArquivo extrai .registros de arquivos envelopados", () => {
	// 06_contas_abertas.json e 07_vendas_historicas.json vêm da exportação
	// real da Loja House como { politica, registros: [...], observacao },
	// não como array puro — reproduzido aqui a partir do formato real visto
	// em produção (bug relatado ao vivo: "esperava um array, obteve object").
	const envelopado = {
		politica: "sem_placeholder",
		registros: [{ chave_externa: "FIN-1", tipo: "pagar" }],
		observacao: "texto qualquer",
	};
	assert.deepStrictEqual(normalizarConteudoArquivo(envelopado), [
		{ chave_externa: "FIN-1", tipo: "pagar" },
	]);

	// Array puro (demais arquivos) passa direto, sem alteração
	const arrayPuro = [{ chave_externa: "CAT-1" }];
	assert.strictEqual(normalizarConteudoArquivo(arrayPuro), arrayPuro);

	// registros vazio (caso real: 0 contas abertas prontas) também funciona
	assert.deepStrictEqual(
		normalizarConteudoArquivo({ registros: [], observacao: "x" }),
		[],
	);
});

test("pasta com 06_contas_abertas.json envelopado ({registros:[...]}) não quebra a importação", async () => {
	const pasta = path.join(TMP, "importacao-teste-7");
	fs.mkdirSync(pasta, { recursive: true });

	fs.writeFileSync(
		path.join(pasta, "01_categorias.json"),
		JSON.stringify([{ chave_externa: "CAT-7", nome: "Cat 7" }]),
	);

	// Formato real da exportação: objeto com metadados, array em .registros
	fs.writeFileSync(
		path.join(pasta, "06_contas_abertas.json"),
		JSON.stringify({
			politica: "sem_placeholder",
			registros: [
				{
					chave_externa: "CTA-1",
					tipo: "pagar",
					descricao: "Conta em aberto",
					valor: 150,
					data_vencimento: "2026-10-01",
				},
			],
			observacao: "texto",
		}),
	);

	fs.writeFileSync(
		path.join(pasta, "07_vendas_historicas.json"),
		JSON.stringify({ registros: [], observacao: "sem vendas prontas" }),
	);

	// Não deve lançar "esperava um array, obteve object"
	const resultado = await executarImportacaoLojHouse(pasta, null, {
		dryRun: false,
	});

	assert.ok(resultado.batchId);
	assert.strictEqual(resultado.erros.length, 0);

	const lancamentos = await allAsync(
		"SELECT * FROM LancamentosFinanceiros WHERE descricao = 'Conta em aberto'",
		[],
	);
	assert.strictEqual(lancamentos.length, 1);
});

test("clientes homonyms são detectados e movidos para Pendencias", async () => {
	const pasta = path.join(TMP, "importacao-teste-6");
	fs.mkdirSync(pasta, { recursive: true });

	// Inserir um cliente manualmente
	await new Promise((resolve, reject) => {
		const conn = db.getConexao();
		conn.run(
			"INSERT INTO Clientes (nome, ativo) VALUES (?, 1)",
			["Cliente Duplicado"],
			function (erro) {
				if (erro) return reject(erro);
				resolve();
			},
		);
	});

	fs.writeFileSync(
		path.join(pasta, "04_clientes.json"),
		JSON.stringify([{ chave_externa: "CLI-DUP", nome: "Cliente Duplicado" }]),
	);

	await executarImportacaoLojHouse(pasta, null, {
		dryRun: false,
	});

	const pendencias = await allAsync(
		"SELECT * FROM Pendencias WHERE tipo_entidade = 'cliente'",
		[],
	);

	assert.ok(pendencias.length > 0);
	assert.ok(
		pendencias.some((p) => p.motivo_rejeicao.includes("mesmo nome já existe")),
	);
});
