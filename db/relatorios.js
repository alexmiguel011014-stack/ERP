const { allAsync, getAsync } = require("./conexao");
const {
	getTaxaAdquirente,
	getTaxaAdquirentePorMetodo,
	getCustoFixoConfig,
} = require("./precificacao");
const { getFluxoCaixa, getFluxoCaixaProjetado } = require("./financeiro");

/* ============ Relatórios ============ */

function diasEntre(inicio, fim) {
	const a = new Date(inicio + "T00:00:00Z");
	const b = new Date(fim + "T00:00:00Z");
	return Math.round((b - a) / 86400000) + 1;
}

function somarDias(dataStr, dias) {
	const d = new Date(dataStr + "T00:00:00Z");
	d.setUTCDate(d.getUTCDate() + dias);
	return d.toISOString().slice(0, 10);
}

function mesFinalDoPeriodo(inicio, fim) {
	if (!inicio || !fim || inicio > fim) return null;
	const fimData = new Date(`${fim}T00:00:00Z`);
	if (Number.isNaN(fimData.getTime())) return null;
	return `${fimData.getUTCFullYear()}-${String(fimData.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Taxas/contas de cartão em aberto representam um custo futuro da venda.
// Elas entram apenas no lucro estimado do relatório de fluxo, não no DRE
// realizado. A mesma venda/parcela pode existir duplicada após uma baixa
// manual; nesse caso, conta-se uma única vez, como no fluxo projetado.
async function getDespesasCartaoAbertas(dataInicio, dataFim) {
	const linhas = await allAsync(
		`SELECT id, valor, venda_id, referencia_id, grupo_id, parcela_num,
            parcela_total
     FROM LancamentosFinanceiros
     WHERE tipo = 'pagar' AND status = 'aberto'
       AND (LOWER(COALESCE(forma_pagamento, '')) LIKE '%cart%'
            OR LOWER(COALESCE(categoria, '')) LIKE '%cart%')
       AND data_vencimento IS NOT NULL
       AND DATE(data_vencimento) BETWEEN ? AND ?`,
		[dataInicio, dataFim],
	);

	const chaves = new Set();
	return linhas.reduce((total, linha) => {
		const referencia = linha.venda_id || linha.referencia_id;
		const chave = referencia
			? `${referencia}:${linha.grupo_id || ""}:${linha.parcela_num || 1}:${linha.parcela_total || 1}`
			: `id:${linha.id}`;
		if (chaves.has(chave)) return total;
		chaves.add(chave);
		return total + (Number(linha.valor) || 0);
	}, 0);
}

// O saldo inicial usa a última posição conhecida antes do período. Fechamento
// anterior fornece o valor contado; uma sessão ainda em andamento recompõe a
// abertura com os movimentos anteriores ao filtro. O fechamento não é somado
// ao fluxo do próprio período, pois é uma conferência do mesmo dinheiro.
async function getSaldoInicialCaixa(dataInicio, dataFim) {
	if (!dataInicio || !dataFim) return 0;
	let sessao = await getAsync(
		`SELECT data_abertura, data_fechamento, status, valor_abertura,
            valor_informado, valor_esperado
		 FROM FechamentosCaixa
		 WHERE DATE(data_abertura) < DATE(?)
		 ORDER BY datetime(data_abertura) DESC, id DESC
		 LIMIT 1`,
		[dataInicio],
	);
	if (sessao) {
		const fechamentoAntes =
			sessao.data_fechamento &&
			String(sessao.data_fechamento).slice(0, 10) < dataInicio;
		if (fechamentoAntes) {
			const contado =
				sessao.valor_informado ??
				sessao.valor_esperado ??
				sessao.valor_abertura;
			return Math.round((Number(contado) || 0) * 100) / 100;
		}

		const abertura = Number(sessao.valor_abertura) || 0;
		const diaAbertura = String(sessao.data_abertura).slice(0, 10);
		const diaAnterior = somarDias(dataInicio, -1);
		if (diaAbertura <= diaAnterior) {
			const anterior = await getFluxoCaixa(diaAbertura, diaAnterior);
			return Math.round((abertura + anterior.saldo) * 100) / 100;
		}
		return Math.round(abertura * 100) / 100;
	}

	// Se o período começa antes do primeiro caixa, a primeira abertura dentro
	// dele é uma base válida; períodos inteiramente anteriores continuam em 0.
	sessao = await getAsync(
		`SELECT valor_abertura
		 FROM FechamentosCaixa
		 WHERE DATE(data_abertura) BETWEEN DATE(?) AND DATE(?)
		 ORDER BY datetime(data_abertura) ASC, id ASC
		 LIMIT 1`,
		[dataInicio, dataFim],
	);
	return sessao
		? Math.round((Number(sessao.valor_abertura) || 0) * 100) / 100
		: 0;
}

// Mesma convenção do comparativo "hoje vs. ontem" do dashboard
// (db/dashboard.js) — null quando não há base de comparação, não 0/Infinity.
function variacaoPercentual(atual, anterior) {
	if (!anterior) return null;
	return ((atual - anterior) / anterior) * 100;
}

// DRE simplificado (regime de caixa para despesas, já que é isso que o
// Fluxo de Caixa também usa): Receita líquida - CMV = Lucro Bruto;
// Lucro Bruto - Despesas pagas no período = Lucro Líquido.
// O CMV usa o custo congelado no item da venda. Linhas históricas sem custo
// comprovável ficam explicitamente desconhecidas e não recebem o custo atual
// da variação por aproximação silenciosa.
async function getDRE(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const resumoVendas = await getAsync(
		"SELECT COUNT(*) AS vendas, COALESCE(SUM(total + COALESCE(desconto, 0)), 0) AS receitaBruta, COALESCE(SUM(desconto), 0) AS descontos FROM Vendas WHERE status = 'finalizada' AND COALESCE(origem, '') NOT IN ('importacao_financeiro_historico', 'venda_historica_manual') AND DATE(data_venda) BETWEEN ? AND ?",
		[inicio, fim],
	);
	const receitaHistoricaSemCMVLinha = await getAsync(
		"SELECT COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS receita FROM Vendas WHERE status = 'finalizada' AND origem IN ('importacao_financeiro_historico', 'venda_historica_manual') AND DATE(data_venda) BETWEEN ? AND ?",
		[inicio, fim],
	);

	const despesasLinha = await getAsync(
		"SELECT COALESCE(SUM(valor), 0) AS despesas FROM LancamentosFinanceiros WHERE tipo = 'pagar' AND status = 'pago' AND COALESCE(origem, '') != 'importacao_financeiro_historico' AND LOWER(COALESCE(categoria, '')) != 'investimento' AND COALESCE(subtipo, '') != 'investimento' AND DATE(data_pagamento) BETWEEN ? AND ?",
		[inicio, fim],
	);
	// Pessoal é uma despesa operacional, mas precisa ficar mensurado separado
	// para o dono distinguir salário, pró-labore e encargos. A categoria antiga
	// Folha/Comissão sem subtipo continua sendo apresentada como salário.
	const pessoalPagoLinha = await getAsync(
		`SELECT
       COALESCE(SUM(CASE WHEN subtipo = 'salario'
          OR (subtipo IS NULL AND LOWER(COALESCE(categoria, '')) = 'folha/comissão') THEN valor ELSE 0 END), 0) AS salarios,
       COALESCE(SUM(CASE WHEN subtipo = 'pro_labore' THEN valor ELSE 0 END), 0) AS pro_labore,
       COALESCE(SUM(CASE WHEN subtipo = 'encargos' THEN valor ELSE 0 END), 0) AS encargos
     FROM LancamentosFinanceiros
     WHERE tipo = 'pagar' AND status = 'pago'
       AND COALESCE(origem, '') != 'importacao_financeiro_historico'
       AND LOWER(COALESCE(categoria, '')) != 'investimento'
       AND COALESCE(subtipo, '') != 'investimento'
       AND COALESCE(origem, '') != 'importacao_financeiro_historico'
       AND DATE(data_pagamento) BETWEEN ? AND ?`,
		[inicio, fim],
	);
	const pessoalAbertoLinha = await getAsync(
		`SELECT
       COALESCE(SUM(CASE WHEN subtipo = 'salario'
          OR (subtipo IS NULL AND LOWER(COALESCE(categoria, '')) = 'folha/comissão') THEN valor ELSE 0 END), 0) AS salarios,
       COALESCE(SUM(CASE WHEN subtipo = 'pro_labore' THEN valor ELSE 0 END), 0) AS pro_labore,
       COALESCE(SUM(CASE WHEN subtipo = 'encargos' THEN valor ELSE 0 END), 0) AS encargos
     FROM LancamentosFinanceiros
     WHERE tipo = 'pagar' AND status = 'aberto'
       AND LOWER(COALESCE(categoria, '')) != 'investimento'
       AND DATE(data_vencimento) BETWEEN ? AND ?`,
		[inicio, fim],
	);
	const investimentosPagosLinha = await getAsync(
		"SELECT COALESCE(SUM(valor), 0) AS valor FROM LancamentosFinanceiros WHERE tipo = 'pagar' AND status = 'pago' AND (LOWER(COALESCE(categoria, '')) = 'investimento' OR COALESCE(subtipo, '') = 'investimento') AND DATE(data_pagamento) BETWEEN ? AND ?",
		[inicio, fim],
	);
	const despesasFixasPagasLinhas = await allAsync(
		"SELECT valor, competencia_mes, DATE(data_pagamento) AS dia FROM LancamentosFinanceiros WHERE tipo = 'pagar' AND status = 'pago' AND (LOWER(COALESCE(categoria, '')) = 'custo fixo' OR COALESCE(subtipo, '') = 'custo_fixo') AND DATE(data_pagamento) BETWEEN ? AND ?",
		[inicio, fim],
	);
	const devolucoesLinha = await getAsync(
		"SELECT COALESCE(SUM(d.valor_total), 0) AS valor FROM Devolucoes d JOIN Vendas v ON v.id = d.venda_id WHERE v.status = 'finalizada' AND DATE(d.data) BETWEEN ? AND ?",
		[inicio, fim],
	);
	const linhasPeriodo = await obterLinhasVendaPeriodo(inicio, fim);
	const cmvItens = linhasPeriodo.reduce(
		(total, linha) => total + (Number(linha.cmvVenda) || 0),
		0,
	);
	const cmvDevolucoesItens = linhasPeriodo.reduce(
		(total, linha) => total + (Number(linha.cmvDevolucao) || 0),
		0,
	);
	const quantidadeCustoDesconhecidoItens = linhasPeriodo.reduce(
		(total, linha) =>
			total +
			(custoUnitarioConhecido(linha)
					? 0
					: (Number(linha.quantidadeVendidaNoPeriodo) || 0) +
						(Number(linha.quantidade_devolvida) || 0)),
		0,
	);
	const receitaSemCMVItens = linhasPeriodo.reduce(
		(total, linha) =>
			total +
			(custoUnitarioConhecido(linha)
					? 0
					: (Number(linha.receitaBrutaVenda) || 0) +
						(Number(linha.receitaDevolvidaSemCMV) || 0)),
		0,
	);

	// Receita de histórico importado (planilha migrada) nunca vira uma Venda
	// de verdade — é só o lançamento financeiro do dia. Sem isso, a Despesa
	// (que já vem de LancamentosFinanceiros) aparecia no DRE mas a Receita
	// correspondente não, fechando o mês como prejuízo mesmo com saldo
	// positivo real. origem='importacao_migracao' evita contar vendas do
	// dia a dia em dobro (essas já entram via Vendas acima).
	const receitaMigradaLinha = await getAsync(
		"SELECT COALESCE(SUM(valor), 0) AS receita FROM LancamentosFinanceiros WHERE tipo = 'receber' AND status = 'pago' AND origem = 'importacao_migracao' AND DATE(data_pagamento) BETWEEN ? AND ?",
		[inicio, fim],
	);

	const receitaBruta =
		(Number(resumoVendas.receitaBruta) || 0) +
		(Number(receitaMigradaLinha.receita) || 0);
	const descontos = Number(resumoVendas.descontos) || 0;
	const devolucoes = Number(devolucoesLinha.valor) || 0;
	const receitaLiquida = receitaBruta - descontos - devolucoes;
	const cmv = Math.round((cmvItens - cmvDevolucoesItens) * 100) / 100;
	const quantidadeCustoDesconhecido = quantidadeCustoDesconhecidoItens;
	const lucroBruto = receitaLiquida - cmv;
	const despesas = Number(despesasLinha.despesas) || 0;
	const salariosPagos = Number(pessoalPagoLinha.salarios) || 0;
	const proLaborePago = Number(pessoalPagoLinha.pro_labore) || 0;
	const encargosPagos = Number(pessoalPagoLinha.encargos) || 0;
	const salariosAbertos = Number(pessoalAbertoLinha.salarios) || 0;
	const proLaboreAberto = Number(pessoalAbertoLinha.pro_labore) || 0;
	const encargosAbertos = Number(pessoalAbertoLinha.encargos) || 0;
	const investimentosPagos = Number(investimentosPagosLinha.valor) || 0;
	const custoFixoConfig = await getCustoFixoConfig();
	// O custo fixo é uma provisão passiva mensal, não um acumulador histórico.
	// Mesmo no atalho "Período todo" (que usa 1900-01-01 como sentinela),
	// considera-se somente o mês final informado no relatório.
	const mesProvisionado = mesFinalDoPeriodo(inicio, fim);
	const mesesProvisionadosLista = mesProvisionado ? [mesProvisionado] : [];
	const pagamentosFixosPorMes = Object.fromEntries(
		mesesProvisionadosLista.map((mes) => [mes, 0]),
	);
	for (const linha of despesasFixasPagasLinhas) {
		const mes = linha.competencia_mes || String(linha.dia).slice(0, 7);
		if (Object.prototype.hasOwnProperty.call(pagamentosFixosPorMes, mes)) {
			pagamentosFixosPorMes[mes] += Number(linha.valor) || 0;
		}
	}
	const despesasFixasPagas = Object.values(pagamentosFixosPorMes).reduce(
		(total, valor) => total + valor,
		0,
	);
	const custoFixoProvisionado = Math.max(
		0,
		mesesProvisionadosLista.reduce(
			(total, mes) =>
				total + Math.max(0, custoFixoConfig.mensal - pagamentosFixosPorMes[mes]),
			0,
		),
	);
	const lucroLiquido = lucroBruto - despesas - custoFixoProvisionado;

	return {
		periodo: { inicio, fim },
		vendas: Number(resumoVendas.vendas) || 0,
		vendasHistoricasSemCMV:
			Number(receitaHistoricaSemCMVLinha.vendas) || 0,
		// Histórico sem ItemVenda não tem CMV verificável. Ele aparece em Vendas
		// e Fluxo de Caixa, mas fica fora da margem/DRE para não fabricar lucro.
		receitaHistoricaSemCMV:
			(Number(receitaHistoricaSemCMVLinha.receita) || 0) + receitaSemCMVItens,
		receitaSemCMV:
			(Number(receitaHistoricaSemCMVLinha.receita) || 0) + receitaSemCMVItens,
		quantidadeCustoDesconhecido,
		custoDesconhecido: quantidadeCustoDesconhecido > 0,
		receitaBruta,
		descontos,
		devolucoes,
		receitaLiquida,
		cmv,
		lucroBruto,
		margemBrutaPercentual:
			receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0,
		despesas,
		// Investimento permanece no Fluxo de Caixa, mas não reduz o lucro
		// operacional do DRE.
		investimentosPagos,
		despesasOperacionais: despesas,
		salariosPagos,
		proLaborePago,
		encargosPagos,
		salariosAbertos,
		proLaboreAberto,
		encargosAbertos,
		despesasFixasPagas,
		custoFixoMensal: custoFixoConfig.mensal,
		mesesProvisionados: mesesProvisionadosLista.length,
		provisaoDeclarada: mesesProvisionadosLista.length * custoFixoConfig.mensal,
		pagamentosFixosPorMes,
		custoFixoProvisionado,
		lucroLiquido,
		margemLiquidaPercentual:
			receitaLiquida > 0 ? (lucroLiquido / receitaLiquida) * 100 : 0,
	};
}

async function getRelatorioVendas(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const resumo = await getAsync(
		"SELECT COUNT(*) AS vendas, COALESCE(SUM(total + COALESCE(desconto, 0)), 0) AS faturamento, COALESCE(SUM(desconto), 0) AS descontos FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ?",
		[inicio, fim],
	);

	const porDia = await allAsync(
		"SELECT DATE(data_venda) AS dia, COUNT(*) AS vendas, SUM(total + COALESCE(desconto, 0)) AS faturamento, SUM(desconto) AS descontos FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ? GROUP BY DATE(data_venda) ORDER BY dia",
		[inicio, fim],
	);

	const porPagamento = await allAsync(
		"SELECT COALESCE(forma_pagamento, 'Genérico') AS forma_pagamento, COUNT(*) AS vendas, SUM(total + COALESCE(desconto, 0)) AS faturamento, SUM(desconto) AS descontos FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ? GROUP BY COALESCE(forma_pagamento, 'Genérico') ORDER BY faturamento DESC",
		[inicio, fim],
	);
	const devolucoesLinha = await getAsync(
		"SELECT COALESCE(SUM(valor_total), 0) AS valor FROM Devolucoes WHERE DATE(data) BETWEEN ? AND ?",
		[inicio, fim],
	);
	const historicoSemCMVLinha = await getAsync(
		"SELECT COALESCE(SUM(total), 0) AS valor FROM Vendas WHERE status = 'finalizada' AND origem IN ('importacao_financeiro_historico', 'venda_historica_manual') AND DATE(data_venda) BETWEEN ? AND ?",
		[inicio, fim],
	);
	const devolucoesPorDia = await allAsync(
		"SELECT DATE(data) AS dia, COALESCE(SUM(valor_total), 0) AS devolucoes FROM Devolucoes WHERE DATE(data) BETWEEN ? AND ? GROUP BY DATE(data)",
		[inicio, fim],
	);
	const devolucoesPorPagamento = await allAsync(
		"SELECT COALESCE(v.forma_pagamento, '---') AS forma_pagamento, COALESCE(SUM(d.valor_total), 0) AS devolucoes FROM Devolucoes d JOIN Vendas v ON v.id = d.venda_id WHERE DATE(d.data) BETWEEN ? AND ? GROUP BY v.forma_pagamento",
		[inicio, fim],
	);
	const devolucoesDia = new Map(
		devolucoesPorDia.map((linha) => [linha.dia, Number(linha.devolucoes) || 0]),
	);
	const devolucoesPagamento = new Map(
		devolucoesPorPagamento.map((linha) => [
			linha.forma_pagamento,
			Number(linha.devolucoes) || 0,
		]),
	);
	const porDiaComLiquido = porDia.map((linha) => {
		const devolucoes = devolucoesDia.get(linha.dia) || 0;
		const faturamento = Number(linha.faturamento) || 0;
		const descontos = Number(linha.descontos) || 0;
		return {
			...linha,
			devolucoes,
			faturamentoLiquido: faturamento - descontos - devolucoes,
		};
	});
	// A devolução tem data efetiva própria. Inclua dias que só têm retorno,
	// para que a soma diária reconcilie com o resumo do período.
	for (const linha of devolucoesPorDia) {
		if (!porDiaComLiquido.some((item) => item.dia === linha.dia)) {
			const devolucoes = Number(linha.devolucoes) || 0;
			porDiaComLiquido.push({
				dia: linha.dia,
				vendas: 0,
				faturamento: 0,
				descontos: 0,
				devolucoes,
				faturamentoLiquido: -devolucoes,
			});
		}
	}
	porDiaComLiquido.sort((a, b) => String(a.dia).localeCompare(String(b.dia)));
	const porPagamentoComLiquido = porPagamento.map((linha) => {
		const devolucoes = devolucoesPagamento.get(linha.forma_pagamento) || 0;
		const faturamento = Number(linha.faturamento) || 0;
		const descontos = Number(linha.descontos) || 0;
		return {
			...linha,
			devolucoes,
			faturamentoLiquido: faturamento - descontos - devolucoes,
		};
	});
	for (const linha of devolucoesPorPagamento) {
		if (!porPagamentoComLiquido.some((item) => item.forma_pagamento === linha.forma_pagamento)) {
			const devolucoes = Number(linha.devolucoes) || 0;
			porPagamentoComLiquido.push({
				forma_pagamento: linha.forma_pagamento,
				vendas: 0,
				faturamento: 0,
				descontos: 0,
				devolucoes,
				faturamentoLiquido: -devolucoes,
			});
		}
	}
	porPagamentoComLiquido.sort(
		(a, b) => (Number(b.faturamentoLiquido) || 0) - (Number(a.faturamentoLiquido) || 0),
	);
	const faturamento = Number(resumo.faturamento) || 0;
	const descontos = Number(resumo.descontos) || 0;
	const devolucoes = Number(devolucoesLinha.valor) || 0;

	// Período anterior de igual duração, pra comparação — generaliza o mesmo
	// cálculo "hoje vs. ontem" que o dashboard já faz (db/dashboard.js), mas
	// pro range arbitrário que o dono escolher aqui em vez de fixo em 1 dia.
	const fimAnterior = somarDias(inicio, -1);
	const inicioAnterior = somarDias(fimAnterior, -(diasEntre(inicio, fim) - 1));
	const resumoAnterior = await getAsync(
		"SELECT COUNT(*) AS vendas, COALESCE(SUM(total + COALESCE(desconto, 0)), 0) AS faturamento FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ?",
		[inicioAnterior, fimAnterior],
	);

	return {
		resumo: {
			vendas: resumo.vendas,
			// Faturamento remains gross for compatibility with the existing card.
			faturamento,
			descontos,
			devolucoes,
			faturamentoLiquido: faturamento - descontos - devolucoes,
			// Financial-only historical imports remain visible in the sales report,
			// but DRE keeps them in its explicit unknown-CMV field.
			faturamentoHistoricoSemCMV: Number(historicoSemCMVLinha.valor) || 0,
			ticketMedio: resumo.vendas > 0 ? faturamento / resumo.vendas : 0,
			vendasVariacao: variacaoPercentual(
				resumo.vendas,
				Number(resumoAnterior.vendas) || 0,
			),
			faturamentoVariacao: variacaoPercentual(
				faturamento,
				Number(resumoAnterior.faturamento) || 0,
			),
			periodoAnterior: { inicio: inicioAnterior, fim: fimAnterior },
		},
		porDia: porDiaComLiquido,
		porPagamento: porPagamentoComLiquido,
	};
}

// Item-level revenue ledger shared by product profitability reports. Discounts
// are allocated proportionally to each line's gross value and returns are
// limited to the selected effective return-date window.
async function obterLinhasVendaPeriodo(inicio, fim) {
	const linhas = await allAsync(
		`SELECT iv.id, iv.variacao_id, iv.venda_id, iv.quantidade, iv.preco_unitario,
            iv.custo_unitario, p.id AS produto_id, p.nome AS produto_nome,
            v.forma_pagamento, v.usuario_id, COALESCE(v.desconto, 0) AS desconto,
            COALESCE(pr.impostos_extras, 0) AS impostos_extras,
            COALESCE(u.comissao_percentual, 0) AS comissao_percentual,
            COALESCE(venda_bruta.total_bruto, 0) AS venda_bruta,
            CASE WHEN DATE(v.data_venda) BETWEEN ? AND ? THEN 1 ELSE 0 END AS venda_no_periodo,
            COALESCE(dev.quantidade, 0) AS quantidade_devolvida,
            COALESCE(dev.valor, 0) AS valor_devolvido
     FROM ItensVenda iv
     JOIN Vendas v ON v.id = iv.venda_id
     JOIN Variacoes var ON var.id = iv.variacao_id
     JOIN Produtos p ON p.id = var.produto_id
     LEFT JOIN Precificacao pr ON pr.produto_id = p.id
     LEFT JOIN Usuarios u ON u.id = v.usuario_id
     LEFT JOIN (
       SELECT venda_id, SUM(quantidade * preco_unitario) AS total_bruto
       FROM ItensVenda GROUP BY venda_id
     ) venda_bruta ON venda_bruta.venda_id = iv.venda_id
     LEFT JOIN (
       SELECT idv.item_venda_id, SUM(idv.quantidade) AS quantidade,
              SUM(idv.quantidade * idv.preco_unitario) AS valor
       FROM ItensDevolucao idv
       JOIN Devolucoes d ON d.id = idv.devolucao_id
       WHERE DATE(d.data) BETWEEN ? AND ?
       GROUP BY idv.item_venda_id
     ) dev ON dev.item_venda_id = iv.id
	     WHERE v.status = 'finalizada' AND (
       DATE(v.data_venda) BETWEEN ? AND ? OR EXISTS (
         SELECT 1 FROM ItensDevolucao idv2
         JOIN Devolucoes d2 ON d2.id = idv2.devolucao_id
         WHERE idv2.item_venda_id = iv.id AND DATE(d2.data) BETWEEN ? AND ?
       )
     )`,
		[inicio, fim, inicio, fim, inicio, fim, inicio, fim],
	);
	return linhas.map((linha) => {
		const quantidadeVendida = Number(linha.venda_no_periodo)
			? Number(linha.quantidade)
			: 0;
		const quantidade =
			quantidadeVendida - Number(linha.quantidade_devolvida || 0);
		const brutoVendaPeriodo =
			quantidadeVendida * (Number(linha.preco_unitario) || 0);
		const valorDevolvido = Number(linha.valor_devolvido) || 0;
		const bruto = brutoVendaPeriodo - valorDevolvido;
		const vendaBruta = Number(linha.venda_bruta) || 0;
		const desconto =
			Number(linha.venda_no_periodo) && vendaBruta > 0
				? (brutoVendaPeriodo / vendaBruta) * (Number(linha.desconto) || 0)
				: 0;
		const custo = custoUnitarioConhecido(linha)
			? Number(linha.custo_unitario)
			: null;
		return {
			...linha,
			quantidadeVendidaNoPeriodo: quantidadeVendida,
			quantidade,
			receitaBrutaVenda: brutoVendaPeriodo,
			cmvVenda:
				custo !== null ? quantidadeVendida * custo : 0,
			cmvDevolucao:
				custo !== null
					? Number(linha.quantidade_devolvida || 0) * custo
					: 0,
			receitaDevolvidaSemCMV: custo !== null ? 0 : valorDevolvido,
			receitaBruta: bruto,
			descontoAlocado: desconto,
			receitaLiquida: brutoVendaPeriodo - desconto - valorDevolvido,
		};
	});
}

// Curva ABC por lucro (receita menos custo): A até 80% acumulado de lucro, B até 95%, C o resto.
async function getCurvaABC(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const linhasBrutas = await obterLinhasVendaPeriodo(inicio, fim);
	const porProduto = new Map();
	for (const linha of linhasBrutas) {
		const atual = porProduto.get(linha.produto_id) || {
			produto_nome: linha.produto_nome,
			quantidade: 0,
			custo_total: 0,
			lucro_total: 0,
			quantidade_custo_desconhecido: 0,
			receita: 0,
		};
		const custoConhecido = custoUnitarioConhecido(linha);
		const custo = custoConhecido ? Number(linha.custo_unitario) : 0;
		atual.quantidade += linha.quantidade;
		atual.receita += linha.receitaLiquida;
		if (custoConhecido) {
			atual.custo_total += linha.quantidade * custo;
			atual.lucro_total += linha.receitaLiquida - linha.quantidade * custo;
		} else {
			atual.quantidade_custo_desconhecido += linha.quantidade;
		}
		porProduto.set(linha.produto_id, atual);
	}
	const linhas = [...porProduto.values()].sort((a, b) => b.receita - a.receita);

	const total = linhas.reduce((a, l) => a + (Number(l.lucro_total) || 0), 0);
	let acumulado = 0;

	return linhas.map((l) => {
		const receita = Number(l.receita) || 0;
		const custo = Number(l.custo_total) || 0;
		const lucro = Number(l.lucro_total) || 0;
		const quantidadeCustoDesconhecido =
			Number(l.quantidade_custo_desconhecido) || 0;
		const percentual = total > 0 ? (lucro / total) * 100 : 0;
		acumulado += percentual;
		return {
			produto_nome: l.produto_nome,
			quantidade: Number(l.quantidade) || 0,
			receita,
			custo,
			lucro,
			quantidadeCustoDesconhecido,
			custoDesconhecido: quantidadeCustoDesconhecido > 0,
			margem: receita > 0 ? (lucro / receita) * 100 : 0,
			percentual,
			acumulado,
			classe: acumulado <= 80 ? "A" : acumulado <= 95 ? "B" : "C",
		};
	});
}

// Comissão por vendedor: soma das vendas finalizadas atribuídas a cada
// usuário no período, multiplicada pelo percentual de comissão dele.
async function getComissoes(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const linhas = await allAsync(
		`SELECT u.id AS usuario_id, u.nome, u.login, u.perfil, u.comissao_percentual,
            COUNT(v.id) AS vendas, COALESCE(SUM(v.total), 0) AS total_vendido
     FROM Vendas v
     JOIN Usuarios u ON u.id = v.usuario_id
     WHERE v.status = 'finalizada' AND DATE(v.data_venda) BETWEEN ? AND ?
     GROUP BY u.id
     ORDER BY total_vendido DESC`,
		[inicio, fim],
	);

	return linhas.map((l) => {
		const totalVendido = Number(l.total_vendido) || 0;
		const percentual = Number(l.comissao_percentual) || 0;
		return {
			usuario_id: l.usuario_id,
			nome: l.nome,
			login: l.login,
			perfil: l.perfil,
			vendas: Number(l.vendas) || 0,
			total_vendido: totalVendido,
			comissao_percentual: percentual,
			comissao_valor: (totalVendido * percentual) / 100,
		};
	});
}
// Margem de contribuição: distinta da margem bruta do DRE (que só desconta o
// CMV) e da margem por produto da Precificação (que só desconta custo+impostos).
// Aqui desconta TODOS os custos variáveis por unidade: CMV + comissão do
// vendedor + taxa média de adquirente + impostos sobre a venda — é o número
// que realmente sobra pra pagar custo fixo e gerar lucro (ver REPERTOIRE.md).
async function getMargemContribuicao(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	// taxaPix/taxaCartao ficam null quando o dono nunca configurou a taxa por
	// forma de pagamento. Pix sem taxa específica é considerado 0%; Cartão sem
	// taxa específica cai na média antiga. Achado real ao implementar
	// (2026-09-02): PDV só aceita
	// "PIX"/"Cartão"/"Dinheiro"/"Fiado" — não existe distinção crédito/débito
	// neste app, diferente do que o plano original supôs.
	const [taxaAdquirente, taxaPix, taxaCartao] = await Promise.all([
		getTaxaAdquirente(),
		getTaxaAdquirentePorMetodo("pix"),
		getTaxaAdquirentePorMetodo("cartao"),
	]);
	function taxaParaForma(forma) {
		const chave = String(forma || "").toLowerCase();
		if (chave === "pix") return taxaPix !== null ? taxaPix : 0;
		if (chave === "cartão" || chave === "cartao") {
			return taxaCartao !== null ? taxaCartao : taxaAdquirente;
		}
		return 0;
	}

	// Agrupado por (produto, forma de pagamento) — não só por produto — porque
	// a taxa agora pode variar por forma de pagamento dentro do mesmo produto
	// no mesmo período. Reagregado por produto logo abaixo pra manter a mesma
	// forma de retorno (porProduto) de antes desta mudança.
	const linhasBrutas = await obterLinhasVendaPeriodo(inicio, fim);
	// Uma venda mista guarda a forma agregada "Misto" em Vendas, mas as
	// alocações reais ficam em VendaPagamentos. Use a taxa média ponderada dessas
	// alocações para não perder a taxa do cartão no cálculo da contribuição.
	const pagamentosPorVenda = new Map();
	const vendaIds = [
		...new Set(linhasBrutas.map((linha) => Number(linha.venda_id)).filter(Boolean)),
	];
	if (vendaIds.length > 0) {
		const placeholders = vendaIds.map(() => "?").join(",");
		const pagamentos = await allAsync(
			`SELECT venda_id, forma_pagamento, COALESCE(SUM(valor), 0) AS valor
       FROM VendaPagamentos
       WHERE venda_id IN (${placeholders})
       GROUP BY venda_id, forma_pagamento`,
			vendaIds,
		);
		for (const pagamento of pagamentos) {
			const id = Number(pagamento.venda_id);
			const lista = pagamentosPorVenda.get(id) || [];
			lista.push(pagamento);
			pagamentosPorVenda.set(id, lista);
		}
	}
	function taxaMediaDaVenda(linha) {
		const pagamentos = pagamentosPorVenda.get(Number(linha.venda_id));
		if (!pagamentos?.length) return taxaParaForma(linha.forma_pagamento);
		const total = pagamentos.reduce(
			(soma, pagamento) => soma + (Number(pagamento.valor) || 0),
			0,
		);
		if (total <= 0) return taxaParaForma(linha.forma_pagamento);
		const taxaPonderada = pagamentos.reduce(
			(soma, pagamento) =>
				soma +
					(Number(pagamento.valor) || 0) *
						taxaParaForma(pagamento.forma_pagamento),
			0,
		);
		return taxaPonderada / total;
	}
	const linhas = linhasBrutas.map((linha) => ({
		...linha,
		receita: linha.receitaLiquida,
		cmv: custoUnitarioConhecido(linha)
			? linha.quantidade * Number(linha.custo_unitario)
			: 0,
		quantidade_custo_desconhecido: custoUnitarioConhecido(linha)
			? 0
			: linha.quantidade,
		impostos_extras: Number(linha.impostos_extras) || 0,
		comissao_percentual: Number(linha.comissao_percentual) || 0,
	}));

	let margemTotal = 0;
	let receitaTotal = 0;
	let quantidadeTotal = 0;
	let quantidadeCustoDesconhecidoTotal = 0;
	const porProdutoMap = new Map();

	for (const l of linhas) {
		const receita = Number(l.receita) || 0;
		const cmv = Number(l.cmv) || 0;
		const quantidade = Number(l.quantidade) || 0;
		const quantidadeCustoDesconhecido =
			Number(l.quantidade_custo_desconhecido) || 0;
		const comissaoValor =
			(receita * (Number(l.comissao_percentual) || 0)) / 100;
		const taxaValor = (receita * taxaMediaDaVenda(l)) / 100;
		const impostos = (Number(l.impostos_extras) || 0) * quantidade;
		const margemContribuicao =
			receita - cmv - comissaoValor - taxaValor - impostos;

		margemTotal += margemContribuicao;
		receitaTotal += receita;
		quantidadeTotal += quantidade;
		quantidadeCustoDesconhecidoTotal += quantidadeCustoDesconhecido;

		const acumulado = porProdutoMap.get(l.produto_id) || {
			produto_id: l.produto_id,
			produto_nome: l.produto_nome,
			quantidade: 0,
			receita: 0,
			margemContribuicao: 0,
			quantidadeCustoDesconhecido: 0,
		};
		acumulado.quantidade += quantidade;
		acumulado.receita += receita;
		acumulado.margemContribuicao += margemContribuicao;
		acumulado.quantidadeCustoDesconhecido += quantidadeCustoDesconhecido;
		porProdutoMap.set(l.produto_id, acumulado);
	}

	const porProduto = Array.from(porProdutoMap.values()).map((p) => ({
		...p,
		margemContribuicaoUnitaria:
			p.quantidade > 0 ? p.margemContribuicao / p.quantidade : 0,
		margemContribuicaoPercentual:
			p.receita > 0 ? (p.margemContribuicao / p.receita) * 100 : 0,
		custoDesconhecido: p.quantidadeCustoDesconhecido > 0,
	}));

	return {
		periodo: { inicio, fim },
		taxaAdquirenteUsada: taxaAdquirente,
		porProduto,
		margemContribuicaoTotal: margemTotal,
		margemContribuicaoUnitariaMedia:
			quantidadeTotal > 0 ? margemTotal / quantidadeTotal : 0,
		margemContribuicaoPercentualMedia:
			receitaTotal > 0 ? (margemTotal / receitaTotal) * 100 : 0,
		quantidadeCustoDesconhecido: quantidadeCustoDesconhecidoTotal,
		custoDesconhecido: quantidadeCustoDesconhecidoTotal > 0,
	};
}

// Ponto de equilíbrio: em quantidade = custo fixo mensal ÷ margem de
// contribuição unitária média (unidades de produto); em faturamento = custo
// fixo mensal ÷ margem de contribuição percentual média (não quantidade ×
// ticket médio — ticket médio é R$/venda, quantidadeNecessaria é unidades de
// produto, misturar as duas unidades dava um faturamentoNecessario errado).
// Não é um simulador de "e se eu subir o preço" — só o equilíbrio atual.
async function getPontoDeEquilibrio(dataInicio, dataFim) {
	const custoFixo = await getCustoFixoConfig();
	const margem = await getMargemContribuicao(dataInicio, dataFim);

	const quantidadeNecessaria =
		margem.margemContribuicaoUnitariaMedia > 0
			? custoFixo.mensal / margem.margemContribuicaoUnitariaMedia
			: null;
	const faturamentoNecessario =
		margem.margemContribuicaoPercentualMedia > 0
			? custoFixo.mensal / (margem.margemContribuicaoPercentualMedia / 100)
			: null;

	return {
		periodo: margem.periodo,
		custoFixoMensal: custoFixo.mensal,
		margemContribuicaoUnitariaMedia: margem.margemContribuicaoUnitariaMedia,
		margemContribuicaoPercentualMedia: margem.margemContribuicaoPercentualMedia,
		quantidadeNecessaria,
		faturamentoNecessario,
	};
}

// Giro de estoque: aproximação por estoque ATUAL (não médio do período) —
// mesma simplificação que getDRE já documenta usar pro CMV (custo atual, não
// histórico). O estoque é somado entre todas as variações do produto e as
// devoluções reduzem a quantidade vendida na data efetiva do retorno. Uma média
// de período real exigiria snapshots de estoque que não existem hoje.
async function getGiroEstoque(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const linhas = await allAsync(
		`WITH vendidos AS (
       SELECT var.produto_id, SUM(iv.quantidade) AS quantidade
       FROM ItensVenda iv
       JOIN Vendas v ON v.id = iv.venda_id
       JOIN Variacoes var ON var.id = iv.variacao_id
       WHERE v.status = 'finalizada' AND DATE(v.data_venda) BETWEEN ? AND ?
       GROUP BY var.produto_id
     ), devolvidos AS (
       SELECT var.produto_id, SUM(idv.quantidade) AS quantidade
       FROM ItensDevolucao idv
       JOIN Devolucoes d ON d.id = idv.devolucao_id
       JOIN Vendas v ON v.id = d.venda_id
       JOIN Variacoes var ON var.id = idv.variacao_id
       WHERE v.status = 'finalizada' AND DATE(d.data) BETWEEN ? AND ?
       GROUP BY var.produto_id
     ), estoque AS (
       SELECT produto_id, SUM(quantidade_estoque) AS quantidade
       FROM Variacoes
       GROUP BY produto_id
     )
     SELECT p.id AS produto_id, p.nome AS produto_nome,
       COALESCE(vendido.quantidade, 0) - COALESCE(devolvido.quantidade, 0) AS quantidade_vendida,
       COALESCE(estoque.quantidade, 0) AS estoque_atual
     FROM Produtos p
     LEFT JOIN vendidos vendido ON vendido.produto_id = p.id
     LEFT JOIN devolvidos devolvido ON devolvido.produto_id = p.id
     LEFT JOIN estoque ON estoque.produto_id = p.id
     WHERE vendido.produto_id IS NOT NULL OR devolvido.produto_id IS NOT NULL
     ORDER BY p.nome COLLATE NOCASE`,
		[inicio, fim, inicio, fim],
	);

	return linhas.map((l) => {
		const vendida = Number(l.quantidade_vendida) || 0;
		const estoque = Number(l.estoque_atual) || 0;
		const giro = estoque > 0 ? vendida / estoque : null;
		return {
			produto_id: l.produto_id,
			produto_nome: l.produto_nome,
			quantidadeVendida: vendida,
			estoqueAtual: estoque,
			giro,
			diasParaReposicao: giro && giro > 0 ? 365 / giro : null,
		};
	});
}

// Segmentação simples de clientes (recência/frequência/valor) — tiers
// práticos pra loja pequena, não um score RFM estatístico de verdade (mesmo
// nível de profundidade já usado pra Curva ABC/DRE neste projeto).
async function getSegmentacaoClientes() {
	const agora = Date.now();
	const linhas = await allAsync(
		`SELECT c.id AS cliente_id, c.nome, c.telefone,
     COUNT(v.id) AS frequencia,
     COALESCE(SUM(v.total), 0) AS valor_total,
     MAX(v.data_venda) AS ultima_compra
     FROM Clientes c
     LEFT JOIN Vendas v ON v.cliente_id = c.id AND v.status = 'finalizada'
     GROUP BY c.id
     ORDER BY valor_total DESC`,
	);

	return linhas.map((l) => {
		const frequencia = Number(l.frequencia) || 0;
		const valorTotal = Number(l.valor_total) || 0;
		const diasDesdeUltimaCompra = l.ultima_compra
			? Math.floor((agora - new Date(l.ultima_compra).getTime()) / 86400000)
			: null;

		let segmento;
		if (diasDesdeUltimaCompra === null) segmento = "Nunca comprou";
		else if (diasDesdeUltimaCompra <= 60 && frequencia >= 3)
			segmento = "Frequente";
		else if (diasDesdeUltimaCompra <= 60) segmento = "Ativo";
		else if (diasDesdeUltimaCompra <= 180) segmento = "Em risco";
		else segmento = "Inativo";

		return {
			cliente_id: l.cliente_id,
			nome: l.nome,
			telefone: l.telefone,
			frequencia,
			valorTotal,
			ultimaCompra: l.ultima_compra,
			diasDesdeUltimaCompra,
			segmento,
		};
	});
}

// Produtos com estoque real e ZERO venda no período — pergunta diferente da
// Curva ABC (que ranqueia por lucro/receita, não aponta o que não vendeu
// nada). Agrupa por VARIAÇÃO (não por produto, ao contrário de
// getGiroEstoque acima) porque cor/tamanho de um mesmo produto podem vender
// de forma bem diferente.
async function getProdutosParados(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const linhas = await allAsync(
		`SELECT p.id AS produto_id, p.nome AS produto_nome, v.sku, v.quantidade_estoque,
   COALESCE(SUM(CASE WHEN vd.status = 'finalizada' AND DATE(vd.data_venda) BETWEEN ? AND ? THEN iv.quantidade ELSE 0 END), 0) AS vendido_no_periodo
   FROM Variacoes v
   JOIN Produtos p ON p.id = v.produto_id
   LEFT JOIN ItensVenda iv ON iv.variacao_id = v.id
   LEFT JOIN Vendas vd ON vd.id = iv.venda_id
   WHERE p.ativo = 1
   GROUP BY v.id
   HAVING v.quantidade_estoque > 0 AND vendido_no_periodo = 0
   ORDER BY v.quantidade_estoque DESC`,
		[inicio, fim],
	);

	return linhas.map((l) => ({
		produto_id: l.produto_id,
		produto_nome: l.produto_nome,
		sku: l.sku,
		quantidadeEstoque: Number(l.quantidade_estoque) || 0,
	}));
}

const NOMES_DIA_SEMANA = [
	"Domingo",
	"Segunda",
	"Terça",
	"Quarta",
	"Quinta",
	"Sexta",
	"Sábado",
];

function custoUnitarioConhecido(linha) {
	return (
		linha?.custo_unitario !== null &&
		linha?.custo_unitario !== undefined &&
		linha?.custo_unitario !== "" &&
		Number.isFinite(Number(linha.custo_unitario))
	);
}

// Sazonalidade por dia da semana e por hora — todo o histórico de vendas
// finalizadas, sem filtro de período (é um padrão de longo prazo, não algo
// que faça sentido restringir a um mês).
async function getSazonalidade() {
	const porDiaSemanaLinhas = await allAsync(
		"SELECT CAST(strftime('%w', data_venda) AS INTEGER) AS dia_semana, COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS faturamento FROM Vendas WHERE status = 'finalizada' GROUP BY dia_semana ORDER BY dia_semana",
	);
	const porHoraLinhas = await allAsync(
		"SELECT CAST(strftime('%H', data_venda) AS INTEGER) AS hora, COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS faturamento FROM Vendas WHERE status = 'finalizada' GROUP BY hora ORDER BY hora",
	);

	return {
		porDiaSemana: porDiaSemanaLinhas.map((l) => ({
			diaSemana: Number(l.dia_semana),
			nome: NOMES_DIA_SEMANA[Number(l.dia_semana)] || "?",
			vendas: Number(l.vendas) || 0,
			faturamento: Number(l.faturamento) || 0,
		})),
		porHora: porHoraLinhas.map((l) => ({
			hora: Number(l.hora),
			vendas: Number(l.vendas) || 0,
			faturamento: Number(l.faturamento) || 0,
		})),
	};
}

// Taxa de conversão orçamento -> venda. Limitação real do schema, documentada
// em vez de escondida: Vendas.origem='orcamento' é gravado na criação e
// SOBREVIVE à conversão (converterOrcamento nunca toca em origem), mas
// data_venda É sobrescrito na conversão (vira a data da conversão, não mais a
// da criação do orçamento) — então "convertidas" abaixo é ancorado na DATA DE
// CONVERSÃO, enquanto "canceladas"/"abertas" são ancoradas na DATA DE CRIAÇÃO
// do orçamento (nunca reescrita nesses dois casos). É a melhor pergunta
// respondível com o dado que existe hoje, não uma taxa de conversão "por
// coorte de criação" perfeita.
async function getConversaoOrcamentos(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const [convertidas, canceladas, abertas] = await Promise.all([
		getAsync(
			"SELECT COUNT(*) AS n FROM Vendas WHERE origem = 'orcamento' AND status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ?",
			[inicio, fim],
		),
		getAsync(
			"SELECT COUNT(*) AS n FROM Vendas WHERE origem = 'orcamento' AND status = 'cancelado' AND DATE(data_venda) BETWEEN ? AND ?",
			[inicio, fim],
		),
		getAsync(
			"SELECT COUNT(*) AS n FROM Vendas WHERE origem = 'orcamento' AND status = 'orcamento' AND DATE(data_venda) BETWEEN ? AND ?",
			[inicio, fim],
		),
	]);

	const nConvertidas = Number(convertidas.n) || 0;
	const nCanceladas = Number(canceladas.n) || 0;
	const nAbertas = Number(abertas.n) || 0;
	const denominador = nConvertidas + nCanceladas;

	return {
		periodo: { inicio, fim },
		convertidas: nConvertidas,
		canceladas: nCanceladas,
		abertas: nAbertas,
		taxaConversaoPercentual:
			denominador > 0 ? (nConvertidas / denominador) * 100 : null,
	};
}

// Relatório usa os mesmos construtores do módulo Financeiro. A camada de
// relatório só compõe realizado e projetado; não repete SQL nem soma Pagamentos
// ou FechamentosCaixa por fora, preservando a política de não dupla contagem.
async function getRelatorioFluxoCaixa(dataInicio, dataFim) {
	const [realizado, projetado] = await Promise.all([
		getFluxoCaixa(dataInicio, dataFim),
		getFluxoCaixaProjetado(dataInicio, dataFim),
	]);
	const dre = await getDRE(dataInicio, dataFim);
	const despesasCartaoAbertas = await getDespesasCartaoAbertas(
		dre.periodo.inicio,
		dre.periodo.fim,
	);
	const saldoInicial = await getSaldoInicialCaixa(
		dre.periodo.inicio,
		dre.periodo.fim,
	);
	const saldoFinalRealizado =
		Math.round((saldoInicial + realizado.saldo) * 100) / 100;
	const saldoFinalEstimado =
		Math.round((saldoFinalRealizado + projetado.saldo) * 100) / 100;

	return {
		realizado,
		projetado,
		dre,
		saldoInicial,
		saldoFinalRealizado,
		saldoFinalEstimado,
		despesasCartaoAbertas,
		lucroLiquidoEstimado: dre.lucroLiquido - despesasCartaoAbertas,
		politica: [
			"Dinheiro e PIX entram na data da venda; Cartão somente na data de liquidação registrada.",
			"Fiado entra somente quando o lançamento a receber é baixado.",
			"Pagamentos de cartão pendentes entram no projetado pela data prevista; os liquidados entram no realizado uma única vez.",
			"Devoluções são saídas na data do estorno; vendas canceladas ficam fora.",
			"Custo fixo é uma provisão passiva por período; lançamentos pagos com categoria Custo Fixo reduzem essa provisão para evitar dupla contagem.",
			"Cartão em aberto por vencimento no período reduz o lucro líquido estimado uma única vez; não altera o lucro realizado.",
		],
	};
}

module.exports = {
	getDRE,
	getRelatorioVendas,
	getCurvaABC,
	getComissoes,
	getMargemContribuicao,
	getPontoDeEquilibrio,
	getGiroEstoque,
	getSegmentacaoClientes,
	getProdutosParados,
	getSazonalidade,
	getConversaoOrcamentos,
	getRelatorioFluxoCaixa,
};
