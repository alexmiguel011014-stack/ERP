/* Harness de teste do banco de imagens (db/imagens.js) + migração de
   produto-imagens/ legado. Uso: node scripts/test-imagens.js
   Ver GOALS.md "Image Database & Management" pro racional completo. */
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-test-imagens-"));
const SENHA = "senha-teste-123";

let ok = 0;
let fail = 0;
const falhas = [];

function check(nome, condicao, extra) {
	if (condicao) {
		ok++;
		console.log("  PASS  " + nome);
	} else {
		fail++;
		falhas.push(nome + (extra ? " -> " + extra : ""));
		console.log("  FAIL  " + nome + (extra ? " -> " + extra : ""));
	}
}

(async () => {
	console.log("DB temporário:", TMP);
	const db = require("../database");
	db.setDBPath(TMP);
	await db.desbloquearBanco(SENHA);
	check(
		"desbloquearBanco + iniciarBanco (cria tabela Imagens)",
		db.isDesbloqueado(),
	);

	console.log("\n== 0. Round-trip CRUD (db/imagens.js) ==");
	const imagens = require("../db/imagens");

	const produto1 = await db.salvarProduto(
		{
			nome: "Produto Imagens E2E 1",
			categoriasSelecionadas: [],
			variacoes: [
				{
					sku: "IMG0001",
					preco: 10,
					preco_custo: 0,
					quantidade_estoque: 1,
					atributos: [{ chave: "Unidade", valor: "Padrão" }],
				},
			],
		},
		[
			{
				sku: "IMG0001",
				preco: 10,
				preco_custo: 0,
				quantidade_estoque: 1,
				atributos: [{ chave: "Unidade", valor: "Padrão" }],
			},
		],
	);
	check(
		"produto de teste criado",
		produto1 && produto1.success,
		JSON.stringify(produto1),
	);

	const arquivoPng = path.join(TMP, "teste.png");
	const bytesPng = Buffer.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	]);
	fs.writeFileSync(arquivoPng, bytesPng);

	const salvo = await imagens.salvarImagem(
		"produto",
		produto1.produtoId,
		arquivoPng,
	);
	check(
		"salvarImagem cria linha",
		salvo && salvo.success && salvo.id > 0,
		JSON.stringify(salvo),
	);

	const porEntidade = await imagens.obterImagemPorEntidade(
		"produto",
		produto1.produtoId,
	);
	check(
		"obterImagemPorEntidade devolve os bytes salvos",
		!!porEntidade && Buffer.compare(porEntidade.dados, bytesPng) === 0,
		JSON.stringify(
			porEntidade && {
				mimetype: porEntidade.mimetype,
				len: porEntidade.dados.length,
			},
		),
	);
	check(
		"mimetype = png",
		porEntidade && porEntidade.mimetype === "png",
		porEntidade && porEntidade.mimetype,
	);

	const porId = await imagens.obterImagemPorId(salvo.id);
	check(
		"obterImagemPorId devolve os mesmos bytes",
		!!porId && Buffer.compare(porId.dados, bytesPng) === 0,
	);

	// Salvar de novo pro mesmo produto deve SUBSTITUIR (UNIQUE entidade_tipo+entidade_id),
	// não criar uma segunda linha — mesmo comportamento de "uma imagem por produto" de hoje.
	const arquivoJpg = path.join(TMP, "teste2.jpg");
	fs.writeFileSync(arquivoJpg, Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
	const substituido = await imagens.salvarImagem(
		"produto",
		produto1.produtoId,
		arquivoJpg,
	);
	check(
		"salvarImagem substitui (mesmo id, não cria segunda linha)",
		substituido.id === salvo.id,
		JSON.stringify({ antes: salvo.id, depois: substituido.id }),
	);
	const listaAposSubstituir = await imagens.listarImagens({
		entidadeTipo: "produto",
	});
	check(
		"ainda só 1 imagem pra este produto depois de substituir",
		listaAposSubstituir.total === 1,
		JSON.stringify(listaAposSubstituir),
	);
	const porEntidadeDepois = await imagens.obterImagemPorEntidade(
		"produto",
		produto1.produtoId,
	);
	check(
		"mimetype trocou pra jpeg após substituir",
		porEntidadeDepois.mimetype === "jpeg",
		porEntidadeDepois.mimetype,
	);

	console.log("\n== 1. listarImagens (metadados, com nome da entidade) ==");
	const lista = await imagens.listarImagens({ entidadeTipo: "produto" });
	check("listarImagens total = 1", lista.total === 1, JSON.stringify(lista));
	check(
		"entidade_nome resolvido via JOIN com Produtos",
		lista.linhas[0] &&
			lista.linhas[0].entidade_nome === "Produto Imagens E2E 1",
		JSON.stringify(lista.linhas[0]),
	);
	check(
		"listarImagens nunca devolve o BLOB (dados) na listagem",
		lista.linhas[0] && lista.linhas[0].dados === undefined,
	);

	console.log("\n== 2. Extensão inválida é rejeitada ==");
	const arquivoInvalido = path.join(TMP, "teste.txt");
	fs.writeFileSync(arquivoInvalido, "não é imagem");
	try {
		await imagens.salvarImagem("produto", produto1.produtoId, arquivoInvalido);
		check("rejeita extensão .txt", false, "não lançou erro");
	} catch (e) {
		check("rejeita extensão .txt", /não suportado/.test(e.message), e.message);
	}

	console.log("\n== 3. Imagens órfãs (entidade dona não existe mais) ==");
	// Simula o que acontecia ANTES do fix em excluirProdutoPermanente: apaga o
	// produto direto via SQL, sem passar pela função que agora limpa Imagens
	// junto — assim há uma órfã de verdade pra exercitar listarImagensOrfas.
	const conexao = require("../db/conexao");
	await conexao.runAsync("DELETE FROM Produtos WHERE id = ?", [
		produto1.produtoId,
	]);

	const orfas = await imagens.listarImagensOrfas();
	check(
		"listarImagensOrfas encontra a imagem do produto apagado",
		orfas.length === 1 && orfas[0].id === salvo.id,
		JSON.stringify(orfas),
	);

	const loteExcluido = await imagens.excluirImagensEmLote(
		orfas.map((o) => o.id),
	);
	check(
		"excluirImagensEmLote remove todas",
		loteExcluido.removidas === 1,
		JSON.stringify(loteExcluido),
	);
	const orfasDepois = await imagens.listarImagensOrfas();
	check(
		"nenhuma órfã depois do bulk-delete",
		orfasDepois.length === 0,
		JSON.stringify(orfasDepois),
	);

	console.log(
		"\n== 4. excluirProdutoPermanente limpa Imagens (fix real, não regressão) ==",
	);
	const produto2 = await db.salvarProduto(
		{
			nome: "Produto Imagens E2E 2",
			categoriasSelecionadas: [],
			variacoes: [
				{
					sku: "IMG0002",
					preco: 10,
					preco_custo: 0,
					quantidade_estoque: 1,
					atributos: [{ chave: "Unidade", valor: "Padrão" }],
				},
			],
		},
		[
			{
				sku: "IMG0002",
				preco: 10,
				preco_custo: 0,
				quantidade_estoque: 1,
				atributos: [{ chave: "Unidade", valor: "Padrão" }],
			},
		],
	);
	await imagens.salvarImagem("produto", produto2.produtoId, arquivoPng);
	await db.removerProduto(produto2.produtoId); // soft delete primeiro (obrigatório antes do hard delete)
	await db.excluirProdutoPermanente(produto2.produtoId);
	const orfasAposExclusaoDefinitiva = await imagens.listarImagensOrfas();
	check(
		"excluir produto definitivamente não deixa imagem órfã pra trás",
		orfasAposExclusaoDefinitiva.length === 0,
		JSON.stringify(orfasAposExclusaoDefinitiva),
	);
	const listaFinal = await imagens.listarImagens({ entidadeTipo: "produto" });
	check(
		"a linha em Imagens foi mesmo apagada (não só desvinculada)",
		listaFinal.total === 0,
		JSON.stringify(listaFinal),
	);

	console.log("\n== 5. Migração de produto-imagens/ legado ==");
	// Simula uma instalação de antes desta feature existir: um produto com
	// Produtos.imagem = nome de arquivo, o arquivo de verdade em
	// produto-imagens/, e imagem_id ainda NULL.
	const produtoLegado = await db.salvarProduto(
		{
			nome: "Produto Legado Migração",
			categoriasSelecionadas: [],
			variacoes: [
				{
					sku: "LEG0001",
					preco: 10,
					preco_custo: 0,
					quantidade_estoque: 1,
					atributos: [{ chave: "Unidade", valor: "Padrão" }],
				},
			],
		},
		[
			{
				sku: "LEG0001",
				preco: 10,
				preco_custo: 0,
				quantidade_estoque: 1,
				atributos: [{ chave: "Unidade", valor: "Padrão" }],
			},
		],
	);
	const pastaLegado = path.join(TMP, "produto-imagens");
	fs.mkdirSync(pastaLegado, { recursive: true });
	const nomeArquivoLegado =
		"produto-" + produtoLegado.produtoId + "-legado.png";
	const bytesLegado = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
	fs.writeFileSync(path.join(pastaLegado, nomeArquivoLegado), bytesLegado);
	await conexao.runAsync("UPDATE Produtos SET imagem = ? WHERE id = ?", [
		nomeArquivoLegado,
		produtoLegado.produtoId,
	]);

	// ERP_TEST_USERDATA_DIR: mesma env var que main.js usa pra isolar userData
	// nos testes e2e (ver db/imagens.js:pastaImagensProdutosLegado) — sem ela,
	// esta função não teria como saber onde procurar fora de um processo
	// Electron de verdade.
	process.env.ERP_TEST_USERDATA_DIR = TMP;
	await db.bloquearBanco();
	await db.desbloquearBanco(SENHA); // reabrir dispara iniciarBanco() -> migrarImagensLegadas()

	const produtosAposMigracao = await db.listProdutosDetalhados();
	const migrado = produtosAposMigracao.find(
		(p) => p.nome === "Produto Legado Migração",
	);
	check(
		"produto migrado tem 'imagem' (imagem_id) preenchido",
		!!(migrado && migrado.imagem),
		JSON.stringify(migrado),
	);

	const imagemMigrada = await imagens.obterImagemPorId(migrado.imagem);
	check(
		"bytes migrados são idênticos ao arquivo original",
		!!imagemMigrada && Buffer.compare(imagemMigrada.dados, bytesLegado) === 0,
	);
	check(
		"pasta produto-imagens/ foi renomeada, não apagada",
		!fs.existsSync(pastaLegado),
	);
	const entradasTmp = fs.readdirSync(TMP);
	check(
		"existe uma pasta produto-imagens.migrado-* no lugar",
		entradasTmp.some((e) => e.startsWith("produto-imagens.migrado-")),
		JSON.stringify(entradasTmp),
	);

	console.log(
		"\n== 6. Migração é idempotente (rodar de novo não quebra nem duplica) ==",
	);
	await db.bloquearBanco();
	await db.desbloquearBanco(SENHA); // dispara iniciarBanco() de novo — já migrado, deve ser no-op
	const produtosSegundaVez = await db.listProdutosDetalhados();
	const migradoDeNovo = produtosSegundaVez.find(
		(p) => p.nome === "Produto Legado Migração",
	);
	check(
		"segunda migração não altera o imagem_id já setado",
		migradoDeNovo.imagem === migrado.imagem,
		JSON.stringify({ antes: migrado.imagem, depois: migradoDeNovo.imagem }),
	);
	delete process.env.ERP_TEST_USERDATA_DIR;

	await db.bloquearBanco();
	console.log("\n================================");
	console.log("PASS: " + ok + "   FAIL: " + fail);
	if (falhas.length) {
		console.log("\nFalhas:");
		falhas.forEach((f) => console.log(" - " + f));
	}
	try {
		fs.rmSync(TMP, { recursive: true, force: true });
	} catch {
		/* ignora */
	}
	process.exit(fail ? 1 : 0);
})().catch((e) => {
	console.error("\nERRO FATAL NO HARNESS:", e && e.stack ? e.stack : e);
	delete process.env.ERP_TEST_USERDATA_DIR;
	try {
		fs.rmSync(TMP, { recursive: true, force: true });
	} catch {
		/* ignora */
	}
	process.exit(2);
});
