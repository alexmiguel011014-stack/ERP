/* Bloco 1 da "Module Improvement Pass" (GOALS.md) — código de barras/EAN em
   Produtos, categoria + meta financeira + alerta de vencimento em Financeiro.
   Roda contra um SQLCipher temporário e descartável (mesmo padrão de
   test/negocio.test.js). */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-melhorias-"));
const db = require("../database");
const { runAsync, getAsync, allAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-teste-123");
});

after(async () => {
	await db.bloquearBanco();
});

async function criarVariacaoComBarras(codigoBarras) {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto Barras " + Math.random().toString(36).slice(2, 8),
	]);
	const sku = "SKU-" + Math.random().toString(36).slice(2, 10);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, codigo_barras, preco, quantidade_estoque) VALUES (?, ?, ?, ?, ?)",
		[produto.lastID, sku, codigoBarras, 100, 5],
	);
	return { variacaoId: variacao.lastID, sku };
}

async function criarProdutoComEstoque(nome, sku) {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		nome,
	]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque, estoque_minimo) VALUES (?, ?, 100, 50, 1, 5)",
		[produto.lastID, sku],
	);
	return { produtoId: produto.lastID, variacaoId: variacao.lastID };
}

test("buscarSKU encontra a variação pelo código de barras, não só pelo SKU", async () => {
	const { sku } = await criarVariacaoComBarras("7891234567890");
	const porSku = await db.buscarSKU(sku);
	assert.ok(porSku, "deveria achar pelo SKU normalmente");
	const porBarras = await db.buscarSKU("7891234567890");
	assert.ok(porBarras, "deveria achar pelo código de barras");
	assert.strictEqual(porBarras.sku, sku);
});

test("listas de estoque ocultam produtos inativos e incluem os restaurados", async () => {
	const nome = "Produto Estoque Ativo e Inativo";
	const sufixo = Math.random().toString(36).slice(2, 8);
	const ativo = await criarProdutoComEstoque(nome, `EST-ATIVO-${sufixo}`);
	const inativo = await criarProdutoComEstoque(nome, `EST-INATIVO-${sufixo}`);
	await runAsync(
		"UPDATE Variacoes SET codigo_barras = ?, quantidade_estoque = 4, quantidade_reservada = 2 WHERE id = ?",
		["7891234567890", ativo.variacaoId],
	);

	await db.removerProduto(inativo.produtoId);
	const visaoAtiva = await db.getEstoqueVisaoGeral();
	const baixoAtivo = await db.getEstoqueBaixo();
	assert.ok(visaoAtiva.some((p) => p.produto_id === ativo.produtoId));
	const linhaAtiva = visaoAtiva.find((p) => p.variacao_id === ativo.variacaoId);
	assert.strictEqual(linhaAtiva.codigo_barras, "7891234567890");
	assert.strictEqual(linhaAtiva.quantidade_reservada, 2);
	assert.strictEqual(linhaAtiva.quantidade_disponivel, 2);
	assert.ok(
		!visaoAtiva.some((p) => p.produto_id === inativo.produtoId),
		"a visão geral não deve exibir produtos inativos",
	);
	assert.ok(baixoAtivo.some((p) => p.variacao_id === ativo.variacaoId));
	assert.ok(
		!baixoAtivo.some((p) => p.variacao_id === inativo.variacaoId),
		"a lista de estoque baixo não deve exibir produtos inativos",
	);

	await db.restaurarProduto(inativo.produtoId);
	const visaoRestaurada = await db.getEstoqueVisaoGeral();
	const baixoRestaurado = await db.getEstoqueBaixo();
	assert.ok(visaoRestaurada.some((p) => p.produto_id === ativo.produtoId));
	assert.ok(visaoRestaurada.some((p) => p.produto_id === inativo.produtoId));
	const linhaRestaurada = visaoRestaurada.find(
		(p) => p.variacao_id === inativo.variacaoId,
	);
	assert.strictEqual(linhaRestaurada.codigo_barras, null);
	assert.strictEqual(linhaRestaurada.quantidade_reservada, 0);
	assert.strictEqual(linhaRestaurada.quantidade_disponivel, 1);
	assert.ok(baixoRestaurado.some((p) => p.variacao_id === ativo.variacaoId));
	assert.ok(baixoRestaurado.some((p) => p.variacao_id === inativo.variacaoId));
});

