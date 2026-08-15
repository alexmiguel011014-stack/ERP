const { runAsync, allAsync, getAsync } = require("./conexao");

/* ============ Fechamento de caixa ============ */

// Soma o que deveria estar em dinheiro no caixa: vendas finalizadas em
// "Dinheiro" dentro da janela aberta, menos devoluções em dinheiro no mesmo
// período (Devolucoes não guarda forma de pagamento — como o troco de uma
// devolução normalmente sai do caixa físico, todo estorno é descontado).
async function calcularValorEsperadoCaixa(dataAbertura, dataFechamento) {
	const fim = dataFechamento || new Date().toISOString();
	const vendas = await getAsync(
		`SELECT COALESCE(SUM(total), 0) AS soma FROM Vendas
     WHERE status = 'finalizada' AND forma_pagamento = 'Dinheiro'
       AND data_venda >= ? AND data_venda <= ?`,
		[dataAbertura, fim],
	);
	const devolucoes = await getAsync(
		`SELECT COALESCE(SUM(valor_total), 0) AS soma FROM Devolucoes
     WHERE data >= ? AND data <= ?`,
		[dataAbertura, fim],
	);
	return (
		Math.round(
			(Number(vendas.soma || 0) - Number(devolucoes.soma || 0)) * 100,
		) / 100
	);
}

async function getCaixaAberto() {
	return getAsync(
		"SELECT * FROM FechamentosCaixa WHERE status = 'aberto' ORDER BY id DESC LIMIT 1",
	);
}

async function abrirCaixa(valorAbertura, usuarioId) {
	const existente = await getCaixaAberto();
	if (existente)
		throw new Error(
			"Já existe um caixa aberto (desde " + existente.data_abertura + ").",
		);

	const valor = Number(valorAbertura);
	if (!Number.isFinite(valor) || valor < 0)
		throw new Error("Valor de abertura inválido.");

	const result = await runAsync(
		"INSERT INTO FechamentosCaixa (data_abertura, valor_abertura, usuario_abertura_id, status) VALUES (?, ?, ?, 'aberto')",
		[new Date().toISOString(), valor, usuarioId || null],
	);
	return { success: true, caixaId: result.lastID };
}

async function fecharCaixa(valorInformado, observacao, usuarioId) {
	const caixa = await getCaixaAberto();
	if (!caixa) throw new Error("Não há caixa aberto.");

	const valor = Number(valorInformado);
	if (!Number.isFinite(valor) || valor < 0)
		throw new Error("Valor informado inválido.");

	const dataFechamento = new Date().toISOString();
	const vendidoEmDinheiro = await calcularValorEsperadoCaixa(
		caixa.data_abertura,
		dataFechamento,
	);
	const valorEsperado =
		Math.round((Number(caixa.valor_abertura) + vendidoEmDinheiro) * 100) / 100;
	const diferenca = Math.round((valor - valorEsperado) * 100) / 100;

	await runAsync(
		`UPDATE FechamentosCaixa
     SET data_fechamento = ?, valor_informado = ?, valor_esperado = ?, diferenca = ?,
         usuario_fechamento_id = ?, observacao = ?, status = 'fechado'
     WHERE id = ?`,
		[
			dataFechamento,
			valor,
			valorEsperado,
			diferenca,
			usuarioId || null,
			String(observacao || "").trim() || null,
			caixa.id,
		],
	);
	return {
		success: true,
		valorEsperado,
		valorInformado: valor,
		diferenca,
	};
}

async function getResumoCaixaAberto() {
	const caixa = await getCaixaAberto();
	if (!caixa) return null;
	const vendidoEmDinheiro = await calcularValorEsperadoCaixa(
		caixa.data_abertura,
		null,
	);
	const valorEsperadoAgora =
		Math.round((Number(caixa.valor_abertura) + vendidoEmDinheiro) * 100) / 100;
	return {
		id: caixa.id,
		data_abertura: caixa.data_abertura,
		valor_abertura: caixa.valor_abertura,
		vendido_em_dinheiro: vendidoEmDinheiro,
		valor_esperado_agora: valorEsperadoAgora,
	};
}

async function getHistoricoCaixa(limite) {
	const lim = Math.max(1, Math.min(200, Number(limite) || 50));
	return allAsync(
		"SELECT * FROM FechamentosCaixa WHERE status = 'fechado' ORDER BY id DESC LIMIT " +
			lim,
	);
}
module.exports = {
	calcularValorEsperadoCaixa,
	getCaixaAberto,
	abrirCaixa,
	fecharCaixa,
	getResumoCaixaAberto,
	getHistoricoCaixa,
};
