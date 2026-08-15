const {
	getConexao,
	runAsync,
	allAsync,
	getAsync,
	runOn,
} = require("./conexao");

/* ============ Precificação ============ */

async function getGlobalMargin() {
	const row = await getAsync(
		"SELECT valor FROM Configuracao WHERE chave = 'margem_padrao'",
	);
	return row ? parseFloat(row.valor) || 40 : 40;
}

async function saveGlobalMargin(valor) {
	await runAsync(
		"INSERT OR REPLACE INTO Configuracao (chave, valor) VALUES ('margem_padrao', ?)",
		[String(valor)],
	);
	// A margem global recém-salva precisa refletir imediatamente no preço dos
	// produtos que ainda não têm override manual — senão o preço de venda real
	// (Variacoes.preco) só seria atualizado na próxima vez que a tela de
	// Precificação fosse recarregada, deixando o PDV desatualizado até lá.
	await sincronizarPrecosPendentes();
	return { success: true };
}

// Recalcula e grava (Precificacao.preco_venda + Variacoes.preco) o preço de
// venda de todo produto "pendente" (sem override manual de margem/preço),
// usando a margem global e o custo fixo atuais. Chamado tanto ao carregar a
// tela de Precificação quanto ao salvar uma nova margem global/custo fixo,
// para que o preço real nunca fique defasado do que a tela exibe.
async function sincronizarPrecosPendentes() {
	const margemGlobalAtual = await getGlobalMargin();
	const custoFixoAtual = await getCustoFixoConfig();
	const pendentes = await allAsync(
		`SELECT pr.produto_id, pr.preco_custo, pr.impostos_extras, pr.preco_venda, pr.aplicar_custo_fixo
     FROM Precificacao pr
     WHERE pr.status = 'pendente'`,
	);
	for (const p of pendentes) {
		const base = Number(p.preco_custo || 0) + Number(p.impostos_extras || 0);
		const custoFixoPercentual = p.aplicar_custo_fixo
			? custoFixoAtual.percentual
			: 0;
		const precoCalculado =
			base > 0
				? base * (1 + margemGlobalAtual / 100) * (1 + custoFixoPercentual / 100)
				: 0;
		if (
			precoCalculado > 0 &&
			Math.abs(precoCalculado - Number(p.preco_venda || 0)) > 0.001
		) {
			const conn2 = getConexao();
			await runOn(conn2, "BEGIN TRANSACTION");
			try {
				await runOn(
					conn2,
					"UPDATE Precificacao SET preco_venda = ? WHERE produto_id = ?",
					[precoCalculado, p.produto_id],
				);
				await runOn(
					conn2,
					"UPDATE Variacoes SET preco = ? WHERE produto_id = ?",
					[precoCalculado, p.produto_id],
				);
				await runOn(conn2, "COMMIT");
			} catch (erro) {
				await runOn(conn2, "ROLLBACK");
				throw erro;
			}
		}
	}
}

