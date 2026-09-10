const { getConexao, runAsync, allAsync } = require("./conexao");

async function getEstoqueNegativo() {
	const conn = getConexao();
	return new Promise((resolver, rejeitar) => {
		const sql =
			"SELECT p.nome AS produto_nome, v.sku, v.tamanho, v.cor, v.atributos, v.quantidade_estoque FROM Variacoes v JOIN Produtos p ON p.id = v.produto_id WHERE v.quantidade_estoque < 0 ORDER BY v.quantidade_estoque ASC";
		conn.all(sql, [], (erro, linhas) => {
			if (erro) return rejeitar(erro.message);
			resolver(linhas);
		});
	});
}

/* ============ Estoque: entradas e movimentações ============ */

// Aplica entrada no saldo e recalcula o custo médio ponderado (quando custo informado).
// Se o saldo anterior era zero/negativo, adota o custo novo diretamente.
async function aplicarEntradaEstoque(run, varRow, quantidade, custo) {
	const estoqueAntigo = Number(varRow.quantidade_estoque) || 0;
	const custoAntigo = Number(varRow.preco_custo) || 0;
	let novoCusto = custoAntigo;
	if (custo !== null && custo !== undefined) {
		novoCusto =
			estoqueAntigo > 0
				? (estoqueAntigo * custoAntigo + quantidade * custo) /
					(estoqueAntigo + quantidade)
				: custo;
	}
	await run(
		"UPDATE Variacoes SET quantidade_estoque = quantidade_estoque + ?, preco_custo = ? WHERE id = ?",
		[quantidade, Math.round(novoCusto * 100) / 100, varRow.id],
	);
}

