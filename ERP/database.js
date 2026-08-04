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

function colunasDaTabela(conn, tabela) {
  return new Promise((resolver, rejeitar) => {
    conn.all('PRAGMA table_info(' + tabela + ')', [], (erro, linhas) => {
      if (erro) return rejeitar(erro);
      resolver(linhas.map((l) => l.name));
    });
  });
}

async function migrarColunas(conn, tabela, colunas) {
  const existentes = await colunasDaTabela(conn, tabela);
  for (const nome of Object.keys(colunas)) {
    if (existentes.indexOf(nome) === -1) {
      await runOn(conn, 'ALTER TABLE ' + tabela + ' ADD COLUMN ' + colunas[nome]);
    }
  }
}

function allAsync(sql, params = []) {
  const conexao = getConexao();
  return new Promise((resolver, rejeitar) => {
    conexao.all(sql, params, (erro, linhas) => {
      if (erro) return rejeitar(erro);
      resolver(linhas);
    });
  });
}

function obterAtributoLegado(atributos, chaveProcurada) {
  if (!Array.isArray(atributos)) return null;
  const alvo = chaveProcurada.toLowerCase();
  for (const a of atributos) {
    if (a && a.chave && a.valor && String(a.chave).trim().toLowerCase() === alvo) {
      return String(a.valor).trim();
    }
  }
  return null;
}

async function iniciarBanco() {
  const conexao = getConexao();

  await runOn(conexao, `
    CREATE TABLE IF NOT EXISTS Categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      categoria_pai_id INTEGER,
      FOREIGN KEY (categoria_pai_id) REFERENCES Categorias(id) ON DELETE CASCADE
    )
  `);

  await runOn(conexao, `
    CREATE TABLE IF NOT EXISTS Produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      categoria TEXT,
      categoria_id INTEGER,
      subcategoria_id INTEGER,
      FOREIGN KEY (categoria_id) REFERENCES Categorias(id) ON DELETE SET NULL,
      FOREIGN KEY (subcategoria_id) REFERENCES Categorias(id) ON DELETE SET NULL
    )
  `);

  await runOn(conexao, `
    CREATE TABLE IF NOT EXISTS Variacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      tamanho TEXT,
      cor TEXT,
      preco REAL NOT NULL,
      preco_custo REAL NOT NULL DEFAULT 0,
      quantidade_estoque INTEGER DEFAULT 0,
      atributos TEXT,
      FOREIGN KEY (produto_id) REFERENCES Produtos(id) ON DELETE CASCADE
    )
  `);

  await runOn(conexao, `
    CREATE TABLE IF NOT EXISTS Clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT,
      academia TEXT,
      faixa TEXT
    )
  `);

  await runOn(conexao, `
    CREATE TABLE IF NOT EXISTS Vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      total REAL NOT NULL,
      forma_pagamento TEXT,
      data_venda TEXT,
      FOREIGN KEY (cliente_id) REFERENCES Clientes(id) ON DELETE SET NULL
    )
  `);

  await runOn(conexao, `
    CREATE TABLE IF NOT EXISTS ItensVenda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL,
      variacao_id INTEGER NOT NULL,
      quantidade INTEGER NOT NULL,
      preco_unitario REAL NOT NULL,
      FOREIGN KEY (venda_id) REFERENCES Vendas(id) ON DELETE CASCADE,
      FOREIGN KEY (variacao_id) REFERENCES Variacoes(id) ON DELETE RESTRICT
    )
  `);

  // Tabela de junção: um produto pode ter várias categorias/atributos
  // (tamanhos A1/A2/A3, cores Azul/Branco, etc.) selecionados em checklist.
  await runOn(conexao, `
    CREATE TABLE IF NOT EXISTS ProdutoCategorias (
      produto_id INTEGER NOT NULL,
      categoria_id INTEGER NOT NULL,
      PRIMARY KEY (produto_id, categoria_id),
      FOREIGN KEY (produto_id) REFERENCES Produtos(id) ON DELETE CASCADE,
      FOREIGN KEY (categoria_id) REFERENCES Categorias(id) ON DELETE CASCADE
    )
  `);

  await runOn(conexao, `
    CREATE TABLE IF NOT EXISTS Configuracao (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    )
  `);

  await runOn(conexao, `
    CREATE TABLE IF NOT EXISTS Precificacao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL UNIQUE,
      preco_custo REAL NOT NULL DEFAULT 0,
      impostos_extras REAL NOT NULL DEFAULT 0,
      margem_percentual REAL,
      preco_venda REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'pendente',
      FOREIGN KEY (produto_id) REFERENCES Produtos(id) ON DELETE CASCADE
    )
  `);

  // Margem padrão global inicial (se não existir)
  await runOn(conexao,
    "INSERT OR IGNORE INTO Configuracao (chave, valor) VALUES ('margem_padrao', '40')"
  );

  // Migração de bancos existentes (cria as colunas novas se ausentes).
  await migrarColunas(conexao, 'Produtos', {
    categoria_id: 'categoria_id INTEGER REFERENCES Categorias(id) ON DELETE SET NULL',
    subcategoria_id: 'subcategoria_id INTEGER REFERENCES Categorias(id) ON DELETE SET NULL',
  });
  await migrarColunas(conexao, 'Variacoes', {
    preco_custo: 'preco_custo REAL NOT NULL DEFAULT 0',
    atributos: 'atributos TEXT',
  });
  await migrarColunas(conexao, 'Clientes', {
    cpf_cnpj: 'cpf_cnpj TEXT',
    email: 'email TEXT',
  });
}