async function getPricingData() {
	const conn = getConexao();
	const all = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.all(sql, params, (erro, linhas) => {
				if (erro) return reject(erro);
				resolve(linhas);
			});
		});

	// Cria produtos faltantes na Precificacao (sync automático)
	await runAsync(
		`INSERT OR IGNORE INTO Precificacao (produto_id, preco_custo, impostos_extras, preco_venda, status)
     SELECT p.id, COALESCE(v.preco_custo, 0), 0, COALESCE(v.preco, 0), 'pendente'
     FROM Produtos p
     LEFT JOIN (SELECT produto_id, MIN(preco_custo) AS preco_custo, MIN(preco) AS preco
                FROM Variacoes GROUP BY produto_id) v ON v.produto_id = p.id
     WHERE p.id NOT IN (SELECT produto_id FROM Precificacao)`,
	);

	// Recupera preços/custos já cadastrados na variação quando a precificação ainda está pendente.
	await runAsync(
		`UPDATE Precificacao
        SET preco_custo = CASE WHEN preco_custo = 0 THEN COALESCE((SELECT MIN(v.preco_custo) FROM Variacoes v WHERE v.produto_id = Precificacao.produto_id), 0) ELSE preco_custo END,
            preco_venda = CASE WHEN preco_venda = 0 THEN COALESCE((SELECT MIN(v.preco) FROM Variacoes v WHERE v.produto_id = Precificacao.produto_id), 0) ELSE preco_venda END
      WHERE status = 'pendente'`,
	);

	// Produtos "pendentes" (sem override manual) usam a margem global para exibição,
	// mas isso nunca era gravado no banco — o preço de venda real (Variacoes.preco)
	// ficava em 0 até o usuário editar algum campo manualmente na tela de Precificação,
	// fazendo o PDV mostrar "Sem preço" mesmo com a Precificação exibindo um valor calculado.
	// Aqui sincronizamos automaticamente sempre que a lista é carregada.
	await sincronizarPrecosPendentes();

	const rows = await all(
		`SELECT pr.id, pr.produto_id, p.nome AS produto_nome, p.categoria_id,
            pr.preco_custo, pr.impostos_extras, pr.margem_percentual,
            pr.preco_venda, pr.status, pr.aplicar_custo_fixo,
            COALESCE(v.preco_custo, 0) AS custo_variacao,
            COALESCE(v.preco, 0) AS preco_variacao,
            v.sku AS sku_primeiro,
            (SELECT GROUP_CONCAT(n, ', ') FROM (
              SELECT DISTINCT c.nome AS n FROM ProdutoCategorias pc
              JOIN Categorias c ON c.id = pc.categoria_id
              WHERE pc.produto_id = p.id
              UNION
              SELECT c.nome AS n FROM Categorias c
              WHERE c.id = p.categoria_id OR c.id = p.subcategoria_id
            )) AS categorias
     FROM Precificacao pr
     JOIN Produtos p ON p.id = pr.produto_id
     LEFT JOIN (SELECT produto_id, MIN(id) AS first_id FROM Variacoes GROUP BY produto_id) vf
              ON vf.produto_id = p.id
     LEFT JOIN Variacoes v ON v.id = vf.first_id
     ORDER BY p.nome COLLATE NOCASE`,
	);

	return rows.map((r) => ({
		id: r.id,
		produto_id: r.produto_id,
		produto_nome: r.produto_nome,
		preco_custo: Number(r.preco_custo || 0),
		impostos_extras: Number(r.impostos_extras || 0),
		margem_percentual:
			r.margem_percentual !== null ? Number(r.margem_percentual) : null,
		preco_venda: Number(r.preco_venda || 0),
		status: r.status || "pendente",
		custo_variacao: Number(r.custo_variacao || 0),
		preco_variacao: Number(r.preco_variacao || 0),
		sku_primeiro: r.sku_primeiro || null,
		categorias: r.categorias || null,
		aplicar_custo_fixo: !!r.aplicar_custo_fixo,
	}));
}

// Custo fixo mensal (aluguel, salários, etc.) diluído como uma PORCENTAGEM do
// faturamento, não um R$ fixo por unidade — ratear em R$ fixo penalizava
// desproporcionalmente produtos baratos (um acessório de R$20 absorvia o
// mesmo custo fixo em R$ que um quimono de R$1000). A % é sempre recalculada
// a partir do faturamento médio histórico real (ver getFaturamentoMedioHistorico),
// nunca de um "volume estimado" digitado à mão.
async function getFaturamentoMedioHistorico(meses) {
	const qtdMeses = Number(meses) > 0 ? Number(meses) : 3;
	const linhas = await allAsync(
		`SELECT strftime('%Y-%m', data_venda) AS mes, SUM(total) AS faturamento
     FROM Vendas
     WHERE status = 'finalizada'
     GROUP BY mes
     ORDER BY mes DESC
     LIMIT ?`,
		[qtdMeses],
	);
	if (linhas.length === 0) return { media: 0, mesesConsiderados: 0 };
	const soma = linhas.reduce((acc, l) => acc + (Number(l.faturamento) || 0), 0);
	return { media: soma / linhas.length, mesesConsiderados: linhas.length };
}

async function getCustoFixoConfig() {
	const linhas = await allAsync(
		"SELECT chave, valor FROM Configuracao WHERE chave = 'custo_fixo_mensal'",
	);
	const mapa = {};
	linhas.forEach((l) => {
		mapa[l.chave] = l.valor;
	});
	const mensal = parseFloat(mapa.custo_fixo_mensal) || 0;
	const { media, mesesConsiderados } = await getFaturamentoMedioHistorico(3);
	const percentual = mensal > 0 && media > 0 ? (mensal / media) * 100 : 0;
	return {
		mensal,
		faturamentoMedioHistorico: media,
		mesesConsiderados,
		percentual,
	};
}

