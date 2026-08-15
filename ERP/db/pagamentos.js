const { allAsync, getAsync, runAsync } = require("./conexao");

/* ============ Pagamentos (Pix / Boleto / Dinheiro) ============

Migração SQL (executar uma única vez):

  CREATE TABLE pagamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id INTEGER,
    cliente_id INTEGER,
    metodo TEXT,               -- 'pix' | 'boleto' | 'cartão' | 'dinheiro' | 'outro'
    numero_identificador TEXT, -- TXID Pix, número do boleto, etc.
    data_recebimento DATE,
    valor_recebido NUMERIC(15,2),
    status TEXT DEFAULT 'pendente',
    observacao TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(venda_id) REFERENCES vendas(id),
    FOREIGN KEY(cliente_id) REFERENCES usuarios(id)
  );

================= */

// Retorna todos os pagamentos (opcionalmente filtrado por método)
async function getAll(metodo) {
  let sql = `SELECT p.id, p.data_recebimento, p.valor_recebido, p.metodo, p.numero_identificador,
                    p.status, p.observacao,
                    v.numero_venda, v.data_venda, v.cliente_id,
                    u.nome AS cliente_nome
             FROM pagamentos p
             LEFT JOIN vendas v ON p.venda_id = v.id
             LEFT JOIN usuarios u ON v.cliente_id = u.id`;
  let where = "";
  let params = [];
  if (metodo) {
    where = " WHERE p.metodo = ?";
    params.push(metodo);
  }
  sql += where + " ORDER BY p.data_recebimento DESC";
  return await allAsync(sql, params);
}

// Retorna um pagamento pelo ID
async function getById(id) {
  const sql = `SELECT p.id, p.data_recebimento, p.valor_recebido, p.metodo, p.numero_identificador,
                      p.status, p.observacao,
                    v.numero_venda, v.data_venda, v.cliente_id,
                    u.nome AS cliente_nome
             FROM pagamentos p
             LEFT JOIN vendas v ON p.venda_id = v.id
             LEFT JOIN usuarios u ON v.cliente_id = u.id
             WHERE p.id = ?`;
  const rows = await allAsync(sql, [id]);
  return rows[0];
}

// Registra um novo recebimento
async function registrar(vendaId, clienteId, metodo, numeroIdentificador, dataRecebimento, valorRecebido, status, observacao) {
  const result = await runAsync(
    `INSERT INTO pagamentos (venda_id, cliente_id, metodo, numero_identificador, data_recebimento, valor_recebido, status, observacao, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [vendaId, clienteId, metodo, numeroIdentificador, dataRecebimento, valorRecebido, status || "pendente", observacao || ""]
  );
  return result.lastID;
}

// Altera o status de um pagamento para 'recebido'
async function pagar(id) {
  return await runAsync("UPDATE pagamentos SET status = 'recebido' WHERE id = ?", [id]);
}

// Lista pagamentos filtrados pelo método (pix, boleto, etc.)
async function listarPorMetodo(metodo) {
  return await getAll(metodo);
}

// Lista apenas os pagamentos com status 'pendente'
async function listarPendentes() {
  const sql = `SELECT p.id, p.data_recebimento, p.valor_recebido, p.metodo, p.numero_identificador,
                     v.numero_venda, u.nome AS cliente_nome
              FROM pagamentos p
              LEFT JOIN vendas v ON p.venda_id = v.id
              LEFT JOIN usuarios u ON v.cliente_id = u.id
              WHERE p.status = 'pendente'
              ORDER BY p.data_recebimento ASC`;
  return await allAsync(sql);
}

module.exports = { getAll, getById, registrar, pagar, listarPorMetodo, listarPendentes };