// Consignação/comodato: itens físicos emprestados a um cliente, fora do
// estoque vendável mas ainda não vendidos nem baixados. Reaproveita o mesmo
// mecanismo de reserva que orçamento já usa (quantidade_reservada em
// Variacoes) — ver db/vendas.js:248/362/450 para o guard/liberação/baixa que
// este arquivo espelha. Decisão registrada em GOALS.md (seção "2.
// Consignação", 2026-09-03): zero query change em nenhum outro lugar do app,
// porque quantidade_disponivel (db/produtos.js) já é
// quantidade_estoque - quantidade_reservada.
const { runAsync, getAsync, allAsync } = require("./conexao");
const { criarLancamentoInterno } = require("./financeiro");

const STATUS_VALIDOS = ["emprestado", "devolvido", "vendido", "perdido"];

function validarInteiroPositivo(valor, mensagem) {
	const n = Number(valor);
	if (!Number.isInteger(n) || n <= 0) {
		throw new Error(mensagem);
	}
	return n;
}

async function obterRotuloVariacao(variacaoId) {
	const linha = await getAsync(
		`SELECT v.sku, v.quantidade_estoque, v.quantidade_reservada, p.nome
     FROM Variacoes v JOIN Produtos p ON p.id = v.produto_id WHERE v.id = ?`,
		[variacaoId],
	);
	if (!linha) return { rotulo: "item " + variacaoId, disponivel: 0 };
	return {
		rotulo: linha.nome + " (" + linha.sku + ")",
		disponivel: linha.quantidade_estoque - linha.quantidade_reservada,
	};
}

// Registra a saída do item para o cliente e reserva a quantidade (mesma
// guarda de db/vendas.js:248: recusa e faz ROLLBACK se não há disponível).
async function registrarConsignacao(dados) {
	const clienteId = dados && dados.cliente_id ? Number(dados.cliente_id) : null;
	const variacaoId = validarInteiroPositivo(
		dados && dados.variacao_id,
		"Variação inválida.",
	);
	const quantidade = validarInteiroPositivo(
		dados && dados.quantidade,
		"Quantidade inválida.",
	);
	const dataPrevistaRetorno = (dados && dados.data_prevista_retorno) || null;
	const observacao = (dados && dados.observacao) || null;

	await runAsync("BEGIN TRANSACTION");
	try {
		const resultado = await runAsync(
			`INSERT INTO Consignacoes
        (cliente_id, variacao_id, quantidade, data_saida, data_prevista_retorno, status, observacao)
       VALUES (?, ?, ?, ?, ?, 'emprestado', ?)`,
			[
				clienteId,
				variacaoId,
				quantidade,
				new Date().toISOString(),
				dataPrevistaRetorno,
				observacao,
			],
		);
		const consignacaoId = resultado.lastID;

		const reserva = await runAsync(
			"UPDATE Variacoes SET quantidade_reservada = quantidade_reservada + ? WHERE id = ? AND (quantidade_estoque - quantidade_reservada) >= ?",
			[quantidade, variacaoId, quantidade],
		);
		if (reserva.changes === 0) {
			const { rotulo, disponivel } = await obterRotuloVariacao(variacaoId);
			throw new Error(
				"Estoque disponível insuficiente para consignar " +
					rotulo +
					". Disponível: " +
					disponivel +
					".",
			);
		}

		await runAsync("COMMIT");
		return { success: true, consignacaoId };
	} catch (erro) {
		await runAsync("ROLLBACK");
		throw erro;
	}
}

// Encerra uma consignação em aberto sem virar venda (devolução ou perda):
// libera a reserva de volta (mesma liberação de db/vendas.js:450), sem
// tocar em quantidade_estoque — o item nunca saiu do estoque real.
async function encerrarSemVenda(id, novoStatus) {
	const consignacaoId = validarInteiroPositivo(id, "Consignação inválida.");

	await runAsync("BEGIN TRANSACTION");
	try {
		const consignacao = await getAsync(
			"SELECT * FROM Consignacoes WHERE id = ?",
			[consignacaoId],
		);
		if (!consignacao) throw new Error("Consignação não encontrada.");
		if (consignacao.status !== "emprestado") {
			throw new Error(
				"Esta consignação já foi encerrada (status atual: " +
					consignacao.status +
					").",
			);
		}

		await runAsync("UPDATE Consignacoes SET status = ? WHERE id = ?", [
			novoStatus,
			consignacaoId,
		]);
		await runAsync(
			"UPDATE Variacoes SET quantidade_reservada = MAX(0, quantidade_reservada - ?) WHERE id = ?",
			[consignacao.quantidade, consignacao.variacao_id],
		);

		await runAsync("COMMIT");
		return { success: true };
	} catch (erro) {
		await runAsync("ROLLBACK");
		throw erro;
	}
}

async function marcarDevolvida(id) {
	return encerrarSemVenda(id, "devolvido");
}

async function marcarPerdida(id) {
	return encerrarSemVenda(id, "perdido");
}

