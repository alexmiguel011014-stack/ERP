const { getConexao, runAsync, allAsync } = require("./conexao");
const { aplicarEntradaEstoque } = require("./estoque");
const { criarLancamentoInterno } = require("./financeiro");

/* ============ Compras (pedidos + recebimento) ============ */

async function criarPedidoCompra(dados) {
	const conn = getConexao();
	const itens = Array.isArray(dados && dados.itens) ? dados.itens : [];
	if (itens.length === 0)
		throw new Error("O pedido precisa de pelo menos um item.");

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
		let total = 0;
		for (const item of itens) {
			const variacaoId = Number(item.variacao_id);
			const quantidade = Number(item.quantidade);
			const custo = Number(item.custo_unitario);
			if (!Number.isInteger(variacaoId) || variacaoId <= 0)
				throw new Error("Variação inválida.");
			if (!Number.isInteger(quantidade) || quantidade <= 0)
				throw new Error("Quantidade inválida no pedido.");
			if (!Number.isFinite(custo) || custo < 0)
				throw new Error("Custo unitário inválido no pedido.");
			const existe = await get("SELECT id FROM Variacoes WHERE id = ?", [
				variacaoId,
			]);
			if (!existe) throw new Error("Variação não encontrada: " + variacaoId);
			total += quantidade * custo;
		}

		const result = await run(
			"INSERT INTO PedidosCompra (fornecedor_id, status, total, data_pedido, observacao) VALUES (?, 'aberto', ?, ?, ?)",
			[
				dados.fornecedor_id || null,
				Math.round(total * 100) / 100,
				new Date().toISOString(),
				dados.observacao || null,
			],
		);
		const pedidoId = result.lastID;

		for (const item of itens) {
			await run(
				"INSERT INTO ItensPedidoCompra (pedido_id, variacao_id, quantidade, custo_unitario) VALUES (?, ?, ?, ?)",
				[
					pedidoId,
					Number(item.variacao_id),
					Number(item.quantidade),
					Number(item.custo_unitario),
				],
			);
		}

		await run("COMMIT");
		return { success: true, pedidoId };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

async function getPedidosCompra() {
	return allAsync(
		`SELECT pc.*, f.nome AS fornecedor_nome
     FROM PedidosCompra pc
     LEFT JOIN Fornecedores f ON f.id = pc.fornecedor_id
     ORDER BY (CASE pc.status WHEN 'aberto' THEN 0 WHEN 'parcial' THEN 1 WHEN 'recebido' THEN 2 ELSE 3 END), pc.id DESC
     LIMIT 100`,
	);
}

async function getItensPedidoCompra(pedidoId) {
	return allAsync(
		`SELECT ipc.id, ipc.quantidade, ipc.quantidade_recebida, ipc.custo_unitario,
            v.sku, v.atributos, v.tamanho, v.cor, p.nome AS produto_nome
     FROM ItensPedidoCompra ipc
     JOIN Variacoes v ON v.id = ipc.variacao_id
     JOIN Produtos p ON p.id = v.produto_id
     WHERE ipc.pedido_id = ?
     ORDER BY ipc.id`,
		[pedidoId],
	);
}

// Recebimento: dá entrada no estoque (custo médio), fecha o pedido e gera a conta a pagar.
// Recebe um pedido de compra, total ou parcialmente. `itensRecebidos` é opcional:
// [{ item_id, quantidade }] com a quantidade a receber AGORA em cada item
// (não o total acumulado). Sem esse parâmetro, recebe tudo que falta de uma vez
// — mantém o comportamento anterior para quem chama sem essa opção.
async function receberPedidoCompra(pedidoId, itensRecebidos) {
	const conn = getConexao();

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

	const all = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.all(sql, params, (erro, linhas) => {
				if (erro) return reject(erro);
				resolve(linhas);
			});
		});

	await run("BEGIN TRANSACTION");

	try {
		const pedido = await get("SELECT * FROM PedidosCompra WHERE id = ?", [
			pedidoId,
		]);
		if (!pedido) throw new Error("Pedido de compra não encontrado.");
		if (pedido.status !== "aberto" && pedido.status !== "parcial")
			throw new Error(
				"Este pedido já foi " +
					(pedido.status === "recebido" ? "recebido" : "cancelado") +
					".",
			);

		const itens = await all(
			"SELECT * FROM ItensPedidoCompra WHERE pedido_id = ?",
			[pedidoId],
		);
		const agora = new Date().toISOString();

		const mapaRecebimento = new Map();
		if (Array.isArray(itensRecebidos)) {
			for (const r of itensRecebidos) {
				const qtd = Number(r.quantidade);
				if (Number.isInteger(qtd) && qtd > 0) {
					mapaRecebimento.set(Number(r.item_id), qtd);
				}
			}
		}

		let valorRecebidoAgora = 0;
		let tudoRecebido = true;

		for (const item of itens) {
			const faltante = item.quantidade - item.quantidade_recebida;
			const receberAgora =
				mapaRecebimento.size > 0
					? Math.min(mapaRecebimento.get(item.id) || 0, faltante)
					: faltante;

			if (receberAgora <= 0) {
				if (faltante > 0) tudoRecebido = false;
				continue;
			}

			const varRow = await get(
				"SELECT id, quantidade_estoque, preco_custo FROM Variacoes WHERE id = ?",
				[item.variacao_id],
			);
			if (!varRow)
				throw new Error("Variação não encontrada: " + item.variacao_id);

			await aplicarEntradaEstoque(
				run,
				varRow,
				receberAgora,
				item.custo_unitario,
			);

			await run(
				"UPDATE ItensPedidoCompra SET quantidade_recebida = quantidade_recebida + ? WHERE id = ?",
				[receberAgora, item.id],
			);

			await run(
				"INSERT INTO MovimentacoesEstoque (variacao_id, tipo, quantidade, custo_unitario, origem, referencia_id, observacao, data) VALUES (?, 'entrada', ?, ?, 'compra', ?, ?, ?)",
				[
					item.variacao_id,
					receberAgora,
					item.custo_unitario,
					pedidoId,
					"Recebimento do pedido #" +
						pedidoId +
						(receberAgora < item.quantidade ? " (parcial)" : ""),
					agora,
				],
			);

			valorRecebidoAgora += receberAgora * item.custo_unitario;
			if (receberAgora < faltante) tudoRecebido = false;
		}

		const novoStatus = tudoRecebido ? "recebido" : "parcial";
		await run(
			"UPDATE PedidosCompra SET status = ?, data_recebimento = ? WHERE id = ?",
			[novoStatus, tudoRecebido ? agora : pedido.data_recebimento, pedidoId],
		);

		// Conta a pagar proporcional ao que foi recebido agora, com vencimento
		// conforme o prazo acordado com o fornecedor.
		if (valorRecebidoAgora > 0) {
			let prazoDias = 0;
			if (pedido.fornecedor_id) {
				const fornecedor = await get(
					"SELECT prazo_pagamento_dias FROM Fornecedores WHERE id = ?",
					[pedido.fornecedor_id],
				);
				prazoDias = fornecedor
					? Number(fornecedor.prazo_pagamento_dias) || 0
					: 0;
			}
			const vencimento = new Date(
				Date.now() + prazoDias * 24 * 60 * 60 * 1000,
			).toISOString();

			await criarLancamentoInterno(run, {
				tipo: "pagar",
				descricao:
					"Pedido de compra #" +
					pedidoId +
					(novoStatus === "parcial" ? " (recebimento parcial)" : ""),
				valor: Math.round(valorRecebidoAgora * 100) / 100,
				data_vencimento: vencimento,
				origem: "compra",
				referencia_id: pedidoId,
			});
		}

		await run("COMMIT");
		return { success: true, pedidoId, status: novoStatus };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

// Cancela o que ainda falta receber. Se já houve recebimento parcial, o que
// foi recebido permanece no estoque — só o saldo pendente é cancelado.
async function cancelarPedidoCompra(pedidoId) {
	const result = await runAsync(
		"UPDATE PedidosCompra SET status = 'cancelado' WHERE id = ? AND status IN ('aberto', 'parcial')",
		[pedidoId],
	);
	if (result.changes === 0)
		throw new Error("Pedido não encontrado ou já finalizado.");
	return { success: true };
}
module.exports = {
	criarPedidoCompra,
	getPedidosCompra,
	getItensPedidoCompra,
	receberPedidoCompra,
	cancelarPedidoCompra,
};
