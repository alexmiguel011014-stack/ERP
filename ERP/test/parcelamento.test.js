const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-parcelamento-"));
const db = require("../database");
const { allAsync, getAsync, runAsync } = require("../db/conexao");
const { calcularParcelamento } = require("../db/parcelamento");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-parcelamento-teste");
});

after(async () => {
	await db.bloquearBanco();
	fs.rmSync(TMP, { recursive: true, force: true });
});

test("calcula acréscimo uma vez em centavos e deixa o resto na última parcela", () => {
	const resultado = calcularParcelamento({
		valorBase: 100,
		acrescimoPercentual: 5,
		numeroParcelas: 3,
	});
	assert.deepEqual(resultado.parcelas.map((parcela) => parcela.valorCentavos), [3500, 3500, 3500]);
	assert.equal(resultado.acrescimoCentavos, 500);
	assert.equal(resultado.totalCentavos, 10500);

	const comResto = calcularParcelamento({
		valorBase: 100,
		acrescimoPercentual: 0,
		numeroParcelas: 3,
	});
	assert.deepEqual(comResto.parcelas.map((parcela) => parcela.valorCentavos), [3333, 3333, 3334]);
});

test("gera vencimentos mensais sem estourar o fim do mês", () => {
	const resultado = calcularParcelamento({
		valorBase: 30,
		numeroParcelas: 3,
		primeiroVencimento: "2026-01-31",
	});
	assert.deepEqual(resultado.parcelas.map((parcela) => parcela.vencimento), [
		"2026-01-31",
		"2026-02-28",
		"2026-03-31",
	]);
});

test("semeia e expõe as condições padrão para Fiado e Cartão", async () => {
	const condicoes = await db.listarCondicoesParcelamento();
	assert.deepEqual(
		condicoes.map((condicao) => ({
			codigo: condicao.codigo,
			forma: condicao.forma_pagamento,
			parcelas: condicao.numero_parcelas,
			acrescimo: condicao.acrescimo_percentual,
		})),
		[
			{ codigo: "cartao-1x", forma: "Cartão", parcelas: 1, acrescimo: 0 },
			{ codigo: "fiado-1x", forma: "Fiado", parcelas: 1, acrescimo: 0 },
		],
	);
});

test("migra snapshots comerciais da condição para Vendas", async () => {
	const colunas = await allAsync("PRAGMA table_info(Vendas)");
	const nomes = new Set(colunas.map((coluna) => coluna.name));
	for (const nome of [
		"condicao_parcelamento_id",
		"condicao_parcelamento_nome",
		"parcelas",
		"acrescimo_percentual",
		"acrescimo_parcelamento",
		"valor_a_vista",
		"valor_base_parcelamento",
		"total_parcelado",
		"data_primeiro_vencimento",
		"request_id",
	]) {
		assert.ok(nomes.has(nome), `Vendas deveria conter ${nome}`);
	}
	const colunasFinanceiro = await allAsync("PRAGMA table_info(LancamentosFinanceiros)");
	assert.ok(
		colunasFinanceiro.some((coluna) => coluna.name === "venda_id"),
		"LancamentosFinanceiros deveria conter venda_id",
	);
});

test("reaplica a migração sem duplicar as condições padrão", async () => {
	await db.bloquearBanco();
	await db.desbloquearBanco("senha-parcelamento-teste");
	const condicoes = await db.listarCondicoesParcelamento();
	assert.equal(condicoes.length, 2);
});