// Consignação vira venda de fato: baixa quantidade_estoque e libera a
// reserva na mesma operação (mesmo UPDATE combinado de
// db/vendas.js:362/converterOrcamento), e cria a Venda/ItensVenda
// correspondente — tudo na mesma transação atômica.
async function marcarVendida(id, dados) {
	const consignacaoId = validarInteiroPositivo(id, "Consignação inválida.");
	const precoUnitario = Number(dados && dados.preco_unitario);
	if (!Number.isFinite(precoUnitario) || precoUnitario < 0) {
		throw new Error("Preço unitário inválido.");
	}
	// forma_pagamento não tem valor padrão inventado: fica null até o dono
	// decidir na hora de fechar a venda, mesma flexibilidade de um orçamento
	// recém-criado antes de converterOrcamento.
	const formaPagamento = (dados && dados.forma_pagamento) || null;
	const observacao = (dados && dados.observacao) || null;
	const usuarioId = (dados && dados.usuario_id) || null;

	await runAsync("BEGIN TRANSACTION");
	try {
		const consignacao = await getAsync(
			"SELECT * FROM Consignacoes WHERE id = ?",
			[consignacaoId],
		);
		if (!consignacao) throw new Error("Consignação não encontrada.");
		if (consignacao.status !== "emprestado") {
			throw new Error(
				"Esta consignação já foi encerrada (status atual: " +
					consignacao.status +
					").",
			);
		}

		await runAsync("UPDATE Consignacoes SET status = 'vendido' WHERE id = ?", [
			consignacaoId,
		]);

		const baixa = await runAsync(
			"UPDATE Variacoes SET quantidade_estoque = quantidade_estoque - ?, quantidade_reservada = MAX(0, quantidade_reservada - ?) WHERE id = ? AND quantidade_estoque >= ?",
			[
				consignacao.quantidade,
				consignacao.quantidade,
				consignacao.variacao_id,
				consignacao.quantidade,
			],
		);
		if (baixa.changes === 0) {
			const { rotulo } = await obterRotuloVariacao(consignacao.variacao_id);
			throw new Error(
				"Estoque insuficiente para concluir a venda de " + rotulo + ".",
			);
		}

		const total = precoUnitario * consignacao.quantidade;
		const venda = await runAsync(
			`INSERT INTO Vendas
        (cliente_id, total, forma_pagamento, data_venda, desconto, observacao, status, usuario_id, origem)
       VALUES (?, ?, ?, ?, 0, ?, 'finalizada', ?, 'consignacao')`,
			[
				consignacao.cliente_id,
				total,
				formaPagamento,
				new Date().toISOString(),
				observacao || "Venda originada da consignação #" + consignacaoId,
				usuarioId,
			],
		);
		const vendaId = venda.lastID;

		await runAsync(
			"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)",
			[vendaId, consignacao.variacao_id, consignacao.quantidade, precoUnitario],
		);

		// Mesma regra de finalizarVenda/converterOrcamento: fiado gera conta a
		// receber automaticamente, não fica "perdido" fora do financeiro.
		if (formaPagamento === "Fiado") {
			await criarLancamentoInterno(runAsync, {
				tipo: "receber",
				descricao: "Venda #" + vendaId + " (fiado, consignação)",
				valor: total,
				data_vencimento: new Date().toISOString(),
				origem: "venda",
				referencia_id: vendaId,
				forma_pagamento: formaPagamento,
			});
		}

		await runAsync("COMMIT");
		return { success: true, vendaId };
	} catch (erro) {
		await runAsync("ROLLBACK");
		throw erro;
	}
}

async function listarConsignacoes(filtro) {
	filtro = filtro || {};
	let sql = `
    SELECT c.id, c.cliente_id, c.variacao_id, c.quantidade, c.data_saida,
           c.data_prevista_retorno, c.status, c.observacao, c.criado_em,
           cl.nome AS cliente_nome,
           v.sku, v.tamanho, v.cor, v.preco,
           p.nome AS produto_nome
    FROM Consignacoes c
    LEFT JOIN Clientes cl ON cl.id = c.cliente_id
    JOIN Variacoes v ON v.id = c.variacao_id
    JOIN Produtos p ON p.id = v.produto_id`;
	const where = [];
	const params = [];
	if (filtro.cliente_id) {
		where.push("c.cliente_id = ?");
		params.push(Number(filtro.cliente_id));
	}
	if (filtro.status) {
		if (STATUS_VALIDOS.indexOf(filtro.status) === -1) {
			throw new Error("Status inválido.");
		}
		where.push("c.status = ?");
		params.push(String(filtro.status));
	}
	if (where.length > 0) sql += " WHERE " + where.join(" AND ");
	sql += " ORDER BY c.criado_em DESC, c.id DESC";
	return allAsync(sql, params);
}

module.exports = {
	STATUS_VALIDOS,
	registrarConsignacao,
	marcarDevolvida,
	marcarPerdida,
	marcarVendida,
	listarConsignacoes,
};
