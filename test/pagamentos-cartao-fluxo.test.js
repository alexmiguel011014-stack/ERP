/* GOALS23-06 — timing and idempotency of payment methods in cash flow. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-pagamentos-cartao-"));
const db = require("../database");
const pagamentos = require("../db/pagamentos");
const { getAsync, runAsync } = require("../db/conexao");

const hoje = () => new Date().toISOString().slice(0, 10);
const somarDias = (data, dias) => {
	const valor = new Date(`${data}T00:00:00Z`);
	valor.setUTCDate(valor.getUTCDate() + dias);
	return valor.toISOString().slice(0, 10);
};

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-pagamentos-cartao");
	await db.abrirCaixa(0);
});

after(async () => {
	await db.bloquearBanco();
	fs.rmSync(TMP, { recursive: true, force: true });
});

async function criarVariacao(sku, preco = 100) {
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [sku]);
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque) VALUES (?, ?, ?, 50, 20)",
		[produto.lastID, sku, preco],
	);
	return variacao.lastID;
}

test("Dinheiro aceita exato e troco, mas rejeita pagamento abaixo do total", async () => {
	const exato = await criarVariacao("PAG-CASH-EXATO");
	const vendaExata = await db.finalizarVenda({
		itens: [{ variacao_id: exato, quantidade: 1 }],
		pagamentos: [{ forma_pagamento: "Dinheiro", valor: 100 }],
		valor_recebido: 100,
	});
	assert.equal(vendaExata.success, true);

	const abaixo = await criarVariacao("PAG-CASH-ABAIXO");
	await assert.rejects(
		() => db.finalizarVenda({
			itens: [{ variacao_id: abaixo, quantidade: 1 }],
			pagamentos: [{ forma_pagamento: "Dinheiro", valor: 100 }],
			valor_recebido: 99,
		}),
		/valor recebido.*total|pagamento.*total/i,
	);

	const acima = await criarVariacao("PAG-CASH-ACIMA");
	const vendaAcima = await db.finalizarVenda({
		itens: [{ variacao_id: acima, quantidade: 1 }],
		pagamentos: [{ forma_pagamento: "Dinheiro", valor: 100 }],
		valor_recebido: 120,
	});
	assert.equal(vendaAcima.success, true);
});

test("Cartão pendente só entra no projetado, liquidado entra no realizado", async () => {
	const variacao = await criarVariacao("PAG-CARTAO-UNICO");
	const venda = await db.finalizarVenda({
		itens: [{ variacao_id: variacao, quantidade: 1 }],
		pagamentos: [{ forma_pagamento: "Cartão", valor: 100 }],
	});
	const diaLiquidacao = somarDias(hoje(), 2);
	await assert.rejects(
		() => pagamentos.registrarPagamento({
			venda_id: venda.vendaId,
			metodo: "Cartão",
			numero_identificador: "ACQ-SEM-DATA",
			valor_recebido: 100,
			status: "recebido",
		}),
		/data de liquidação/i,
	);
	const pagamentoAutomatico = await getAsync(
		"SELECT id, numero_identificador, data_recebimento FROM Pagamentos WHERE venda_id = ? AND metodo = 'Cartão'",
		[venda.vendaId],
	);
	assert.equal(pagamentoAutomatico.data_recebimento, null);

	const realizadoAntes = await db.getFluxoCaixa(hoje(), diaLiquidacao);
	assert.equal(realizadoAntes.eventos.some((evento) => evento.referenciaId === venda.vendaId), false);
	await runAsync("UPDATE Pagamentos SET data_recebimento = ? WHERE id = ?", [diaLiquidacao, pagamentoAutomatico.id]);
	const projetado = await db.getFluxoCaixaProjetado(hoje(), diaLiquidacao);
	assert.deepEqual(
		projetado.eventos.filter((evento) => evento.referenciaId === venda.vendaId).map((evento) => evento.valor),
		[100],
	);

	await pagamentos.pagarPagamento(pagamentoAutomatico.id, diaLiquidacao);
	await assert.rejects(
		() => pagamentos.pagarPagamento(pagamentoAutomatico.id, diaLiquidacao),
		/já recebido|não encontrado/i,
	);
	const realizadoDepois = await db.getFluxoCaixa(hoje(), diaLiquidacao);
	assert.deepEqual(
		realizadoDepois.eventos.filter((evento) => evento.referenciaId === venda.vendaId).map((evento) => evento.valor),
		[100],
	);
});

test("Venda mista realiza apenas dinheiro e retry do cartão não duplica", async () => {
	const variacao = await criarVariacao("PAG-MISTO");
	const venda = await db.finalizarVenda({
		itens: [{ variacao_id: variacao, quantidade: 1 }],
		pagamentos: [
			{ forma_pagamento: "Dinheiro", valor: 40 },
			{ forma_pagamento: "Cartão", valor: 60 },
		],
		valor_recebido: 40,
	});
	const diaLiquidacao = somarDias(hoje(), 3);
	const pagamentoAutomatico = await getAsync(
		"SELECT id, numero_identificador FROM Pagamentos WHERE venda_id = ? AND metodo = 'Cartão'",
		[venda.vendaId],
	);
	await runAsync("UPDATE Pagamentos SET data_recebimento = ? WHERE id = ?", [diaLiquidacao, pagamentoAutomatico.id]);
	const dados = {
		venda_id: venda.vendaId,
		metodo: "cartao",
		numero_identificador: pagamentoAutomatico.numero_identificador,
		data_recebimento: diaLiquidacao,
		valor_recebido: 60,
		status: "pendente",
		parcela_num: 1,
		parcela_total: 1,
	};
	const primeiro = await pagamentos.registrarPagamento(dados);
	const segundo = await pagamentos.registrarPagamento(dados);
	assert.equal(segundo, primeiro);
	await assert.rejects(
		() => pagamentos.registrarPagamento({
			...dados,
			numero_identificador: "outro-identificador",
			valor_recebido: 0.01,
		}),
		/supera a alocação/i,
	);
	const quantidade = await getAsync(
		"SELECT COUNT(*) AS total FROM Pagamentos WHERE venda_id = ? AND metodo = 'Cartão'",
		[venda.vendaId],
	);
	assert.equal(quantidade.total, 1);

	const realizado = await db.getFluxoCaixa(hoje(), diaLiquidacao);
	assert.deepEqual(
		realizado.eventos.filter((evento) => evento.referenciaId === venda.vendaId).map((evento) => evento.valor),
		[40],
	);
	const projetado = await db.getFluxoCaixaProjetado(hoje(), diaLiquidacao);
	assert.deepEqual(
		projetado.eventos.filter((evento) => evento.referenciaId === venda.vendaId).map((evento) => evento.valor),
		[60],
	);
});

test("Conversão de orçamento Cartão cria pendência sem data inventada", async () => {
	const variacao = await criarVariacao("PAG-ORCAMENTO-CARTAO");
	const orcamento = await db.finalizarVenda({
		status: "orcamento",
		forma_pagamento: "Cartão",
		itens: [{ variacao_id: variacao, quantidade: 1 }],
	});
	await db.converterOrcamento(orcamento.vendaId);
	const pagamento = await getAsync(
		"SELECT status, data_recebimento, data_liquidacao, valor_recebido, parcela_num, parcela_total FROM Pagamentos WHERE venda_id = ?",
		[orcamento.vendaId],
	);
	assert.deepEqual(pagamento, {
		status: "pendente",
		data_recebimento: null,
		data_liquidacao: null,
		valor_recebido: 100,
		parcela_num: 1,
		parcela_total: 1,
	});
});