test("histórico de estoque expõe ID do produto, mantém inativos e respeita ordem e limite", async () => {
	const nome = "Produto com nome repetido";
	const sufixo = Math.random().toString(36).slice(2, 8);
	const primeiro = await criarProdutoComEstoque(nome, `MOV-A-${sufixo}`);
	const segundo = await criarProdutoComEstoque(nome, `MOV-B-${sufixo}`);
	await db.registrarEntradaEstoque({
		itens: [{ variacao_id: primeiro.variacaoId, quantidade: 1 }],
		observacao: "mais antigo",
	});
	await db.registrarEntradaEstoque({
		itens: [{ variacao_id: segundo.variacaoId, quantidade: 2 }],
		observacao: "produto inativo",
	});
	await db.removerProduto(segundo.produtoId);
	await db.registrarEntradaEstoque({
		itens: [{ variacao_id: primeiro.variacaoId, quantidade: 3 }],
		observacao: "mais recente",
	});

	const movimentos = await db.getMovimentacoesEstoque(2);
	assert.strictEqual(movimentos.length, 2);
	assert.deepStrictEqual(
		movimentos.map((movimento) => movimento.observacao),
		["mais recente", "produto inativo"],
	);
	assert.deepStrictEqual(
		movimentos.map((movimento) => movimento.produto_id),
		[primeiro.produtoId, segundo.produtoId],
	);
	assert.notStrictEqual(movimentos[0].produto_id, movimentos[1].produto_id);
	assert.ok(movimentos.every((movimento) => movimento.produto_nome === nome));
	assert.ok(movimentos[0].id > movimentos[1].id);
	assert.ok(
		movimentos.every(
			(movimento) => !Object.keys(movimento).some((chave) => /categoria/i.test(chave)),
		),
	);
	assert.ok(!movimentos.some((movimento) => movimento.observacao === "mais antigo"));
});

test("entrada com produto inativo reverte o lote e preserva custo e histórico", async () => {
	const sufixo = Math.random().toString(36).slice(2, 8);
	const ativo = await criarProdutoComEstoque("Entrada ativa", `ENT-A-${sufixo}`);
	const inativo = await criarProdutoComEstoque("Entrada inativa", `ENT-B-${sufixo}`);
	await db.registrarEntradaEstoque({ itens: [{ variacao_id: ativo.variacaoId, quantidade: 1, custo_unitario: 70 }] });
	await db.registrarEntradaEstoque({ itens: [{ variacao_id: inativo.variacaoId, quantidade: 1, custo_unitario: 70 }] });
	assert.deepStrictEqual(await getAsync("SELECT quantidade_estoque, preco_custo FROM Variacoes WHERE id = ?", [ativo.variacaoId]), { quantidade_estoque: 2, preco_custo: 60 });
	const historico = await allAsync("SELECT tipo, quantidade, custo_unitario, origem FROM MovimentacoesEstoque WHERE variacao_id = ? ORDER BY id", [ativo.variacaoId]);
	const historicoInativo = await allAsync("SELECT tipo, quantidade, custo_unitario, origem FROM MovimentacoesEstoque WHERE variacao_id = ? ORDER BY id", [inativo.variacaoId]);
	await db.removerProduto(inativo.produtoId);
	await assert.rejects(() => db.registrarEntradaEstoque({ itens: [
		{ variacao_id: ativo.variacaoId, quantidade: 2, custo_unitario: 90 },
		{ variacao_id: inativo.variacaoId, quantidade: 2, custo_unitario: 90 },
	] }), /inativo/i);
	assert.deepStrictEqual(await getAsync("SELECT quantidade_estoque, preco_custo FROM Variacoes WHERE id = ?", [ativo.variacaoId]), { quantidade_estoque: 2, preco_custo: 60 });
	assert.deepStrictEqual(await allAsync("SELECT tipo, quantidade, custo_unitario, origem FROM MovimentacoesEstoque WHERE variacao_id = ? ORDER BY id", [ativo.variacaoId]), historico);
	await db.restaurarProduto(inativo.produtoId);
	assert.strictEqual((await getAsync("SELECT quantidade_estoque FROM Variacoes WHERE id = ?", [inativo.variacaoId])).quantidade_estoque, 2);
	assert.deepStrictEqual(await allAsync("SELECT tipo, quantidade, custo_unitario, origem FROM MovimentacoesEstoque WHERE variacao_id = ? ORDER BY id", [inativo.variacaoId]), historicoInativo);
	assert.deepStrictEqual(await allAsync("SELECT tipo, quantidade, custo_unitario, origem FROM MovimentacoesEstoque WHERE variacao_id = ? ORDER BY id", [ativo.variacaoId]), historico);
});

