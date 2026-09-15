const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-pagamento-misto-"));
const db = require("../database");
const { allAsync, getAsync, runAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-pagamento-misto");
	await db.abrirCaixa(0, null);
});

after(async () => {
	await db.bloquearBanco();
	fs.rmSync(TMP, { recursive: true, force: true });
});

async function criarVariacao(preco, estoque) {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto pagamento misto",
	]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, quantidade_estoque) VALUES (?, ?, ?, ?)",
		[produto.lastID, `MISTO-${produto.lastID}`, preco, estoque],
	);
	return variacao.lastID;
}

test("calcula e persiste a taxa do cartão somente na linha mista", async () => {
	const variacaoId = await criarVariacao(213.75, 2);
	const condicao = await db.salvarCondicaoParcelamento({
		nome: "Cartão misto 4x 4%",
		forma_pagamento: "Cartão",
		numero_parcelas: 4,
		acrescimo_percentual: 4,
	});
	const pagamentos = [
		{ forma_pagamento: "PIX", valor: 100 },
		{
			forma_pagamento: "Cartão",
			valor: 113.75,
			condicao_parcelamento_id: condicao.condicaoId,
		},
	];

	const previa = await db.calcularVendaMista({
		itens: [{ variacao_id: variacaoId, quantidade: 1 }],
		desconto: 0,
		pagamentos,
	});
	assert.equal(previa.total, 218.3);
	assert.deepEqual(
		previa.pagamentos[1].parcelas.map((parcela) => parcela.valorCentavos),
		[2957, 2957, 2957, 2959],
	);

	const venda = await db.finalizarVenda(
		{
			itens: [{ variacao_id: variacaoId, quantidade: 1 }],
			status: "finalizada",
			forma_pagamento: "Misto",
			pagamentos,
			total: 999,
		},
		null,
	);
	assert.equal(venda.total, 218.3);
	const snapshot = await allAsync(
		"SELECT forma_pagamento, valor_base, valor_final, parcelas, acrescimo_percentual FROM VendaPagamentos WHERE venda_id = ? ORDER BY id",
		[venda.vendaId],
	);
	assert.deepEqual(snapshot, [
		{
			forma_pagamento: "PIX",
			valor_base: 100,
			valor_final: 100,
			parcelas: 1,
			acrescimo_percentual: 0,
		},
		{
			forma_pagamento: "Cartão",
			valor_base: 113.75,
			valor_final: 118.3,
			parcelas: 4,
			acrescimo_percentual: 4,
		},
	]);
	assert.deepEqual(
		await getAsync(
			"SELECT metodo, valor_recebido, status FROM Pagamentos WHERE venda_id = ?",
			[venda.vendaId],
		),
		{ metodo: "Cartão", valor_recebido: 118.3, status: "pendente" },
	);
});

test("rejeita soma mista inválida sem criar venda", async () => {
	const variacaoId = await criarVariacao(100, 2);
	await assert.rejects(
		() =>
			db.finalizarVenda({
				itens: [{ variacao_id: variacaoId, quantidade: 1 }],
				status: "finalizada",
				forma_pagamento: "Misto",
				pagamentos: [
					{ forma_pagamento: "PIX", valor: 50 },
					{ forma_pagamento: "Cartão", valor: 40 },
				],
			}),
		/Os pagamentos devem somar exatamente/,
	);
	assert.equal(
		(await getAsync("SELECT COUNT(*) AS total FROM Vendas WHERE total = 90", [])).total,
		0,
	);
});

test("rejeita orçamento com pagamento dividido também no backend", async () => {
	const variacaoId = await criarVariacao(100, 2);
	await assert.rejects(
		() =>
			db.finalizarVenda({
				itens: [{ variacao_id: variacaoId, quantidade: 1 }],
				status: "orcamento",
				pagamentos: [
					{ forma_pagamento: "PIX", valor: 50 },
					{ forma_pagamento: "Dinheiro", valor: 50 },
				],
			}),
		/Pagamento dividido só pode ser usado ao finalizar a venda/,
	);
});

test("valida o recebido somente contra a parte em dinheiro", async () => {
	const variacaoId = await criarVariacao(100, 2);
	await assert.rejects(
		() =>
			db.finalizarVenda({
				itens: [{ variacao_id: variacaoId, quantidade: 1 }],
				status: "finalizada",
				pagamentos: [
					{ forma_pagamento: "Dinheiro", valor: 40 },
					{ forma_pagamento: "PIX", valor: 60 },
				],
				valor_recebido: 39,
			}),
		/O valor recebido em dinheiro não cobre/,
	);
	assert.equal(
		(await getAsync("SELECT COUNT(*) AS total FROM Vendas WHERE total = 100", [])).total,
		0,
	);
});

test("rejeita Fiado combinado com outra forma", async () => {
	const variacaoId = await criarVariacao(100, 2);
	await assert.rejects(
		() =>
			db.calcularVendaMista({
				itens: [{ variacao_id: variacaoId, quantidade: 1 }],
				pagamentos: [
					{ forma_pagamento: "Fiado", valor: 50 },
					{ forma_pagamento: "PIX", valor: 50 },
				],
			}),
		/Fiado não pode ser misturado/,
	);
});

test("orçamento de cartão mantém a taxa e converte uma única vez", async () => {
	const variacaoId = await criarVariacao(100, 2);
	const condicao = await getAsync(
		"SELECT id FROM CondicoesParcelamento WHERE forma_pagamento = 'Cartão' AND numero_parcelas = 4 LIMIT 1",
	);
	const orcamento = await db.finalizarVenda({
		itens: [{ variacao_id: variacaoId, quantidade: 1 }],
		status: "orcamento",
		forma_pagamento: "Cartão",
		condicao_parcelamento_id: condicao.id,
	});
	assert.equal(orcamento.total, 104);
	assert.equal(
		(await getAsync("SELECT COUNT(*) AS total FROM Pagamentos WHERE venda_id = ?", [orcamento.vendaId])).total,
		0,
	);
	assert.equal(
		(await getAsync("SELECT quantidade_estoque FROM Variacoes WHERE id = ?", [variacaoId])).quantidade_estoque,
		2,
	);

	await db.converterOrcamento(orcamento.vendaId);
	assert.equal(
		(await getAsync("SELECT total FROM Vendas WHERE id = ?", [orcamento.vendaId])).total,
		104,
	);
	assert.equal(
		(await getAsync("SELECT COUNT(*) AS total FROM Pagamentos WHERE venda_id = ? AND metodo = 'Cartão'", [orcamento.vendaId])).total,
		1,
	);
	assert.equal(
		(await getAsync("SELECT quantidade_estoque FROM Variacoes WHERE id = ?", [variacaoId])).quantidade_estoque,
		1,
	);
	await assert.rejects(() => db.converterOrcamento(orcamento.vendaId), /não é um orçamento/);
});
