/**
 * Disposable data set for GOALS23-01. It deliberately contains the smallest
 * cross-domain ledger that can expose the current reporting inconsistencies.
 * The caller supplies the isolated database helpers so this module never
 * opens or mutates the production database by itself.
 */
async function criarCenarioIntegridade({ runAsync, allAsync }) {

 	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
 		"Fixture integridade",
 	]);
 	const variacao = await runAsync(
 		"INSERT INTO Variacoes (produto_id, sku, preco, preco_custo, quantidade_estoque, atributos) VALUES (?, ?, ?, ?, ?, ?)",
 		[produto.lastID, "INTEGRIDADE-01", 150, 100, 20, "[]"],
 	);

	const vendaDesconto = await runAsync(
		"INSERT INTO Vendas (total, forma_pagamento, data_venda, desconto, status, origem) VALUES (?, ?, ?, ?, 'finalizada', 'pdv')",
		[140, "Dinheiro", "2026-01-10T12:00:00Z", 10],
	);
	const itemDesconto = await runAsync(
		"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario, custo_unitario) VALUES (?, ?, ?, ?, ?)",
 		[vendaDesconto.lastID, variacao.lastID, 1, 150, 100],
	);
	const devolucao = await runAsync(
		"INSERT INTO Devolucoes (venda_id, motivo, valor_total, data) VALUES (?, ?, ?, ?)",
		[vendaDesconto.lastID, "Fixture de devolução", 150, "2026-01-12T12:00:00Z"],
	);
	await runAsync(
		"INSERT INTO ItensDevolucao (devolucao_id, item_venda_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?, ?)",
		[devolucao.lastID, itemDesconto.lastID, variacao.lastID, 1, 150],
	);

 	const vendaCartao = await runAsync(
 		"INSERT INTO Vendas (total, forma_pagamento, data_venda, desconto, status, origem) VALUES (?, ?, ?, 0, 'finalizada', 'pdv')",
 		[200, "Cartão", "2026-01-11T12:00:00Z"],
 	);
 	await runAsync(
 		"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario, custo_unitario) VALUES (?, ?, ?, ?, ?)",
 		[vendaCartao.lastID, variacao.lastID, 1, 200, 100],
 	);
	await runAsync(
 		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, status, origem, referencia_id, forma_pagamento, venda_id, grupo_id, parcela_num, parcela_total, categoria) VALUES ('pagar', 'Taxa cartão fixture', 20, '2026-01-20', 'aberto', 'venda', ?, 'Cartão', ?, 'fixture-cartao', 1, 1, 'Cartão')",
 		[vendaCartao.lastID, vendaCartao.lastID],
 	);

	await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, categoria) VALUES ('pagar', 'Salário fixture', 100, '2026-01-31', '2026-01-31T12:00:00Z', 'pago', 'manual', 'Folha/Comissão')",
	);
	await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, categoria) VALUES ('pagar', 'Custo fixo fixture', 30, '2026-01-15', '2026-01-15T12:00:00Z', 'pago', 'manual', 'Custo Fixo')",
	);
	await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, status, origem, categoria) VALUES ('pagar', 'Investimento fixture', 50, '2026-01-25', 'aberto', 'manual', 'Investimento')",
	);
	await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, status, origem, categoria) VALUES ('receber', 'Fiado fixture', 80, '2026-01-25', 'aberto', 'venda', 'Outros')",
	);
	await runAsync(
		"INSERT INTO FechamentosCaixa (data_abertura, valor_abertura, status) VALUES ('2026-01-01T08:00:00Z', 3000, 'aberto')",
	);

	const colunasItens = await allAsync("PRAGMA table_info(ItensVenda)");
	const possuiCustoSnapshot = colunasItens.some(
		(coluna) => coluna.name === "custo_unitario",
	);
	const fontes = {
		vendas: await allAsync(
			"SELECT id, total, desconto, forma_pagamento, data_venda, status, origem FROM Vendas ORDER BY id",
		),
		itensVenda: await allAsync(
			possuiCustoSnapshot
				? "SELECT id, venda_id, variacao_id, quantidade, preco_unitario, custo_unitario FROM ItensVenda ORDER BY id"
				: "SELECT id, venda_id, variacao_id, quantidade, preco_unitario FROM ItensVenda ORDER BY id",
		),
		lancamentos: await allAsync(
			"SELECT id, tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, categoria, forma_pagamento, venda_id, grupo_id, parcela_num, parcela_total FROM LancamentosFinanceiros ORDER BY id",
		),
		fechamentos: await allAsync(
			"SELECT id, data_abertura, valor_abertura, data_fechamento, valor_informado, valor_esperado, status FROM FechamentosCaixa ORDER BY id",
		),
		devolucoes: await allAsync(
			"SELECT id, venda_id, valor_total, data FROM Devolucoes ORDER BY id",
		),
		itensDevolucao: await allAsync(
			"SELECT id, devolucao_id, item_venda_id, variacao_id, quantidade, preco_unitario FROM ItensDevolucao ORDER BY id",
		),
	};

	return {
		periodo: { inicio: "2026-01-01", fim: "2026-01-31" },
		ids: { produtoId: produto.lastID, variacaoId: variacao.lastID },
		fontes,
		classificacaoAtual: {
			custoSnapshotAusente: possuiCustoSnapshot ? null : "P0:data",
			cmvHistoricoMutavel: possuiCustoSnapshot ? null : "P0:data",
			caixaFisicoMisturadoAoConsolidado: "P0:data",
			cartaoVendaEQuitacaoEmDatasDiferentes: "P0:formula",
			receitaDescontoEntreConsultas: "P1:formula",
			devolucaoNaoReverteDre: "P1:formula",
		salarioSemSubtipoOuCompetencia: "P1:data",
			custoFixoMensalSemChaveDeMes: "P1:date",
			consumidoresComPeriodosDiferentes: "P1:date",
			dtoSemQualidadeOuReconcilicao: "P1:label",
			fixtureNaoIncluidoNoNpmTest: "P2:UI-only",
		},
	};
}

async function capturarRelatorios(db, inicio, fim) {
	const [vendas, dre, curvaABC, margemContribuicao, fluxo, projetado, composto] =
		await Promise.all([
			db.getRelatorioVendas(inicio, fim),
			db.getDRE(inicio, fim),
			db.getCurvaABC(inicio, fim),
			db.getMargemContribuicao(inicio, fim),
			db.getFluxoCaixa(inicio, fim),
			db.getFluxoCaixaProjetado(inicio, fim),
			db.getRelatorioFluxoCaixa(inicio, fim),
		]);
	return { vendas, dre, curvaABC, margemContribuicao, fluxo, projetado, composto };
}

module.exports = { criarCenarioIntegridade, capturarRelatorios };
