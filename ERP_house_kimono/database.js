const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'erp_jiujitsu.sqlite');

let db = null;

function getConexao() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (erro) => {
      if (erro) {
        console.error('Erro ao conectar ao banco de dados:', erro.message);
      } else {
        db.run('PRAGMA foreign_keys = ON');
        console.log('Banco de dados SQLite conectado com sucesso.');
      }
    });
  }
  return db;
}

function runAsync(sql, params = []) {
  const conexao = getConexao();
  return new Promise((resolver, rejeitar) => {
    conexao.run(sql, params, function (erro) {
      if (erro) return rejeitar(erro);
      resolver(this);
    });
  });
}

function getAsync(sql, params = []) {
  const conexao = getConexao();
  return new Promise((resolver, rejeitar) => {
    conexao.get(sql, params, (erro, linha) => {
      if (erro) return rejeitar(erro);
      resolver(linha);
    });
  });
}

function iniciarBanco() {
  const conexao = getConexao();

  return new Promise((resolver, rejeitar) => {
    conexao.serialize(() => {
      conexao.run(`
        CREATE TABLE IF NOT EXISTS Produtos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          categoria TEXT
        )
      `, (erro) => {
        if (erro) return rejeitar(erro);
      });

      conexao.run(`
        CREATE TABLE IF NOT EXISTS Variacoes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          produto_id INTEGER NOT NULL,
          sku TEXT UNIQUE NOT NULL,
          tamanho TEXT,
          cor TEXT,
          preco REAL NOT NULL,
          quantidade_estoque INTEGER DEFAULT 0,
          FOREIGN KEY (produto_id) REFERENCES Produtos(id) ON DELETE CASCADE
        )
      `, (erro) => {
        if (erro) return rejeitar(erro);
      });

      conexao.run(`
        CREATE TABLE IF NOT EXISTS Clientes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          telefone TEXT,
          academia TEXT,
          faixa TEXT
        )
      `, (erro) => {
        if (erro) return rejeitar(erro);
      });

      conexao.run(`
        CREATE TABLE IF NOT EXISTS Vendas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_id INTEGER,
          total REAL NOT NULL,
          forma_pagamento TEXT,
          data_venda TEXT,
          FOREIGN KEY (cliente_id) REFERENCES Clientes(id) ON DELETE SET NULL
        )
      `, (erro) => {
        if (erro) return rejeitar(erro);
      });

      conexao.run(`
        CREATE TABLE IF NOT EXISTS ItensVenda (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          venda_id INTEGER NOT NULL,
          variacao_id INTEGER NOT NULL,
          quantidade INTEGER NOT NULL,
          preco_unitario REAL NOT NULL,
          FOREIGN KEY (venda_id) REFERENCES Vendas(id) ON DELETE CASCADE,
          FOREIGN KEY (variacao_id) REFERENCES Variacoes(id) ON DELETE RESTRICT
        )
      `, (erro) => {
        if (erro) return rejeitar(erro);
      });

      resolver();
    });
  });
}

async function salvarProduto(produto, variacoes) {
  const conn = getConexao();

  const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
      conn.run(sql, params, function (erro) {
        if (erro) return reject(erro);
        resolve(this);
      });
    });

  await run('BEGIN TRANSACTION');

  try {
    const result = await run(
      'INSERT INTO Produtos (nome, categoria) VALUES (?, ?)',
      [produto.nome, produto.categoria || null]
    );
    const produtoId = result.lastID;

    for (const v of variacoes) {
      await run(
        'INSERT INTO Variacoes (produto_id, sku, tamanho, cor, preco, quantidade_estoque) VALUES (?, ?, ?, ?, ?, ?)',
        [produtoId, v.sku, v.tamanho, v.cor, v.preco, v.quantidade_estoque]
      );
    }

    await run('COMMIT');
    return { success: true, produtoId };
  } catch (erro) {
    await run('ROLLBACK');
    throw erro;
  }
}
async function buscarSKU(sku) {
  const conn = getConexao();

  const get = (sql, params = []) =>
    new Promise((resolve, reject) => {
      conn.get(sql, params, (erro, linha) => {
        if (erro) return reject(erro);
        resolve(linha);
      });
    });

  const row = await get(
    `SELECT v.id AS variacao_id, p.nome, v.tamanho, v.cor, v.preco, v.quantidade_estoque, v.sku
     FROM Variacoes v
     JOIN Produtos p ON p.id = v.produto_id
     WHERE v.sku = ?`,
    [sku]
  );

  return row || null;
}

async function finalizarVenda(dados) {
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
    const result = await run(
      "INSERT INTO Vendas (cliente_id, total, forma_pagamento, data_venda) VALUES (?, ?, ?, ?)",
      [null, dados.total, dados.forma_pagamento, new Date().toISOString()]
    );
    const vendaId = result.lastID;

    for (const item of dados.itens) {
      await run(
        "INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)",
        [vendaId, item.variacao_id, item.quantidade, item.preco_unitario]
      );

      await run(
        "UPDATE Variacoes SET quantidade_estoque = quantidade_estoque - ? WHERE id = ?",
        [item.quantidade, item.variacao_id]
      );
    }

    await run("COMMIT");
    return { success: true, vendaId };
  } catch (erro) {
    await run("ROLLBACK");
    throw erro;
  }
}

module.exports = {
  db: getConexao,
  iniciarBanco,
  getConexao,
  salvarProduto,
  buscarSKU,
  finalizarVenda,
};