test("calcula a venda pelo preço salvo, condição e desconto, sem confiar no renderer", async () => {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", ["Produto parcelado"]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, quantidade_estoque) VALUES (?, ?, ?, ?)",
		[produto.lastID, "PARC-CLIENTE", 100, 10],
	);
	const cliente = await runAsync("INSERT INTO Clientes (nome) VALUES (?)", ["Cliente parcelado"]);
	await runAsync("INSERT INTO PrecoCliente (cliente_id, variacao_id, preco) VALUES (?, ?, ?)", [
		cliente.lastID,
		variacao.lastID,
		90,
	]);
	const condicao = await db.salvarCondicaoParcelamento({
		nome: "Fiado 3x com acréscimo",
		forma_pagamento: "Fiado",
		numero_parcelas: 3,
		acrescimo_percentual: 5,
	});

	const resultado = await db.calcularVendaParcelada({
		forma_pagamento: "Fiado",
		cliente_id: cliente.lastID,
		condicao_parcelamento_id: condicao.condicaoId,
		desconto: 10,
		data_primeiro_vencimento: "2026-01-31",
		itens: [{ variacao_id: variacao.lastID, quantidade: 2, preco_unitario: 1 }],
	});
	assert.equal(resultado.valorBase, 180);
	assert.equal(resultado.acrescimo, 9);
	assert.equal(resultado.desconto, 10);
	assert.equal(resultado.total, 179);
	assert.deepEqual(resultado.parcelas.map((parcela) => parcela.valorCentavos), [5966, 5966, 5968]);
	assert.deepEqual(resultado.parcelas.map((parcela) => parcela.vencimento), ["2026-01-31", "2026-02-28", "2026-03-31"]);
});

test("rejeita forma, condição, cliente fiado e desconto inválidos", async () => {
	const fiado = (await db.listarCondicoesParcelamento("Fiado"))[0];
	const cartao = (await db.listarCondicoesParcelamento("Cartão"))[0];
	await assert.rejects(
		() => db.calcularVendaParcelada({ forma_pagamento: "Cartão", condicao_parcelamento_id: fiado.id, itens: [{ variacao_id: 1, quantidade: 1 }] }),
		/não pertence/,
	);
	assert.ok(cartao);
	await assert.rejects(
		() => db.calcularVendaParcelada({ forma_pagamento: "Fiado", condicao_parcelamento_id: fiado.id, itens: [{ variacao_id: 1, quantidade: 1 }] }),
		/Selecione um cliente/,
	);
	assert.throws(
		() => calcularParcelamento({ valorBase: 10, desconto: 11 }),
		/Desconto não pode ser maior/,
	);
});

async function garantirCaixaAberto() {
	const caixa = await db.getCaixaAberto();
	if (!caixa) await db.abrirCaixa(0, null);
}

test("finaliza fiado pela condição persistida, baixa estoque e cria uma parcela por recebível", async () => {
	await garantirCaixaAberto();
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", ["Produto fiado finalizado"]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, quantidade_estoque) VALUES (?, ?, ?, ?)",
		[produto.lastID, "PARC-FIADO-FINAL", 100, 5],
	);
	const cliente = await runAsync("INSERT INTO Clientes (nome) VALUES (?)", ["Cliente fiado finalizado"]);
	const condicao = await db.salvarCondicaoParcelamento({
		nome: "Fiado 2x 5%",
		forma_pagamento: "Fiado",
		numero_parcelas: 2,
		acrescimo_percentual: 5,
	});

	const resultado = await db.finalizarVenda(
		{
			itens: [{ variacao_id: variacao.lastID, quantidade: 2, preco_unitario: 1 }],
			total: 1,
			desconto: 10,
			cliente_id: cliente.lastID,
			forma_pagamento: "Fiado",
			condicao_parcelamento_id: condicao.condicaoId,
			data_primeiro_vencimento: "2026-01-31",
		},
		null,
	);
	assert.equal(resultado.total, 200);
	const venda = await getAsync(
		"SELECT total, valor_a_vista, acrescimo_parcelamento, parcelas, condicao_parcelamento_nome, data_primeiro_vencimento FROM Vendas WHERE id = ?",
		[resultado.vendaId],
	);
	assert.deepEqual(venda, {
		total: 200,
		valor_a_vista: 200,
		acrescimo_parcelamento: 10,
		parcelas: 2,
		condicao_parcelamento_nome: "Fiado 2x 5%",
		data_primeiro_vencimento: "2026-01-31",
	});
	const recebiveis = await allAsync(
		"SELECT venda_id, cliente_id, grupo_id, parcela_num, parcela_total, valor, data_vencimento, forma_pagamento FROM LancamentosFinanceiros WHERE venda_id = ? ORDER BY parcela_num",
		[resultado.vendaId],
	);
	assert.deepEqual(recebiveis.map(({ grupo_id, ...linha }) => ({ ...linha, grupo_id: !!grupo_id })), [
		{ venda_id: resultado.vendaId, cliente_id: cliente.lastID, grupo_id: true, parcela_num: 1, parcela_total: 2, valor: 100, data_vencimento: "2026-01-31", forma_pagamento: "Fiado" },
		{ venda_id: resultado.vendaId, cliente_id: cliente.lastID, grupo_id: true, parcela_num: 2, parcela_total: 2, valor: 100, data_vencimento: "2026-02-28", forma_pagamento: "Fiado" },
	]);
	const estoque = await getAsync("SELECT quantidade_estoque FROM Variacoes WHERE id = ?", [variacao.lastID]);
	assert.equal(estoque.quantidade_estoque, 3);
});

