const { getConexao } = require("./conexao");

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

	// Série curta para o mini-gráfico do dashboard — últimos 7 dias, incluindo
	// hoje, preenchendo com zero os dias sem venda.
	const seteDiasAtras = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10);
	const porDiaBruto = await all(
		"SELECT DATE(data_venda) AS dia, COALESCE(SUM(total), 0) AS faturamento FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ? GROUP BY DATE(data_venda)",
		[seteDiasAtras, hoje],
	);
	const mapaDias = {};
	porDiaBruto.forEach((r) => {
		mapaDias[r.dia] = r.faturamento;
	});
	const faturamentoUltimos7Dias = [];
	for (let i = 6; i >= 0; i--) {
		const dia = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
			.toISOString()
			.slice(0, 10);
		faturamentoUltimos7Dias.push({ dia, faturamento: mapaDias[dia] || 0 });
	}

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
		faturamentoUltimos7Dias,
		topProdutos,
	};
}
module.exports = {
	getDashboardStats,
};
