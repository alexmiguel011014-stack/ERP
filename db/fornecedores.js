const { runAsync, allAsync, getAsync } = require("./conexao");

/* ============ Fornecedores ============ */

async function getFornecedores() {
	return allAsync("SELECT * FROM Fornecedores ORDER BY nome COLLATE NOCASE");
}

async function salvarFornecedor(dados) {
	if (!dados || !String(dados.nome || "").trim())
		throw new Error("O nome do fornecedor é obrigatório.");
	const result = await runAsync(
		"INSERT INTO Fornecedores (nome, cnpj, telefone, email, contato, prazo_pagamento_dias, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)",
		[
			String(dados.nome).trim(),
			dados.cnpj || null,
			dados.telefone || null,
			dados.email || null,
			dados.contato || null,
			Number(dados.prazo_pagamento_dias) || 0,
			dados.observacao || null,
		],
	);
	return { success: true, fornecedorId: result.lastID };
}

async function atualizarFornecedor(id, dados) {
	if (!dados || !String(dados.nome || "").trim())
		throw new Error("O nome do fornecedor é obrigatório.");
	const result = await runAsync(
		"UPDATE Fornecedores SET nome=?, cnpj=?, telefone=?, email=?, contato=?, prazo_pagamento_dias=?, observacao=? WHERE id=?",
		[
			String(dados.nome).trim(),
			dados.cnpj || null,
			dados.telefone || null,
			dados.email || null,
			dados.contato || null,
			Number(dados.prazo_pagamento_dias) || 0,
			dados.observacao || null,
			id,
		],
	);
	if (result.changes === 0) throw new Error("Fornecedor não encontrado.");
	return { success: true };
}

async function removerFornecedor(id) {
	const pedidos = await getAsync(
		"SELECT COUNT(*) AS n FROM PedidosCompra WHERE fornecedor_id = ?",
		[id],
	);
	if (pedidos && pedidos.n > 0) {
		throw new Error(
			"Este fornecedor possui pedidos de compra e não pode ser excluído.",
		);
	}
	await runAsync("DELETE FROM Fornecedores WHERE id = ?", [id]);
	return { success: true };
}

/* ============ Fornecedor x Produto (tabela de preços) ============ */

async function listarProdutosFornecedor(fornecedorId) {
	return allAsync(
		`SELECT fp.id, fp.fornecedor_id, fp.variacao_id, fp.preco_custo,
            fp.prazo_entrega_dias, fp.codigo_fornecedor, fp.observacao,
            v.sku, v.tamanho, v.cor, v.atributos, p.nome AS produto_nome
     FROM FornecedorProdutos fp
     JOIN Variacoes v ON v.id = fp.variacao_id
     JOIN Produtos p ON p.id = v.produto_id
     WHERE fp.fornecedor_id = ?
     ORDER BY p.nome COLLATE NOCASE`,
		[fornecedorId],
	);
}

async function salvarProdutoFornecedor(dados) {
	const fornecedorId = Number(dados && dados.fornecedor_id);
	const variacaoId = Number(dados && dados.variacao_id);
	const precoCusto = Number(dados && dados.preco_custo);
	if (!fornecedorId) throw new Error("Fornecedor inválido.");
	if (!variacaoId) throw new Error("SKU inválido.");
	if (!Number.isFinite(precoCusto) || precoCusto < 0)
		throw new Error("Custo inválido.");
	const prazo =
		dados.prazo_entrega_dias !== undefined &&
		dados.prazo_entrega_dias !== null &&
		dados.prazo_entrega_dias !== ""
			? Number(dados.prazo_entrega_dias)
			: null;

	// Mesmo par fornecedor+SKU já cadastrado -> substitui (sem duplicar linha).
	await runAsync(
		`INSERT OR REPLACE INTO FornecedorProdutos
       (id, fornecedor_id, variacao_id, preco_custo, prazo_entrega_dias, codigo_fornecedor, observacao)
     VALUES (
       (SELECT id FROM FornecedorProdutos WHERE fornecedor_id = ? AND variacao_id = ?),
       ?, ?, ?, ?, ?, ?
     )`,
		[
			fornecedorId,
			variacaoId,
			fornecedorId,
			variacaoId,
			precoCusto,
			prazo,
			dados.codigo_fornecedor || null,
			dados.observacao || null,
		],
	);
	return { success: true };
}

async function removerProdutoFornecedor(id) {
	const result = await runAsync("DELETE FROM FornecedorProdutos WHERE id = ?", [
		id,
	]);
	if (result.changes === 0) throw new Error("Registro não encontrado.");
	return { success: true };
}

async function getCustoFornecedorProduto(fornecedorId, variacaoId) {
	if (!fornecedorId || !variacaoId) return null;
	const row = await getAsync(
		"SELECT preco_custo, prazo_entrega_dias FROM FornecedorProdutos WHERE fornecedor_id = ? AND variacao_id = ?",
		[Number(fornecedorId), Number(variacaoId)],
	);
	return row || null;
}

// Cotação comparativa: todos os fornecedores cadastrados para um SKU,
// ordenados do custo mais barato para o mais caro — usado para escolher com
// quem comprar antes de lançar o pedido.
async function getCotacaoProduto(variacaoId) {
	if (!variacaoId) return [];
	return allAsync(
		`SELECT fp.fornecedor_id, f.nome AS fornecedor_nome, fp.preco_custo,
            fp.prazo_entrega_dias, fp.codigo_fornecedor
     FROM FornecedorProdutos fp
     JOIN Fornecedores f ON f.id = fp.fornecedor_id
     WHERE fp.variacao_id = ?
     ORDER BY fp.preco_custo ASC`,
		[Number(variacaoId)],
	);
}
module.exports = {
	getFornecedores,
	salvarFornecedor,
	atualizarFornecedor,
	removerFornecedor,
	listarProdutosFornecedor,
	salvarProdutoFornecedor,
	removerProdutoFornecedor,
	getCustoFornecedorProduto,
	getCotacaoProduto,
};