test("cartão parcelado grava a condição comercial, mas não cria recebível do cliente", async () => {
	await garantirCaixaAberto();
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", ["Produto cartão finalizado"]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, quantidade_estoque) VALUES (?, ?, ?, ?)",
		[produto.lastID, "PARC-CARTAO-FINAL", 100, 3],
	);
	const condicao = await db.salvarCondicaoParcelamento({
		nome: "Cartão 3x 8%",
		forma_pagamento: "Cartão",
		numero_parcelas: 3,
		acrescimo_percentual: 8,
	});
	const resultado = await db.finalizarVenda(
		{
			itens: [{ variacao_id: variacao.lastID, quantidade: 2, preco_unitario: 1 }],
			total: 1,
			forma_pagamento: "Cartão",
			condicao_parcelamento_id: condicao.condicaoId,
		},
		null,
	);
	assert.equal(resultado.total, 216);
	const venda = await getAsync("SELECT total, parcelas, acrescimo_parcelamento FROM Vendas WHERE id = ?", [resultado.vendaId]);
	assert.deepEqual(venda, { total: 216, parcelas: 3, acrescimo_parcelamento: 16 });
	const recebivel = await getAsync("SELECT id FROM LancamentosFinanceiros WHERE venda_id = ?", [resultado.vendaId]);
	assert.equal(recebivel, undefined);
});

test("falha de estoque no fiado desfaz venda e recebíveis no mesmo checkout", async () => {
	await garantirCaixaAberto();
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", ["Produto fiado sem estoque"]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, quantidade_estoque) VALUES (?, ?, ?, ?)",
		[produto.lastID, "PARC-FIADO-ROLLBACK", 50, 1],
	);
	const cliente = await runAsync("INSERT INTO Clientes (nome) VALUES (?)", ["Cliente fiado rollback"]);
	const condicao = await db.salvarCondicaoParcelamento({
		nome: "Fiado 4x sem acréscimo",
		forma_pagamento: "Fiado",
		numero_parcelas: 4,
		acrescimo_percentual: 0,
	});
	const antes = await getAsync("SELECT COUNT(*) AS total FROM LancamentosFinanceiros WHERE origem = 'venda'");
	await assert.rejects(
		() =>
			db.finalizarVenda(
				{
					itens: [{ variacao_id: variacao.lastID, quantidade: 2 }],
					cliente_id: cliente.lastID,
					forma_pagamento: "Fiado",
					condicao_parcelamento_id: condicao.condicaoId,
					data_primeiro_vencimento: "2026-01-31",
				},
				null,
			),
		/Estoque insuficiente/,
	);
	const depois = await getAsync("SELECT COUNT(*) AS total FROM LancamentosFinanceiros WHERE origem = 'venda'");
	assert.equal(depois.total, antes.total);
	const estoque = await getAsync("SELECT quantidade_estoque FROM Variacoes WHERE id = ?", [variacao.lastID]);
	assert.equal(estoque.quantidade_estoque, 1);
});