async function salvarProduto(produto, variacoes) {
  const conn = getConexao();

  if (!produto || !String(produto.nome || '').trim()) {
    throw new Error('O nome do produto é obrigatório.');
  }
  // Produtos básicos podem ser salvos sem variações; a grade de variações
  // será gerida futuramente na aba comercial.
  variacoes = Array.isArray(variacoes) ? variacoes : [];

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

  await run('BEGIN TRANSACTION');

  try {
    // SKUs únicos: sem duplicatas na grade e sem conflito com o banco.
    const skusVistos = new Set();
    for (const v of variacoes) {
      const sku = String(v.sku || '').trim().toUpperCase();
      if (!sku) throw new Error('Todas as variações precisam de um SKU.');
      const preco = Number(v.preco);
      const precoCusto = Number(v.preco_custo || 0);
      const estoque = Number(v.quantidade_estoque);
      const atributos = Array.isArray(v.atributos) ? v.atributos : [];
      if (!Number.isFinite(preco) || preco < 0) throw new Error('Preço de venda inválido.');
      if (!Number.isFinite(precoCusto) || precoCusto < 0) throw new Error('Preço de custo inválido.');
      if (!Number.isInteger(estoque) || estoque < 0) throw new Error('Estoque inválido.');
      if (atributos.length === 0) throw new Error('Cada variação precisa de pelo menos um atributo.');
      if (atributos.some((a) => !a || !String(a.chave || '').trim() || !String(a.valor || '').trim())) {
        throw new Error('Todos os atributos precisam de chave e valor.');
      }
      if (skusVistos.has(sku)) throw new Error('SKU duplicado na grade: ' + sku);
      skusVistos.add(sku);
      const existente = await get('SELECT id FROM Variacoes WHERE UPPER(sku) = ?', [sku]);
      if (existente) throw new Error('Já existe uma variação com o SKU: ' + sku);
    }

    // Integridade da subcategoria: precisa pertencer à categoria escolhida.
    if (produto.categoria_id && produto.subcategoria_id) {
      const sub = await get('SELECT id, categoria_pai_id FROM Categorias WHERE id = ?', [produto.subcategoria_id]);
      if (!sub || sub.categoria_pai_id !== produto.categoria_id) {
        throw new Error('A subcategoria selecionada não pertence à categoria escolhida.');
      }
    }

    const result = await run(
      'INSERT INTO Produtos (nome, categoria, categoria_id, subcategoria_id) VALUES (?, ?, ?, ?)',
      [produto.nome, produto.categoria || null, produto.categoria_id || null, produto.subcategoria_id || null]
    );
    const produtoId = result.lastID;

    // Associa as categorias/atributos selecionados no checklist (múltipla seleção).
    // Cria a tabela de junção se o banco foi aberto por uma versão antiga do app
    // (migração defensive - normalmente criada em iniciarBanco).
    await run(
      `CREATE TABLE IF NOT EXISTS ProdutoCategorias (
        produto_id INTEGER NOT NULL,
        categoria_id INTEGER NOT NULL,
        PRIMARY KEY (produto_id, categoria_id),
        FOREIGN KEY (produto_id) REFERENCES Produtos(id) ON DELETE CASCADE,
        FOREIGN KEY (categoria_id) REFERENCES Categorias(id) ON DELETE CASCADE
      )`
    );
    const categoriasSelecionadas = Array.isArray(produto.categoriasSelecionadas)
      ? produto.categoriasSelecionadas
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      : [];
    for (const catId of categoriasSelecionadas) {
      await run(
        'INSERT OR IGNORE INTO ProdutoCategorias (produto_id, categoria_id) VALUES (?, ?)',
        [produtoId, catId]
      );
    }

    // Sincronização automática: insere produto na tabela de precificação
    // com status 'pendente' (preço de custo e venda vêm das variações).
    await run(
      `CREATE TABLE IF NOT EXISTS Precificacao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER NOT NULL UNIQUE,
        preco_custo REAL NOT NULL DEFAULT 0,
        impostos_extras REAL NOT NULL DEFAULT 0,
        margem_percentual REAL,
        preco_venda REAL NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        FOREIGN KEY (produto_id) REFERENCES Produtos(id) ON DELETE CASCADE
      )`
    );
    await run(
      'INSERT OR IGNORE INTO Precificacao (produto_id, preco_custo, impostos_extras, preco_venda, status) VALUES (?, 0, 0, 0, ?)',
      [produtoId, 'pendente']
    );

    for (const v of variacoes) {
      const atributos = Array.isArray(v.atributos) ? v.atributos : [];
      // Fallback legado: se os atributos contêm Tamanho/Cor, espelha nas colunas antigas.
      const tamanho = obterAtributoLegado(atributos, 'tamanho') || v.tamanho || null;
      const cor = obterAtributoLegado(atributos, 'cor') || v.cor || null;
      await run(
        'INSERT INTO Variacoes (produto_id, sku, tamanho, cor, preco, preco_custo, quantidade_estoque, atributos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          produtoId,
          String(v.sku).trim().toUpperCase(),
          tamanho,
          cor,
          v.preco,
          v.preco_custo || 0,
          v.quantidade_estoque,
          JSON.stringify(atributos),
        ]
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
    `SELECT v.id AS variacao_id, p.nome, p.categoria AS categoria_legada,
            c.nome AS categoria_nome, s.nome AS subcategoria_nome,
            v.tamanho, v.cor, v.preco, v.preco_custo, v.quantidade_estoque, v.sku, v.atributos
     FROM Variacoes v
     JOIN Produtos p ON p.id = v.produto_id
     LEFT JOIN Categorias c ON c.id = p.categoria_id
     LEFT JOIN Categorias s ON s.id = p.subcategoria_id
     WHERE UPPER(v.sku) = ?`,
    [String(sku).trim().toUpperCase()]
  );

  return row || null;
}

function validarVariacao(v) {
  const sku = String(v.sku || '').trim().toUpperCase();
  if (!sku) throw new Error('Todas as variações precisam de um SKU.');
  const preco = Number(v.preco);
  const precoCusto = Number(v.preco_custo || 0);
  const estoque = Number(v.quantidade_estoque);
  const atributos = Array.isArray(v.atributos) ? v.atributos : [];
  if (!Number.isFinite(preco) || preco < 0) throw new Error('Preço de venda inválido.');
  if (!Number.isFinite(precoCusto) || precoCusto < 0) throw new Error('Preço de custo inválido.');
  if (!Number.isInteger(estoque) || estoque < 0) throw new Error('Estoque inválido.');
  if (atributos.length === 0) throw new Error('Cada variação precisa de pelo menos um atributo.');
  if (atributos.some((a) => !a || !String(a.chave || '').trim() || !String(a.valor || '').trim())) {
    throw new Error('Todos os atributos precisam de chave e valor.');
  }
  return { sku, preco, precoCusto, estoque, atributos };
}

async function listProdutosDetalhados() {
  const conn = getConexao();

  const all = (sql, params = []) =>
    new Promise((resolve, reject) => {
      conn.all(sql, params, (erro, linhas) => {
        if (erro) return reject(erro);
        resolve(linhas);
      });
    });

  const produtos = await all(
    `SELECT p.id, p.nome, p.categoria AS categoria_legada,
            c.nome AS categoria_nome, s.nome AS subcategoria_nome,
            p.categoria_id, p.subcategoria_id
     FROM Produtos p
     LEFT JOIN Categorias c ON c.id = p.categoria_id
     LEFT JOIN Categorias s ON s.id = p.subcategoria_id
     ORDER BY p.nome COLLATE NOCASE`
  );
  const variacoes = await all(
    `SELECT v.produto_id, v.id AS variacao_id, v.sku, v.tamanho, v.cor,
            v.preco, v.preco_custo, v.quantidade_estoque, v.atributos
     FROM Variacoes v
     ORDER BY v.id`
  );

  const catsProd = await all(
    `SELECT pc.produto_id, c.id AS categoria_id, c.nome AS categoria_nome,
            c.categoria_pai_id, p.nome AS categoria_pai_nome
     FROM ProdutoCategorias pc
     JOIN Categorias c ON c.id = pc.categoria_id
     LEFT JOIN Categorias p ON p.id = c.categoria_pai_id
     ORDER BY c.nome COLLATE NOCASE`
  );

  return produtos.map((p) => ({
    id: p.id,
    nome: p.nome,
    categoria_legada: p.categoria_legada,
    categoria_nome: p.categoria_nome,
    subcategoria_nome: p.subcategoria_nome,
    categoria_id: p.categoria_id,
    subcategoria_id: p.subcategoria_id,
    categorias_selecionadas: catsProd
      .filter((c) => c.produto_id === p.id)
      .map((c) => ({
        id: c.categoria_id,
        nome: c.categoria_nome,
        categoria_pai_id: c.categoria_pai_id,
        categoria_pai_nome: c.categoria_pai_nome,
      })),
    variacoes: variacoes
      .filter((v) => v.produto_id === p.id)
      .map((v) => ({
        variacao_id: v.variacao_id,
        sku: v.sku,
        tamanho: v.tamanho,
        cor: v.cor,
        preco: v.preco,
        preco_custo: v.preco_custo,
        quantidade_estoque: v.quantidade_estoque,
        atributos: v.atributos,
      })),
  }));
}

async function getProximoCodigoProduto() {
  const conn = getConexao();
  const get = (sql, params = []) =>
    new Promise((resolve, reject) => {
      conn.get(sql, params, (erro, linha) => {
        if (erro) return reject(erro);
        resolve(linha);
      });
    });
  const row = await get('SELECT COALESCE(MAX(id), 0) + 1 AS proximo FROM Produtos');
  return row ? row.proximo : 1;
}

async function getProximoCodigoCategoria() {
  const conn = getConexao();
  const get = (sql, params = []) =>
    new Promise((resolve, reject) => {
      conn.get(sql, params, (erro, linha) => {
        if (erro) return reject(erro);
        resolve(linha);
      });
    });
  const row = await get('SELECT COALESCE(MAX(id), 0) + 1 AS proximo FROM Categorias');
  const n = row ? row.proximo : 1;
  return 'C' + String(n).padStart(4, '0');
}

async function getProximoCodigoCliente() {
  const conn = getConexao();
  const get = (sql, params = []) =>
    new Promise((resolve, reject) => {
      conn.get(sql, params, (erro, linha) => {
        if (erro) return reject(erro);
        resolve(linha);
      });
    });
  const row = await get('SELECT COALESCE(MAX(id), 0) + 1 AS proximo FROM Clientes');
  const n = row ? row.proximo : 1;
  return '#CLI' + String(n).padStart(4, '0');
}

async function atualizarProduto(id, produto, variacoes) {
  const conn = getConexao();

  if (!produto || !String(produto.nome || '').trim()) {
    throw new Error('O nome do produto é obrigatório.');
  }

  const variacoesLista = Array.isArray(variacoes) ? variacoes : [];

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

  await run('BEGIN TRANSACTION');

  try {
    const existente = await get('SELECT id FROM Produtos WHERE id = ?', [id]);
    if (!existente) throw new Error('Produto não encontrado.');

    // Integridade da subcategoria: precisa pertencer à categoria escolhida.
    if (produto.categoria_id && produto.subcategoria_id) {
      const sub = await get('SELECT id, categoria_pai_id FROM Categorias WHERE id = ?', [produto.subcategoria_id]);
      if (!sub || sub.categoria_pai_id !== produto.categoria_id) {
        throw new Error('A subcategoria selecionada não pertence à categoria escolhida.');
      }
    }

    // Substitui as associações de categorias/atributos (checklist de múltipla seleção).
    // Cria a tabela de junção se o banco foi aberto por uma versão antiga do app.
    await run(
      `CREATE TABLE IF NOT EXISTS ProdutoCategorias (
        produto_id INTEGER NOT NULL,
        categoria_id INTEGER NOT NULL,
        PRIMARY KEY (produto_id, categoria_id),
        FOREIGN KEY (produto_id) REFERENCES Produtos(id) ON DELETE CASCADE,
        FOREIGN KEY (categoria_id) REFERENCES Categorias(id) ON DELETE CASCADE
      )`
    );
    const categoriasSelecionadas = Array.isArray(produto.categoriasSelecionadas)
      ? produto.categoriasSelecionadas
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      : [];
    await run('DELETE FROM ProdutoCategorias WHERE produto_id = ?', [id]);
    for (const catId of categoriasSelecionadas) {
      await run(
        'INSERT OR IGNORE INTO ProdutoCategorias (produto_id, categoria_id) VALUES (?, ?)',
        [id, catId]
      );
    }

    if (variacoesLista.length === 0) {
      // Atualização em nível de produto: apenas nome/categoria/subcategoria,
      // preservando as variações existentes (inclusive as com vendas).
      await run(
        'UPDATE Produtos SET nome = ?, categoria = ?, categoria_id = ?, subcategoria_id = ? WHERE id = ?',
        [produto.nome, produto.categoria || null, produto.categoria_id || null, produto.subcategoria_id || null, id]
      );
      await run('COMMIT');
      return { success: true, produtoId: id, variacoesPreservadas: true };
    }

    // Substituição completa de variações (uso futuro da aba comercial).
    const vendido = await get(
      `SELECT COUNT(*) AS n FROM ItensVenda iv
       JOIN Variacoes v ON v.id = iv.variacao_id
       WHERE v.produto_id = ?`,
      [id]
    );
    if (vendido.n > 0) {
      throw new Error('Não é possível editar este produto pois ele possui variações com vendas registradas.');
    }

    // SKUs únicos: sem duplicatas na grade e sem conflito com outros produtos.
    const skusVistos = new Set();
    for (const v of variacoesLista) {
      const { sku } = validarVariacao(v);
      if (skusVistos.has(sku)) throw new Error('SKU duplicado na grade: ' + sku);
      skusVistos.add(sku);
      const outro = await get(
        'SELECT id FROM Variacoes WHERE UPPER(sku) = ? AND produto_id != ?',
        [sku, id]
      );
      if (outro) throw new Error('Já existe uma variação com o SKU: ' + sku);
    }

    await run(
      'UPDATE Produtos SET nome = ?, categoria = ?, categoria_id = ?, subcategoria_id = ? WHERE id = ?',
      [produto.nome, produto.categoria || null, produto.categoria_id || null, produto.subcategoria_id || null, id]
    );
    await run('DELETE FROM Variacoes WHERE produto_id = ?', [id]);

    for (const v of variacoesLista) {
      const { sku, preco, precoCusto, estoque, atributos } = validarVariacao(v);
      // Fallback legado: se os atributos contêm Tamanho/Cor, espelha nas colunas antigas.
      const tamanho = obterAtributoLegado(atributos, 'tamanho') || v.tamanho || null;
      const cor = obterAtributoLegado(atributos, 'cor') || v.cor || null;
      await run(
        'INSERT INTO Variacoes (produto_id, sku, tamanho, cor, preco, preco_custo, quantidade_estoque, atributos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, sku, tamanho, cor, preco, precoCusto, estoque, JSON.stringify(atributos)]
      );
    }

    await run('COMMIT');
    return { success: true, produtoId: id };
  } catch (erro) {
    await run('ROLLBACK');
    throw erro;
  }
}

async function removerProduto(id) {
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

  await run('BEGIN TRANSACTION');

  try {
    const existente = await get('SELECT id FROM Produtos WHERE id = ?', [id]);
    if (!existente) throw new Error('Produto não encontrado.');

    const vendido = await get(
      `SELECT COUNT(*) AS n FROM ItensVenda iv
       JOIN Variacoes v ON v.id = iv.variacao_id
       WHERE v.produto_id = ?`,
      [id]
    );
    if (vendido.n > 0) {
      throw new Error('Este produto não pode ser excluído pois possui variações com vendas registradas.');
    }

    await run('DELETE FROM Variacoes WHERE produto_id = ?', [id]);
    await run('DELETE FROM Produtos WHERE id = ?', [id]);
    await run('COMMIT');
    return { success: true };
  } catch (erro) {
    await run('ROLLBACK');
    throw erro;
  }
}

async function getListCategoriasWithUsage() {
  // Garante a tabela de junção mesmo em bancos abertos antes da migração
  // (p.ex. app em execução antes da atualização que introduziu o checklist).
  await runAsync(
    `CREATE TABLE IF NOT EXISTS ProdutoCategorias (
      produto_id INTEGER NOT NULL,
      categoria_id INTEGER NOT NULL,
      PRIMARY KEY (produto_id, categoria_id),
      FOREIGN KEY (produto_id) REFERENCES Produtos(id) ON DELETE CASCADE,
      FOREIGN KEY (categoria_id) REFERENCES Categorias(id) ON DELETE CASCADE
    )`
  );

  const linhas = await allAsync(
    `SELECT c.id, c.nome, c.categoria_pai_id,
            p.nome AS categoria_pai_nome,
            (SELECT COUNT(*) FROM ProdutoCategorias pc WHERE pc.categoria_id = c.id) AS uso_checklist,
            (SELECT COUNT(*) FROM Produtos pr WHERE pr.categoria_id = c.id OR pr.subcategoria_id = c.id) AS uso_legado
     FROM Categorias c
     LEFT JOIN Categorias p ON p.id = c.categoria_pai_id
     ORDER BY (CASE WHEN c.categoria_pai_id IS NULL THEN 0 ELSE 1 END), c.nome COLLATE NOCASE`
  );

  return linhas.map((l) => ({
    id: l.id,
    codigo: 'C' + String(l.id).padStart(4, '0'),
    nome: l.nome,
    categoria_pai_id: l.categoria_pai_id,
    categoria_pai_nome: l.categoria_pai_nome,
    tipo: l.categoria_pai_id ? 'subcategoria' : 'categoria',
    uso_count: Number(l.uso_checklist || 0) + Number(l.uso_legado || 0),
  }));
}

async function removerCategoria(id) {
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

  await run('BEGIN TRANSACTION');
  try {
    const alvo = await get('SELECT id, categoria_pai_id FROM Categorias WHERE id = ?', [id]);
    if (!alvo) throw new Error('Categoria não encontrada.');

    // Subcategorias: bloqueia se houver vinculações em algum nível.
    const temSub = await get('SELECT id FROM Categorias WHERE categoria_pai_id = ? LIMIT 1', [id]);
    if (temSub) {
      throw new Error('Exclua as subcategorias vinculadas antes de remover esta categoria.');
    }

    const vinculadoChecklist = await get(
      'SELECT COUNT(*) AS n FROM ProdutoCategorias WHERE categoria_id = ?',
      [id]
    );
    const vinculadoLegado = await get(
      'SELECT COUNT(*) AS n FROM Produtos WHERE categoria_id = ? OR subcategoria_id = ?',
      [id, id]
    );
    if ((vinculadoChecklist && vinculadoChecklist.n > 0) || (vinculadoLegado && vinculadoLegado.n > 0)) {
      throw new Error('Categoria vinculada a produtos. Remova as vinculações antes de excluí-la.');
    }

    await run('DELETE FROM Categorias WHERE id = ?', [id]);
    await run('COMMIT');
    return { success: true };
  } catch (erro) {
    await run('ROLLBACK');
    throw erro;
  }
}

/* ============ Precificação ============ */

async function getGlobalMargin() {
  const row = await getAsync(
    "SELECT valor FROM Configuracao WHERE chave = 'margem_padrao'"
  );
  return row ? parseFloat(row.valor) || 40 : 40;
}

async function saveGlobalMargin(valor) {
  await runAsync(
    "INSERT OR REPLACE INTO Configuracao (chave, valor) VALUES ('margem_padrao', ?)",
    [String(valor)]
  );
  return { success: true };
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
     WHERE p.id NOT IN (SELECT produto_id FROM Precificacao)`
  );

  const rows = await all(
    `SELECT pr.id, pr.produto_id, p.nome AS produto_nome, p.categoria_id,
            pr.preco_custo, pr.impostos_extras, pr.margem_percentual,
            pr.preco_venda, pr.status,
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
     ORDER BY p.nome COLLATE NOCASE`
  );

  return rows.map((r) => ({
    id: r.id,
    produto_id: r.produto_id,
    produto_nome: r.produto_nome,
    preco_custo: Number(r.preco_custo || 0),
    impostos_extras: Number(r.impostos_extras || 0),
    margem_percentual: r.margem_percentual !== null ? Number(r.margem_percentual) : null,
    preco_venda: Number(r.preco_venda || 0),
    status: r.status || 'pendente',
    custo_variacao: Number(r.custo_variacao || 0),
    preco_variacao: Number(r.preco_variacao || 0),
    sku_primeiro: r.sku_primeiro || null,
    categorias: r.categorias || null,
  }));
}

async function saveProductMargin(produtoId, margem) {
  const margemVal = margem !== null && margem !== '' ? Number(margem) : null;
  if (margemVal !== null && (!Number.isFinite(margemVal) || margemVal < 0)) {
    throw new Error('Margem inválida.');
  }
  await runAsync(
    'UPDATE Precificacao SET margem_percentual = ?, status = ? WHERE produto_id = ?',
    [margemVal, margemVal !== null ? 'definido' : 'pendente', produtoId]
  );
  return { success: true };
}

async function saveProductPrice(produtoId, precoVenda) {
  const preco = Number(precoVenda);
  if (!Number.isFinite(preco) || preco < 0) throw new Error('Preço inválido.');
  await runAsync(
    'UPDATE Precificacao SET preco_venda = ?, status = ? WHERE produto_id = ?',
    [preco, 'definido', produtoId]
  );
  return { success: true };
}

async function saveProductCost(produtoId, precoCusto) {
  const custo = Number(precoCusto);
  if (!Number.isFinite(custo) || custo < 0) throw new Error('Custo inválido.');
  await runAsync(
    'UPDATE Precificacao SET preco_custo = ? WHERE produto_id = ?',
    [custo, produtoId]
  );
  return { success: true };
}

async function saveProductTaxes(produtoId, valor) {
  const v = Number(valor);
  if (!Number.isFinite(v) || v < 0) throw new Error('Valor inválido.');
  await runAsync(
    'UPDATE Precificacao SET impostos_extras = ? WHERE produto_id = ?',
    [v, produtoId]
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
  await run('BEGIN TRANSACTION');
  try {
    for (const pid of produtoIds) {
      await run(
        'UPDATE Precificacao SET margem_percentual = ?, status = ? WHERE produto_id = ?',
        [margem, 'definido', pid]
      );
    }
    await run('COMMIT');
    return { success: true, count: produtoIds.length };
  } catch (erro) {
    await run('ROLLBACK');
    throw erro;
  }
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
  atualizarProduto,
  removerProduto,
  listProdutosDetalhados,
  getProximoCodigoProduto,
  getProximoCodigoCategoria,
  buscarSKU,
  finalizarVenda,
  setDBPath,
  getDBPath,
  getProximoCodigoCliente,
  getDashboardStats,
  getClientes,
  salvarCliente,
  atualizarCliente,
  removerCliente,
  buscarCliente,
  getVendas,
  getVendasHoje,
  getItensVenda,
  getEstoqueNegativo,
  getCategorias,
  getListCategoriasWithUsage,
  removerCategoria,
  getPricingData,
  getGlobalMargin,
  saveGlobalMargin,
  saveProductMargin,
  saveProductPrice,
  saveProductCost,
  saveProductTaxes,
  massUpdateMargem,
  salvarCategoria,
  salvarCategoriaComSubcategorias,
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
      "INSERT INTO Clientes (nome, cpf_cnpj, telefone, email, academia, faixa) VALUES (?, ?, ?, ?, ?, ?)",
      [dados.nome, dados.cpf_cnpj || null, dados.telefone || null, dados.email || null, dados.academia || null, dados.faixa || null]
    );
    await run("COMMIT");
    return { success: true, clienteId: result.lastID };
  } catch (erro) {
    await run("ROLLBACK");
    throw erro;
  }
}

async function atualizarCliente(id, dados) {
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
    await run(
      "UPDATE Clientes SET nome=?, cpf_cnpj=?, telefone=?, email=?, academia=?, faixa=? WHERE id=?",
      [dados.nome, dados.cpf_cnpj || null, dados.telefone || null, dados.email || null, dados.academia || null, dados.faixa || null, id]
    );
    await run("COMMIT");
    return { success: true };
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
      "SELECT p.nome AS produto_nome, v.tamanho, v.cor, v.atributos, v.sku, iv.quantidade, iv.preco_unitario, (iv.quantidade * iv.preco_unitario) AS subtotal FROM ItensVenda iv JOIN Variacoes v ON v.id = iv.variacao_id JOIN Produtos p ON p.id = v.produto_id WHERE iv.venda_id = ? ORDER BY iv.id";
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
      "SELECT p.nome AS produto_nome, v.sku, v.tamanho, v.cor, v.atributos, v.quantidade_estoque FROM Variacoes v JOIN Produtos p ON p.id = v.produto_id WHERE v.quantidade_estoque < 0 ORDER BY v.quantidade_estoque ASC";
    conn.all(sql, [], (erro, linhas) => {
      if (erro) return rejeitar(erro.message);
      resolver(linhas);
    });
  });
}

async function getCategorias() {
  const linhas = await allAsync('SELECT * FROM Categorias ORDER BY nome');
  const subcategorias = linhas.filter((l) => l.categoria_pai_id);
  return linhas
    .filter((l) => !l.categoria_pai_id)
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      subcategorias: subcategorias
        .filter((s) => s.categoria_pai_id === c.id)
        .map((s) => ({ id: s.id, nome: s.nome })),
    }));
}

async function salvarCategoria(nome, categoriaPaiId) {
  const nomeLimpo = String(nome || '').trim();
  if (!nomeLimpo) throw new Error('Informe o nome da categoria.');

  const paiId = categoriaPaiId || null;
  if (paiId) {
    const pai = await getAsync('SELECT id, categoria_pai_id FROM Categorias WHERE id = ?', [paiId]);
    if (!pai) throw new Error('Categoria pai não encontrada.');
    if (pai.categoria_pai_id) throw new Error('Só é permitido um nível de subcategoria.');
  }

  const existente = await getAsync(
    'SELECT id FROM Categorias WHERE UPPER(nome) = ? AND IFNULL(categoria_pai_id, 0) = ?',
    [nomeLimpo.toUpperCase(), paiId || 0]
  );
  if (existente) throw new Error('Categoria já cadastrada.');

  const result = await runAsync('INSERT INTO Categorias (nome, categoria_pai_id) VALUES (?, ?)', [nomeLimpo, paiId]);
  return { success: true, id: result.lastID };
}

async function salvarCategoriaComSubcategorias(dados) {
  const conn = getConexao();

  const nome = String((dados && dados.nome) || '').trim();
  const paiId = dados && dados.categoriaPaiId ? Number(dados.categoriaPaiId) || null : null;
  const subcategorias = Array.isArray(dados && dados.subcategorias) ? dados.subcategorias : [];

  const nomesSubs = [];
  for (const s of subcategorias) {
    const n = String((s && s.nome) || (typeof s === 'string' ? s : '') || '').trim();
    if (n) nomesSubs.push(n);
  }

  if (!nome && nomesSubs.length === 0) {
    throw new Error('Informe o nome da categoria ou ao menos uma subcategoria.');
  }
  // Máximo de 2 níveis: não é possível criar subcategorias dentro de uma subcategoria.
  if (nome && paiId && nomesSubs.length > 0) {
    throw new Error('Não é possível criar subcategorias dentro de uma subcategoria (máximo de 2 níveis).');
  }

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

  await run('BEGIN TRANSACTION');

  try {
    let pai = null;
    if (paiId) {
      pai = await get('SELECT id, categoria_pai_id FROM Categorias WHERE id = ?', [paiId]);
      if (!pai) throw new Error('Categoria principal não encontrada.');
      if (pai.categoria_pai_id) throw new Error('Só é permitido um nível de subcategoria.');
    }

    const existeDuplicata = async (nomeCandidato, nivelPai) => {
      const dup = await get(
        'SELECT id FROM Categorias WHERE UPPER(nome) = ? AND IFNULL(categoria_pai_id, 0) = ?',
        [nomeCandidato.toUpperCase(), nivelPai]
      );
      return !!dup;
    };

    let paiAlvo = null;
    const criados = [];

    if (nome) {
      if (await existeDuplicata(nome, paiId || 0)) {
        throw new Error('Categoria já cadastrada: ' + nome);
      }
      const result = await run('INSERT INTO Categorias (nome, categoria_pai_id) VALUES (?, ?)', [nome, paiId || null]);
      paiAlvo = result.lastID;
      criados.push(paiAlvo);
    } else {
      // Modo "adicionar subcategorias a uma categoria existente".
      paiAlvo = paiId;
    }

    for (const n of nomesSubs) {
      if (await existeDuplicata(n, paiAlvo)) {
        throw new Error('Subcategoria já cadastrada: ' + n);
      }
      const r = await run('INSERT INTO Categorias (nome, categoria_pai_id) VALUES (?, ?)', [n, paiAlvo]);
      criados.push(r.lastID);
    }

    await run('COMMIT');
    return { success: true, id: paiAlvo, criados };
  } catch (erro) {
    await run('ROLLBACK');
    throw erro;
  }
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