test("exclusão concorrente persiste quando entrada com item inativo reverte", async () => {
	const sufixo = Math.random().toString(36).slice(2, 8);
	const ativo = await criarProdutoComEstoque("Entrada concorrente", `CONC-A-${sufixo}`);
	const inativo = await criarProdutoComEstoque("Entrada rejeitada", `CONC-B-${sufixo}`);
	const excluido = await criarProdutoComEstoque("Exclusão concorrente", `CONC-C-${sufixo}`);
	await db.removerProduto(inativo.produtoId);

	const sqlite = require("@journeyapps/sqlcipher");
	const originalRun = sqlite.Database.prototype.run;
	let chegouNaEntrada;
	let tentouExcluir;
	let liberarEntrada;
	const entradaPausada = new Promise((resolve) => { chegouNaEntrada = resolve; });
	const exclusaoTentada = new Promise((resolve) => { tentouExcluir = resolve; });
	const liberar = new Promise((resolve) => { liberarEntrada = resolve; });
	async function esperarEtapa(promessa) {
		let tempo;
		try {
			await Promise.race([promessa, new Promise((_, rejeitar) => {
				tempo = setTimeout(() => rejeitar(new Error("Etapa concorrente não foi alcançada")), 5000);
			})]);
		} finally {
			clearTimeout(tempo);
		}
	}
	let entrada;
	let exclusao;
	let pausou = false;
	try {
		sqlite.Database.prototype.run = function (sql, ...args) {
			if (sql.startsWith("INSERT INTO MovimentacoesEstoque") && args[0]?.[0] === ativo.variacaoId && !pausou) {
				pausou = true;
				const callback = args[args.length - 1];
				args[args.length - 1] = function (erro) {
					const statement = this;
					chegouNaEntrada();
					liberar.then(() => callback.call(statement, erro));
				};
			} else if (sql === "UPDATE Produtos SET ativo = 0 WHERE id = ?" && args[0]?.[0] === excluido.produtoId) {
				tentouExcluir();
			}
			return originalRun.call(this, sql, ...args);
		};
		entrada = db.registrarEntradaEstoque({ itens: [
			{ variacao_id: ativo.variacaoId, quantidade: 2, custo_unitario: 80 },
			{ variacao_id: inativo.variacaoId, quantidade: 2, custo_unitario: 80 },
		] });
		await esperarEtapa(entradaPausada);
		exclusao = db.removerProduto(excluido.produtoId);
		await esperarEtapa(exclusaoTentada);
		liberarEntrada();
		const [resultadoEntrada, resultadoExclusao] = await Promise.allSettled([entrada, exclusao]);
		assert.strictEqual(resultadoEntrada.status, "rejected");
		assert.match(String(resultadoEntrada.reason), /inativo/i);
		assert.strictEqual(resultadoExclusao.status, "fulfilled");
		assert.strictEqual((await getAsync("SELECT ativo FROM Produtos WHERE id = ?", [excluido.produtoId])).ativo, 0);
		for (const item of [ativo, inativo]) {
			assert.deepStrictEqual(await getAsync("SELECT quantidade_estoque, preco_custo FROM Variacoes WHERE id = ?", [item.variacaoId]), { quantidade_estoque: 1, preco_custo: 50 });
			assert.strictEqual((await getAsync("SELECT COUNT(*) AS n FROM MovimentacoesEstoque WHERE variacao_id = ?", [item.variacaoId])).n, 0);
		}
	} finally {
		liberarEntrada();
		sqlite.Database.prototype.run = originalRun;
		await Promise.allSettled([entrada, exclusao].filter(Boolean));
	}
});