test("repete um checkout com request_id sem duplicar venda ou baixa de estoque", async () => {
	await garantirCaixaAberto();
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", ["Produto idempotente"]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, quantidade_estoque) VALUES (?, ?, ?, ?)",
		[produto.lastID, "PARC-IDEMPOTENTE", 40, 4],
	);
	const condicao = await db.salvarCondicaoParcelamento({
		nome: "Cartão 2x sem acréscimo",
		forma_pagamento: "Cartão",
		numero_parcelas: 2,
		acrescimo_percentual: 0,
	});
	const dados = {
		itens: [{ variacao_id: variacao.lastID, quantidade: 1 }],
		forma_pagamento: "Cartão",
		condicao_parcelamento_id: condicao.condicaoId,
		request_id: "checkout-idempotente-1",
	};
	const primeira = await db.finalizarVenda(dados, null);
	const repetida = await db.finalizarVenda(dados, null);
	assert.equal(repetida.vendaId, primeira.vendaId);
	assert.equal(repetida.idempotente, true);
	const estoque = await getAsync("SELECT quantidade_estoque FROM Variacoes WHERE id = ?", [variacao.lastID]);
	assert.equal(estoque.quantidade_estoque, 3);
	const vendas = await getAsync("SELECT COUNT(*) AS total FROM Vendas WHERE request_id = ?", [dados.request_id]);
	assert.equal(vendas.total, 1);
});

test("orçamento fiado reserva sem recebível e converte uma única vez na agenda salva", async () => {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", ["Produto orçamento fiado"]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, quantidade_estoque) VALUES (?, ?, ?, ?)",
		[produto.lastID, "PARC-ORCAMENTO-FIADO", 60, 5],
	);
	const cliente = await runAsync("INSERT INTO Clientes (nome) VALUES (?)", ["Cliente orçamento fiado"]);
	const condicao = await db.salvarCondicaoParcelamento({
		nome: "Fiado 5x sem acréscimo",
		forma_pagamento: "Fiado",
		numero_parcelas: 5,
		acrescimo_percentual: 0,
	});
	const orcamento = await db.finalizarVenda(
		{
			status: "orcamento",
			itens: [{ variacao_id: variacao.lastID, quantidade: 2 }],
			cliente_id: cliente.lastID,
			forma_pagamento: "Fiado",
			condicao_parcelamento_id: condicao.condicaoId,
			data_primeiro_vencimento: "2026-01-31",
		},
		null,
	);
	const antes = await getAsync("SELECT COUNT(*) AS total FROM LancamentosFinanceiros WHERE venda_id = ?", [orcamento.vendaId]);
	assert.equal(antes.total, 0);
	await db.converterOrcamento(orcamento.vendaId);
	const recebiveis = await allAsync("SELECT parcela_num, parcela_total, data_vencimento FROM LancamentosFinanceiros WHERE venda_id = ? ORDER BY parcela_num", [orcamento.vendaId]);
	assert.deepEqual(recebiveis, [
		{ parcela_num: 1, parcela_total: 5, data_vencimento: "2026-01-31" },
		{ parcela_num: 2, parcela_total: 5, data_vencimento: "2026-02-28" },
		{ parcela_num: 3, parcela_total: 5, data_vencimento: "2026-03-31" },
		{ parcela_num: 4, parcela_total: 5, data_vencimento: "2026-04-30" },
		{ parcela_num: 5, parcela_total: 5, data_vencimento: "2026-05-31" },
	]);
	await assert.rejects(() => db.converterOrcamento(orcamento.vendaId), /não é um orçamento/);
	const depois = await getAsync("SELECT COUNT(*) AS total FROM LancamentosFinanceiros WHERE venda_id = ?", [orcamento.vendaId]);
	assert.equal(depois.total, 5);
});