async function registrarEntradaEstoque(dados) {
	const conn = getConexao();
	const itens = Array.isArray(dados && dados.itens) ? dados.itens : [];
	if (itens.length === 0)
		throw new Error("Informe ao menos um item para a entrada.");

	const run = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.run(sql, params, function (erro) {
				if (erro) return reject(erro);
				resolve(this);
			});
		});

	const get = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.get(sql, params, (erro, linha) => {
				if (erro) return reject(erro);
				resolve(linha);
			});
		});

	await run("BEGIN TRANSACTION");

	try {
		const agora = new Date().toISOString();

		for (const item of itens) {
			const variacaoId = Number(item.variacao_id);
			const quantidade = Number(item.quantidade);
			const custoInformado =
				item.custo_unitario !== null &&
				item.custo_unitario !== undefined &&
				item.custo_unitario !== "";
			const custo = custoInformado ? Number(item.custo_unitario) : null;

			if (!Number.isInteger(variacaoId) || variacaoId <= 0)
				throw new Error("Variação inválida.");
			if (!Number.isInteger(quantidade) || quantidade <= 0)
				throw new Error(
					"Quantidade de entrada inválida (precisa ser inteira e positiva).",
				);
			if (custoInformado && (!Number.isFinite(custo) || custo < 0))
				throw new Error("Custo unitário inválido.");

			const varRow = await get(
				"SELECT id, quantidade_estoque, preco_custo FROM Variacoes WHERE id = ?",
				[variacaoId],
			);
			if (!varRow) throw new Error("Variação não encontrada: " + variacaoId);

			await aplicarEntradaEstoque(run, varRow, quantidade, custo);

			await run(
				"INSERT INTO MovimentacoesEstoque (variacao_id, tipo, quantidade, custo_unitario, origem, referencia_id, observacao, data) VALUES (?, 'entrada', ?, ?, ?, ?, ?, ?)",
				[
					variacaoId,
					quantidade,
					custo,
					dados.origem || "manual",
					dados.referencia_id || null,
					dados.observacao || null,
					agora,
				],
			);
		}

		await run("COMMIT");
		return { success: true, itens: itens.length };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

async function getMovimentacoesEstoque(limite) {
	return allAsync(
		`SELECT m.id, m.tipo, m.quantidade, m.custo_unitario, m.origem, m.observacao, m.data,
            v.sku, v.atributos, v.tamanho, v.cor, p.nome AS produto_nome
     FROM MovimentacoesEstoque m
     JOIN Variacoes v ON v.id = m.variacao_id
     JOIN Produtos p ON p.id = v.produto_id
     ORDER BY m.id DESC LIMIT ?`,
		[Number(limite) || 100],
	);
}

async function getEstoqueBaixo() {
	return allAsync(
		`SELECT v.id AS variacao_id, v.sku, v.quantidade_estoque, v.estoque_minimo, v.preco_custo,
            v.atributos, v.tamanho, v.cor, p.nome AS produto_nome
     FROM Variacoes v
     JOIN Produtos p ON p.id = v.produto_id
     WHERE v.quantidade_estoque <= v.estoque_minimo
     ORDER BY v.quantidade_estoque ASC, p.nome COLLATE NOCASE`,
	);
}

// Visão geral: todas as variações (não só as em alerta), para a tabela de
// estoque completa com valorização (quantidade x custo).
async function getEstoqueVisaoGeral() {
	return allAsync(
		`SELECT v.id AS variacao_id, v.sku, v.quantidade_estoque, v.estoque_minimo,
            v.preco_custo, v.atributos, v.tamanho, v.cor,
            p.nome AS produto_nome, p.id AS produto_id
     FROM Variacoes v
     JOIN Produtos p ON p.id = v.produto_id
     ORDER BY p.nome COLLATE NOCASE, v.sku`,
	);
}

async function salvarEstoqueMinimo(variacaoId, valor) {
	const v = Number(valor);
	if (!Number.isInteger(v) || v < 0)
		throw new Error("Estoque mínimo inválido.");
	const result = await runAsync(
		"UPDATE Variacoes SET estoque_minimo = ? WHERE id = ?",
		[v, Number(variacaoId)],
	);
	if (result.changes === 0) throw new Error("Variação não encontrada.");
	return { success: true };
}

async function ajustarEstoqueManual(dados) {
	const conn = getConexao();
	const variacaoId = Number(dados && dados.variacao_id);
	const novaQuantidade = Number(dados && dados.quantidade);
	if (!Number.isInteger(variacaoId) || variacaoId <= 0)
		throw new Error("Variação inválida.");
	if (!Number.isInteger(novaQuantidade) || novaQuantidade < 0)
		throw new Error(
			"O estoque precisa ser um número inteiro maior ou igual a zero.",
		);

	const run = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.run(sql, params, function (erro) {
				if (erro) return reject(erro);
				resolve(this);
			});
		});
	const get = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.get(sql, params, (erro, linha) =>
				erro ? reject(erro) : resolve(linha),
			);
		});

	await run("BEGIN TRANSACTION");
	try {
		const atual = await get(
			"SELECT quantidade_estoque, quantidade_reservada FROM Variacoes WHERE id = ?",
			[variacaoId],
		);
		if (!atual) throw new Error("Variação não encontrada.");
		const diferenca = novaQuantidade - Number(atual.quantidade_estoque || 0);
		if (diferenca === 0) {
			await run("COMMIT");
			return {
				success: true,
				alterado: false,
				quantidade_estoque: novaQuantidade,
			};
		}
		// Ajuste manual pode legitimamente zerar/reduzir por perda ou avaria, mas
		// se isso deixar o saldo abaixo do já reservado em orçamentos abertos, o
		// operador precisa ser avisado — senão o PDV promete um estoque que não
		// existe de fato.
		const reservada = Number(atual.quantidade_reservada || 0);
		const ficaAbaixoDoReservado = novaQuantidade < reservada;
		await run("UPDATE Variacoes SET quantidade_estoque = ? WHERE id = ?", [
			novaQuantidade,
			variacaoId,
		]);
		await run(
			"INSERT INTO MovimentacoesEstoque (variacao_id, tipo, quantidade, custo_unitario, origem, referencia_id, observacao, data) VALUES (?, 'ajuste', ?, NULL, 'ajuste_manual', NULL, ?, ?)",
			[
				variacaoId,
				diferenca,
				String(dados.observacao || "").trim() || null,
				new Date().toISOString(),
			],
		);
		await run("COMMIT");
		return {
			success: true,
			alterado: true,
			diferenca,
			quantidade_estoque: novaQuantidade,
			abaixoDoReservado: ficaAbaixoDoReservado,
			quantidade_reservada: reservada,
		};
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}
module.exports = {
	getEstoqueNegativo,
	aplicarEntradaEstoque,
	registrarEntradaEstoque,
	getMovimentacoesEstoque,
	getEstoqueBaixo,
	getEstoqueVisaoGeral,
	salvarEstoqueMinimo,
	ajustarEstoqueManual,
};
