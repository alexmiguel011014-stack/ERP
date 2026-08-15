/* Harness de teste de integração do banco (produtos + categorias).
   Uso: node scripts/test-db.js   (cria um DB temporário descartável) */
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-test-"));
const db = require("../database");

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

async function esperaErro(nome, fn, trechoEsperado) {
	try {
		await fn();
		check(nome, false, "não lançou erro");
	} catch (e) {
		const msg = e && e.message ? e.message : String(e);
		check(nome, !trechoEsperado || msg.indexOf(trechoEsperado) !== -1, msg);
	}
}

(async () => {
	console.log("DB temporário:", TMP);
	db.setDBPath(TMP);

	console.log("\n== 0. Abertura / criação de schema ==");
	await db.desbloquearBanco("senha-teste-123");
	check("desbloquearBanco + iniciarBanco", db.isDesbloqueado());

	const tabelas = await db.listarTabelasBanco();
	const nomes = tabelas.map((t) => t.nome || t.name || t);
	for (const t of [
		"Categorias",
		"Produtos",
		"Variacoes",
		"ProdutoCategorias",
		"Precificacao",
	]) {
		check(
			"tabela " + t + " existe",
			JSON.stringify(nomes).indexOf(t) !== -1,
			JSON.stringify(nomes),
		);
	}

	console.log("\n== 1. Categorias ==");
	const vazio = await db.getListCategoriasWithUsage();
	check(
		"lista vazia inicial",
		Array.isArray(vazio) && vazio.length === 0,
		JSON.stringify(vazio),
	);

	const cod1 = await db.getProximoCodigoCategoria();
	check("proximo código categoria = CAT0001", cod1 === "CAT0001", cod1);

	const grupo = await db.salvarCategoria("Tamanhos", null);
	check(
		"cria categoria pai",
		grupo && grupo.success && grupo.id > 0,
		JSON.stringify(grupo),
	);

	const sub = await db.salvarCategoria("A1", grupo.id);
	check(
		"cria subcategoria",
		sub && sub.success && sub.id > 0,
		JSON.stringify(sub),
	);

	await esperaErro(
		"bloqueia categoria duplicada",
		() => db.salvarCategoria("Tamanhos", null),
		"já cadastrada",
	);
	await esperaErro(
		"bloqueia 3º nível",
		() => db.salvarCategoria("XPTO", sub.id),
		"um nível",
	);

	const lista = await db.getListCategoriasWithUsage();
	check("lista com 2 categorias", lista.length === 2, JSON.stringify(lista));
	const itemGrupo = lista.find((c) => c.id === grupo.id);
	const itemSub = lista.find((c) => c.id === sub.id);
	check(
		"campo codigo presente",
		!!(itemGrupo && itemGrupo.codigo),
		JSON.stringify(itemGrupo),
	);
	check(
		"tipo do pai = categoria",
		itemGrupo && itemGrupo.tipo === "categoria",
		itemGrupo && itemGrupo.tipo,
	);
	check(
		"tipo do filho = subcategoria",
		itemSub && itemSub.tipo === "subcategoria",
		itemSub && itemSub.tipo,
	);
	check(
		"categoria_pai_nome do filho",
		itemSub && itemSub.categoria_pai_nome === "Tamanhos",
		itemSub && itemSub.categoria_pai_nome,
	);
	check(
		"uso_count inicial = 0",
		itemGrupo && itemGrupo.uso_count === 0,
		itemGrupo && itemGrupo.uso_count,
	);

	const arvore = await db.getCategorias();
	check(
		"getCategorias devolve árvore",
		arvore.length === 1 && arvore[0].subcategorias.length === 1,
		JSON.stringify(arvore),
	);

	console.log("\n== 2. Produtos ==");
	const sku1 = await db.getProximoSkuProduto();
	check("próximo SKU = P0001", sku1 === "P0001", sku1);

	// Mesmo payload que modules/produtos/cadastro.js envia
	const payload = {
		nome: "Quimono Trançado",
		categoria: null,
		categoria_id: null,
		subcategoria_id: null,
		categoriasSelecionadas: [grupo.id, sub.id],
		variacoes: [
			{
				sku: sku1,
				preco: 0,
				preco_custo: 0,
				quantidade_estoque: 10,
				atributos: [{ chave: "Unidade", valor: "Padrão" }],
			},
		],
	};
	const salvo = await db.salvarProduto(payload, payload.variacoes);
	check(
		"salvarProduto (payload do cadastro.js)",
		salvo && salvo.success && salvo.produtoId > 0,
		JSON.stringify(salvo),
	);

	const detalhados = await db.listProdutosDetalhados();
	check(
		"listProdutosDetalhados retorna 1",
		detalhados.length === 1,
		JSON.stringify(detalhados),
	);
	const p = detalhados[0];
	check(
		"produto tem 1 variação",
		p.variacoes.length === 1,
		JSON.stringify(p.variacoes),
	);
	check(
		"variação tem o SKU gerado",
		p.variacoes[0].sku === sku1,
		p.variacoes[0].sku,
	);
	check(
		"produto tem 2 categorias vinculadas",
		p.categorias_selecionadas.length === 2,
		JSON.stringify(p.categorias_selecionadas),
	);
	check(
		"estoque persistido = 10",
		p.variacoes[0].quantidade_estoque === 10,
		p.variacoes[0].quantidade_estoque,
	);

	const sku2 = await db.getProximoSkuProduto();
	check("próximo SKU avança para P0002", sku2 === "P0002", sku2);

	const usoDepois = await db.getListCategoriasWithUsage();
	check(
		"uso_count do grupo = 1",
		usoDepois.find((c) => c.id === grupo.id).uso_count === 1,
		JSON.stringify(usoDepois),
	);

	console.log("\n== 3. Busca / PDV ==");
	const achado = await db.buscarSKU(sku1);
	check(
		"buscarSKU encontra a variação",
		achado && achado.sku === sku1,
		JSON.stringify(achado),
	);
	const porTermo = await db.buscarProdutosPorTermo("Quimono");
	check(
		"buscarProdutosPorTermo (nome)",
		porTermo.length === 1,
		JSON.stringify(porTermo),
	);
	const porTermoSku = await db.buscarProdutosPorTermo(sku1);
	check(
		"buscarProdutosPorTermo (sku)",
		porTermoSku.length === 1,
		JSON.stringify(porTermoSku),
	);
	const porTermoAcento = await db.buscarProdutosPorTermo("trançado");
	check(
		"buscarProdutosPorTermo (minúsculas)",
		porTermoAcento.length === 1,
		JSON.stringify(porTermoAcento),
	);

	console.log("\n== 4. Atualização de produto ==");
	const payloadEdit = {
		nome: "Quimono Trançado Pro",
		categoria: null,
		categoria_id: null,
		subcategoria_id: null,
		categoriasSelecionadas: [sub.id],
		variacoes: [
			{
				sku: sku1,
				preco: 250,
				preco_custo: 0,
				quantidade_estoque: 7,
				atributos: [{ chave: "Unidade", valor: "Padrão" }],
			},
		],
	};
	const atualizado = await db.atualizarProduto(
		p.id,
		payloadEdit,
		payloadEdit.variacoes,
	);
	check(
		"atualizarProduto",
		atualizado && atualizado.success,
		JSON.stringify(atualizado),
	);
	const dep = (await db.listProdutosDetalhados())[0];
	check("nome atualizado", dep.nome === "Quimono Trançado Pro", dep.nome);
	check(
		"categorias reduzidas para 1",
		dep.categorias_selecionadas.length === 1,
		JSON.stringify(dep.categorias_selecionadas),
	);
	// Estoque NÃO deve mudar pela edição de cadastro — só a aba Estoque (ledger
	// MovimentacoesEstoque) pode alterar quantidade_estoque, mesmo que o payload
	// de edição envie um valor diferente (ignorado de propósito).
	check(
		"estoque preservado (não muda por edição de cadastro)",
		dep.variacoes[0].quantidade_estoque === 10,
		dep.variacoes[0].quantidade_estoque,
	);
	check(
		"SKU preservado na edição",
		dep.variacoes[0].sku === sku1,
		dep.variacoes[0].sku,
	);

	console.log("\n== 5. Integridade referencial ==");
	await esperaErro(
		"não exclui categoria em uso",
		() => db.removerCategoria(sub.id),
		"vinculada",
	);
	await esperaErro(
		"não exclui grupo com filhos",
		() => db.removerCategoria(grupo.id),
		"subcategorias",
	);

	console.log("\n== 6. Dashboard ==");
	const stats = await db.getDashboardStats();
	check(
		"dashboardStats.totalProdutos = 1",
		stats.totalProdutos === 1,
		JSON.stringify(stats),
	);

	console.log("\n== 7. Remoção em cascata ==");
	const rem = await db.removerProduto(dep.id);
	check(
		"removerProduto (soft delete)",
		rem && rem.success,
		JSON.stringify(rem),
	);
	// Soft delete é reversível (Lixeira): preserva tudo, inclusive ProdutoCategorias,
	// para que restaurarProduto devolva o produto intacto.
	const vinculosNaLixeira = await db.consultarTabelaBanco(
		"ProdutoCategorias",
		50,
	);
	const linhasNaLixeira =
		(vinculosNaLixeira && vinculosNaLixeira.linhas) || vinculosNaLixeira || [];
	check(
		"ProdutoCategorias preservada com produto na lixeira",
		linhasNaLixeira.length === 1,
		JSON.stringify(linhasNaLixeira),
	);
	await esperaErro(
		"não remove categoria vinculada a produto na lixeira",
		() => db.removerCategoria(sub.id),
		"vinculada",
	);

	const excluido = await db.excluirProdutoPermanente(dep.id);
	check(
		"excluirProdutoPermanente",
		excluido && excluido.success,
		JSON.stringify(excluido),
	);
	const vinculosAposExclusao = await db.consultarTabelaBanco(
		"ProdutoCategorias",
		50,
	);
	const linhasAposExclusao =
		(vinculosAposExclusao && vinculosAposExclusao.linhas) ||
		vinculosAposExclusao ||
		[];
	check(
		"ProdutoCategorias limpa após exclusão definitiva (FK cascade)",
		linhasAposExclusao.length === 0,
		JSON.stringify(linhasAposExclusao),
	);
	const remSub = await db.removerCategoria(sub.id);
	check(
		"remove subcategoria livre",
		remSub && remSub.success,
		JSON.stringify(remSub),
	);
	const remGrupo = await db.removerCategoria(grupo.id);
	check(
		"remove grupo livre",
		remGrupo && remGrupo.success,
		JSON.stringify(remGrupo),
	);

	console.log("\n== 8. Persistência entre sessões ==");
	await db.salvarCategoria("Cores", null);
	await db.bloquearBanco();
	await db.desbloquearBanco("senha-teste-123");
	const reabertas = await db.getListCategoriasWithUsage();
	check(
		"dados sobrevivem ao lock/unlock",
		reabertas.length === 1 && reabertas[0].nome === "Cores",
		JSON.stringify(reabertas),
	);
	await esperaErro("senha errada não abre o banco", async () => {
		await db.bloquearBanco();
		await db.desbloquearBanco("senha-errada");
		await db.getCategorias();
	});

	await db.bloquearBanco();
	console.log("\n================================");
	console.log("PASS: " + ok + "   FAIL: " + fail);
	if (falhas.length) {
		console.log("\nFalhas:");
		falhas.forEach((f) => console.log(" - " + f));
	}
	try {
		fs.rmSync(TMP, { recursive: true, force: true });
	} catch (e) {
		/* ignora */
	}
	process.exit(fail ? 1 : 0);
})().catch((e) => {
	console.error("\nERRO FATAL NO HARNESS:", e && e.stack ? e.stack : e);
	try {
		fs.rmSync(TMP, { recursive: true, force: true });
	} catch (er) {
		/* ignora */
	}
	process.exit(2);
});