test("reconhece Fiado somente na baixa e Cartão uma vez na venda, mesmo com Pagamentos", async () => {
	await garantirCaixaAberto();
	const hoje = new Date().toISOString().slice(0, 10);
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", ["Produto fluxo parcelado"]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, quantidade_estoque) VALUES (?, ?, ?, ?)",
		[produto.lastID, "PARC-FLUXO", 100, 10],
	);
	const cliente = await runAsync("INSERT INTO Clientes (nome) VALUES (?)", ["Cliente fluxo parcelado"]);
	const fiado = await db.salvarCondicaoParcelamento({
		nome: "Fiado fluxo 6x",
		forma_pagamento: "Fiado",
		numero_parcelas: 6,
		acrescimo_percentual: 0,
	});
	const vendaFiado = await db.finalizarVenda(
		{
			itens: [{ variacao_id: variacao.lastID, quantidade: 1 }],
			cliente_id: cliente.lastID,
			forma_pagamento: "Fiado",
			condicao_parcelamento_id: fiado.condicaoId,
			data_primeiro_vencimento: hoje,
		},
		null,
	);
	const realizadoAntes = await db.getFluxoCaixa(hoje, hoje);
	assert.equal(
		realizadoAntes.eventos.filter((evento) => evento.referenciaId === vendaFiado.vendaId).length,
		0,
	);
	const projetadoAntes = await db.getFluxoCaixaProjetado(hoje, hoje);
	assert.deepEqual(
		projetadoAntes.eventos
			.filter((evento) => evento.referenciaId === vendaFiado.vendaId)
			.map((evento) => evento.valor),
		[16.66],
	);
	const parcelasFiado = await db.getParcelasVenda(vendaFiado.vendaId);
	assert.equal(parcelasFiado[0].cliente_nome, "Cliente fluxo parcelado");
	await db.baixarLancamento(parcelasFiado[0].id);
	const realizadoDepois = await db.getFluxoCaixa(hoje, hoje);
	assert.deepEqual(
		realizadoDepois.eventos
			.filter((evento) => evento.referenciaId === vendaFiado.vendaId)
			.map((evento) => evento.valor),
		[16.66],
	);

	const cartao = await db.salvarCondicaoParcelamento({
		nome: "Cartão fluxo 4x",
		forma_pagamento: "Cartão",
		numero_parcelas: 4,
		acrescimo_percentual: 0,
	});
	const vendaCartao = await db.finalizarVenda(
		{
			itens: [{ variacao_id: variacao.lastID, quantidade: 1 }],
			forma_pagamento: "Cartão",
			condicao_parcelamento_id: cartao.condicaoId,
		},
		null,
	);
	await runAsync(
		"INSERT INTO Pagamentos (venda_id, metodo, numero_identificador, data_recebimento, valor_recebido, status) VALUES (?, ?, ?, ?, ?, ?)",
		[vendaCartao.vendaId, "cartao", "teste-sem-duplicar", hoje, 100, "recebido"],
	);
	const realizadoCartao = await db.getFluxoCaixa(hoje, hoje);
	assert.deepEqual(
		realizadoCartao.eventos
			.filter((evento) => evento.referenciaId === vendaCartao.vendaId)
			.map((evento) => ({ valor: evento.valor, origem: evento.origem })),
		[{ valor: 100, origem: "venda" }],
	);
});