async function saveCustoFixoConfig(mensal) {
	const mensalVal = Number(mensal);
	if (!Number.isFinite(mensalVal) || mensalVal < 0)
		throw new Error("Custo fixo mensal inválido.");
	await runAsync(
		"INSERT OR REPLACE INTO Configuracao (chave, valor) VALUES ('custo_fixo_mensal', ?)",
		[String(mensalVal)],
	);
	// Reflete imediatamente no preço dos produtos sem override manual — mesmo
	// motivo de saveGlobalMargin chamar sincronizarPrecosPendentes().
	await sincronizarPrecosPendentes();
	return { success: true };
}

async function saveAplicarCustoFixo(produtoId, aplicar) {
	await runAsync(
		"UPDATE Precificacao SET aplicar_custo_fixo = ? WHERE produto_id = ?",
		[aplicar ? 1 : 0, produtoId],
	);
	return { success: true };
}

async function saveProductMargin(produtoId, margem) {
	const margemVal = margem !== null && margem !== "" ? Number(margem) : null;
	if (margemVal !== null && (!Number.isFinite(margemVal) || margemVal < 0)) {
		throw new Error("Margem inválida.");
	}
	await runAsync(
		"UPDATE Precificacao SET margem_percentual = ?, status = ? WHERE produto_id = ?",
		[margemVal, margemVal !== null ? "definido" : "pendente", produtoId],
	);
	return { success: true };
}

async function saveProductPrice(produtoId, precoVenda) {
	const preco = Number(precoVenda);
	if (!Number.isFinite(preco) || preco < 0) throw new Error("Preço inválido.");
	const conn = getConexao();
	await runOn(conn, "BEGIN TRANSACTION");
	try {
		await runOn(
			conn,
			"UPDATE Precificacao SET preco_venda = ?, status = ? WHERE produto_id = ?",
			[preco, "definido", produtoId],
		);
		await runOn(conn, "UPDATE Variacoes SET preco = ? WHERE produto_id = ?", [
			preco,
			produtoId,
		]);
		await runOn(conn, "COMMIT");
	} catch (erro) {
		await runOn(conn, "ROLLBACK");
		throw erro;
	}
	return { success: true };
}

async function saveProductCost(produtoId, precoCusto) {
	const custo = Number(precoCusto);
	if (!Number.isFinite(custo) || custo < 0) throw new Error("Custo inválido.");
	const conn = getConexao();
	await runOn(conn, "BEGIN TRANSACTION");
	try {
		await runOn(
			conn,
			"UPDATE Precificacao SET preco_custo = ? WHERE produto_id = ?",
			[custo, produtoId],
		);
		await runOn(
			conn,
			"UPDATE Variacoes SET preco_custo = ? WHERE produto_id = ?",
			[custo, produtoId],
		);
		await runOn(conn, "COMMIT");
	} catch (erro) {
		await runOn(conn, "ROLLBACK");
		throw erro;
	}
	return { success: true };
}

async function saveProductTaxes(produtoId, valor) {
	const v = Number(valor);
	if (!Number.isFinite(v) || v < 0) throw new Error("Valor inválido.");
	await runAsync(
		"UPDATE Precificacao SET impostos_extras = ? WHERE produto_id = ?",
		[v, produtoId],
	);
	return { success: true };
}

async function massUpdateMargem(produtoIds, margem) {
	const conn = getConexao();
	const run = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.run(sql, params, function (erro) {
				if (erro) return reject(erro);
				resolve(this);
			});
		});
	await run("BEGIN TRANSACTION");
	try {
		for (const pid of produtoIds) {
			await run(
				"UPDATE Precificacao SET margem_percentual = ?, status = ? WHERE produto_id = ?",
				[margem, "definido", pid],
			);
		}
		await run("COMMIT");
		return { success: true, count: produtoIds.length };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}
module.exports = {
	getGlobalMargin,
	saveGlobalMargin,
	sincronizarPrecosPendentes,
	getPricingData,
	getFaturamentoMedioHistorico,
	getCustoFixoConfig,
	saveCustoFixoConfig,
	saveAplicarCustoFixo,
	saveProductMargin,
	saveProductPrice,
	saveProductCost,
	saveProductTaxes,
	massUpdateMargem,
};
