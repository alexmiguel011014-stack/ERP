const { allAsync, runAsync } = require("./conexao");

// Pagamentos (Pix / Boleto / Dinheiro / Cartão) — recebimentos vinculados a uma venda.
// Tabela criada em db/schema.js:iniciarBanco().

const SELECT_BASE = `SELECT p.id, p.data_recebimento, p.valor_recebido, p.metodo, p.numero_identificador,
                    p.status, p.observacao,
                    v.id AS numero_venda, v.data_venda, v.cliente_id,
                    c.nome AS cliente_nome
             FROM Pagamentos p
             LEFT JOIN Vendas v ON p.venda_id = v.id
             LEFT JOIN Clientes c ON v.cliente_id = c.id`;

// Retorna todos os pagamentos (opcionalmente filtrado por método)
async function listarPagamentos(metodo) {
	let sql = SELECT_BASE;
	const params = [];
	if (metodo) {
		sql += " WHERE p.metodo = ?";
		params.push(metodo);
	}
	sql += " ORDER BY p.data_recebimento DESC";
	return await allAsync(sql, params);
}

// Registra um novo recebimento
async function registrarPagamento(dados) {
	const {
		venda_id,
		cliente_id,
		metodo,
		numero_identificador,
		data_recebimento,
		valor_recebido,
		status,
		observacao,
	} = dados;
	const result = await runAsync(
		`INSERT INTO Pagamentos (venda_id, cliente_id, metodo, numero_identificador, data_recebimento, valor_recebido, status, observacao, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
		[
			venda_id,
			cliente_id || null,
			metodo,
			numero_identificador,
			data_recebimento,
			valor_recebido,
			status || "pendente",
			observacao || "",
		],
	);
	return result.lastID;
}

// Altera o status de um pagamento para 'recebido'
async function pagarPagamento(id) {
	return await runAsync(
		"UPDATE Pagamentos SET status = 'recebido' WHERE id = ?",
		[id],
	);
}

// Lista apenas os pagamentos com status 'pendente'
async function listarPagamentosPendentes() {
	const sql = `SELECT p.id, p.data_recebimento, p.valor_recebido, p.metodo, p.numero_identificador,
                     v.id AS numero_venda, c.nome AS cliente_nome
              FROM Pagamentos p
              LEFT JOIN Vendas v ON p.venda_id = v.id
              LEFT JOIN Clientes c ON v.cliente_id = c.id
              WHERE p.status = 'pendente'
              ORDER BY p.data_recebimento ASC`;
	return await allAsync(sql);
}

module.exports = {
	listarPagamentos,
	registrarPagamento,
	pagarPagamento,
	listarPagamentosPendentes,
};
