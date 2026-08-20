const { runAsync, allAsync, getAsync } = require("./conexao");

/* ============ Financeiro (contas a pagar/receber + fluxo de caixa) ============ */

async function criarLancamentoInterno(run, dados) {
	await run(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, referencia_id, forma_pagamento, data_criacao) VALUES (?, ?, ?, ?, NULL, 'aberto', ?, ?, ?, ?)",
		[
			dados.tipo,
			dados.descricao,
			dados.valor,
			dados.data_vencimento || null,
			dados.origem || "manual",
			dados.referencia_id || null,
			dados.forma_pagamento || null,
			new Date().toISOString(),
		],
	);
}

async function getLancamentos(filtro) {
	filtro = filtro || {};
	let sql = "SELECT * FROM LancamentosFinanceiros";
	const where = [];
	const params = [];
	if (filtro.tipo) {
		where.push("tipo = ?");
		params.push(filtro.tipo);
	}
	if (filtro.status) {
		where.push("status = ?");
		params.push(filtro.status);
	}
	if (where.length > 0) sql += " WHERE " + where.join(" AND ");
	sql +=
		" ORDER BY (CASE WHEN status = 'aberto' THEN 0 ELSE 1 END), DATE(data_vencimento) ASC, id DESC LIMIT 200";
	return allAsync(sql, params);
}

async function criarLancamento(dados) {
	const tipo = dados && dados.tipo;
	const descricao = String((dados && dados.descricao) || "").trim();
	const valor = Number(dados && dados.valor);
	if (tipo !== "pagar" && tipo !== "receber")
		throw new Error("Tipo de lançamento inválido.");
	if (!descricao) throw new Error("Informe a descrição do lançamento.");
	if (!Number.isFinite(valor) || valor <= 0) throw new Error("Valor inválido.");

	const parcelas = Math.max(1, parseInt(dados.parcelas, 10) || 1);
	if (parcelas > 1) {
		return criarLancamentoParcelado(dados, tipo, descricao, valor, parcelas);
	}

	const vencimento = dados.data_vencimento
		? new Date(dados.data_vencimento).toISOString()
		: new Date().toISOString();

	const result = await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, referencia_id, forma_pagamento, data_criacao) VALUES (?, ?, ?, ?, NULL, 'aberto', 'manual', NULL, NULL, ?)",
		[
			tipo,
			descricao,
			Math.round(valor * 100) / 100,
			vencimento,
			new Date().toISOString(),
		],
	);
	return { success: true, lancamentoId: result.lastID };
}

// Divide um lançamento em N parcelas mensais iguais (a última absorve o
// arredondamento), ligadas por um grupo_id para exibição/baixa individual.
async function criarLancamentoParcelado(
	dados,
	tipo,
	descricao,
	valor,
	parcelas,
) {
	const grupoId =
		Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
	const dataBase = dados.data_vencimento
		? new Date(dados.data_vencimento)
		: new Date();
	const valorParcela = Math.round((valor / parcelas) * 100) / 100;
	const agora = new Date().toISOString();
	const ids = [];

	let somaParcelas = 0;
	for (let i = 0; i < parcelas; i++) {
		const vencParcela = new Date(dataBase);
		vencParcela.setMonth(vencParcela.getMonth() + i);
		const ultima = i === parcelas - 1;
		const valorEsta = ultima
			? Math.round((valor - somaParcelas) * 100) / 100
			: valorParcela;
		somaParcelas += valorEsta;

		const result = await runAsync(
			"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, referencia_id, forma_pagamento, data_criacao, grupo_id, parcela_num, parcela_total) VALUES (?, ?, ?, ?, NULL, 'aberto', 'manual', NULL, NULL, ?, ?, ?, ?)",
			[
				tipo,
				descricao + " (" + (i + 1) + "/" + parcelas + ")",
				valorEsta,
				vencParcela.toISOString(),
				agora,
				grupoId,
				i + 1,
				parcelas,
			],
		);
		ids.push(result.lastID);
	}
	return { success: true, lancamentoId: ids[0], grupoId, parcelaIds: ids };
}

async function baixarLancamento(id) {
	const result = await runAsync(
		"UPDATE LancamentosFinanceiros SET status = 'pago', data_pagamento = ? WHERE id = ? AND status = 'aberto'",
		[new Date().toISOString(), id],
	);
	if (result.changes === 0)
		throw new Error("Lançamento não encontrado ou já baixado.");
	return { success: true };
}