test("saída valida quantidade e produto e registra motivo e aviso de reserva", async () => {
	const item = await criarProdutoComEstoque("Saída", `SAIDA-${Math.random().toString(36).slice(2, 8)}`);
	await runAsync("UPDATE Variacoes SET quantidade_estoque = 10, quantidade_reservada = 9 WHERE id = ?", [item.variacaoId]);
	for (const quantidade of [0, -1, 1.5, 11]) {
		await assert.rejects(() => db.registrarSaidaEstoque({ variacao_id: item.variacaoId, quantidade, observacao: "Avaria" }));
	}
	await assert.rejects(() => db.registrarSaidaEstoque({ variacao_id: item.variacaoId, quantidade: 1, observacao: "" }));
	assert.strictEqual((await getAsync("SELECT quantidade_estoque FROM Variacoes WHERE id = ?", [item.variacaoId])).quantidade_estoque, 10);
	const resultado = await db.registrarSaidaEstoque({ variacao_id: item.variacaoId, quantidade: 2, observacao: "Avaria" });
	assert.strictEqual(resultado.quantidade_estoque, 8);
	assert.strictEqual(resultado.abaixoDoReservado, true);
	assert.strictEqual(resultado.quantidade_reservada, 9);
	assert.deepStrictEqual(await getAsync("SELECT tipo, quantidade, origem, observacao FROM MovimentacoesEstoque WHERE variacao_id = ?", [item.variacaoId]), { tipo: "ajuste", quantidade: -2, origem: "ajuste_manual", observacao: "Avaria" });
	await db.removerProduto(item.produtoId);
	await assert.rejects(() => db.registrarSaidaEstoque({ variacao_id: item.variacaoId, quantidade: 1, observacao: "Avaria" }), /inativo/i);
	await db.restaurarProduto(item.produtoId);
	assert.strictEqual((await getAsync("SELECT quantidade_estoque FROM Variacoes WHERE id = ?", [item.variacaoId])).quantidade_estoque, 8);
});

test("IPC de estoque exige permissão e histórico não expõe categorias", async () => {
	const sku = `IPC-ESTOQUE-${Math.random().toString(36).slice(2, 8)}`;
	const item = await criarProdutoComEstoque("Produto IPC Estoque", sku);
	const nomeCategoria = `Categoria IPC ${Math.random().toString(36).slice(2, 8)}`;
	const categoriaId = await criarCategoria(nomeCategoria);
	await db.atribuirCategoriaEmLote([item.produtoId], categoriaId);

	const handlers = new Map();
	const permissoesSolicitadas = [];
	let permitir = true;
	const { registrar } = require("../ipc/estoque");
	registrar(
		{
			handle(canal, handler) {
				assert.ok(!handlers.has(canal), `handler duplicado: ${canal}`);
				handlers.set(canal, handler);
			},
		},
		{
			exigirPermissao(modulo) {
				permissoesSolicitadas.push(modulo);
				if (!permitir) throw new Error("Permissão de estoque negada.");
			},
		},
	);

	const chamar = (canal, ...argumentos) => {
		const handler = handlers.get(canal);
		assert.ok(handler, `handler ausente: ${canal}`);
		return handler({}, ...argumentos);
	};
	const canais = [
		"get-estoque-visao-geral",
		"get-movimentacoes-estoque",
		"registrar-entrada-estoque",
		"registrar-saida-estoque",
	];

	const visao = await chamar(canais[0]);
	assert.ok(visao.some((linha) => linha.variacao_id === item.variacaoId));
	await chamar(canais[2], {
		itens: [{ variacao_id: item.variacaoId, quantidade: 1, custo_unitario: 50 }],
		observacao: "Entrada permitida pelo IPC",
	});
	await chamar(canais[3], {
		variacao_id: item.variacaoId,
		quantidade: 1,
		observacao: "Saída permitida pelo IPC",
	});
	const historico = await chamar(canais[1], 100);
	assert.deepStrictEqual(permissoesSolicitadas, Array(4).fill("estoque"));

	const movimentosDoProduto = historico.filter((movimento) => movimento.sku === sku);
	assert.strictEqual(movimentosDoProduto.length, 2);
	assert.ok(
		movimentosDoProduto.every((movimento) =>
			Object.keys(movimento).every((campo) => !/categoria/i.test(campo)),
		),
		"o histórico não deve expor campos com IDs ou nomes de categoria",
	);
	assert.ok(
		!JSON.stringify(movimentosDoProduto).includes(nomeCategoria),
		"o histórico não deve expor o nome da categoria do produto",
	);

	const saldoAntes = await getAsync(
		"SELECT quantidade_estoque FROM Variacoes WHERE id = ?",
		[item.variacaoId],
	);
	const movimentosAntes = await getAsync(
		"SELECT COUNT(*) AS quantidade FROM MovimentacoesEstoque WHERE variacao_id = ?",
		[item.variacaoId],
	);
	permitir = false;
	permissoesSolicitadas.length = 0;
	for (const [canal, ...argumentos] of [
		[canais[0]],
		[canais[1], 100],
		[canais[2], { itens: [{ variacao_id: item.variacaoId, quantidade: 3 }] }],
		[canais[3], { variacao_id: item.variacaoId, quantidade: 1, observacao: "Negada" }],
	]) {
		await assert.rejects(
			() => chamar(canal, ...argumentos),
			(erro) => String(erro) === "Permissão de estoque negada.",
		);
	}
	assert.deepStrictEqual(permissoesSolicitadas, Array(4).fill("estoque"));
	assert.deepStrictEqual(
		await getAsync("SELECT quantidade_estoque FROM Variacoes WHERE id = ?", [item.variacaoId]),
		saldoAntes,
	);
	assert.deepStrictEqual(
		await getAsync(
			"SELECT COUNT(*) AS quantidade FROM MovimentacoesEstoque WHERE variacao_id = ?",
			[item.variacaoId],
		),
		movimentosAntes,
	);
});