test("devolução Fiado cancela parcelas abertas por vencimento e nunca altera parcela paga", async () => {
	await garantirCaixaAberto();
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", ["Produto devolução fiado"]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, quantidade_estoque) VALUES (?, ?, ?, ?)",
		[produto.lastID, "PARC-DEVOLUCAO", 100, 12],
	);
	const cliente = await runAsync("INSERT INTO Clientes (nome) VALUES (?)", ["Cliente devolução fiado"]);
	const condicao = await db.salvarCondicaoParcelamento({
		nome: "Fiado devolução 8x",
		forma_pagamento: "Fiado",
		numero_parcelas: 8,
		acrescimo_percentual: 0,
	});
	const venda = await db.finalizarVenda(
		{
			itens: [{ variacao_id: variacao.lastID, quantidade: 8 }],
			cliente_id: cliente.lastID,
			forma_pagamento: "Fiado",
			condicao_parcelamento_id: condicao.condicaoId,
			data_primeiro_vencimento: "2026-01-31",
		},
		null,
	);
	const itens = await db.getItensVenda(venda.vendaId);
	let parcelas = await db.getParcelasVenda(venda.vendaId);
	await db.baixarLancamento(parcelas[0].id);
	await db.registrarDevolucao(
		{
			venda_id: venda.vendaId,
			itens: [{ item_venda_id: itens[0].id, quantidade: 1 }],
		},
		null,
	);
	parcelas = await db.getParcelasVenda(venda.vendaId);
	assert.deepEqual(
		parcelas.map((parcela) => ({ valor: parcela.valor, status: parcela.status })),
		[
			{ valor: 100, status: "pago" },
			{ valor: 0, status: "cancelado" },
			...Array.from({ length: 6 }, () => ({ valor: 100, status: "aberto" })),
		],
	);
});

test("bloqueia devolução Fiado que excede o saldo aberto sem reescrever parcela paga", async () => {
	await garantirCaixaAberto();
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", ["Produto devolução bloqueada"]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, quantidade_estoque) VALUES (?, ?, ?, ?)",
		[produto.lastID, "PARC-DEVOLUCAO-BLOQ", 100, 4],
	);
	const cliente = await runAsync("INSERT INTO Clientes (nome) VALUES (?)", ["Cliente devolução bloqueada"]);
	const condicao = await db.salvarCondicaoParcelamento({
		nome: "Fiado devolução bloqueada 9x",
		forma_pagamento: "Fiado",
		numero_parcelas: 9,
		acrescimo_percentual: 0,
	});
	const venda = await db.finalizarVenda(
		{
			itens: [{ variacao_id: variacao.lastID, quantidade: 1 }],
			cliente_id: cliente.lastID,
			forma_pagamento: "Fiado",
			condicao_parcelamento_id: condicao.condicaoId,
			data_primeiro_vencimento: "2026-01-31",
		},
		null,
	);
	const itens = await db.getItensVenda(venda.vendaId);
	const parcelas = await db.getParcelasVenda(venda.vendaId);
	await db.baixarLancamento(parcelas[0].id);
	await assert.rejects(
		() =>
			db.registrarDevolucao(
				{
					venda_id: venda.vendaId,
					itens: [{ item_venda_id: itens[0].id, quantidade: 1 }],
				},
				null,
			),
		/excede o saldo fiado em aberto/,
	);
	assert.deepEqual(
		(await db.getParcelasVenda(venda.vendaId)).map((parcela) => parcela.status),
		["pago", ...Array.from({ length: 8 }, () => "aberto")],
	);
});

test("IPC de parcelas exige admin e preserva o canal entre IPC, preload e API tipada", async () => {
	const { registrar } = require("../ipc/vendas");
	const handlers = {};
	registrar(
		{
			handle: (canal, handler) => {
				handlers[canal] = handler;
			},
		},
		{
			exigirSessao: (perfil) => {
				if (perfil === "admin") throw new Error("Permissão negada.");
			},
			exigirPermissao: () => {},
			getSessao: () => null,
			log: () => {},
		},
	);
	assert.equal(typeof handlers["get-parcelas-venda"], "function");
	await assert.rejects(
		() => handlers["get-parcelas-venda"](null, 1),
		/Permissão negada/,
	);
	const preload = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");
	const api = fs.readFileSync(
		path.join(__dirname, "..", "frontend", "src", "lib", "erpApi.ts"),
		"utf8",
	);
	assert.match(preload, /getParcelasVenda:[\s\S]*get-parcelas-venda/);
	assert.match(api, /parcelas: \(vendaId: number\)[\s\S]*getParcelasVenda/);
});