async function excluirLancamento(id) {
	const result = await runAsync(
		"DELETE FROM LancamentosFinanceiros WHERE id = ? AND status = 'aberto' AND origem = 'manual'",
		[id],
	);
	if (result.changes === 0)
		throw new Error("Só é possível excluir lançamentos manuais em aberto.");
	return { success: true };
}

// Fluxo de caixa realizado: entradas = vendas à vista + recebimentos; saídas = pagamentos.
async function getFluxoCaixa(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const entradasVendas = await allAsync(
		"SELECT DATE(data_venda) AS dia, SUM(total) AS valor FROM Vendas WHERE status = 'finalizada' AND (forma_pagamento IS NULL OR forma_pagamento != 'Fiado') AND DATE(data_venda) BETWEEN ? AND ? GROUP BY DATE(data_venda)",
		[inicio, fim],
	);
	const entradasRecebimentos = await allAsync(
		"SELECT DATE(data_pagamento) AS dia, SUM(valor) AS valor FROM LancamentosFinanceiros WHERE tipo = 'receber' AND status = 'pago' AND DATE(data_pagamento) BETWEEN ? AND ? GROUP BY DATE(data_pagamento)",
		[inicio, fim],
	);
	const saidasPagamentos = await allAsync(
		"SELECT DATE(data_pagamento) AS dia, SUM(valor) AS valor FROM LancamentosFinanceiros WHERE tipo = 'pagar' AND status = 'pago' AND DATE(data_pagamento) BETWEEN ? AND ? GROUP BY DATE(data_pagamento)",
		[inicio, fim],
	);

	const mapa = {};
	const adicionar = (dia, campo, valor) => {
		if (!dia) return;
		if (!mapa[dia]) mapa[dia] = { dia, entradas: 0, saidas: 0 };
		mapa[dia][campo] += Number(valor) || 0;
	};
	entradasVendas.forEach((r) => adicionar(r.dia, "entradas", r.valor));
	entradasRecebimentos.forEach((r) => adicionar(r.dia, "entradas", r.valor));
	saidasPagamentos.forEach((r) => adicionar(r.dia, "saidas", r.valor));

	const dias = Object.values(mapa).sort((a, b) => (a.dia < b.dia ? -1 : 1));
	let saldo = 0;
	dias.forEach((d) => {
		d.saldo = d.entradas - d.saidas;
		saldo += d.saldo;
		d.saldoAcumulado = saldo;
	});

	return {
		dias,
		totalEntradas: dias.reduce((a, d) => a + d.entradas, 0),
		totalSaidas: dias.reduce((a, d) => a + d.saidas, 0),
		saldo,
	};
}
// Alíquota de provisão de DAS, % owner-informado — a faixa/anexo/Fator R real
// do Simples Nacional é decisão do contador do dono, não algo que este app
// deveria adivinhar. Mesmo padrão manual de custo_fixo_mensal/taxa_adquirente_media.
async function getAliquotaDAS() {
	const row = await getAsync(
		"SELECT valor FROM Configuracao WHERE chave = 'aliquota_das_provisao'",
	);
	return row ? parseFloat(row.valor) || 0 : 0;
}

async function saveAliquotaDAS(valor) {
	const v = Number(valor);
	if (!Number.isFinite(v) || v < 0) throw new Error("Alíquota inválida.");
	await runAsync(
		"INSERT OR REPLACE INTO Configuracao (chave, valor) VALUES ('aliquota_das_provisao', ?)",
		[String(v)],
	);
	return { success: true };
}

// Provisão de DAS no regime de caixa: aplica a alíquota sobre o que
// getFluxoCaixa() já mostra como RECEBIDO no período (não faturado) — é essa
// distinção que evita o erro real documentado (provisionar contra Vendas.total
// faturado, pagando DAS antes do dinheiro efetivamente ter caído na conta).
async function getProvisaoDAS(dataInicio, dataFim) {
	const aliquota = await getAliquotaDAS();
	const fluxo = await getFluxoCaixa(dataInicio, dataFim);
	const valorProvisionado = (fluxo.totalEntradas * aliquota) / 100;
	return {
		periodo: {
			inicio: dataInicio || fluxo.dias[0]?.dia || null,
			fim: dataFim || null,
		},
		totalRecebido: fluxo.totalEntradas,
		aliquota,
		valorProvisionado,
	};
}

module.exports = {
	criarLancamentoInterno,
	getLancamentos,
	criarLancamento,
	criarLancamentoParcelado,
	baixarLancamento,
	excluirLancamento,
	getFluxoCaixa,
	getAliquotaDAS,
	saveAliquotaDAS,
	getProvisaoDAS,
};