test("vendas e orçamentos mantêm baixas, reservas e saídas concorrentes consistentes", async () => {
	const item = await criarProdutoComEstoque("Venda e reserva", `VENDA-${Math.random().toString(36).slice(2, 8)}`);
	await runAsync("UPDATE Variacoes SET quantidade_estoque = 10 WHERE id = ?", [item.variacaoId]);
	await db.abrirCaixa(0, null);
	const venda = (quantidade, status) => db.finalizarVenda({ itens: [{ variacao_id: item.variacaoId, quantidade, preco_unitario: 100 }], total: quantidade * 100, ...(status ? { status } : {}) }, null);
	await venda(2);
	await venda(3, "orcamento");
	assert.deepStrictEqual(await getAsync("SELECT quantidade_estoque, quantidade_reservada FROM Variacoes WHERE id = ?", [item.variacaoId]), { quantidade_estoque: 8, quantidade_reservada: 3 });
	const [vendaConcorrente, saidaConcorrente] = await Promise.allSettled([
		venda(1),
		db.registrarSaidaEstoque({ variacao_id: item.variacaoId, quantidade: 2, observacao: "Perda" }),
	]);
	assert.ok(vendaConcorrente.status === "fulfilled" || saidaConcorrente.status === "fulfilled");
	const saldoEsperado = 8 - (vendaConcorrente.status === "fulfilled" ? 1 : 0) - (saidaConcorrente.status === "fulfilled" ? 2 : 0);
	assert.deepStrictEqual(await getAsync("SELECT quantidade_estoque, quantidade_reservada FROM Variacoes WHERE id = ?", [item.variacaoId]), { quantidade_estoque: saldoEsperado, quantidade_reservada: 3 });
	const movimento = await getAsync("SELECT COUNT(*) AS n FROM MovimentacoesEstoque WHERE variacao_id = ? AND origem = 'ajuste_manual'", [item.variacaoId]);
	assert.strictEqual(movimento.n, saidaConcorrente.status === "fulfilled" ? 1 : 0);
});

test("buscarProdutosPorTermo encontra pelo código de barras", async () => {
	await criarVariacaoComBarras("7899999999999");
	const resultado = await db.buscarProdutosPorTermo("7899999999999");
	assert.strictEqual(resultado.length, 1);
	assert.strictEqual(resultado[0].codigo_barras, "7899999999999");
});

test("criarLancamento aceita categoria da lista fechada", async () => {
	const resultado = await db.criarLancamento({
		tipo: "pagar",
		descricao: "Aluguel de setembro",
		valor: 1500,
		categoria: "Aluguel",
	});
	assert.strictEqual(resultado.success, true);
});

test("criarLancamento aceita categoria Investimento (capex, distinto de despesa recorrente)", async () => {
	const resultado = await db.criarLancamento({
		tipo: "pagar",
		descricao: "Reforma da loja - tintas e cortinas",
		valor: 830.29,
		categoria: "Investimento",
	});
	assert.strictEqual(resultado.success, true);
});

test("criarLancamento recusa categoria fora da lista fechada", async () => {
	await assert.rejects(() =>
		db.criarLancamento({
			tipo: "pagar",
			descricao: "Categoria inventada",
			valor: 100,
			categoria: "Categoria Que Não Existe",
		}),
	);
});

test("criarLancamento sem categoria continua funcionando (campo opcional)", async () => {
	const resultado = await db.criarLancamento({
		tipo: "receber",
		descricao: "Venda avulsa",
		valor: 50,
	});
	assert.strictEqual(resultado.success, true);
});

