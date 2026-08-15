const { allAsync, getAsync } = require("./conexao");

/* ============ Relatórios ============ */

// DRE simplificado (regime de caixa para despesas, já que é isso que o
// Fluxo de Caixa também usa): Receita líquida - CMV = Lucro Bruto;
// Lucro Bruto - Despesas pagas no período = Lucro Líquido.
// O CMV usa o preco_custo ATUAL da variação (não o custo histórico da época
// da venda) — mesma simplificação que a Curva ABC já assume para receita.
async function getDRE(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const resumoVendas = await getAsync(
		"SELECT COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS receitaBruta, COALESCE(SUM(desconto), 0) AS descontos FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ?",
		[inicio, fim],
	);

	const cmvLinha = await getAsync(
		`SELECT COALESCE(SUM(iv.quantidade * var.preco_custo), 0) AS cmv
     FROM ItensVenda iv
     JOIN Vendas v ON v.id = iv.venda_id
     JOIN Variacoes var ON var.id = iv.variacao_id
     WHERE v.status = 'finalizada' AND DATE(v.data_venda) BETWEEN ? AND ?`,
		[inicio, fim],
	);

	const despesasLinha = await getAsync(
		"SELECT COALESCE(SUM(valor), 0) AS despesas FROM LancamentosFinanceiros WHERE tipo = 'pagar' AND status = 'pago' AND DATE(data_pagamento) BETWEEN ? AND ?",
		[inicio, fim],
	);

	const receitaBruta = Number(resumoVendas.receitaBruta) || 0;
	const descontos = Number(resumoVendas.descontos) || 0;
	const receitaLiquida = receitaBruta - descontos;
	const cmv = Number(cmvLinha.cmv) || 0;
	const lucroBruto = receitaLiquida - cmv;
	const despesas = Number(despesasLinha.despesas) || 0;
	const lucroLiquido = lucroBruto - despesas;

	return {
		periodo: { inicio, fim },
		vendas: Number(resumoVendas.vendas) || 0,
		receitaBruta,
		descontos,
		receitaLiquida,
		cmv,
		lucroBruto,
		margemBrutaPercentual:
			receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0,
		despesas,
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
		"SELECT COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS faturamento, COALESCE(SUM(desconto), 0) AS descontos FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ?",
		[inicio, fim],
	);

	const porDia = await allAsync(
		"SELECT DATE(data_venda) AS dia, COUNT(*) AS vendas, SUM(total) AS faturamento, SUM(desconto) AS descontos FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ? GROUP BY DATE(data_venda) ORDER BY dia",
		[inicio, fim],
	);

	const porPagamento = await allAsync(
		"SELECT COALESCE(forma_pagamento, '---') AS forma_pagamento, COUNT(*) AS vendas, SUM(total) AS faturamento FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ? GROUP BY forma_pagamento ORDER BY faturamento DESC",
		[inicio, fim],
	);

	return {
		resumo: {
			vendas: resumo.vendas,
			faturamento: resumo.faturamento,
			descontos: resumo.descontos,
			ticketMedio: resumo.vendas > 0 ? resumo.faturamento / resumo.vendas : 0,
		},
		porDia,
		porPagamento,
	};
}

// Curva ABC por receita: A até 80% acumulado, B até 95%, C o restante.
async function getCurvaABC(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const linhas = await allAsync(
		`SELECT p.nome AS produto_nome, SUM(iv.quantidade) AS quantidade, SUM(iv.quantidade * iv.preco_unitario) AS receita
     FROM ItensVenda iv
     JOIN Vendas v ON v.id = iv.venda_id
     JOIN Variacoes var ON var.id = iv.variacao_id
     JOIN Produtos p ON p.id = var.produto_id
     WHERE v.status = 'finalizada' AND DATE(v.data_venda) BETWEEN ? AND ?
     GROUP BY p.id
     ORDER BY receita DESC`,
		[inicio, fim],
	);

	const total = linhas.reduce((a, l) => a + (Number(l.receita) || 0), 0);
	let acumulado = 0;

	return linhas.map((l) => {
		const receita = Number(l.receita) || 0;
		const percentual = total > 0 ? (receita / total) * 100 : 0;
		acumulado += percentual;
		return {
			produto_nome: l.produto_nome,
			quantidade: Number(l.quantidade) || 0,
			receita,
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
module.exports = {
	getDRE,
	getRelatorioVendas,
	getCurvaABC,
	getComissoes,
};
