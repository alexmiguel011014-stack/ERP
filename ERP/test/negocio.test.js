/* Cobertura das rotinas que mexem em dinheiro/estoque: baixa atômica no checkout,
   conversão de orçamento, baixa de lançamento financeiro e recebimentos (pagamentos).
   Roda contra um SQLCipher temporário e descartável (mesmo padrão de scripts/test-db.js). */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-negocio-"));
const db = require("../database");
const { runAsync, getAsync } = require("../db/conexao");
const pagamentos = require("../db/pagamentos");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-teste-123");
});

after(async () => {
	await db.bloquearBanco();
});

async function criarVariacao(estoque) {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto Teste " + Math.random().toString(36).slice(2, 8),
	]);
	const sku = "SKU-" + Math.random().toString(36).slice(2, 10);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, quantidade_estoque) VALUES (?, ?, ?, ?)",
		[produto.lastID, sku, 100, estoque],
	);
	return variacao.lastID;
}

async function estoqueAtual(variacaoId) {
	const row = await getAsync(
		"SELECT quantidade_estoque, quantidade_reservada FROM Variacoes WHERE id = ?",
		[variacaoId],
	);
	return row;
}

test("checkout com estoque insuficiente: rejeita e não altera o saldo (rollback atômico)", async () => {
	const variacaoId = await criarVariacao(2);
	await assert.rejects(
		() =>
			db.finalizarVenda(
				{
					itens: [
						{ variacao_id: variacaoId, quantidade: 5, preco_unitario: 100 },
					],
					total: 500,
				},
				null,
			),
		/[Ee]stoque insuficiente/,
	);
	const depois = await estoqueAtual(variacaoId);
	assert.strictEqual(
		depois.quantidade_estoque,
		2,
		"saldo não pode mudar numa venda rejeitada",
	);
});

test("checkout com estoque suficiente: baixa exatamente a quantidade vendida", async () => {
	const variacaoId = await criarVariacao(10);
	const resultado = await db.finalizarVenda(
		{
			itens: [{ variacao_id: variacaoId, quantidade: 3, preco_unitario: 100 }],
			total: 300,
		},
		null,
	);
	assert.ok(resultado.success);
	const depois = await estoqueAtual(variacaoId);
	assert.strictEqual(depois.quantidade_estoque, 7);
});

test("orçamento reserva estoque sem baixar; converter em venda baixa e libera a reserva", async () => {
	const variacaoId = await criarVariacao(10);
	const orcamento = await db.finalizarVenda(
		{
			itens: [{ variacao_id: variacaoId, quantidade: 4, preco_unitario: 100 }],
			total: 400,
			status: "orcamento",
		},
		null,
	);
	const apósOrcamento = await estoqueAtual(variacaoId);
	assert.strictEqual(
		apósOrcamento.quantidade_estoque,
		10,
		"orçamento não pode baixar estoque real",
	);
	assert.strictEqual(
		apósOrcamento.quantidade_reservada,
		4,
		"orçamento precisa reservar a quantidade",
	);

	await db.converterOrcamento(orcamento.vendaId);
	const apósConversao = await estoqueAtual(variacaoId);
	assert.strictEqual(
		apósConversao.quantidade_estoque,
		6,
		"conversão baixa o estoque real",
	);
	assert.strictEqual(
		apósConversao.quantidade_reservada,
		0,
		"conversão libera a reserva",
	);
});

test("baixarLancamento: marca como pago, entra no fluxo de caixa uma única vez", async () => {
	const criado = await db.criarLancamento({
		tipo: "receber",
		descricao: "Teste fluxo de caixa",
		valor: 250,
		data_vencimento: new Date().toISOString(),
	});
	await db.baixarLancamento(criado.lancamentoId);

	const hoje = new Date().toISOString().slice(0, 10);
	const fluxo1 = await db.getFluxoCaixa(hoje, hoje);
	const entradasAntes = fluxo1.totalEntradas;

	// Baixar de novo o mesmo lançamento tem que falhar (guarda contra dupla contagem).
	await assert.rejects(
		() => db.baixarLancamento(criado.lancamentoId),
		/já baixado|não encontrado/,
	);

	const fluxo2 = await db.getFluxoCaixa(hoje, hoje);
	assert.strictEqual(
		fluxo2.totalEntradas,
		entradasAntes,
		"uma segunda tentativa de baixa não pode contar o valor de novo",
	);
});

test("pagamentos: registrar -> listar -> marcar como recebido (round-trip)", async () => {
	const cliente = await runAsync("INSERT INTO Clientes (nome) VALUES (?)", [
		"Cliente Pagamentos",
	]);
	const venda = await runAsync(
		"INSERT INTO Vendas (cliente_id, total, data_venda) VALUES (?, ?, datetime('now'))",
		[cliente.lastID, 199.9],
	);

	const novoId = await pagamentos.registrarPagamento({
		venda_id: venda.lastID,
		cliente_id: cliente.lastID,
		metodo: "pix",
		numero_identificador: "TXID-TESTE",
		data_recebimento: "2026-08-15",
		valor_recebido: 199.9,
		status: "pendente",
		observacao: "",
	});

	const pendentesAntes = await pagamentos.listarPagamentosPendentes();
	assert.strictEqual(pendentesAntes.length, 1);
	assert.strictEqual(pendentesAntes[0].cliente_nome, "Cliente Pagamentos");

	await pagamentos.pagarPagamento(novoId);

	const lista = await pagamentos.listarPagamentos("pix");
	assert.strictEqual(lista[0].status, "recebido");

	const pendentesDepois = await pagamentos.listarPagamentosPendentes();
	assert.strictEqual(pendentesDepois.length, 0);
});