test("meta de faturamento mensal: salva e recupera", async () => {
	assert.strictEqual(await db.getMetaFaturamentoMensal(), 0);
	await db.saveMetaFaturamentoMensal(30000);
	assert.strictEqual(await db.getMetaFaturamentoMensal(), 30000);
});

test("getLancamentosVencendoHoje só retorna lançamentos abertos vencendo hoje", async () => {
	const hoje = new Date().toISOString();
	const ontem = new Date(Date.now() - 86400000).toISOString();
	await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, status, data_criacao) VALUES ('pagar', 'Vence hoje', 200, ?, 'aberto', ?)",
		[hoje, hoje],
	);
	await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, status, data_criacao) VALUES ('pagar', 'Venceu ontem', 200, ?, 'aberto', ?)",
		[ontem, ontem],
	);
	const vencendoHoje = await db.getLancamentosVencendoHoje();
	assert.ok(vencendoHoje.some((l) => l.descricao === "Vence hoje"));
	assert.ok(!vencendoHoje.some((l) => l.descricao === "Venceu ontem"));
});

// atribuirCategoriaEmLote (GOALS.md "Cadastro de Produtos — Review
// Findings" → Atribuição de categoria em lote): caso real do dono —
// produtos importados sem categoria, hoje só corrigíveis um por um.
async function criarProdutoSemCategoria(nome) {
	const r = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		nome || "Produto Lote " + Math.random().toString(36).slice(2, 8),
	]);
	return r.lastID;
}

async function criarCategoria(nome) {
	const r = await runAsync("INSERT INTO Categorias (nome) VALUES (?)", [
		nome || "Categoria Lote " + Math.random().toString(36).slice(2, 8),
	]);
	return r.lastID;
}

async function categoriasDoProduto(produtoId) {
	return new Promise((resolve, reject) => {
		require("../db/conexao")
			.getConexao()
			.all(
				"SELECT categoria_id FROM ProdutoCategorias WHERE produto_id = ?",
				[produtoId],
				(erro, linhas) =>
					erro ? reject(erro) : resolve(linhas.map((l) => l.categoria_id)),
			);
	});
}

test("atribuirCategoriaEmLote rejeita categoria inexistente", async () => {
	const produtoId = await criarProdutoSemCategoria();
	await assert.rejects(() => db.atribuirCategoriaEmLote([produtoId], 999999));
});

test("atribuirCategoriaEmLote rejeita quando nenhum produto é enviado", async () => {
	const categoriaId = await criarCategoria();
	await assert.rejects(() => db.atribuirCategoriaEmLote([], categoriaId));
});

test("atribuirCategoriaEmLote aplica a categoria aos produtos selecionados", async () => {
	const categoriaId = await criarCategoria();
	const p1 = await criarProdutoSemCategoria();
	const p2 = await criarProdutoSemCategoria();
	const resultado = await db.atribuirCategoriaEmLote([p1, p2], categoriaId);
	assert.strictEqual(resultado.success, true);
	assert.strictEqual(resultado.quantidade, 2);
	assert.deepStrictEqual(await categoriasDoProduto(p1), [categoriaId]);
	assert.deepStrictEqual(await categoriasDoProduto(p2), [categoriaId]);
});

test("atribuirCategoriaEmLote é atômico: um produto id inexistente faz o lote inteiro falhar, nada é gravado", async () => {
	const categoriaId = await criarCategoria();
	const p1 = await criarProdutoSemCategoria();
	const idInexistente = 987654321;
	await assert.rejects(() =>
		db.atribuirCategoriaEmLote([p1, idInexistente], categoriaId),
	);
	assert.deepStrictEqual(
		await categoriasDoProduto(p1),
		[],
		"nada deveria ter sido gravado — o lote inteiro deve falhar junto",
	);
});

test("atribuirCategoriaEmLote é aditivo: não remove categoria que o produto já tinha", async () => {
	const categoriaAntiga = await criarCategoria("Categoria Já Tinha");
	const categoriaNova = await criarCategoria("Categoria Nova Do Lote");
	const produtoId = await criarProdutoSemCategoria();
	await db.atribuirCategoriaEmLote([produtoId], categoriaAntiga);

	await db.atribuirCategoriaEmLote([produtoId], categoriaNova);

	const categoriasFinal = await categoriasDoProduto(produtoId);
	assert.ok(
		categoriasFinal.includes(categoriaAntiga),
		"categoria anterior deveria continuar",
	);
	assert.ok(
		categoriasFinal.includes(categoriaNova),
		"categoria nova do lote deveria ter sido adicionada",
	);
});
