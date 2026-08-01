const sqlite3 = require('@journeyapps/sqlcipher').verbose();
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { app } = require('electron');

let DB_PATH = path.join(__dirname, 'erp_jiujitsu.sqlite');

function setDBPath(basePath) {
  DB_PATH = path.join(basePath, 'erp_jiujitsu.sqlite');
}

let db = null;
let currentKey = null;
let dbReady = Promise.resolve();

function derivarChave(senha) {
  return crypto.createHash('sha256').update('erp_jiujitsu:' + String(senha)).digest('hex');
}

function runOn(conn, sql, params = []) {
  return new Promise((resolver, rejeitar) => {
    conn.run(sql, params, function (erro) {
      if (erro) return rejeitar(erro);
      resolver(this);
    });
  });
}

function fecharConn(conn) {
  return new Promise((resolver) => {
    conn.close(() => resolver());
  });
}

function abrirBanco(key) {
  return new Promise((resolver, rejeitar) => {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const conn = new sqlite3.Database(DB_PATH, (erro) => {
      if (erro) return rejeitar(erro);

      const validar = () => {
        conn.run('PRAGMA foreign_keys = ON');
        conn.get('SELECT count(*) AS n FROM sqlite_master', [], (e) => {
          if (e) {
            fecharConn(conn).then(() => rejeitar(e));
          } else {
            resolver(conn);
          }
        });
      };

      if (key) {
        conn.run("PRAGMA key = '" + key + "'", (e2) => {
          if (e2) {
            fecharConn(conn).then(() => rejeitar(e2));
          } else {
            validar();
          }
        });
      } else {
        validar();
      }
    });
  });
}

async function migrarParaCriptografado(key) {
  const tmpPath = DB_PATH + '.enc';
  try {
    const conn = await abrirBanco(null); // abre banco em texto plano
    await runOn(conn, "ATTACH DATABASE '" + tmpPath.replace(/'/g, "''") + "' AS encrypted KEY '" + key + "'");
    await runOn(conn, "SELECT sqlcipher_export('encrypted')");
    await runOn(conn, "DETACH DATABASE encrypted");
    await fecharConn(conn);
    fs.copyFileSync(tmpPath, DB_PATH);
    fs.unlinkSync(tmpPath);
    console.log('Banco migrado para SQLCipher (criptografado).');
  } catch (erro) {
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath); } catch (e) { /* ignora */ }
    }
    throw erro;
  }
}

async function desbloquearBanco(senha) {
  if (db) return { success: true, jaDesbloqueado: true };

  const key = derivarChave(senha);
  try {
    db = await abrirBanco(key);
  } catch (e1) {
    // Tenta migrar banco antigo em texto plano
    try {
      await migrarParaCriptografado(key);
      db = await abrirBanco(key);
    } catch (e2) {
      db = null;
      throw new Error('Senha incorreta ou banco de dados ilegível.');
    }
  }

  currentKey = key;
  await iniciarBanco();
  console.log('Banco de dados desbloqueado em:', DB_PATH);
  return { success: true };
}

async function trocarChave(novaSenha) {
  const conn = getConexao();
  const novaKey = derivarChave(novaSenha);
  await runOn(conn, "PRAGMA rekey = '" + novaKey + "'");
  currentKey = novaKey;
  return { success: true };
}

function isDesbloqueado() {
  return db !== null;
}

function getConexao() {
  if (!db) {
    throw new Error('Banco de dados bloqueado. Faça login para desbloquear.');
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
        `, (erro2) => {
          if (erro2) return rejeitar(erro2);

          conexao.run(`
            CREATE TABLE IF NOT EXISTS Clientes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              nome TEXT NOT NULL,
              telefone TEXT,
              academia TEXT,
              faixa TEXT
            )
          `, (erro3) => {
            if (erro3) return rejeitar(erro3);

            conexao.run(`
              CREATE TABLE IF NOT EXISTS Vendas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id INTEGER,
                total REAL NOT NULL,
                forma_pagamento TEXT,
                data_venda TEXT,
                FOREIGN KEY (cliente_id) REFERENCES Clientes(id) ON DELETE SET NULL
              )
            `, (erro4) => {
              if (erro4) return rejeitar(erro4);

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
              `, (erro5) => {
                if (erro5) return rejeitar(erro5);
                resolver();
              });
            });
          });
        });
      });
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
  desbloquearBanco,
  trocarChave,
  isDesbloqueado,
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
  getItensVenda,
  getEstoqueNegativo,
  exportBackup,
  importBackup,
  backupAutomatico,
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
  const dbDir = path.dirname(DB_PATH);
  const backupDir = path.join(dbDir, "backups");

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const destino = path.join(backupDir, "backup_" + Date.now() + ".sqlite");

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

        abrirBanco(currentKey)
          .then((conn) => {
            db = conn;
            resolver({ success: true, message: "Backup restaurado com sucesso." });
          })
          .catch((e) => rejeitar("Backup restaurado, mas não foi possível reabrir o banco: " + e.message));
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

async function getItensVenda(vendaId) {
  const conn = getConexao();
  return new Promise((resolver, rejeitar) => {
    const sql =
      "SELECT p.nome AS produto_nome, v.tamanho, v.cor, v.sku, iv.quantidade, iv.preco_unitario, (iv.quantidade * iv.preco_unitario) AS subtotal FROM ItensVenda iv JOIN Variacoes v ON v.id = iv.variacao_id JOIN Produtos p ON p.id = v.produto_id WHERE iv.venda_id = ? ORDER BY iv.id";
    conn.all(sql, [vendaId], (erro, linhas) => {
      if (erro) return rejeitar(erro.message);
      resolver(linhas);
    });
  });
}

async function getEstoqueNegativo() {
  const conn = getConexao();
  return new Promise((resolver, rejeitar) => {
    const sql =
      "SELECT p.nome AS produto_nome, v.sku, v.tamanho, v.cor, v.quantidade_estoque FROM Variacoes v JOIN Produtos p ON p.id = v.produto_id WHERE v.quantidade_estoque < 0 ORDER BY v.quantidade_estoque ASC";
    conn.all(sql, [], (erro, linhas) => {
      if (erro) return rejeitar(erro.message);
      resolver(linhas);
    });
  });
}

function backupAutomatico() {
  const fs = require("fs");
  const origem = DB_PATH;
  const dbDir = path.dirname(DB_PATH);
  const backupDir = path.join(dbDir, "backups");

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const dataHoje = new Date().toISOString().slice(0, 10);
  const destino = path.join(backupDir, "backup_" + dataHoje + ".sqlite");

  if (fs.existsSync(destino)) {
    return destino;
  }

  fs.copyFileSync(origem, destino);
  return destino;
}