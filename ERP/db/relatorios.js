const { allAsync, getAsync } = require("./conexao");
const { getTaxaAdquirente, getCustoFixoConfig } = require("./precificacao");

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

// Curva ABC por lucro (receita menos custo): A até 80% acumulado de lucro, B até 95%, C o resto.
async function getCurvaABC(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const linhas = await allAsync(
		`SELECT p.nome AS produto_nome, SUM(iv.quantidade) AS quantidade,
   SUM(iv.quantidade * var.preco_custo) AS custo_total,
   SUM(iv.quantidade * (iv.preco_unitario - var.preco_custo)) AS lucro_total,
   SUM(iv.quantidade * iv.preco_unitario) AS receita
   FROM ItensVenda iv
   JOIN Vendas v ON v.id = iv.venda_id
   JOIN Variacoes var ON var.id = iv.variacao_id
   JOIN Produtos p ON p.id = var.produto_id
   WHERE v.status = 'finalizada' AND DATE(v.data_venda) BETWEEN ? AND ?
   GROUP BY p.id
   ORDER BY receita DESC`,
		[inicio, fim],
	);

	const total = linhas.reduce((a, l) => a + (Number(l.lucro_total) || 0), 0);
	let acumulado = 0;

	return linhas.map((l) => {
		const receita = Number(l.receita) || 0;
		const custo = Number(l.custo_total) || 0;
		const lucro = Number(l.lucro_total) || 0;
		const percentual = total > 0 ? (lucro / total) * 100 : 0;
		acumulado += percentual;
		return {
			produto_nome: l.produto_nome,
			quantidade: Number(l.quantidade) || 0,
			receita,
			custo,
			lucro,
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

	const taxaAdquirente = await getTaxaAdquirente();

	const linhas = await allAsync(
		`SELECT p.id AS produto_id, p.nome AS produto_nome,
   SUM(iv.quantidade) AS quantidade,
   SUM(iv.quantidade * iv.preco_unitario) AS receita,
   SUM(iv.quantidade * var.preco_custo) AS cmv,
   COALESCE(pr.impostos_extras, 0) AS impostos_extras,
   COALESCE(v.comissao_percentual, 0) AS comissao_percentual
   FROM ItensVenda iv
   JOIN Vendas v2 ON v2.id = iv.venda_id
   JOIN Variacoes var ON var.id = iv.variacao_id
   JOIN Produtos p ON p.id = var.produto_id
   LEFT JOIN Precificacao pr ON pr.produto_id = p.id
   LEFT JOIN Usuarios v ON v.id = v2.usuario_id
   WHERE v2.status = 'finalizada' AND DATE(v2.data_venda) BETWEEN ? AND ?
   GROUP BY p.id`,
		[inicio, fim],
	);

	let margemTotal = 0;
	let receitaTotal = 0;
	let quantidadeTotal = 0;

	const porProduto = linhas.map((l) => {
		const receita = Number(l.receita) || 0;
		const cmv = Number(l.cmv) || 0;
		const quantidade = Number(l.quantidade) || 0;
		const comissaoValor =
			(receita * (Number(l.comissao_percentual) || 0)) / 100;
		const taxaValor = (receita * taxaAdquirente) / 100;
		const impostos = (Number(l.impostos_extras) || 0) * quantidade;
		const margemContribuicao =
			receita - cmv - comissaoValor - taxaValor - impostos;

		margemTotal += margemContribuicao;
		receitaTotal += receita;
		quantidadeTotal += quantidade;

		return {
			produto_id: l.produto_id,
			produto_nome: l.produto_nome,
			quantidade,
			receita,
			margemContribuicao,
			margemContribuicaoUnitaria:
				quantidade > 0 ? margemContribuicao / quantidade : 0,
			margemContribuicaoPercentual:
				receita > 0 ? (margemContribuicao / receita) * 100 : 0,
		};
	});

	return {
		periodo: { inicio, fim },
		taxaAdquirenteUsada: taxaAdquirente,
		porProduto,
		margemContribuicaoTotal: margemTotal,
		margemContribuicaoUnitariaMedia:
			quantidadeTotal > 0 ? margemTotal / quantidadeTotal : 0,
		margemContribuicaoPercentualMedia:
			receitaTotal > 0 ? (margemTotal / receitaTotal) * 100 : 0,
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
// histórico). Uma média de período real exigiria snapshots de estoque que não
// existem hoje; documentado aqui como limitação conhecida, não passado como exato.
async function getGiroEstoque(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const linhas = await allAsync(
		`SELECT p.id AS produto_id, p.nome AS produto_nome,
   SUM(iv.quantidade) AS quantidade_vendida,
   var.quantidade_estoque AS estoque_atual
   FROM ItensVenda iv
   JOIN Vendas v ON v.id = iv.venda_id
   JOIN Variacoes var ON var.id = iv.variacao_id
   JOIN Produtos p ON p.id = var.produto_id
   WHERE v.status = 'finalizada' AND DATE(v.data_venda) BETWEEN ? AND ?
   GROUP BY p.id`,
		[inicio, fim],
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

module.exports = {
	getDRE,
	getRelatorioVendas,
	getCurvaABC,
	getComissoes,
	getMargemContribuicao,
	getPontoDeEquilibrio,
	getGiroEstoque,
};
