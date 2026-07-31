const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { app } = require('electron');

let DB_PATH = path.join(__dirname, 'erp_jiujitsu.sqlite');

function setDBPath(basePath) {
  DB_PATH = path.join(basePath, 'erp_jiujitsu.sqlite');
}

let db = null;

function getConexao() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (erro) => {
      if (erro) {
        console.error('Erro ao conectar ao banco de dados:', erro.message);
      } else {
        db.run('PRAGMA foreign_keys = ON');
        console.log('Banco de dados SQLite conectado em:', DB_PATH);
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

function getDBPath() {
  return DB_PATH;
}

module.exports = {
  db: getConexao,
  iniciarBanco,
  getConexao,
  salvarProduto,
  buscarSKU,
  finalizarVenda,
  setDBPath,
  getDBPath,
  getDashboardStats,
  getClientes,
  salvarCliente,
  removerCliente,
  buscarCliente,
  getVendas,
  getVendasHoje,
  exportBackup,
  importBackup,
};

function getClientes() {
  const conn = getConexao();
  return new Promise((resolver, rejeitar) => {
    conn.all("SELECT * FROM Clientes ORDER BY nome", [], (erro, linhas) => {
      if (erro) return rejeitar(erro.message);
      resolver(linhas);
    });
  });
}

async function salvarCliente(dados) {
  const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
      const conn = getConexao();
      conn.run(sql, params, function (erro) {
        if (erro) return reject(erro);
        resolve(this);
      });
    });

  await run("BEGIN TRANSACTION");
  try {
    const result = await run(
      "INSERT INTO Clientes (nome, telefone, academia, faixa) VALUES (?, ?, ?, ?)",
      [dados.nome, dados.telefone || null, dados.academia || null, dados.faixa || null]
    );
    await run("COMMIT");
    return { success: true, clienteId: result.lastID };
  } catch (erro) {
    await run("ROLLBACK");
    throw erro;
  }
}

async function removerCliente(id) {
  const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
      const conn = getConexao();
      conn.run(sql, params, function (erro) {
        if (erro) return reject(erro);
        resolve(this);
      });
    });

  await run("BEGIN TRANSACTION");
  try {
    await run("DELETE FROM Clientes WHERE id = ?", [id]);
    await run("COMMIT");
    return { success: true };
  } catch (erro) {
    await run("ROLLBACK");
    throw erro;
  }
}

async function buscarCliente(filtro) {
  const conn = getConexao();
  return new Promise((resolver, rejeitar) => {
    const sql = "SELECT * FROM Clientes WHERE nome LIKE ? OR telefone LIKE ?";
    const param = "%" + filtro + "%";
    conn.all(sql, [param, param], (erro, linhas) => {
      if (erro) return rejeitar(erro.message);
      resolver(linhas);
    });
  });
}

async function getVendas(filtroData) {
  const conn = getConexao();
  return new Promise((resolver, rejeitar) => {
    let sql = "SELECT v.id, v.total, v.forma_pagamento, v.data_venda, c.nome AS cliente_nome FROM Vendas v LEFT JOIN Clientes c ON c.id = v.cliente_id";
    const params = [];

    if (filtroData) {
      sql += " WHERE DATE(v.data_venda) = ?";
      params.push(filtroData);
    }

    sql += " ORDER BY v.data_venda DESC LIMIT 100";

    conn.all(sql, params, (erro, linhas) => {
      if (erro) return rejeitar(erro.message);
      resolver(linhas);
    });
  });
}

async function getVendasHoje() {
  const conn = getConexao();
  const hoje = new Date().toISOString().slice(0, 10);
  return new Promise((resolver, rejeitar) => {
    conn.all(
      "SELECT v.id, v.total, v.forma_pagamento, c.nome AS cliente_nome FROM Vendas v LEFT JOIN Clientes c ON c.id = v.cliente_id WHERE DATE(v.data_venda) = ? ORDER BY v.data_venda DESC",
      [hoje],
      (erro, linhas) => {
        if (erro) return rejeitar(erro.message);
        resolver(linhas);
      }
    );
  });
}

function exportBackup() {
  const fs = require("fs");
  const origem = DB_PATH;
  const destino = path.join(__dirname, "data", "backup_" + Date.now() + ".sqlite");

  if (!fs.existsSync(path.join(__dirname, "data"))) {
    fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
  }

  fs.copyFileSync(origem, destino);
  return destino;
}

async function importBackup(caminhoArquivo) {
  const fs = require("fs");
  const conn = getConexao();

  return new Promise((resolver, rejeitar) => {
    fs.readFile(caminhoArquivo, (erroLeitura, dados) => {
      if (erroLeitura) return rejeitar(erroLeitura.message);

      const tmpPath = DB_PATH + ".tmp";
      fs.writeFileSync(tmpPath, dados);

      conn.close((errClose) => {
        if (errClose) return rejeitar(errClose.message);

        db = null;
        fs.copyFileSync(tmpPath, DB_PATH);
        fs.unlinkSync(tmpPath);

        resolver({ success: true, message: "Backup restaurado com sucesso." });
      });
    });
  });
}

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

  const totalVendas = await get(
    "SELECT COUNT(*) AS total FROM Vendas WHERE DATE(data_venda) = ?",
    [hoje]
  );

  const somaTotal = await get(
    "SELECT COALESCE(SUM(total), 0) AS soma FROM Vendas WHERE DATE(data_venda) = ?",
    [hoje]
  );

  const totalProdutos = await get(
    "SELECT COUNT(*) AS total FROM Produtos"
  );

  const estoqueBaixo = await all(
    "SELECT COUNT(*) AS total FROM Variacoes WHERE quantidade_estoque > 0 AND quantidade_estoque <= 5"
  );

  return {
    vendasHoje: totalVendas.total,
    faturamentoHoje: somaTotal.soma,
    totalProdutos: totalProdutos.total,
    estoqueBaixo: estoqueBaixo[0].total,
  };
}