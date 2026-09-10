const { getConexao, getAsync, allAsync } = require("./conexao");

async function getDashboardStats() {
	const conn = getConexao();
	const get = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.get(sql, params, (erro, linha) => {
				if (erro) return reject(erro);
				resolve(linha);
			});
		});
	const all = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.all(sql, params, (erro, linhas) => {
				if (erro) return reject(erro);
				resolve(linhas);
			});
		});

	const hoje = new Date().toISOString().slice(0, 10);
	const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10);

	const totalVendas = await get(
		"SELECT COUNT(*) AS total FROM Vendas WHERE DATE(data_venda) = ? AND status = 'finalizada'",
		[hoje],
	);

	const somaTotal = await get(
		"SELECT COALESCE(SUM(total), 0) AS soma FROM Vendas WHERE DATE(data_venda) = ? AND status = 'finalizada'",
		[hoje],
	);

	// Comparativo "hoje vs. ontem" para o badge de tendência do dashboard —
	// só faz sentido pra vendas/faturamento do dia, não pros demais cards.
	const totalVendasOntem = await get(
		"SELECT COUNT(*) AS total FROM Vendas WHERE DATE(data_venda) = ? AND status = 'finalizada'",
		[ontem],
	);
	const somaTotalOntem = await get(
		"SELECT COALESCE(SUM(total), 0) AS soma FROM Vendas WHERE DATE(data_venda) = ? AND status = 'finalizada'",
		[ontem],
	);
	function variacaoPercentual(hojeVal, ontemVal) {
		if (!ontemVal) return null;
		return ((hojeVal - ontemVal) / ontemVal) * 100;
	}
	const vendasHojeVariacao = variacaoPercentual(
		totalVendas.total,
		totalVendasOntem.total,
	);
	const faturamentoHojeVariacao = variacaoPercentual(
		somaTotal.soma,
		somaTotalOntem.soma,
	);

	const totalProdutos = await get("SELECT COUNT(*) AS total FROM Produtos");

	const estoqueBaixo = await all(
		"SELECT COUNT(*) AS total FROM Variacoes WHERE quantidade_estoque > 0 AND quantidade_estoque <= estoque_minimo",
	);

	const aReceber = await get(
		"SELECT COALESCE(SUM(valor), 0) AS soma FROM LancamentosFinanceiros WHERE tipo = 'receber' AND status = 'aberto' AND DATE(data_vencimento) <= ?",
		[hoje],
	);

	const aPagar = await get(
		"SELECT COALESCE(SUM(valor), 0) AS soma FROM LancamentosFinanceiros WHERE tipo = 'pagar' AND status = 'aberto' AND DATE(data_vencimento) <= ?",
		[hoje],
	);

	// Produtos mais vendidos nos últimos 30 dias (por receita) — alimenta o
	// painel "Mais vendidos" do dashboard.
	const trintaDiasAtras = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10);
	const topProdutos = await all(
		`SELECT p.nome, p.imagem, v.sku, SUM(iv.quantidade) AS quantidade,
            SUM(iv.quantidade * iv.preco_unitario) AS receita
     FROM ItensVenda iv
     JOIN Vendas ve ON ve.id = iv.venda_id
     JOIN Variacoes v ON v.id = iv.variacao_id
     JOIN Produtos p ON p.id = v.produto_id
     WHERE ve.status = 'finalizada' AND DATE(ve.data_venda) >= ?
     GROUP BY p.id
     ORDER BY receita DESC
     LIMIT 5`,
		[trintaDiasAtras],
	);

	return {
		vendasHoje: totalVendas.total,
		vendasHojeVariacao,
		faturamentoHoje: somaTotal.soma,
		faturamentoHojeVariacao,
		totalProdutos: totalProdutos.total,
		estoqueBaixo: estoqueBaixo[0].total,
		aReceberHoje: aReceber.soma,
		aPagarHoje: aPagar.soma,
		topProdutos,
	};
}

const ESCOPOS_PERIODO = {
	"7d": { dias: 7, granularidade: "dia" },
	"1m": { dias: 30, granularidade: "dia" },
	"6m": { dias: 183, granularidade: "semana" },
	"1a": { dias: 365, granularidade: "mes" },
	"5a": { dias: 365 * 5, granularidade: "mes" },
	tudo: { dias: null, granularidade: "mes" },
};

function formatarISO(data) {
	return data.toISOString().slice(0, 10);
}

// Agrupa o mapa de faturamento por dia (já buscado do banco) em buckets do
// tamanho pedido, zero-preenchendo os buckets sem venda — o front nunca vê
// buracos na série, só zeros.
function agregarPorGranularidade(
	dataInicioISO,
	dataFimISO,
	mapaDias,
	granularidade,
) {
	const inicio = new Date(`${dataInicioISO}T00:00:00`);
	const fim = new Date(`${dataFimISO}T00:00:00`);
	const resultado = [];

	if (granularidade === "dia") {
		for (const d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
			const dia = formatarISO(d);
			resultado.push({ periodo: dia, faturamento: mapaDias[dia] || 0 });
		}
		return resultado;
	}

	if (granularidade === "semana") {
		for (const d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 7)) {
			let soma = 0;
			for (
				const cursor = new Date(d),
					limite = Math.min(fim, new Date(d).setDate(d.getDate() + 6));
				cursor.getTime() <= limite;
				cursor.setDate(cursor.getDate() + 1)
			) {
				soma += mapaDias[formatarISO(cursor)] || 0;
			}
			resultado.push({ periodo: formatarISO(d), faturamento: soma });
		}
		return resultado;
	}

	// mensal
	const diasOrdenados = Object.keys(mapaDias);
	const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
	const limite = new Date(fim.getFullYear(), fim.getMonth(), 1);
	while (cursor <= limite) {
		const anoMes = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
		const soma = diasOrdenados
			.filter((dia) => dia.startsWith(anoMes))
			.reduce((acc, dia) => acc + mapaDias[dia], 0);
		resultado.push({ periodo: `${anoMes}-01`, faturamento: soma });
		cursor.setMonth(cursor.getMonth() + 1);
	}
	return resultado;
}

// Série de faturamento para o gráfico do dashboard, com escopo selecionável
// (ver GOALS.md "Dashboard — Faturamento Chart Redesign"). Granularidade
// muda por escopo pra nunca plotar milhares de pontos diários num range de
// anos: dia (7d/1m), semana (6m), mês (1a/5a/tudo).
async function getFaturamentoPorPeriodo(range) {
	const escopo = ESCOPOS_PERIODO[range];
	if (!escopo) {
		throw new Error(`Escopo de período inválido: ${range}`);
	}

	const hoje = formatarISO(new Date());
	let dataInicio;
	if (escopo.dias === null) {
		const primeira = await getAsync(
			"SELECT MIN(DATE(data_venda)) AS dia FROM Vendas WHERE status = 'finalizada'",
		);
		dataInicio = primeira.dia || hoje;
	} else {
		dataInicio = formatarISO(
			new Date(Date.now() - (escopo.dias - 1) * 24 * 60 * 60 * 1000),
		);
	}

	const linhas = await allAsync(
		"SELECT DATE(data_venda) AS dia, COALESCE(SUM(total), 0) AS faturamento FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ? GROUP BY DATE(data_venda)",
		[dataInicio, hoje],
	);
	const mapaDias = {};
	linhas.forEach((r) => {
		mapaDias[r.dia] = r.faturamento;
	});

	return {
		granularidade: escopo.granularidade,
		dados: agregarPorGranularidade(
			dataInicio,
			hoje,
			mapaDias,
			escopo.granularidade,
		),
	};
}

module.exports = {
	getDashboardStats,
	getFaturamentoPorPeriodo,
};
