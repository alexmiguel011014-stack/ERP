const sqlite3 = require("@journeyapps/sqlcipher").verbose();
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { app } = require("electron");

let DB_PATH = path.join(__dirname, "erp.sqlite");

function setDBPath(basePath) {
	DB_PATH = path.join(basePath, "erp_housekimono.sqlite");
}

let db = null;
let currentKey = null;
const dbReady = Promise.resolve();

function derivarChave(senha) {
	return crypto
		.createHash("sha256")
		.update("erp_housekimono:" + String(senha))
		.digest("hex");
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
				conn.run("PRAGMA foreign_keys = ON");
				conn.get("SELECT count(*) AS n FROM sqlite_master", [], (e) => {
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
	const tmpPath = DB_PATH + ".enc";
	try {
		const conn = await abrirBanco(null); // abre banco em texto plano
		await runOn(
			conn,
			"ATTACH DATABASE '" +
				tmpPath.replace(/'/g, "''") +
				"' AS encrypted KEY '" +
				key +
				"'",
		);
		await runOn(conn, "SELECT sqlcipher_export('encrypted')");
		await runOn(conn, "DETACH DATABASE encrypted");
		await fecharConn(conn);
		fs.copyFileSync(tmpPath, DB_PATH);
		fs.unlinkSync(tmpPath);
		console.log("Banco migrado para SQLCipher (criptografado).");
	} catch (erro) {
		if (fs.existsSync(tmpPath)) {
			try {
				fs.unlinkSync(tmpPath);
			} catch (e) {
				/* ignora */
			}
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
		// Banco pode ser plaintext (dev/testing). Tenta abrir sem chave.
		try {
			db = await abrirBanco(null);
			currentKey = null;
		} catch (e1b) {
			// Tenta migrar banco antigo em texto plano
			try {
				await migrarParaCriptografado(key);
				db = await abrirBanco(key);
			} catch (e2) {
				db = null;
				throw new Error("Senha incorreta ou banco de dados ilegível.");
			}
		}
	}

	currentKey = key;
	await iniciarBanco();
	console.log("Banco de dados desbloqueado em:", DB_PATH);
	return { success: true };
}

async function bloquearBanco() {
	if (db) await fecharConn(db);
	db = null;
	currentKey = null;
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
		throw new Error("Banco de dados bloqueado. Faça login para desbloquear.");
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
		conn.all("PRAGMA table_info(" + tabela + ")", [], (erro, linhas) => {
			if (erro) return rejeitar(erro);
			resolver(linhas.map((l) => l.name));
		});
	});
}

async function migrarColunas(conn, tabela, colunas) {
	const existentes = await colunasDaTabela(conn, tabela);
	for (const nome of Object.keys(colunas)) {
		if (existentes.indexOf(nome) === -1) {
			await runOn(
				conn,
				"ALTER TABLE " + tabela + " ADD COLUMN " + colunas[nome],
			);
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

// UPPER()/LOWER()/LIKE do SQLite só cobrem ASCII: "Trançado" nunca casa com
// "trançado". Como o catálogo é local e pequeno, a filtragem textual acontece
// em JS sobre o resultado da query, com acentos e caixa normalizados.
function normalizarBusca(texto) {
	return String(texto == null ? "" : texto)
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.trim();
}

function obterAtributoLegado(atributos, chaveProcurada) {
	if (!Array.isArray(atributos)) return null;
	const alvo = chaveProcurada.toLowerCase();
	for (const a of atributos) {
		if (
			a &&
			a.chave &&
			a.valor &&
			String(a.chave).trim().toLowerCase() === alvo
		) {
			return String(a.valor).trim();
		}
	}
	return null;
}

async function iniciarBanco() {
	const conexao = getConexao();

	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS Categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      categoria_pai_id INTEGER,
      FOREIGN KEY (categoria_pai_id) REFERENCES Categorias(id) ON DELETE CASCADE
    )
  `,
	);

	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS Produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      categoria TEXT,
      categoria_id INTEGER,
      subcategoria_id INTEGER,
      FOREIGN KEY (categoria_id) REFERENCES Categorias(id) ON DELETE SET NULL,
      FOREIGN KEY (subcategoria_id) REFERENCES Categorias(id) ON DELETE SET NULL
    )
  `,
	);

	await runOn(
		conexao,
		`
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
  `,
	);

	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS Clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE,
      nome TEXT NOT NULL,
      cpf_cnpj TEXT,
      telefone TEXT,
      email TEXT,
      endereco TEXT,
      academia TEXT,
      faixa TEXT
    )
  `,
	);

	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS Vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      total REAL NOT NULL,
      forma_pagamento TEXT,
      data_venda TEXT,
      FOREIGN KEY (cliente_id) REFERENCES Clientes(id) ON DELETE SET NULL
    )
  `,
	);

	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS ItensVenda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL,
      variacao_id INTEGER NOT NULL,
      quantidade INTEGER NOT NULL,
      preco_unitario REAL NOT NULL,
      FOREIGN KEY (venda_id) REFERENCES Vendas(id) ON DELETE CASCADE,
      FOREIGN KEY (variacao_id) REFERENCES Variacoes(id) ON DELETE RESTRICT
    )
  `,
	);

	// Tabela de junção: um produto pode ter várias categorias/atributos
	// (tamanhos A1/A2/A3, cores Azul/Branco, etc.) selecionados em checklist.
	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS ProdutoCategorias (
      produto_id INTEGER NOT NULL,
      categoria_id INTEGER NOT NULL,
      PRIMARY KEY (produto_id, categoria_id),
      FOREIGN KEY (produto_id) REFERENCES Produtos(id) ON DELETE CASCADE,
      FOREIGN KEY (categoria_id) REFERENCES Categorias(id) ON DELETE CASCADE
    )
  `,
	);

	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS Configuracao (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    )
  `,
	);

	// Usuários do sistema (login do app). Todos com perfil 'admin' por enquanto.
	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS Usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT COLLATE NOCASE UNIQUE NOT NULL,
      nome TEXT NOT NULL,
      perfil TEXT NOT NULL DEFAULT 'admin',
      ativo INTEGER NOT NULL DEFAULT 1,
      senha_hash TEXT,
      criado_em TEXT
    )
  `,
	);

	await runOn(
		conexao,
		`
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
  `,
	);

	// Livro-razão do estoque: toda entrada/saída manual ou de compras fica registrada.
	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS MovimentacoesEstoque (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variacao_id INTEGER NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'entrada',
      quantidade INTEGER NOT NULL,
      custo_unitario REAL,
      origem TEXT DEFAULT 'manual',
      referencia_id INTEGER,
      observacao TEXT,
      data TEXT,
      FOREIGN KEY (variacao_id) REFERENCES Variacoes(id) ON DELETE CASCADE
    )
  `,
	);

	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS Fornecedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cnpj TEXT,
      telefone TEXT,
      email TEXT,
      contato TEXT,
      prazo_pagamento_dias INTEGER DEFAULT 0,
      observacao TEXT
    )
  `,
	);

	// Tabela de preços por fornecedor: qual fornecedor vende qual SKU, a que
	// custo e prazo de entrega — usada para sugerir o custo ao lançar um
	// pedido de compra (em vez de digitar de cabeça toda vez).
	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS FornecedorProdutos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fornecedor_id INTEGER NOT NULL,
      variacao_id INTEGER NOT NULL,
      preco_custo REAL NOT NULL DEFAULT 0,
      prazo_entrega_dias INTEGER,
      codigo_fornecedor TEXT,
      observacao TEXT,
      FOREIGN KEY (fornecedor_id) REFERENCES Fornecedores(id) ON DELETE CASCADE,
      FOREIGN KEY (variacao_id) REFERENCES Variacoes(id) ON DELETE CASCADE,
      UNIQUE (fornecedor_id, variacao_id)
    )
  `,
	);

	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS PedidosCompra (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fornecedor_id INTEGER,
      status TEXT NOT NULL DEFAULT 'aberto',
      total REAL NOT NULL DEFAULT 0,
      data_pedido TEXT,
      data_recebimento TEXT,
      observacao TEXT,
      FOREIGN KEY (fornecedor_id) REFERENCES Fornecedores(id) ON DELETE SET NULL
    )
  `,
	);

	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS ItensPedidoCompra (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL,
      variacao_id INTEGER NOT NULL,
      quantidade INTEGER NOT NULL,
      custo_unitario REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (pedido_id) REFERENCES PedidosCompra(id) ON DELETE CASCADE,
      FOREIGN KEY (variacao_id) REFERENCES Variacoes(id) ON DELETE RESTRICT
    )
  `,
	);

	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS LancamentosFinanceiros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      data_vencimento TEXT,
      data_pagamento TEXT,
      status TEXT NOT NULL DEFAULT 'aberto',
      origem TEXT DEFAULT 'manual',
      referencia_id INTEGER,
      forma_pagamento TEXT,
      data_criacao TEXT
    )
  `,
	);

	// Devolução/troca: estorna item(ns) de uma venda finalizada de volta ao estoque.
	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS Devolucoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL,
      motivo TEXT,
      valor_total REAL NOT NULL DEFAULT 0,
      usuario_id INTEGER,
      data TEXT,
      FOREIGN KEY (venda_id) REFERENCES Vendas(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE SET NULL
    )
  `,
	);

	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS ItensDevolucao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      devolucao_id INTEGER NOT NULL,
      item_venda_id INTEGER NOT NULL,
      variacao_id INTEGER NOT NULL,
      quantidade INTEGER NOT NULL,
      preco_unitario REAL NOT NULL,
      FOREIGN KEY (devolucao_id) REFERENCES Devolucoes(id) ON DELETE CASCADE,
      FOREIGN KEY (item_venda_id) REFERENCES ItensVenda(id) ON DELETE CASCADE,
      FOREIGN KEY (variacao_id) REFERENCES Variacoes(id) ON DELETE RESTRICT
    )
  `,
	);

	// Preço combinado por cliente para uma variação específica (tabela de preço
	// dedicada) — se não houver linha aqui, o PDV usa o preço padrão da variação.
	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS PrecoCliente (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      variacao_id INTEGER NOT NULL,
      preco REAL NOT NULL,
      FOREIGN KEY (cliente_id) REFERENCES Clientes(id) ON DELETE CASCADE,
      FOREIGN KEY (variacao_id) REFERENCES Variacoes(id) ON DELETE CASCADE,
      UNIQUE (cliente_id, variacao_id)
    )
  `,
	);

	// Log de auditoria: quem fez o quê, quando — cobre as ações de maior
	// impacto (não instrumenta as 80+ funções do backend, só as que importam
	// para responsabilização em um ambiente multiusuário).
	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS LogAtividades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      usuario_login TEXT,
      acao TEXT NOT NULL,
      entidade TEXT,
      entidade_id INTEGER,
      detalhes TEXT,
      data TEXT NOT NULL
    )
  `,
	);

	// Fechamento de caixa: um registro por sessão de caixa (abertura -> fechamento).
	// O valor esperado em dinheiro é calculado a partir das vendas finalizadas
	// em "Dinheiro" registradas dentro da janela de tempo aberta.
	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS FechamentosCaixa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_abertura TEXT NOT NULL,
      valor_abertura REAL NOT NULL DEFAULT 0,
      data_fechamento TEXT,
      valor_informado REAL,
      valor_esperado REAL,
      diferenca REAL,
      usuario_abertura_id INTEGER,
      usuario_fechamento_id INTEGER,
      observacao TEXT,
      status TEXT NOT NULL DEFAULT 'aberto'
    )
  `,
	);

	// Margem padrão global inicial (se não existir)
	await runOn(
		conexao,
		"INSERT OR IGNORE INTO Configuracao (chave, valor) VALUES ('margem_padrao', '40')",
	);

	// Migração de bancos existentes (cria as colunas novas se ausentes).
	await migrarColunas(conexao, "Produtos", {
		categoria_id:
			"categoria_id INTEGER REFERENCES Categorias(id) ON DELETE SET NULL",
		subcategoria_id:
			"subcategoria_id INTEGER REFERENCES Categorias(id) ON DELETE SET NULL",
		imagem: "imagem TEXT",
		ativo: "ativo INTEGER NOT NULL DEFAULT 1",
	});
	await migrarColunas(conexao, "Variacoes", {
		preco_custo: "preco_custo REAL NOT NULL DEFAULT 0",
		atributos: "atributos TEXT",
		estoque_minimo: "estoque_minimo INTEGER NOT NULL DEFAULT 5",
	});
	// ALTER TABLE do SQLite recusa colunas UNIQUE: adiciona simples e garante a
	// unicidade por índice (mesma semântica, inclusive vários NULL permitidos).
	await migrarColunas(conexao, "Clientes", {
		codigo: "codigo TEXT",
		cpf_cnpj: "cpf_cnpj TEXT",
		email: "email TEXT",
		endereco: "endereco TEXT",
		ativo: "ativo INTEGER NOT NULL DEFAULT 1",
	});
	await runOn(
		conexao,
		"CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_codigo ON Clientes(codigo)",
	);
	await migrarColunas(conexao, "Vendas", {
		desconto: "desconto REAL NOT NULL DEFAULT 0",
		observacao: "observacao TEXT",
		status: "status TEXT NOT NULL DEFAULT 'finalizada'",
		usuario_id: "usuario_id INTEGER REFERENCES Usuarios(id) ON DELETE SET NULL",
		origem: "origem TEXT NOT NULL DEFAULT 'pdv'",
	});
	await migrarColunas(conexao, "Precificacao", {
		aplicar_custo_fixo: "aplicar_custo_fixo INTEGER NOT NULL DEFAULT 1",
	});
	await migrarColunas(conexao, "Usuarios", {
		comissao_percentual: "comissao_percentual REAL NOT NULL DEFAULT 0",
		// JSON com toggles por módulo p/ perfil vendedor, ex: {"relatorios":true}.
		// Admin ignora este campo (sempre tem acesso total). Ausente = "{}".
		permissoes: "permissoes TEXT NOT NULL DEFAULT '{}'",
	});
	// Parcelamento: lançamentos da mesma compra/venda a prazo compartilham um
	// grupo_id, cada linha é uma parcela (parcela_num de parcela_total).
	await migrarColunas(conexao, "LancamentosFinanceiros", {
		grupo_id: "grupo_id TEXT",
		parcela_num: "parcela_num INTEGER NOT NULL DEFAULT 1",
		parcela_total: "parcela_total INTEGER NOT NULL DEFAULT 1",
	});
	// Reserva de estoque: orçamento passa a reservar quantidade (sem baixar o
	// saldo real) para não ser vendida duas vezes até virar venda ou expirar.
	await migrarColunas(conexao, "Variacoes", {
		quantidade_reservada: "quantidade_reservada INTEGER NOT NULL DEFAULT 0",
	});
	// Recebimento parcial: cada item do pedido guarda quanto já foi recebido;
	// o pedido só vira 'recebido' quando todo item atingir sua quantidade.
	await migrarColunas(conexao, "ItensPedidoCompra", {
		quantidade_recebida: "quantidade_recebida INTEGER NOT NULL DEFAULT 0",
	});
	await criarVariacoesPadrao(conexao);
}

async function criarVariacoesPadrao(conn) {
	const produtos = await new Promise((resolve, reject) => {
		conn.all(
			`SELECT p.id
       FROM Produtos p
       LEFT JOIN Variacoes v ON v.produto_id = p.id
       GROUP BY p.id
       HAVING COUNT(v.id) = 0`,
			[],
			(erro, linhas) => (erro ? reject(erro) : resolve(linhas)),
		);
	});
	for (const produto of produtos) {
		await runOn(
			conn,
			`INSERT INTO Variacoes
       (produto_id, sku, tamanho, cor, preco, preco_custo, quantidade_estoque, estoque_minimo, atributos)
       VALUES (?, ?, NULL, NULL, 0, 0, 0, 5, ?)`,
			[
				produto.id,
				"PRODUTO-" + produto.id,
				JSON.stringify([{ chave: "Unidade", valor: "Padrão" }]),
			],
		);
	}
}

async function salvarProduto(produto, variacoes) {
	const conn = getConexao();

	if (!produto || !String(produto.nome || "").trim()) {
		throw new Error("O nome do produto é obrigatório.");
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

	await run("BEGIN TRANSACTION");

	try {
		let proximoSku = null;
		for (const v of variacoes) {
			if (String(v.sku || "").trim()) continue;
			if (proximoSku === null) {
				const linhaSku = await get(
					"SELECT COALESCE(MAX(CASE WHEN UPPER(sku) GLOB 'P[0-9]*' THEN CAST(SUBSTR(sku, 2) AS INTEGER) ELSE 0 END), 0) + 1 AS proximo FROM Variacoes",
				);
				proximoSku = Number(linhaSku && linhaSku.proximo) || 1;
			}
			v.sku = "P" + String(proximoSku++).padStart(4, "0");
		}

		// SKUs únicos: sem duplicatas na grade e sem conflito com o banco.
		const skusVistos = new Set();
		for (const v of variacoes) {
			const sku = String(v.sku || "")
				.trim()
				.toUpperCase();
			if (!sku) throw new Error("Todas as variações precisam de um SKU.");
			const preco = Number(v.preco);
			const precoCusto = Number(v.preco_custo || 0);
			const estoque = Number(v.quantidade_estoque);
			const atributos = Array.isArray(v.atributos) ? v.atributos : [];
			if (!Number.isFinite(preco) || preco < 0)
				throw new Error("Preço de venda inválido.");
			if (!Number.isFinite(precoCusto) || precoCusto < 0)
				throw new Error("Preço de custo inválido.");
			if (!Number.isInteger(estoque) || estoque < 0)
				throw new Error("Estoque inválido.");
			if (atributos.length === 0)
				throw new Error("Cada variação precisa de pelo menos um atributo.");
			if (
				atributos.some(
					(a) =>
						!a ||
						!String(a.chave || "").trim() ||
						!String(a.valor || "").trim(),
				)
			) {
				throw new Error("Todos os atributos precisam de chave e valor.");
			}
			if (skusVistos.has(sku))
				throw new Error("SKU duplicado na grade: " + sku);
			skusVistos.add(sku);
			const existente = await get(
				"SELECT id FROM Variacoes WHERE UPPER(sku) = ?",
				[sku],
			);
			if (existente)
				throw new Error("Já existe uma variação com o SKU: " + sku);
		}

		// Integridade da subcategoria: precisa pertencer à categoria escolhida.
		if (produto.categoria_id && produto.subcategoria_id) {
			const sub = await get(
				"SELECT id, categoria_pai_id FROM Categorias WHERE id = ?",
				[produto.subcategoria_id],
			);
			if (!sub || sub.categoria_pai_id !== produto.categoria_id) {
				throw new Error(
					"A subcategoria selecionada não pertence à categoria escolhida.",
				);
			}
		}

		const result = await run(
			"INSERT INTO Produtos (nome, categoria, categoria_id, subcategoria_id) VALUES (?, ?, ?, ?)",
			[
				produto.nome,
				produto.categoria || null,
				produto.categoria_id || null,
				produto.subcategoria_id || null,
			],
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
      )`,
		);
		const categoriasSelecionadas = Array.isArray(produto.categoriasSelecionadas)
			? produto.categoriasSelecionadas
					.map((id) => Number(id))
					.filter((id) => Number.isInteger(id) && id > 0)
			: [];
		for (const catId of categoriasSelecionadas) {
			await run(
				"INSERT OR IGNORE INTO ProdutoCategorias (produto_id, categoria_id) VALUES (?, ?)",
				[produtoId, catId],
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
      )`,
		);
		await run(
			"INSERT OR IGNORE INTO Precificacao (produto_id, preco_custo, impostos_extras, preco_venda, status) VALUES (?, 0, 0, 0, ?)",
			[produtoId, "pendente"],
		);

		for (const v of variacoes) {
			const atributos = Array.isArray(v.atributos) ? v.atributos : [];
			// Fallback legado: se os atributos contêm Tamanho/Cor, espelha nas colunas antigas.
			const tamanho =
				obterAtributoLegado(atributos, "tamanho") || v.tamanho || null;
			const cor = obterAtributoLegado(atributos, "cor") || v.cor || null;
			await run(
				"INSERT INTO Variacoes (produto_id, sku, tamanho, cor, preco, preco_custo, quantidade_estoque, estoque_minimo, atributos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
				[
					produtoId,
					String(v.sku).trim().toUpperCase(),
					tamanho,
					cor,
					v.preco,
					v.preco_custo || 0,
					v.quantidade_estoque,
					Number.isInteger(Number(v.estoque_minimo)) &&
					Number(v.estoque_minimo) >= 0
						? Number(v.estoque_minimo)
						: 5,
					JSON.stringify(atributos),
				],
			);
		}

		await run("COMMIT");
		return { success: true, produtoId };
	} catch (erro) {
		await run("ROLLBACK");
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
		`SELECT v.id AS id, p.id AS produto_id, p.nome, p.categoria AS categoria_legada,
            c.nome AS categoria_nome, s.nome AS subcategoria_nome,
            v.tamanho, v.cor, v.preco, v.preco_custo, v.quantidade_estoque, v.quantidade_reservada,
            (v.quantidade_estoque - v.quantidade_reservada) AS quantidade_disponivel,
            v.estoque_minimo, v.sku, v.atributos, p.imagem
     FROM Variacoes v
     JOIN Produtos p ON p.id = v.produto_id
     LEFT JOIN Categorias c ON c.id = p.categoria_id
     LEFT JOIN Categorias s ON s.id = p.subcategoria_id
     WHERE UPPER(v.sku) = ? AND p.ativo = 1`,
		[String(sku).trim().toUpperCase()],
	);

	return row || null;
}

async function buscarProdutosPorTermo(termo) {
	const conn = getConexao();
	const all = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.all(sql, params, (erro, linhas) => {
				if (erro) return reject(erro.message);
				resolve(linhas);
			});
		});
	const texto = String(termo).trim();
	const codigo = Number(texto.replace(/^#/, ""));
	const alvo = normalizarBusca(texto);
	const linhas = await all(
		`SELECT v.id AS id, p.id AS produto_id, v.sku, p.nome, v.tamanho, v.cor, v.preco,
              v.quantidade_estoque, v.quantidade_reservada,
              (v.quantidade_estoque - v.quantidade_reservada) AS quantidade_disponivel,
              v.estoque_minimo, v.atributos, p.imagem
       FROM Variacoes v
       JOIN Produtos p ON p.id = v.produto_id
       WHERE p.ativo = 1
        ORDER BY p.nome`,
	);
	if (!alvo) return linhas.slice(0, 100);
	return linhas
		.filter(
			(l) =>
				normalizarBusca(l.nome).indexOf(alvo) !== -1 ||
				normalizarBusca(l.sku).indexOf(alvo) !== -1 ||
				(Number.isInteger(codigo) && l.produto_id === codigo),
		)
		.slice(0, 100);
}

function validarVariacao(v) {
	const sku = String(v.sku || "")
		.trim()
		.toUpperCase();
	if (!sku) throw new Error("Todas as variações precisam de um SKU.");
	const preco = Number(v.preco);
	const precoCusto = Number(v.preco_custo || 0);
	const estoque = Number(v.quantidade_estoque);
	const atributos = Array.isArray(v.atributos) ? v.atributos : [];
	if (!Number.isFinite(preco) || preco < 0)
		throw new Error("Preço de venda inválido.");
	if (!Number.isFinite(precoCusto) || precoCusto < 0)
		throw new Error("Preço de custo inválido.");
	if (!Number.isInteger(estoque) || estoque < 0)
		throw new Error("Estoque inválido.");
	if (atributos.length === 0)
		throw new Error("Cada variação precisa de pelo menos um atributo.");
	if (
		atributos.some(
			(a) =>
				!a || !String(a.chave || "").trim() || !String(a.valor || "").trim(),
		)
	) {
		throw new Error("Todos os atributos precisam de chave e valor.");
	}

	return { sku, preco, precoCusto, estoque, atributos };
}

async function buscarProdutosPDV02(termo) {
	const conn = getConexao();
	const texto = String(termo || "").trim();
	const like = "%" + texto.toUpperCase() + "%";
	return new Promise((resolve, reject) => {
		conn.all(
			`SELECT v.id AS variacao_id, v.sku, p.nome, v.tamanho, v.cor,
              v.preco, v.quantidade_estoque, v.atributos
       FROM Variacoes v
       JOIN Produtos p ON p.id = v.produto_id
       WHERE ? = '' OR UPPER(v.sku) LIKE ? OR UPPER(p.nome) LIKE ?
       ORDER BY p.nome, v.sku
       LIMIT 50`,
			[texto, like, like],
			(erro, linhas) => (erro ? reject(erro) : resolve(linhas)),
		);
	});
}

async function buscarClientesPDV02(termo) {
	const conn = getConexao();
	const texto = String(termo || "").trim();
	const like = "%" + texto.toUpperCase() + "%";
	return new Promise((resolve, reject) => {
		conn.all(
			`SELECT id, codigo, nome, cpf_cnpj, telefone
       FROM Clientes
       WHERE ? = '' OR UPPER(nome) LIKE ? OR UPPER(COALESCE(codigo, '')) LIKE ?
          OR UPPER(COALESCE(cpf_cnpj, '')) LIKE ?
       ORDER BY nome
       LIMIT 30`,
			[texto, like, like, like],
			(erro, linhas) => (erro ? reject(erro) : resolve(linhas)),
		);
	});
}

async function finalizarVendaPDV02(dados) {
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
			conn.get(sql, params, (erro, linha) =>
				erro ? reject(erro) : resolve(linha),
			);
		});

	const requestId = String((dados && dados.requestId) || "").trim();
	if (!requestId) throw new Error("Identificador da venda ausente.");

	const tipo = dados.tipo === "orcamento" ? "orcamento" : "finalizada";
	const pagamento =
		tipo === "orcamento" ? null : String(dados.formaPagamento || "").trim();
	const pagamentosAceitos = ["PIX", "Cartão", "Dinheiro", "Fiado"];
	if (tipo === "finalizada" && pagamentosAceitos.indexOf(pagamento) === -1) {
		throw new Error("Forma de pagamento inválida.");
	}

	const entrada = Array.isArray(dados.itens) ? dados.itens : [];
	const mapa = new Map();
	entrada.forEach((item) => {
		const id = Number(item && item.variacaoId);
		const quantidade = Number(item && item.quantidade);
		if (
			!Number.isInteger(id) ||
			id <= 0 ||
			!Number.isInteger(quantidade) ||
			quantidade <= 0
		) {
			throw new Error("Item inválido no carrinho.");
		}
		mapa.set(id, (mapa.get(id) || 0) + quantidade);
	});
	if (!mapa.size) throw new Error("A venda precisa de pelo menos um item.");

	const clienteId = dados.clienteId ? Number(dados.clienteId) : null;
	const desconto = Number(dados.desconto || 0);
	if (!Number.isFinite(desconto) || desconto < 0)
		throw new Error("Desconto inválido.");

	await run("BEGIN TRANSACTION");
	try {
		const repetida = await get("SELECT id FROM Vendas WHERE request_id = ?", [
			requestId,
		]);
		if (repetida) {
			await run("ROLLBACK");
			return { success: true, vendaId: repetida.id, repetida: true };
		}

		if (clienteId) {
			const cliente = await get("SELECT id FROM Clientes WHERE id = ?", [
				clienteId,
			]);
			if (!cliente) throw new Error("Cliente não encontrado.");
		}

		const itens = [];
		let subtotal = 0;
		for (const [variacaoId, quantidade] of mapa) {
			const item = await get(
				`SELECT v.id, v.sku, v.preco, v.quantidade_estoque, p.nome
         FROM Variacoes v JOIN Produtos p ON p.id = v.produto_id WHERE v.id = ?`,
				[variacaoId],
			);
			if (!item) throw new Error("Produto não encontrado: " + variacaoId + ".");
			if (
				tipo === "finalizada" &&
				Number(item.quantidade_estoque) < quantidade
			) {
				throw new Error(
					"Estoque insuficiente para " + item.nome + " (" + item.sku + ").",
				);
			}
			subtotal += Number(item.preco) * quantidade;
			itens.push({ ...item, quantidade });
		}

		if (desconto > subtotal)
			throw new Error("O desconto não pode superar o subtotal.");
		const total = subtotal - desconto;
		const observacao = String(dados.observacao || "").trim() || null;
		const result = await run(
			`INSERT INTO Vendas
       (cliente_id, total, forma_pagamento, data_venda, desconto, observacao, status, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				clienteId,
				total,
				pagamento,
				new Date().toISOString(),
				desconto,
				observacao,
				tipo,
				requestId,
			],
		);
		const vendaId = result.lastID;

		for (const item of itens) {
			await run(
				"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)",
				[vendaId, item.id, item.quantidade, item.preco],
			);
			if (tipo === "finalizada") {
				const baixa = await run(
					"UPDATE Variacoes SET quantidade_estoque = quantidade_estoque - ? WHERE id = ? AND quantidade_estoque >= ?",
					[item.quantidade, item.id, item.quantidade],
				);
				if (baixa.changes !== 1)
					throw new Error("Estoque alterado durante a venda. Tente novamente.");
				await run(
					`INSERT INTO MovimentacoesEstoque
           (variacao_id, tipo, quantidade, custo_unitario, origem, referencia_id, observacao, data)
           VALUES (?, 'saida', ?, ?, 'venda', ?, ?, ?)`,
					[
						item.id,
						-item.quantidade,
						item.preco,
						vendaId,
						"PDV02",
						new Date().toISOString(),
					],
				);
			}
		}

		if (tipo === "finalizada" && pagamento === "Fiado") {
			await criarLancamentoInterno(run, {
				tipo: "receber",
				descricao: "Venda #" + vendaId + " (fiado)",
				valor: total,
				data_vencimento: new Date().toISOString(),
				origem: "venda",
				referencia_id: vendaId,
				forma_pagamento: pagamento,
			});
		}
		await run("COMMIT");
		return { success: true, vendaId, subtotal, desconto, total };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

async function listProdutosDetalhados(incluirInativos) {
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
            p.categoria_id, p.subcategoria_id, p.imagem, p.ativo
     FROM Produtos p
     LEFT JOIN Categorias c ON c.id = p.categoria_id
     LEFT JOIN Categorias s ON s.id = p.subcategoria_id
     WHERE ? OR p.ativo = 1
     ORDER BY p.nome COLLATE NOCASE`,
		[incluirInativos ? 1 : 0],
	);
	const variacoes = await all(
		`SELECT v.produto_id, v.id AS variacao_id, v.sku, v.tamanho, v.cor,
            v.preco, v.preco_custo, v.quantidade_estoque, v.atributos
     FROM Variacoes v
     ORDER BY v.id`,
	);

	const catsProd = await all(
		`SELECT pc.produto_id, c.id AS categoria_id, c.nome AS categoria_nome,
            c.categoria_pai_id, p.nome AS categoria_pai_nome
     FROM ProdutoCategorias pc
     JOIN Categorias c ON c.id = pc.categoria_id
     LEFT JOIN Categorias p ON p.id = c.categoria_pai_id
     ORDER BY c.nome COLLATE NOCASE`,
	);

	return produtos.map((p) => ({
		id: p.id,
		nome: p.nome,
		categoria_legada: p.categoria_legada,
		categoria_nome: p.categoria_nome,
		subcategoria_nome: p.subcategoria_nome,
		categoria_id: p.categoria_id,
		subcategoria_id: p.subcategoria_id,
		imagem: p.imagem,
		ativo: p.ativo,
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

async function getProximoSkuProduto() {
	const conn = getConexao();
	const linhas = await new Promise((resolve, reject) => {
		conn.all(
			"SELECT sku FROM Variacoes WHERE UPPER(sku) LIKE 'P%'",
			[],
			(erro, rows) => {
				if (erro) return reject(erro);
				resolve(rows);
			},
		);
	});
	const maior = linhas.reduce((max, linha) => {
		const match = /^P(\d+)$/.exec(String(linha.sku || "").toUpperCase());
		return match ? Math.max(max, Number(match[1])) : max;
	}, 0);
	return "P" + String(maior + 1).padStart(4, "0");
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
	const row = await get(
		"SELECT COALESCE(MAX(id), 0) + 1 AS proximo FROM Categorias",
	);
	const n = row ? row.proximo : 1;
	return "CAT" + String(n).padStart(4, "0");
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
	const row = await get(
		"SELECT COALESCE(MAX(id), 0) + 1 AS proximo FROM Clientes",
	);
	const n = row ? row.proximo : 1;
	return "C" + String(n).padStart(4, "0");
}

async function atualizarProduto(id, produto, variacoes) {
	const conn = getConexao();

	if (!produto || !String(produto.nome || "").trim()) {
		throw new Error("O nome do produto é obrigatório.");
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

	await run("BEGIN TRANSACTION");

	try {
		const existente = await get("SELECT id FROM Produtos WHERE id = ?", [id]);
		if (!existente) throw new Error("Produto não encontrado.");

		// Integridade da subcategoria: precisa pertencer à categoria escolhida.
		if (produto.categoria_id && produto.subcategoria_id) {
			const sub = await get(
				"SELECT id, categoria_pai_id FROM Categorias WHERE id = ?",
				[produto.subcategoria_id],
			);
			if (!sub || sub.categoria_pai_id !== produto.categoria_id) {
				throw new Error(
					"A subcategoria selecionada não pertence à categoria escolhida.",
				);
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
      )`,
		);
		const categoriasSelecionadas = Array.isArray(produto.categoriasSelecionadas)
			? produto.categoriasSelecionadas
					.map((id) => Number(id))
					.filter((id) => Number.isInteger(id) && id > 0)
			: [];
		await run("DELETE FROM ProdutoCategorias WHERE produto_id = ?", [id]);
		for (const catId of categoriasSelecionadas) {
			await run(
				"INSERT OR IGNORE INTO ProdutoCategorias (produto_id, categoria_id) VALUES (?, ?)",
				[id, catId],
			);
		}

		if (variacoesLista.length === 0) {
			// Atualização em nível de produto: apenas nome/categoria/subcategoria,
			// preservando as variações existentes (inclusive as com vendas).
			await run(
				"UPDATE Produtos SET nome = ?, categoria = ?, categoria_id = ?, subcategoria_id = ? WHERE id = ?",
				[
					produto.nome,
					produto.categoria || null,
					produto.categoria_id || null,
					produto.subcategoria_id || null,
					id,
				],
			);
			await run("COMMIT");
			return { success: true, produtoId: id, variacoesPreservadas: true };
		}

		// Sincronização por SKU: variações que já existiam são preservadas (o
		// mesmo id, então histórico de movimentações e vendas continua íntegro);
		// só SKUs novos na grade viram INSERT e só os removidos viram DELETE.
		let proximoSku = null;
		for (const v of variacoesLista) {
			if (String(v.sku || "").trim()) continue;
			if (proximoSku === null) {
				const linhaSku = await get(
					"SELECT COALESCE(MAX(CASE WHEN UPPER(sku) GLOB 'P[0-9]*' THEN CAST(SUBSTR(sku, 2) AS INTEGER) ELSE 0 END), 0) + 1 AS proximo FROM Variacoes",
				);
				proximoSku = Number(linhaSku && linhaSku.proximo) || 1;
			}
			v.sku = "P" + String(proximoSku++).padStart(4, "0");
		}

		// SKUs únicos: sem duplicatas na grade e sem conflito com outros produtos.
		const skusVistos = new Set();
		const validadas = [];
		for (const v of variacoesLista) {
			const validada = validarVariacao(v);
			if (skusVistos.has(validada.sku))
				throw new Error("SKU duplicado na grade: " + validada.sku);
			skusVistos.add(validada.sku);
			const outro = await get(
				"SELECT id FROM Variacoes WHERE UPPER(sku) = ? AND produto_id != ?",
				[validada.sku, id],
			);
			if (outro)
				throw new Error("Já existe uma variação com o SKU: " + validada.sku);
			validadas.push({ ...validada, estoque_minimo: v.estoque_minimo });
		}

		const existentes = await new Promise((resolve, reject) => {
			conn.all(
				"SELECT id, sku, preco, preco_custo, estoque_minimo FROM Variacoes WHERE produto_id = ?",
				[id],
				(erro, linhas) => (erro ? reject(erro) : resolve(linhas)),
			);
		});
		const existentesPorSku = new Map(
			existentes.map((e) => [String(e.sku).toUpperCase(), e]),
		);
		const skusMantidos = new Set(validadas.map((v) => v.sku));

		// Remove variações que saíram da grade — bloqueado se já tiverem vendas.
		for (const e of existentes) {
			if (skusMantidos.has(String(e.sku).toUpperCase())) continue;
			const vendida = await get(
				"SELECT COUNT(*) AS n FROM ItensVenda WHERE variacao_id = ?",
				[e.id],
			);
			if (vendida.n > 0) {
				throw new Error(
					"Não é possível remover a variação " +
						e.sku +
						" pois ela possui vendas registradas.",
				);
			}
			await run("DELETE FROM Variacoes WHERE id = ?", [e.id]);
		}

		await run(
			"UPDATE Produtos SET nome = ?, categoria = ?, categoria_id = ?, subcategoria_id = ? WHERE id = ?",
			[
				produto.nome,
				produto.categoria || null,
				produto.categoria_id || null,
				produto.subcategoria_id || null,
				id,
			],
		);

		for (const v of validadas) {
			// Fallback legado: se os atributos contêm Tamanho/Cor, espelha nas colunas antigas.
			const tamanho = obterAtributoLegado(v.atributos, "tamanho") || null;
			const cor = obterAtributoLegado(v.atributos, "cor") || null;
			const existente = existentesPorSku.get(v.sku);
			const estoqueMinimo =
				Number.isInteger(Number(v.estoque_minimo)) &&
				Number(v.estoque_minimo) >= 0
					? Number(v.estoque_minimo)
					: existente
						? existente.estoque_minimo
						: 5;

			if (existente) {
				// Já existia: preserva id, preço e saldo de estoque (quantidade só
				// muda pela aba Estoque) — só os dados descritivos são atualizados.
				await run(
					"UPDATE Variacoes SET tamanho = ?, cor = ?, atributos = ?, estoque_minimo = ? WHERE id = ?",
					[tamanho, cor, JSON.stringify(v.atributos), estoqueMinimo, existente.id],
				);
			} else {
				// Variação nova: herda preço/custo de uma irmã já cadastrada para
				// não nascer com preço zerado enquanto as demais já têm preço.
				const irma = existentes[0];
				await run(
					"INSERT INTO Variacoes (produto_id, sku, tamanho, cor, preco, preco_custo, quantidade_estoque, estoque_minimo, atributos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
					[
						id,
						v.sku,
						tamanho,
						cor,
						irma ? irma.preco : 0,
						irma ? irma.preco_custo : 0,
						v.estoque,
						estoqueMinimo,
						JSON.stringify(v.atributos),
					],
				);
			}
		}

		await run("COMMIT");
		return { success: true, produtoId: id };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

// Exclusão é lógica (ativo=0): produto some das listas/buscas normais mas
// fica recuperável na Lixeira, e vendas antigas continuam referenciando as
// variações sem quebrar (nada em Variacoes/ItensVenda é tocado).
async function removerProduto(id) {
	const existente = await getAsync("SELECT id FROM Produtos WHERE id = ?", [id]);
	if (!existente) throw new Error("Produto não encontrado.");

	await runAsync("UPDATE Produtos SET ativo = 0 WHERE id = ?", [id]);
	return { success: true };
}

async function restaurarProduto(id) {
	const existente = await getAsync("SELECT id FROM Produtos WHERE id = ?", [id]);
	if (!existente) throw new Error("Produto não encontrado.");

	await runAsync("UPDATE Produtos SET ativo = 1 WHERE id = ?", [id]);
	return { success: true };
}

async function excluirProdutoPermanente(id) {
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

	await run("BEGIN TRANSACTION");

	try {
		const existente = await get("SELECT id, ativo FROM Produtos WHERE id = ?", [id]);
		if (!existente) throw new Error("Produto não encontrado.");
		if (Number(existente.ativo) === 1)
			throw new Error("Envie o produto para a lixeira antes de excluir definitivamente.");

		const vendido = await get(
			`SELECT COUNT(*) AS n FROM ItensVenda iv
       JOIN Variacoes v ON v.id = iv.variacao_id
       WHERE v.produto_id = ?`,
			[id],
		);
		if (vendido.n > 0) {
			throw new Error(
				"Este produto não pode ser excluído pois possui variações com vendas registradas.",
			);
		}

		await run("DELETE FROM Variacoes WHERE produto_id = ?", [id]);
		await run("DELETE FROM Produtos WHERE id = ?", [id]);
		await run("COMMIT");
		return { success: true };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

/* ============ Imagem do produto ============ */

function pastaImagensProdutos() {
	const dir = path.join(app.getPath("userData"), "produto-imagens");
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	return dir;
}

// Copia o arquivo escolhido (caminho absoluto já validado pelo diálogo nativo
// do main.js) para a pasta de imagens do app e grava o nome do arquivo salvo.
// Remove a imagem anterior do produto, se houver, para não acumular lixo.
async function salvarImagemProduto(produtoId, caminhoOrigem) {
	const id = Number(produtoId);
	if (!Number.isInteger(id) || id <= 0) throw new Error("Produto inválido.");
	if (!caminhoOrigem || !fs.existsSync(caminhoOrigem))
		throw new Error("Arquivo de imagem não encontrado.");

	const extensoesPermitidas = [".png", ".jpg", ".jpeg", ".webp"];
	const ext = path.extname(caminhoOrigem).toLowerCase();
	if (!extensoesPermitidas.includes(ext))
		throw new Error("Formato de imagem não suportado. Use PNG, JPG ou WEBP.");

	const produto = await getAsync("SELECT imagem FROM Produtos WHERE id = ?", [id]);
	if (!produto) throw new Error("Produto não encontrado.");

	const dir = pastaImagensProdutos();
	const nomeArquivo = "produto-" + id + "-" + Date.now() + ext;
	fs.copyFileSync(caminhoOrigem, path.join(dir, nomeArquivo));

	if (produto.imagem) {
		try { fs.unlinkSync(path.join(dir, produto.imagem)); } catch (e) { /* já não existe */ }
	}

	await runAsync("UPDATE Produtos SET imagem = ? WHERE id = ?", [nomeArquivo, id]);
	return { success: true, imagem: nomeArquivo, caminho: path.join(dir, nomeArquivo) };
}

async function removerImagemProduto(produtoId) {
	const id = Number(produtoId);
	const produto = await getAsync("SELECT imagem FROM Produtos WHERE id = ?", [id]);
	if (!produto) throw new Error("Produto não encontrado.");
	if (produto.imagem) {
		try { fs.unlinkSync(path.join(pastaImagensProdutos(), produto.imagem)); } catch (e) { /* já não existe */ }
	}
	await runAsync("UPDATE Produtos SET imagem = NULL WHERE id = ?", [id]);
	return { success: true };
}

function getCaminhoImagemProduto(nomeArquivo) {
	if (!nomeArquivo) return null;
	return path.join(pastaImagensProdutos(), nomeArquivo);
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
    )`,
	);

	const linhas = await allAsync(
		`SELECT c.id, c.nome, c.categoria_pai_id,
            p.nome AS categoria_pai_nome,
            (SELECT COUNT(*) FROM ProdutoCategorias pc WHERE pc.categoria_id = c.id) AS uso_checklist,
            (SELECT COUNT(*) FROM Produtos pr WHERE pr.categoria_id = c.id OR pr.subcategoria_id = c.id) AS uso_legado
     FROM Categorias c
     LEFT JOIN Categorias p ON p.id = c.categoria_pai_id
     ORDER BY (CASE WHEN c.categoria_pai_id IS NULL THEN 0 ELSE 1 END), c.nome COLLATE NOCASE`,
	);

	return linhas.map((l) => ({
		id: l.id,
		codigo: "CAT" + String(l.id).padStart(4, "0"),
		nome: l.nome,
		categoria_pai_id: l.categoria_pai_id,
		categoria_pai_nome: l.categoria_pai_nome,
		tipo: l.categoria_pai_id ? "subcategoria" : "categoria",
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

	await run("BEGIN TRANSACTION");
	try {
		const alvo = await get(
			"SELECT id, categoria_pai_id FROM Categorias WHERE id = ?",
			[id],
		);
		if (!alvo) throw new Error("Categoria não encontrada.");

		// Subcategorias: bloqueia se houver vinculações em algum nível.
		const temSub = await get(
			"SELECT id FROM Categorias WHERE categoria_pai_id = ? LIMIT 1",
			[id],
		);
		if (temSub) {
			throw new Error(
				"Exclua as subcategorias vinculadas antes de remover esta categoria.",
			);
		}

		const vinculadoChecklist = await get(
			"SELECT COUNT(*) AS n FROM ProdutoCategorias WHERE categoria_id = ?",
			[id],
		);
		const vinculadoLegado = await get(
			"SELECT COUNT(*) AS n FROM Produtos WHERE categoria_id = ? OR subcategoria_id = ?",
			[id, id],
		);
		if (
			(vinculadoChecklist && vinculadoChecklist.n > 0) ||
			(vinculadoLegado && vinculadoLegado.n > 0)
		) {
			throw new Error(
				"Categoria vinculada a produtos. Remova as vinculações antes de excluí-la.",
			);
		}

		await run("DELETE FROM Categorias WHERE id = ?", [id]);
		await run("COMMIT");
		return { success: true };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

/* ============ Precificação ============ */

async function getGlobalMargin() {
	const row = await getAsync(
		"SELECT valor FROM Configuracao WHERE chave = 'margem_padrao'",
	);
	return row ? parseFloat(row.valor) || 40 : 40;
}

async function saveGlobalMargin(valor) {
	await runAsync(
		"INSERT OR REPLACE INTO Configuracao (chave, valor) VALUES ('margem_padrao', ?)",
		[String(valor)],
	);
	// A margem global recém-salva precisa refletir imediatamente no preço dos
	// produtos que ainda não têm override manual — senão o preço de venda real
	// (Variacoes.preco) só seria atualizado na próxima vez que a tela de
	// Precificação fosse recarregada, deixando o PDV desatualizado até lá.
	await sincronizarPrecosPendentes();
	return { success: true };
}

// Recalcula e grava (Precificacao.preco_venda + Variacoes.preco) o preço de
// venda de todo produto "pendente" (sem override manual de margem/preço),
// usando a margem global e o custo fixo atuais. Chamado tanto ao carregar a
// tela de Precificação quanto ao salvar uma nova margem global/custo fixo,
// para que o preço real nunca fique defasado do que a tela exibe.
async function sincronizarPrecosPendentes() {
	const margemGlobalAtual = await getGlobalMargin();
	const custoFixoAtual = await getCustoFixoConfig();
	const pendentes = await allAsync(
		`SELECT pr.produto_id, pr.preco_custo, pr.impostos_extras, pr.preco_venda, pr.aplicar_custo_fixo
     FROM Precificacao pr
     WHERE pr.status = 'pendente'`,
	);
	for (const p of pendentes) {
		const base = Number(p.preco_custo || 0) + Number(p.impostos_extras || 0);
		const custoFixoPercentual = p.aplicar_custo_fixo ? custoFixoAtual.percentual : 0;
		const precoCalculado =
			base > 0 ? base * (1 + margemGlobalAtual / 100) * (1 + custoFixoPercentual / 100) : 0;
		if (precoCalculado > 0 && Math.abs(precoCalculado - Number(p.preco_venda || 0)) > 0.001) {
			const conn2 = getConexao();
			await runOn(conn2, "BEGIN TRANSACTION");
			try {
				await runOn(conn2, "UPDATE Precificacao SET preco_venda = ? WHERE produto_id = ?", [
					precoCalculado,
					p.produto_id,
				]);
				await runOn(conn2, "UPDATE Variacoes SET preco = ? WHERE produto_id = ?", [
					precoCalculado,
					p.produto_id,
				]);
				await runOn(conn2, "COMMIT");
			} catch (erro) {
				await runOn(conn2, "ROLLBACK");
				throw erro;
			}
		}
	}
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
     WHERE p.id NOT IN (SELECT produto_id FROM Precificacao)`,
	);

	// Recupera preços/custos já cadastrados na variação quando a precificação ainda está pendente.
	await runAsync(
		`UPDATE Precificacao
        SET preco_custo = CASE WHEN preco_custo = 0 THEN COALESCE((SELECT MIN(v.preco_custo) FROM Variacoes v WHERE v.produto_id = Precificacao.produto_id), 0) ELSE preco_custo END,
            preco_venda = CASE WHEN preco_venda = 0 THEN COALESCE((SELECT MIN(v.preco) FROM Variacoes v WHERE v.produto_id = Precificacao.produto_id), 0) ELSE preco_venda END
      WHERE status = 'pendente'`,
	);

	// Produtos "pendentes" (sem override manual) usam a margem global para exibição,
	// mas isso nunca era gravado no banco — o preço de venda real (Variacoes.preco)
	// ficava em 0 até o usuário editar algum campo manualmente na tela de Precificação,
	// fazendo o PDV mostrar "Sem preço" mesmo com a Precificação exibindo um valor calculado.
	// Aqui sincronizamos automaticamente sempre que a lista é carregada.
	await sincronizarPrecosPendentes();

	const rows = await all(
		`SELECT pr.id, pr.produto_id, p.nome AS produto_nome, p.categoria_id,
            pr.preco_custo, pr.impostos_extras, pr.margem_percentual,
            pr.preco_venda, pr.status, pr.aplicar_custo_fixo,
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
     ORDER BY p.nome COLLATE NOCASE`,
	);

	return rows.map((r) => ({
		id: r.id,
		produto_id: r.produto_id,
		produto_nome: r.produto_nome,
		preco_custo: Number(r.preco_custo || 0),
		impostos_extras: Number(r.impostos_extras || 0),
		margem_percentual:
			r.margem_percentual !== null ? Number(r.margem_percentual) : null,
		preco_venda: Number(r.preco_venda || 0),
		status: r.status || "pendente",
		custo_variacao: Number(r.custo_variacao || 0),
		preco_variacao: Number(r.preco_variacao || 0),
		sku_primeiro: r.sku_primeiro || null,
		categorias: r.categorias || null,
		aplicar_custo_fixo: !!r.aplicar_custo_fixo,
	}));
}

// Custo fixo mensal (aluguel, salários, etc.) diluído como uma PORCENTAGEM do
// faturamento, não um R$ fixo por unidade — ratear em R$ fixo penalizava
// desproporcionalmente produtos baratos (um acessório de R$20 absorvia o
// mesmo custo fixo em R$ que um quimono de R$1000). A % é sempre recalculada
// a partir do faturamento médio histórico real (ver getFaturamentoMedioHistorico),
// nunca de um "volume estimado" digitado à mão.
async function getFaturamentoMedioHistorico(meses) {
	const qtdMeses = Number(meses) > 0 ? Number(meses) : 3;
	const linhas = await allAsync(
		`SELECT strftime('%Y-%m', data_venda) AS mes, SUM(total) AS faturamento
     FROM Vendas
     WHERE status = 'finalizada'
     GROUP BY mes
     ORDER BY mes DESC
     LIMIT ?`,
		[qtdMeses],
	);
	if (linhas.length === 0) return { media: 0, mesesConsiderados: 0 };
	const soma = linhas.reduce((acc, l) => acc + (Number(l.faturamento) || 0), 0);
	return { media: soma / linhas.length, mesesConsiderados: linhas.length };
}

async function getCustoFixoConfig() {
	const linhas = await allAsync(
		"SELECT chave, valor FROM Configuracao WHERE chave = 'custo_fixo_mensal'",
	);
	const mapa = {};
	linhas.forEach((l) => {
		mapa[l.chave] = l.valor;
	});
	const mensal = parseFloat(mapa.custo_fixo_mensal) || 0;
	const { media, mesesConsiderados } = await getFaturamentoMedioHistorico(3);
	const percentual = mensal > 0 && media > 0 ? (mensal / media) * 100 : 0;
	return {
		mensal,
		faturamentoMedioHistorico: media,
		mesesConsiderados,
		percentual,
	};
}

async function saveCustoFixoConfig(mensal) {
	const mensalVal = Number(mensal);
	if (!Number.isFinite(mensalVal) || mensalVal < 0)
		throw new Error("Custo fixo mensal inválido.");
	await runAsync(
		"INSERT OR REPLACE INTO Configuracao (chave, valor) VALUES ('custo_fixo_mensal', ?)",
		[String(mensalVal)],
	);
	// Reflete imediatamente no preço dos produtos sem override manual — mesmo
	// motivo de saveGlobalMargin chamar sincronizarPrecosPendentes().
	await sincronizarPrecosPendentes();
	return { success: true };
}

async function saveAplicarCustoFixo(produtoId, aplicar) {
	await runAsync(
		"UPDATE Precificacao SET aplicar_custo_fixo = ? WHERE produto_id = ?",
		[aplicar ? 1 : 0, produtoId],
	);
	return { success: true };
}

async function saveProductMargin(produtoId, margem) {
	const margemVal = margem !== null && margem !== "" ? Number(margem) : null;
	if (margemVal !== null && (!Number.isFinite(margemVal) || margemVal < 0)) {
		throw new Error("Margem inválida.");
	}
	await runAsync(
		"UPDATE Precificacao SET margem_percentual = ?, status = ? WHERE produto_id = ?",
		[margemVal, margemVal !== null ? "definido" : "pendente", produtoId],
	);
	return { success: true };
}

async function saveProductPrice(produtoId, precoVenda) {
	const preco = Number(precoVenda);
	if (!Number.isFinite(preco) || preco < 0) throw new Error("Preço inválido.");
	const conn = getConexao();
	await runOn(conn, "BEGIN TRANSACTION");
	try {
		await runOn(
			conn,
			"UPDATE Precificacao SET preco_venda = ?, status = ? WHERE produto_id = ?",
			[preco, "definido", produtoId],
		);
		await runOn(conn, "UPDATE Variacoes SET preco = ? WHERE produto_id = ?", [
			preco,
			produtoId,
		]);
		await runOn(conn, "COMMIT");
	} catch (erro) {
		await runOn(conn, "ROLLBACK");
		throw erro;
	}
	return { success: true };
}

async function saveProductCost(produtoId, precoCusto) {
	const custo = Number(precoCusto);
	if (!Number.isFinite(custo) || custo < 0) throw new Error("Custo inválido.");
	const conn = getConexao();
	await runOn(conn, "BEGIN TRANSACTION");
	try {
		await runOn(
			conn,
			"UPDATE Precificacao SET preco_custo = ? WHERE produto_id = ?",
			[custo, produtoId],
		);
		await runOn(
			conn,
			"UPDATE Variacoes SET preco_custo = ? WHERE produto_id = ?",
			[custo, produtoId],
		);
		await runOn(conn, "COMMIT");
	} catch (erro) {
		await runOn(conn, "ROLLBACK");
		throw erro;
	}
	return { success: true };
}

async function saveProductTaxes(produtoId, valor) {
	const v = Number(valor);
	if (!Number.isFinite(v) || v < 0) throw new Error("Valor inválido.");
	await runAsync(
		"UPDATE Precificacao SET impostos_extras = ? WHERE produto_id = ?",
		[v, produtoId],
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
	await run("BEGIN TRANSACTION");
	try {
		for (const pid of produtoIds) {
			await run(
				"UPDATE Precificacao SET margem_percentual = ?, status = ? WHERE produto_id = ?",
				[margem, "definido", pid],
			);
		}
		await run("COMMIT");
		return { success: true, count: produtoIds.length };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

async function finalizarVenda(dados, usuarioId) {
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

	const itens = Array.isArray(dados.itens) ? dados.itens : [];
	if (itens.length === 0)
		throw new Error("A venda precisa de pelo menos um item.");

	const status = dados.status === "orcamento" ? "orcamento" : "finalizada";
	const desconto = Math.max(0, Number(dados.desconto) || 0);
	const total = Math.max(0, Number(dados.total) || 0);
	const clienteId = dados.cliente_id ? Number(dados.cliente_id) : null;
	const formaPagamento = dados.forma_pagamento || null;
	const observacao = dados.observacao || null;

	await run("BEGIN TRANSACTION");

	try {
		const result = await run(
			"INSERT INTO Vendas (cliente_id, total, forma_pagamento, data_venda, desconto, observacao, status, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			[
				clienteId,
				total,
				formaPagamento,
				new Date().toISOString(),
				desconto,
				observacao,
				status,
				usuarioId || null,
			],
		);
		const vendaId = result.lastID;

		for (const item of itens) {
			await run(
				"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)",
				[vendaId, item.variacao_id, item.quantidade, item.preco_unitario],
			);

			// Orçamento não baixa estoque, mas reserva a quantidade para que não
			// seja vendida por outra frente enquanto o orçamento está em aberto.
			if (status === "orcamento") {
				const reserva = await run(
					"UPDATE Variacoes SET quantidade_reservada = quantidade_reservada + ? WHERE id = ? AND (quantidade_estoque - quantidade_reservada) >= ?",
					[item.quantidade, item.variacao_id, item.quantidade],
				);
				if (reserva.changes === 0) {
					const varRow = await get(
						"SELECT v.sku, v.quantidade_estoque, v.quantidade_reservada, p.nome FROM Variacoes v JOIN Produtos p ON p.id = v.produto_id WHERE v.id = ?",
						[item.variacao_id],
					);
					const rotulo = varRow
						? varRow.nome + " (" + varRow.sku + ")"
						: "item " + item.variacao_id;
					const disponivel = varRow
						? varRow.quantidade_estoque - varRow.quantidade_reservada
						: 0;
					throw new Error(
						"Estoque disponível insuficiente para reservar " +
							rotulo +
							". Disponível: " +
							disponivel +
							".",
					);
				}
				continue;
			}

			// Baixa atômica com guarda: falha (e faz ROLLBACK) se o estoque não for suficiente.
			const baixa = await run(
				"UPDATE Variacoes SET quantidade_estoque = quantidade_estoque - ? WHERE id = ? AND quantidade_estoque >= ?",
				[item.quantidade, item.variacao_id, item.quantidade],
			);
			if (baixa.changes === 0) {
				const varRow = await get(
					"SELECT v.sku, v.quantidade_estoque, p.nome FROM Variacoes v JOIN Produtos p ON p.id = v.produto_id WHERE v.id = ?",
					[item.variacao_id],
				);
				const rotulo = varRow
					? varRow.nome + " (" + varRow.sku + ")"
					: "item " + item.variacao_id;
				const saldo = varRow ? varRow.quantidade_estoque : 0;
				throw new Error(
					"Estoque insuficiente para " +
						rotulo +
						". Saldo atual: " +
						saldo +
						".",
				);
			}
		}

		// Venda a prazo gera conta a receber automaticamente.
		if (status === "finalizada" && formaPagamento === "Fiado") {
			await criarLancamentoInterno(run, {
				tipo: "receber",
				descricao: "Venda #" + vendaId + " (fiado)",
				valor: total,
				data_vencimento: new Date().toISOString(),
				origem: "venda",
				referencia_id: vendaId,
				forma_pagamento: formaPagamento,
			});
		}

		await run("COMMIT");
		return { success: true, vendaId };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

// Converte um orçamento em venda efetiva: valida estoque, baixa e muda o status.
async function converterOrcamento(vendaId) {
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
		const venda = await get("SELECT * FROM Vendas WHERE id = ?", [vendaId]);
		if (!venda) throw new Error("Orçamento não encontrado.");
		if (venda.status !== "orcamento")
			throw new Error("Esta venda não é um orçamento.");

		const itens = await all("SELECT * FROM ItensVenda WHERE venda_id = ?", [
			vendaId,
		]);

		for (const item of itens) {
			// A quantidade já estava reservada desde a criação do orçamento:
			// libera a reserva e baixa o estoque real na mesma operação.
			const baixa = await run(
				"UPDATE Variacoes SET quantidade_estoque = quantidade_estoque - ?, quantidade_reservada = MAX(0, quantidade_reservada - ?) WHERE id = ? AND quantidade_estoque >= ?",
				[item.quantidade, item.quantidade, item.variacao_id, item.quantidade],
			);
			if (baixa.changes === 0) {
				const varRow = await get(
					"SELECT v.sku, v.quantidade_estoque, p.nome FROM Variacoes v JOIN Produtos p ON p.id = v.produto_id WHERE v.id = ?",
					[item.variacao_id],
				);
				const rotulo = varRow
					? varRow.nome + " (" + varRow.sku + ")"
					: "item " + item.variacao_id;
				const saldo = varRow ? varRow.quantidade_estoque : 0;
				throw new Error(
					"Estoque insuficiente para " +
						rotulo +
						". Saldo atual: " +
						saldo +
						".",
				);
			}
		}

		await run(
			"UPDATE Vendas SET status = 'finalizada', data_venda = ? WHERE id = ?",
			[new Date().toISOString(), vendaId],
		);

		if (venda.forma_pagamento === "Fiado") {
			await criarLancamentoInterno(run, {
				tipo: "receber",
				descricao: "Venda #" + vendaId + " (fiado)",
				valor: venda.total,
				data_vencimento: new Date().toISOString(),
				origem: "venda",
				referencia_id: vendaId,
				forma_pagamento: venda.forma_pagamento,
			});
		}

		await run("COMMIT");
		return { success: true, vendaId };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

// Cancela um orçamento em aberto, liberando a reserva de estoque associada.
async function cancelarOrcamento(vendaId) {
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
		const venda = await get("SELECT * FROM Vendas WHERE id = ?", [vendaId]);
		if (!venda) throw new Error("Orçamento não encontrado.");
		if (venda.status !== "orcamento")
			throw new Error("Esta venda não é um orçamento em aberto.");

		const itens = await all("SELECT * FROM ItensVenda WHERE venda_id = ?", [
			vendaId,
		]);
		for (const item of itens) {
			await run(
				"UPDATE Variacoes SET quantidade_reservada = MAX(0, quantidade_reservada - ?) WHERE id = ?",
				[item.quantidade, item.variacao_id],
			);
		}

		await run("UPDATE Vendas SET status = 'cancelado' WHERE id = ?", [
			vendaId,
		]);

		await run("COMMIT");
		return { success: true };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

/* ============ Busca global ============ */

// Busca combinada em Clientes, Produtos (via SKU/nome) e Vendas (por número),
// usada pela barra de busca da navbar. Limita a poucos resultados por
// categoria — é um atalho de navegação, não um relatório.
async function buscaGlobal(termo) {
	const texto = String(termo || "").trim();
	if (!texto) return { clientes: [], produtos: [], vendas: [] };
	const alvo = normalizarBusca(texto);
	const like = "%" + texto.toUpperCase() + "%";

	const clientes = await allAsync(
		`SELECT id, codigo, nome, telefone FROM Clientes
     WHERE ativo = 1 AND (UPPER(nome) LIKE ? OR UPPER(COALESCE(codigo,'')) LIKE ? OR UPPER(COALESCE(cpf_cnpj,'')) LIKE ?)
     ORDER BY nome LIMIT 6`,
		[like, like, like],
	);

	const produtosBrutos = await allAsync(
		`SELECT v.id, v.sku, p.nome, v.tamanho, v.cor, v.preco
     FROM Variacoes v JOIN Produtos p ON p.id = v.produto_id
     WHERE p.ativo = 1
     ORDER BY p.nome LIMIT 500`,
	);
	const produtos = produtosBrutos
		.filter(
			(p) =>
				normalizarBusca(p.nome).indexOf(alvo) !== -1 ||
				normalizarBusca(p.sku).indexOf(alvo) !== -1,
		)
		.slice(0, 6);

	let vendas = [];
	const numero = parseInt(texto.replace(/\D/g, ""), 10);
	if (Number.isInteger(numero) && numero > 0) {
		vendas = await allAsync(
			`SELECT v.id, v.total, v.data_venda, v.status, c.nome AS cliente_nome
       FROM Vendas v LEFT JOIN Clientes c ON c.id = v.cliente_id
       WHERE v.id = ? LIMIT 1`,
			[numero],
		);
	}

	return { clientes, produtos, vendas };
}

/* ============ Devolução / troca ============ */

// Devolve item(ns) de uma venda finalizada: estorna a quantidade ao estoque,
// registra a movimentação e devolve o valor ao cliente (ajuste no financeiro
// se a venda original foi fiado, senão é considerado ressarcido fora do sistema).
async function registrarDevolucao(dados, usuarioId) {
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

	const vendaId = Number(dados && dados.venda_id);
	const itens = Array.isArray(dados && dados.itens) ? dados.itens : [];
	const motivo = (dados && dados.motivo) || null;
	if (!Number.isInteger(vendaId) || vendaId <= 0)
		throw new Error("Venda inválida.");
	if (itens.length === 0)
		throw new Error("Selecione ao menos um item para devolver.");

	await run("BEGIN TRANSACTION");

	try {
		const venda = await get("SELECT * FROM Vendas WHERE id = ?", [vendaId]);
		if (!venda) throw new Error("Venda não encontrada.");
		if (venda.status !== "finalizada")
			throw new Error("Só é possível devolver itens de uma venda finalizada.");

		const result = await run(
			"INSERT INTO Devolucoes (venda_id, motivo, valor_total, usuario_id, data) VALUES (?, ?, 0, ?, ?)",
			[vendaId, motivo, usuarioId || null, new Date().toISOString()],
		);
		const devolucaoId = result.lastID;
		let valorTotal = 0;

		for (const item of itens) {
			const itemVendaId = Number(item.item_venda_id);
			const quantidade = Number(item.quantidade);
			if (!Number.isInteger(itemVendaId) || itemVendaId <= 0)
				throw new Error("Item de venda inválido.");
			if (!Number.isInteger(quantidade) || quantidade <= 0)
				throw new Error("Quantidade de devolução inválida.");

			const itemVenda = await get(
				"SELECT * FROM ItensVenda WHERE id = ? AND venda_id = ?",
				[itemVendaId, vendaId],
			);
			if (!itemVenda)
				throw new Error("Item não pertence a esta venda.");

			const jaDevolvido = await get(
				"SELECT COALESCE(SUM(quantidade), 0) AS total FROM ItensDevolucao WHERE item_venda_id = ?",
				[itemVendaId],
			);
			const disponivel = itemVenda.quantidade - (jaDevolvido ? jaDevolvido.total : 0);
			if (quantidade > disponivel)
				throw new Error(
					"Quantidade maior que o disponível para devolução (" + disponivel + ").",
				);

			await run(
				"INSERT INTO ItensDevolucao (devolucao_id, item_venda_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?, ?)",
				[devolucaoId, itemVendaId, itemVenda.variacao_id, quantidade, itemVenda.preco_unitario],
			);

			await run(
				"UPDATE Variacoes SET quantidade_estoque = quantidade_estoque + ? WHERE id = ?",
				[quantidade, itemVenda.variacao_id],
			);

			await run(
				"INSERT INTO MovimentacoesEstoque (variacao_id, tipo, quantidade, custo_unitario, origem, referencia_id, observacao, data) VALUES (?, 'entrada', ?, NULL, 'devolucao', ?, ?, ?)",
				[
					itemVenda.variacao_id,
					quantidade,
					devolucaoId,
					"Devolução da venda #" + vendaId + (motivo ? " — " + motivo : ""),
					new Date().toISOString(),
				],
			);

			valorTotal += quantidade * itemVenda.preco_unitario;
		}

		await run("UPDATE Devolucoes SET valor_total = ? WHERE id = ?", [
			Math.round(valorTotal * 100) / 100,
			devolucaoId,
		]);

		// Venda fiado com conta a receber ainda aberta: abate o valor devolvido.
		if (venda.forma_pagamento === "Fiado") {
			const lancamento = await get(
				"SELECT * FROM LancamentosFinanceiros WHERE origem = 'venda' AND referencia_id = ? AND tipo = 'receber' AND status = 'aberto'",
				[vendaId],
			);
			if (lancamento) {
				const novoValor = Math.max(0, lancamento.valor - valorTotal);
				if (novoValor <= 0.005) {
					await run(
						"UPDATE LancamentosFinanceiros SET status = 'pago', data_pagamento = ?, valor = 0 WHERE id = ?",
						[new Date().toISOString(), lancamento.id],
					);
				} else {
					await run(
						"UPDATE LancamentosFinanceiros SET valor = ? WHERE id = ?",
						[Math.round(novoValor * 100) / 100, lancamento.id],
					);
				}
			}
		}

		await run("COMMIT");
		return { success: true, devolucaoId, valorTotal: Math.round(valorTotal * 100) / 100 };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

async function getDevolucoes(filtro) {
	filtro = filtro || {};
	let sql =
		`SELECT d.*, v.cliente_id, c.nome AS cliente_nome
     FROM Devolucoes d
     JOIN Vendas v ON v.id = d.venda_id
     LEFT JOIN Clientes c ON c.id = v.cliente_id`;
	const where = [];
	const params = [];
	if (filtro.vendaId) {
		where.push("d.venda_id = ?");
		params.push(filtro.vendaId);
	}
	if (where.length > 0) sql += " WHERE " + where.join(" AND ");
	sql += " ORDER BY d.id DESC LIMIT 200";
	return allAsync(sql, params);
}

async function getItensDevolucao(devolucaoId) {
	return allAsync(
		`SELECT idv.*, v.sku, p.nome AS produto_nome
     FROM ItensDevolucao idv
     JOIN Variacoes v ON v.id = idv.variacao_id
     JOIN Produtos p ON p.id = v.produto_id
     WHERE idv.devolucao_id = ?
     ORDER BY idv.id`,
		[devolucaoId],
	);
}

function getDBPath() {
	return DB_PATH;
}

const TABELAS_VISIVEIS = null;

async function listarTabelasBanco() {
	const conn = getConexao();
	return new Promise((resolver, rejeitar) => {
		conn.all(
			"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
			[],
			(erro, linhas) => {
				if (erro) return rejeitar(erro.message);
				resolver((linhas || []).map((l) => l.name));
			},
		);
	});
}

// Visão geral: todas as tabelas (já cadastradas e as que forem criadas no
// futuro, já que a lista vem de sqlite_master) com a contagem de registros.
async function resumoTabelasBanco() {
	const tabelas = await listarTabelasBanco();
	const resumo = [];
	for (const tabela of tabelas) {
		const linha = await getAsync("SELECT COUNT(*) AS n FROM " + tabela, []);
		resumo.push({ tabela, total: Number(linha.n) });
	}
	return resumo;
}

// Exporta o conteúdo completo do banco (todas as tabelas, sem limite de
// linhas) para um arquivo JSON legível, para backup/auditoria fora do app.
async function exportarBancoJSON() {
	const fs = require("fs");
	const tabelas = await listarTabelasBanco();
	const dados = {};
	let totalRegistros = 0;
	for (const tabela of tabelas) {
		const linhas = await allAsync("SELECT * FROM " + tabela, []);
		dados[tabela] = linhas;
		totalRegistros += linhas.length;
	}

	const dbDir = path.dirname(DB_PATH);
	const exportDir = path.join(dbDir, "exports");
	if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

	const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
	const destino = path.join(exportDir, "banco_export_" + carimbo + ".json");
	fs.writeFileSync(
		destino,
		JSON.stringify(
			{ exportadoEm: new Date().toISOString(), tabelas: dados },
			null,
			2,
		),
		"utf8",
	);

	return { caminho: destino, tabelas: tabelas.length, registros: totalRegistros };
}

async function consultarTabelaBanco(tabela, limite) {
	const nome = String(tabela || "").replace(/[^A-Za-z0-9_]/g, "");
	if (!nome) throw new Error("Tabela inválida.");
	const tabelas = await listarTabelasBanco();
	if (tabelas.indexOf(nome) === -1) {
		throw new Error("Tabela não existe: " + nome);
	}
	const limiteNum = Math.max(1, Math.min(200, Number(limite) || 50));
	const conn = getConexao();
	const [colunas, linhas, total] = await Promise.all([
		colunasDaTabela(conn, nome),
		allAsync("SELECT * FROM " + nome + " LIMIT " + limiteNum, []),
		getAsync("SELECT COUNT(*) AS n FROM " + nome, []),
	]);
	return {
		tabela: nome,
		colunas,
		linhas,
		total: Number(total.n),
		limite: limiteNum,
	};
}

function verificarSenhaAdmin(login, senha) {
	const l = String(login || "")
		.trim()
		.toLowerCase();
	const hash = hashSenhaUsuario(l, String(senha || ""));
	return getAsync(
		"SELECT senha_hash, perfil, ativo FROM Usuarios WHERE login = ? COLLATE NOCASE",
		[l],
	).then(
		(usr) =>
			!!(
				usr &&
				usr.perfil === "admin" &&
				Number(usr.ativo) === 1 &&
				usr.senha_hash === hash
			),
	);
}

module.exports = {
	db: getConexao,
	iniciarBanco,
	getConexao,
	desbloquearBanco,
	trocarChave,
	isDesbloqueado,
	bloquearBanco,
	listarTabelasBanco,
	resumoTabelasBanco,
	consultarTabelaBanco,
	exportarBancoJSON,
	verificarSenhaAdmin,
	salvarProduto,
	atualizarProduto,
	removerProduto,
	restaurarProduto,
	excluirProdutoPermanente,
	listProdutosDetalhados,
	getProximoSkuProduto,
	getProximoCodigoCategoria,
	buscarSKU,
	buscarProdutosPorTermo,
	finalizarVenda,
	setDBPath,
	getDBPath,
	getProximoCodigoCliente,
	getDashboardStats,
	getClientes,
	salvarCliente,
	atualizarCliente,
	removerCliente,
	restaurarCliente,
	excluirClientePermanente,
	buscarCliente,
	getVendas,
	getVendasHoje,
	importarVendasHistoricas,
	getFaturamentoMedioHistorico,
	getItensVenda,
	getMovimentacoesCliente,
	getEstoqueNegativo,
	getCategorias,
	getListCategoriasWithUsage,
	removerCategoria,
	getPricingData,
	getGlobalMargin,
	saveGlobalMargin,
	getCustoFixoConfig,
	saveCustoFixoConfig,
	saveAplicarCustoFixo,
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
	registrarEntradaEstoque,
	getMovimentacoesEstoque,
	getEstoqueBaixo,
	getEstoqueVisaoGeral,
	salvarEstoqueMinimo,
	ajustarEstoqueManual,
	converterOrcamento,
	getFornecedores,
	salvarFornecedor,
	atualizarFornecedor,
	removerFornecedor,
	listarProdutosFornecedor,
	salvarProdutoFornecedor,
	removerProdutoFornecedor,
	getCustoFornecedorProduto,
	criarPedidoCompra,
	getPedidosCompra,
	getItensPedidoCompra,
	receberPedidoCompra,
	cancelarPedidoCompra,
	getLancamentos,
	criarLancamento,
	baixarLancamento,
	excluirLancamento,
	abrirCaixa,
	fecharCaixa,
	getCaixaAberto,
	getResumoCaixaAberto,
	getHistoricoCaixa,
	getFluxoCaixa,
	getDRE,
	getRelatorioVendas,
	getCurvaABC,
	getComissoes,
	registrarLog,
	getLogAtividades,
	autenticarUsuario,
	getUsuario,
	listarUsuarios,
	salvarUsuario,
	removerUsuario,
	cancelarOrcamento,
	registrarDevolucao,
	getDevolucoes,
	getItensDevolucao,
	getCotacaoProduto,
	listarPrecosCliente,
	salvarPrecoCliente,
	removerPrecoCliente,
	getPrecoCliente,
	salvarImagemProduto,
	removerImagemProduto,
	getCaminhoImagemProduto,
	buscaGlobal,
};

function getClientes(incluirInativos) {
	const conn = getConexao();
	return new Promise((resolver, rejeitar) => {
		conn.all(
			"SELECT id, codigo, nome, cpf_cnpj, telefone, email, endereco, academia, faixa, ativo FROM Clientes WHERE ? OR ativo = 1 ORDER BY nome",
			[incluirInativos ? 1 : 0],
			(erro, linhas) => {
				if (erro) return rejeitar(erro.message);
				resolver(linhas);
			},
		);
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
			"INSERT INTO Clientes (codigo, nome, cpf_cnpj, telefone, email, academia, faixa, endereco) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			[
				dados.codigo || null,
				dados.nome,
				dados.cpf_cnpj || null,
				dados.telefone || null,
				dados.email || null,
				dados.academia || null,
				dados.faixa || null,
				dados.endereco || null,
			],
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
			"UPDATE Clientes SET codigo=?, nome=?, cpf_cnpj=?, telefone=?, email=?, academia=?, faixa=?, endereco=? WHERE id=?",
			[
				dados.codigo || null,
				dados.nome,
				dados.cpf_cnpj || null,
				dados.telefone || null,
				dados.email || null,
				dados.academia || null,
				dados.faixa || null,
				dados.endereco || null,
				id,
			],
		);
		await run("COMMIT");
		return { success: true };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

// Exclusão é lógica (ativo=0): cliente some das listas/buscas normais mas
// fica recuperável na Lixeira, e vendas antigas continuam com a referência
// (Vendas.cliente_id não é tocado).
async function removerCliente(id) {
	const existente = await getAsync("SELECT id FROM Clientes WHERE id = ?", [id]);
	if (!existente) throw new Error("Cliente não encontrado.");

	await runAsync("UPDATE Clientes SET ativo = 0 WHERE id = ?", [id]);
	return { success: true };
}

async function restaurarCliente(id) {
	const existente = await getAsync("SELECT id FROM Clientes WHERE id = ?", [id]);
	if (!existente) throw new Error("Cliente não encontrado.");

	await runAsync("UPDATE Clientes SET ativo = 1 WHERE id = ?", [id]);
	return { success: true };
}

async function excluirClientePermanente(id) {
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

	await run("BEGIN TRANSACTION");
	try {
		const existente = await get("SELECT id, ativo FROM Clientes WHERE id = ?", [id]);
		if (!existente) throw new Error("Cliente não encontrado.");
		if (Number(existente.ativo) === 1)
			throw new Error("Envie o cliente para a lixeira antes de excluir definitivamente.");

		const vendido = await get("SELECT COUNT(*) AS n FROM Vendas WHERE cliente_id = ?", [id]);
		if (vendido.n > 0) {
			throw new Error("Este cliente não pode ser excluído pois possui vendas registradas.");
		}

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
		const sql =
			"SELECT id, codigo, nome, cpf_cnpj, telefone, email, endereco, academia, faixa FROM Clientes WHERE ativo = 1 ORDER BY nome";
		const alvo = normalizarBusca(filtro);
		conn.all(sql, [], (erro, linhas) => {
			if (erro) return rejeitar(erro.message);
			if (!alvo) return resolver(linhas);
			resolver(
				linhas.filter((l) =>
					["nome", "telefone", "codigo", "cpf_cnpj"].some(
						(campo) => normalizarBusca(l[campo]).indexOf(alvo) !== -1,
					),
				),
			);
		});
	});
}

async function getVendas(filtro) {
	const conn = getConexao();
	return new Promise((resolver, rejeitar) => {
		let sql =
			"SELECT v.id, v.total, v.forma_pagamento, v.data_venda, v.desconto, v.observacao, v.status, c.nome AS cliente_nome FROM Vendas v LEFT JOIN Clientes c ON c.id = v.cliente_id";
		const params = [];
		const where = [];

		// Compatibilidade: string simples filtra por data exata (frontend antigo).
		const filtroObj = filtro && typeof filtro === "object" ? filtro : {};
		const filtroData = typeof filtro === "string" ? filtro : filtroObj.data || null;
		const filtroDataInicio = filtroObj.dataInicio || null;
		const filtroDataFim = filtroObj.dataFim || null;
		const filtroStatus = filtroObj.status || null;
		const filtroFormaPagamento = filtroObj.formaPagamento || null;

		if (filtroData) {
			where.push("DATE(v.data_venda) = ?");
			params.push(filtroData);
		}
		if (filtroDataInicio) {
			where.push("DATE(v.data_venda) >= ?");
			params.push(filtroDataInicio);
		}
		if (filtroDataFim) {
			where.push("DATE(v.data_venda) <= ?");
			params.push(filtroDataFim);
		}
		if (filtroStatus) {
			where.push("v.status = ?");
			params.push(filtroStatus);
		}
		if (filtroFormaPagamento) {
			where.push("v.forma_pagamento = ?");
			params.push(filtroFormaPagamento);
		}
		if (where.length > 0) {
			sql += " WHERE " + where.join(" AND ");
		}

		sql += " ORDER BY v.data_venda DESC LIMIT 100";

		conn.all(sql, params, (erro, linhas) => {
			if (erro) return rejeitar(erro.message);
			resolver(linhas);
		});
	});
}

// Importa vendas históricas já normalizadas (ver ferramenta externa de tratamento
// de planilhas do cliente — o ERP não faz parsing/mapeamento de coluna, só recebe
// {sku, quantidade, valorUnitario, data} prontos). Usado para popular o histórico
// de faturamento (getFaturamentoMedioHistorico) sem esperar um mês real de uso.
// Diferente de finalizarVenda: NÃO mexe em Variacoes.quantidade_estoque, pois é
// histórico de um período passado — o estoque atual não deve ser afetado.
async function importarVendasHistoricas(linhas) {
	if (!Array.isArray(linhas) || linhas.length === 0) {
		throw new Error("Nenhuma linha para importar.");
	}
	const conn = getConexao();

	const get = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.get(sql, params, (erro, linha) => {
				if (erro) return reject(erro);
				resolve(linha);
			});
		});

	let importadas = 0;
	let puladas = 0;
	await runOn(conn, "BEGIN TRANSACTION");
	try {
		for (const linha of linhas) {
			const sku = String(linha.sku || "").trim().toUpperCase();
			const quantidade = Number(linha.quantidade);
			const valorUnitario = Number(linha.valorUnitario);
			const data = linha.data ? String(linha.data) : null;
			if (
				!sku ||
				!Number.isFinite(quantidade) ||
				quantidade <= 0 ||
				!Number.isFinite(valorUnitario) ||
				valorUnitario < 0 ||
				!data
			) {
				puladas++;
				continue;
			}
			const variacao = await get("SELECT id FROM Variacoes WHERE UPPER(sku) = ?", [sku]);
			if (!variacao) {
				puladas++;
				continue;
			}
			const total = quantidade * valorUnitario;
			const vendaResult = await runOn(
				conn,
				"INSERT INTO Vendas (total, forma_pagamento, data_venda, status, origem) VALUES (?, NULL, ?, 'finalizada', 'importado')",
				[total, data],
			);
			await runOn(
				conn,
				"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)",
				[vendaResult.lastID, variacao.id, quantidade, valorUnitario],
			);
			importadas++;
		}
		await runOn(conn, "COMMIT");
	} catch (erro) {
		await runOn(conn, "ROLLBACK");
		throw erro;
	}
	return { importadas, puladas, total: linhas.length };
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
			},
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
						resolver({
							success: true,
							message: "Backup restaurado com sucesso.",
						});
					})
					.catch((e) =>
						rejeitar(
							"Backup restaurado, mas não foi possível reabrir o banco: " +
								e.message,
						),
					);
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
	const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

	const totalVendas = await get(
		"SELECT COUNT(*) AS total FROM Vendas WHERE DATE(data_venda) = ? AND status = 'finalizada'",
		[hoje],
	);

	const somaTotal = await get(
		"SELECT COALESCE(SUM(total), 0) AS soma FROM Vendas WHERE DATE(data_venda) = ? AND status = 'finalizada'",
		[hoje],
	);

	// Comparativo "hoje vs. ontem" para o badge de tendência do dashboard —
	// só faz sentido pra vendas/faturamento do dia, não pros demais cards.
	const totalVendasOntem = await get(
		"SELECT COUNT(*) AS total FROM Vendas WHERE DATE(data_venda) = ? AND status = 'finalizada'",
		[ontem],
	);
	const somaTotalOntem = await get(
		"SELECT COALESCE(SUM(total), 0) AS soma FROM Vendas WHERE DATE(data_venda) = ? AND status = 'finalizada'",
		[ontem],
	);
	function variacaoPercentual(hojeVal, ontemVal) {
		if (!ontemVal) return null;
		return ((hojeVal - ontemVal) / ontemVal) * 100;
	}
	const vendasHojeVariacao = variacaoPercentual(totalVendas.total, totalVendasOntem.total);
	const faturamentoHojeVariacao = variacaoPercentual(somaTotal.soma, somaTotalOntem.soma);

	const totalProdutos = await get("SELECT COUNT(*) AS total FROM Produtos");

	const estoqueBaixo = await all(
		"SELECT COUNT(*) AS total FROM Variacoes WHERE quantidade_estoque > 0 AND quantidade_estoque <= estoque_minimo",
	);

	const aReceber = await get(
		"SELECT COALESCE(SUM(valor), 0) AS soma FROM LancamentosFinanceiros WHERE tipo = 'receber' AND status = 'aberto' AND DATE(data_vencimento) <= ?",
		[hoje],
	);

	const aPagar = await get(
		"SELECT COALESCE(SUM(valor), 0) AS soma FROM LancamentosFinanceiros WHERE tipo = 'pagar' AND status = 'aberto' AND DATE(data_vencimento) <= ?",
		[hoje],
	);

	// Série curta para o mini-gráfico do dashboard — últimos 7 dias, incluindo
	// hoje, preenchendo com zero os dias sem venda.
	const seteDiasAtras = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10);
	const porDiaBruto = await all(
		"SELECT DATE(data_venda) AS dia, COALESCE(SUM(total), 0) AS faturamento FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ? GROUP BY DATE(data_venda)",
		[seteDiasAtras, hoje],
	);
	const mapaDias = {};
	porDiaBruto.forEach((r) => { mapaDias[r.dia] = r.faturamento; });
	const faturamentoUltimos7Dias = [];
	for (let i = 6; i >= 0; i--) {
		const dia = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
		faturamentoUltimos7Dias.push({ dia, faturamento: mapaDias[dia] || 0 });
	}

	// Produtos mais vendidos nos últimos 30 dias (por receita) — alimenta o
	// painel "Mais vendidos" do dashboard.
	const trintaDiasAtras = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10);
	const topProdutos = await all(
		`SELECT p.nome, p.imagem, v.sku, SUM(iv.quantidade) AS quantidade,
            SUM(iv.quantidade * iv.preco_unitario) AS receita
     FROM ItensVenda iv
     JOIN Vendas ve ON ve.id = iv.venda_id
     JOIN Variacoes v ON v.id = iv.variacao_id
     JOIN Produtos p ON p.id = v.produto_id
     WHERE ve.status = 'finalizada' AND DATE(ve.data_venda) >= ?
     GROUP BY p.id
     ORDER BY receita DESC
     LIMIT 5`,
		[trintaDiasAtras],
	);

	return {
		vendasHoje: totalVendas.total,
		vendasHojeVariacao,
		faturamentoHoje: somaTotal.soma,
		faturamentoHojeVariacao,
		totalProdutos: totalProdutos.total,
		estoqueBaixo: estoqueBaixo[0].total,
		aReceberHoje: aReceber.soma,
		aPagarHoje: aPagar.soma,
		faturamentoUltimos7Dias,
		topProdutos,
	};
}

async function getItensVenda(vendaId) {
	const conn = getConexao();
	return new Promise((resolver, rejeitar) => {
		const sql =
			"SELECT iv.id, iv.variacao_id, p.nome AS produto_nome, v.tamanho, v.cor, v.atributos, v.sku, iv.quantidade, iv.preco_unitario, (iv.quantidade * iv.preco_unitario) AS subtotal, " +
			"(SELECT COALESCE(SUM(idv.quantidade), 0) FROM ItensDevolucao idv WHERE idv.item_venda_id = iv.id) AS quantidade_devolvida " +
			"FROM ItensVenda iv JOIN Variacoes v ON v.id = iv.variacao_id JOIN Produtos p ON p.id = v.produto_id WHERE iv.venda_id = ? ORDER BY iv.id";
		conn.all(sql, [vendaId], (erro, linhas) => {
			if (erro) return rejeitar(erro.message);
			resolver(linhas);
		});
	});
}

async function getMovimentacoesCliente(clienteId) {
	const conn = getConexao();
	const all = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.all(sql, params, (erro, linhas) => {
				if (erro) return reject(erro.message);
				resolve(linhas);
			});
		});
	const linhasVendas = await all(
		`SELECT v.id, v.total, v.forma_pagamento, v.data_venda, v.desconto, v.observacao, v.status
     FROM Vendas v WHERE v.cliente_id = ? ORDER BY v.data_venda DESC`,
		[Number(clienteId)],
	);
	const movimentacoes = [];
	for (const venda of linhasVendas) {
		const itens = await all(
			`SELECT p.nome AS produto_nome, v.tamanho, v.cor, v.sku,
              iv.quantidade, iv.preco_unitario,
              (iv.quantidade * iv.preco_unitario) AS subtotal
       FROM ItensVenda iv
       JOIN Variacoes v ON v.id = iv.variacao_id
       JOIN Produtos p ON p.id = v.produto_id
       WHERE iv.venda_id = ? ORDER BY iv.id`,
			[venda.id],
		);
		movimentacoes.push({ venda: venda, itens: itens });
	}
	return movimentacoes;
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
	const linhas = await allAsync("SELECT * FROM Categorias ORDER BY nome");
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
	const nomeLimpo = String(nome || "").trim();
	if (!nomeLimpo) throw new Error("Informe o nome da categoria.");

	const paiId = categoriaPaiId || null;
	if (paiId) {
		const pai = await getAsync(
			"SELECT id, categoria_pai_id FROM Categorias WHERE id = ?",
			[paiId],
		);
		if (!pai) throw new Error("Categoria pai não encontrada.");
		if (pai.categoria_pai_id)
			throw new Error("Só é permitido um nível de subcategoria.");
	}

	const existente = await getAsync(
		"SELECT id FROM Categorias WHERE UPPER(nome) = ? AND IFNULL(categoria_pai_id, 0) = ?",
		[nomeLimpo.toUpperCase(), paiId || 0],
	);
	if (existente) throw new Error("Categoria já cadastrada.");

	const result = await runAsync(
		"INSERT INTO Categorias (nome, categoria_pai_id) VALUES (?, ?)",
		[nomeLimpo, paiId],
	);
	return { success: true, id: result.lastID };
}

async function salvarCategoriaComSubcategorias(dados) {
	const conn = getConexao();

	const nome = String((dados && dados.nome) || "").trim();
	const paiId =
		dados && dados.categoriaPaiId ? Number(dados.categoriaPaiId) || null : null;
	const subcategorias = Array.isArray(dados && dados.subcategorias)
		? dados.subcategorias
		: [];

	const nomesSubs = [];
	for (const s of subcategorias) {
		const n = String(
			(s && s.nome) || (typeof s === "string" ? s : "") || "",
		).trim();
		if (n) nomesSubs.push(n);
	}

	if (!nome && nomesSubs.length === 0) {
		throw new Error(
			"Informe o nome da categoria ou ao menos uma subcategoria.",
		);
	}
	// Máximo de 2 níveis: não é possível criar subcategorias dentro de uma subcategoria.
	if (nome && paiId && nomesSubs.length > 0) {
		throw new Error(
			"Não é possível criar subcategorias dentro de uma subcategoria (máximo de 2 níveis).",
		);
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

	await run("BEGIN TRANSACTION");

	try {
		let pai = null;
		if (paiId) {
			pai = await get(
				"SELECT id, categoria_pai_id FROM Categorias WHERE id = ?",
				[paiId],
			);
			if (!pai) throw new Error("Categoria principal não encontrada.");
			if (pai.categoria_pai_id)
				throw new Error("Só é permitido um nível de subcategoria.");
		}

		const existeDuplicata = async (nomeCandidato, nivelPai) => {
			const dup = await get(
				"SELECT id FROM Categorias WHERE UPPER(nome) = ? AND IFNULL(categoria_pai_id, 0) = ?",
				[nomeCandidato.toUpperCase(), nivelPai],
			);
			return !!dup;
		};

		let paiAlvo = null;
		const criados = [];

		if (nome) {
			if (await existeDuplicata(nome, paiId || 0)) {
				throw new Error("Categoria já cadastrada: " + nome);
			}
			const result = await run(
				"INSERT INTO Categorias (nome, categoria_pai_id) VALUES (?, ?)",
				[nome, paiId || null],
			);
			paiAlvo = result.lastID;
			criados.push(paiAlvo);
		} else {
			// Modo "adicionar subcategorias a uma categoria existente".
			paiAlvo = paiId;
		}

		for (const n of nomesSubs) {
			if (await existeDuplicata(n, paiAlvo)) {
				throw new Error("Subcategoria já cadastrada: " + n);
			}
			const r = await run(
				"INSERT INTO Categorias (nome, categoria_pai_id) VALUES (?, ?)",
				[n, paiAlvo],
			);
			criados.push(r.lastID);
		}

		await run("COMMIT");
		return { success: true, id: paiAlvo, criados };
	} catch (erro) {
		await run("ROLLBACK");
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
		dados.prazo_entrega_dias !== undefined && dados.prazo_entrega_dias !== null && dados.prazo_entrega_dias !== ""
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
	const result = await runAsync(
		"DELETE FROM FornecedorProdutos WHERE id = ?",
		[id],
	);
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

/* ============ Tabela de preço por cliente ============ */

async function listarPrecosCliente(clienteId) {
	if (!clienteId) return [];
	return allAsync(
		`SELECT pc.id, pc.cliente_id, pc.variacao_id, pc.preco,
            v.sku, v.tamanho, v.cor, v.atributos, v.preco AS preco_padrao, p.nome AS produto_nome
     FROM PrecoCliente pc
     JOIN Variacoes v ON v.id = pc.variacao_id
     JOIN Produtos p ON p.id = v.produto_id
     WHERE pc.cliente_id = ?
     ORDER BY p.nome COLLATE NOCASE`,
		[Number(clienteId)],
	);
}

async function salvarPrecoCliente(dados) {
	const clienteId = Number(dados && dados.cliente_id);
	const variacaoId = Number(dados && dados.variacao_id);
	const preco = Number(dados && dados.preco);
	if (!clienteId) throw new Error("Cliente inválido.");
	if (!variacaoId) throw new Error("SKU inválido.");
	if (!Number.isFinite(preco) || preco < 0) throw new Error("Preço inválido.");

	await runAsync(
		`INSERT OR REPLACE INTO PrecoCliente (id, cliente_id, variacao_id, preco)
     VALUES ((SELECT id FROM PrecoCliente WHERE cliente_id = ? AND variacao_id = ?), ?, ?, ?)`,
		[clienteId, variacaoId, clienteId, variacaoId, Math.round(preco * 100) / 100],
	);
	return { success: true };
}

async function removerPrecoCliente(id) {
	const result = await runAsync("DELETE FROM PrecoCliente WHERE id = ?", [id]);
	if (result.changes === 0) throw new Error("Preço especial não encontrado.");
	return { success: true };
}

// Consultado pelo PDV ao escanear um SKU com cliente já selecionado: retorna
// o preço combinado com este cliente para esta variação, ou null se não houver.
async function getPrecoCliente(clienteId, variacaoId) {
	if (!clienteId || !variacaoId) return null;
	const row = await getAsync(
		"SELECT preco FROM PrecoCliente WHERE cliente_id = ? AND variacao_id = ?",
		[Number(clienteId), Number(variacaoId)],
	);
	return row ? row.preco : null;
}

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
			const receberAgora = mapaRecebimento.size > 0
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
					"Recebimento do pedido #" + pedidoId +
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
				prazoDias = fornecedor ? Number(fornecedor.prazo_pagamento_dias) || 0 : 0;
			}
			const vencimento = new Date(
				Date.now() + prazoDias * 24 * 60 * 60 * 1000,
			).toISOString();

			await criarLancamentoInterno(run, {
				tipo: "pagar",
				descricao:
					"Pedido de compra #" + pedidoId +
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

/* ============ Financeiro (contas a pagar/receber + fluxo de caixa) ============ */

async function criarLancamentoInterno(run, dados) {
	await run(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, referencia_id, forma_pagamento, data_criacao) VALUES (?, ?, ?, ?, NULL, 'aberto', ?, ?, ?, ?)",
		[
			dados.tipo,
			dados.descricao,
			dados.valor,
			dados.data_vencimento || null,
			dados.origem || "manual",
			dados.referencia_id || null,
			dados.forma_pagamento || null,
			new Date().toISOString(),
		],
	);
}

async function getLancamentos(filtro) {
	filtro = filtro || {};
	let sql = "SELECT * FROM LancamentosFinanceiros";
	const where = [];
	const params = [];
	if (filtro.tipo) {
		where.push("tipo = ?");
		params.push(filtro.tipo);
	}
	if (filtro.status) {
		where.push("status = ?");
		params.push(filtro.status);
	}
	if (where.length > 0) sql += " WHERE " + where.join(" AND ");
	sql +=
		" ORDER BY (CASE WHEN status = 'aberto' THEN 0 ELSE 1 END), DATE(data_vencimento) ASC, id DESC LIMIT 200";
	return allAsync(sql, params);
}

async function criarLancamento(dados) {
	const tipo = dados && dados.tipo;
	const descricao = String((dados && dados.descricao) || "").trim();
	const valor = Number(dados && dados.valor);
	if (tipo !== "pagar" && tipo !== "receber")
		throw new Error("Tipo de lançamento inválido.");
	if (!descricao) throw new Error("Informe a descrição do lançamento.");
	if (!Number.isFinite(valor) || valor <= 0) throw new Error("Valor inválido.");

	const parcelas = Math.max(1, parseInt(dados.parcelas, 10) || 1);
	if (parcelas > 1) {
		return criarLancamentoParcelado(dados, tipo, descricao, valor, parcelas);
	}

	const vencimento = dados.data_vencimento
		? new Date(dados.data_vencimento).toISOString()
		: new Date().toISOString();

	const result = await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, referencia_id, forma_pagamento, data_criacao) VALUES (?, ?, ?, ?, NULL, 'aberto', 'manual', NULL, NULL, ?)",
		[
			tipo,
			descricao,
			Math.round(valor * 100) / 100,
			vencimento,
			new Date().toISOString(),
		],
	);
	return { success: true, lancamentoId: result.lastID };
}

// Divide um lançamento em N parcelas mensais iguais (a última absorve o
// arredondamento), ligadas por um grupo_id para exibição/baixa individual.
async function criarLancamentoParcelado(dados, tipo, descricao, valor, parcelas) {
	const grupoId =
		Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
	const dataBase = dados.data_vencimento
		? new Date(dados.data_vencimento)
		: new Date();
	const valorParcela = Math.round((valor / parcelas) * 100) / 100;
	const agora = new Date().toISOString();
	const ids = [];

	let somaParcelas = 0;
	for (let i = 0; i < parcelas; i++) {
		const vencParcela = new Date(dataBase);
		vencParcela.setMonth(vencParcela.getMonth() + i);
		const ultima = i === parcelas - 1;
		const valorEsta = ultima
			? Math.round((valor - somaParcelas) * 100) / 100
			: valorParcela;
		somaParcelas += valorEsta;

		const result = await runAsync(
			"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, referencia_id, forma_pagamento, data_criacao, grupo_id, parcela_num, parcela_total) VALUES (?, ?, ?, ?, NULL, 'aberto', 'manual', NULL, NULL, ?, ?, ?, ?)",
			[
				tipo,
				descricao + " (" + (i + 1) + "/" + parcelas + ")",
				valorEsta,
				vencParcela.toISOString(),
				agora,
				grupoId,
				i + 1,
				parcelas,
			],
		);
		ids.push(result.lastID);
	}
	return { success: true, lancamentoId: ids[0], grupoId, parcelaIds: ids };
}

async function baixarLancamento(id) {
	const result = await runAsync(
		"UPDATE LancamentosFinanceiros SET status = 'pago', data_pagamento = ? WHERE id = ? AND status = 'aberto'",
		[new Date().toISOString(), id],
	);
	if (result.changes === 0)
		throw new Error("Lançamento não encontrado ou já baixado.");
	return { success: true };
}

async function excluirLancamento(id) {
	const result = await runAsync(
		"DELETE FROM LancamentosFinanceiros WHERE id = ? AND status = 'aberto' AND origem = 'manual'",
		[id],
	);
	if (result.changes === 0)
		throw new Error("Só é possível excluir lançamentos manuais em aberto.");
	return { success: true };
}

/* ============ Fechamento de caixa ============ */

// Soma o que deveria estar em dinheiro no caixa: vendas finalizadas em
// "Dinheiro" dentro da janela aberta, menos devoluções em dinheiro no mesmo
// período (Devolucoes não guarda forma de pagamento — como o troco de uma
// devolução normalmente sai do caixa físico, todo estorno é descontado).
async function calcularValorEsperadoCaixa(dataAbertura, dataFechamento) {
	const fim = dataFechamento || new Date().toISOString();
	const vendas = await getAsync(
		`SELECT COALESCE(SUM(total), 0) AS soma FROM Vendas
     WHERE status = 'finalizada' AND forma_pagamento = 'Dinheiro'
       AND data_venda >= ? AND data_venda <= ?`,
		[dataAbertura, fim],
	);
	const devolucoes = await getAsync(
		`SELECT COALESCE(SUM(valor_total), 0) AS soma FROM Devolucoes
     WHERE data >= ? AND data <= ?`,
		[dataAbertura, fim],
	);
	return (
		Math.round((Number(vendas.soma || 0) - Number(devolucoes.soma || 0)) * 100) /
		100
	);
}

async function getCaixaAberto() {
	return getAsync(
		"SELECT * FROM FechamentosCaixa WHERE status = 'aberto' ORDER BY id DESC LIMIT 1",
	);
}

async function abrirCaixa(valorAbertura, usuarioId) {
	const existente = await getCaixaAberto();
	if (existente) throw new Error("Já existe um caixa aberto (desde " + existente.data_abertura + ").");

	const valor = Number(valorAbertura);
	if (!Number.isFinite(valor) || valor < 0)
		throw new Error("Valor de abertura inválido.");

	const result = await runAsync(
		"INSERT INTO FechamentosCaixa (data_abertura, valor_abertura, usuario_abertura_id, status) VALUES (?, ?, ?, 'aberto')",
		[new Date().toISOString(), valor, usuarioId || null],
	);
	return { success: true, caixaId: result.lastID };
}

async function fecharCaixa(valorInformado, observacao, usuarioId) {
	const caixa = await getCaixaAberto();
	if (!caixa) throw new Error("Não há caixa aberto.");

	const valor = Number(valorInformado);
	if (!Number.isFinite(valor) || valor < 0)
		throw new Error("Valor informado inválido.");

	const dataFechamento = new Date().toISOString();
	const vendidoEmDinheiro = await calcularValorEsperadoCaixa(
		caixa.data_abertura,
		dataFechamento,
	);
	const valorEsperado =
		Math.round((Number(caixa.valor_abertura) + vendidoEmDinheiro) * 100) / 100;
	const diferenca = Math.round((valor - valorEsperado) * 100) / 100;

	await runAsync(
		`UPDATE FechamentosCaixa
     SET data_fechamento = ?, valor_informado = ?, valor_esperado = ?, diferenca = ?,
         usuario_fechamento_id = ?, observacao = ?, status = 'fechado'
     WHERE id = ?`,
		[
			dataFechamento,
			valor,
			valorEsperado,
			diferenca,
			usuarioId || null,
			String(observacao || "").trim() || null,
			caixa.id,
		],
	);
	return {
		success: true,
		valorEsperado,
		valorInformado: valor,
		diferenca,
	};
}

async function getResumoCaixaAberto() {
	const caixa = await getCaixaAberto();
	if (!caixa) return null;
	const vendidoEmDinheiro = await calcularValorEsperadoCaixa(caixa.data_abertura, null);
	const valorEsperadoAgora =
		Math.round((Number(caixa.valor_abertura) + vendidoEmDinheiro) * 100) / 100;
	return {
		id: caixa.id,
		data_abertura: caixa.data_abertura,
		valor_abertura: caixa.valor_abertura,
		vendido_em_dinheiro: vendidoEmDinheiro,
		valor_esperado_agora: valorEsperadoAgora,
	};
}

async function getHistoricoCaixa(limite) {
	const lim = Math.max(1, Math.min(200, Number(limite) || 50));
	return allAsync(
		"SELECT * FROM FechamentosCaixa WHERE status = 'fechado' ORDER BY id DESC LIMIT " + lim,
	);
}

// Fluxo de caixa realizado: entradas = vendas à vista + recebimentos; saídas = pagamentos.
async function getFluxoCaixa(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const entradasVendas = await allAsync(
		"SELECT DATE(data_venda) AS dia, SUM(total) AS valor FROM Vendas WHERE status = 'finalizada' AND (forma_pagamento IS NULL OR forma_pagamento != 'Fiado') AND DATE(data_venda) BETWEEN ? AND ? GROUP BY DATE(data_venda)",
		[inicio, fim],
	);
	const entradasRecebimentos = await allAsync(
		"SELECT DATE(data_pagamento) AS dia, SUM(valor) AS valor FROM LancamentosFinanceiros WHERE tipo = 'receber' AND status = 'pago' AND DATE(data_pagamento) BETWEEN ? AND ? GROUP BY DATE(data_pagamento)",
		[inicio, fim],
	);
	const saidasPagamentos = await allAsync(
		"SELECT DATE(data_pagamento) AS dia, SUM(valor) AS valor FROM LancamentosFinanceiros WHERE tipo = 'pagar' AND status = 'pago' AND DATE(data_pagamento) BETWEEN ? AND ? GROUP BY DATE(data_pagamento)",
		[inicio, fim],
	);

	const mapa = {};
	const adicionar = (dia, campo, valor) => {
		if (!dia) return;
		if (!mapa[dia]) mapa[dia] = { dia, entradas: 0, saidas: 0 };
		mapa[dia][campo] += Number(valor) || 0;
	};
	entradasVendas.forEach((r) => adicionar(r.dia, "entradas", r.valor));
	entradasRecebimentos.forEach((r) => adicionar(r.dia, "entradas", r.valor));
	saidasPagamentos.forEach((r) => adicionar(r.dia, "saidas", r.valor));

	const dias = Object.values(mapa).sort((a, b) => (a.dia < b.dia ? -1 : 1));
	let saldo = 0;
	dias.forEach((d) => {
		d.saldo = d.entradas - d.saidas;
		saldo += d.saldo;
		d.saldoAcumulado = saldo;
	});

	return {
		dias,
		totalEntradas: dias.reduce((a, d) => a + d.entradas, 0),
		totalSaidas: dias.reduce((a, d) => a + d.saidas, 0),
		saldo,
	};
}

/* ============ Relatórios ============ */

// DRE simplificado (regime de caixa para despesas, já que é isso que o
// Fluxo de Caixa também usa): Receita líquida - CMV = Lucro Bruto;
// Lucro Bruto - Despesas pagas no período = Lucro Líquido.
// O CMV usa o preco_custo ATUAL da variação (não o custo histórico da época
// da venda) — mesma simplificação que a Curva ABC já assume para receita.
async function getDRE(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const resumoVendas = await getAsync(
		"SELECT COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS receitaBruta, COALESCE(SUM(desconto), 0) AS descontos FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ?",
		[inicio, fim],
	);

	const cmvLinha = await getAsync(
		`SELECT COALESCE(SUM(iv.quantidade * var.preco_custo), 0) AS cmv
     FROM ItensVenda iv
     JOIN Vendas v ON v.id = iv.venda_id
     JOIN Variacoes var ON var.id = iv.variacao_id
     WHERE v.status = 'finalizada' AND DATE(v.data_venda) BETWEEN ? AND ?`,
		[inicio, fim],
	);

	const despesasLinha = await getAsync(
		"SELECT COALESCE(SUM(valor), 0) AS despesas FROM LancamentosFinanceiros WHERE tipo = 'pagar' AND status = 'pago' AND DATE(data_pagamento) BETWEEN ? AND ?",
		[inicio, fim],
	);

	const receitaBruta = Number(resumoVendas.receitaBruta) || 0;
	const descontos = Number(resumoVendas.descontos) || 0;
	const receitaLiquida = receitaBruta - descontos;
	const cmv = Number(cmvLinha.cmv) || 0;
	const lucroBruto = receitaLiquida - cmv;
	const despesas = Number(despesasLinha.despesas) || 0;
	const lucroLiquido = lucroBruto - despesas;

	return {
		periodo: { inicio, fim },
		vendas: Number(resumoVendas.vendas) || 0,
		receitaBruta,
		descontos,
		receitaLiquida,
		cmv,
		lucroBruto,
		margemBrutaPercentual: receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0,
		despesas,
		lucroLiquido,
		margemLiquidaPercentual: receitaLiquida > 0 ? (lucroLiquido / receitaLiquida) * 100 : 0,
	};
}

async function getRelatorioVendas(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const resumo = await getAsync(
		"SELECT COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS faturamento, COALESCE(SUM(desconto), 0) AS descontos FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ?",
		[inicio, fim],
	);

	const porDia = await allAsync(
		"SELECT DATE(data_venda) AS dia, COUNT(*) AS vendas, SUM(total) AS faturamento, SUM(desconto) AS descontos FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ? GROUP BY DATE(data_venda) ORDER BY dia",
		[inicio, fim],
	);

	const porPagamento = await allAsync(
		"SELECT COALESCE(forma_pagamento, '---') AS forma_pagamento, COUNT(*) AS vendas, SUM(total) AS faturamento FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ? GROUP BY forma_pagamento ORDER BY faturamento DESC",
		[inicio, fim],
	);

	return {
		resumo: {
			vendas: resumo.vendas,
			faturamento: resumo.faturamento,
			descontos: resumo.descontos,
			ticketMedio: resumo.vendas > 0 ? resumo.faturamento / resumo.vendas : 0,
		},
		porDia,
		porPagamento,
	};
}

// Curva ABC por receita: A até 80% acumulado, B até 95%, C o restante.
async function getCurvaABC(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const linhas = await allAsync(
		`SELECT p.nome AS produto_nome, SUM(iv.quantidade) AS quantidade, SUM(iv.quantidade * iv.preco_unitario) AS receita
     FROM ItensVenda iv
     JOIN Vendas v ON v.id = iv.venda_id
     JOIN Variacoes var ON var.id = iv.variacao_id
     JOIN Produtos p ON p.id = var.produto_id
     WHERE v.status = 'finalizada' AND DATE(v.data_venda) BETWEEN ? AND ?
     GROUP BY p.id
     ORDER BY receita DESC`,
		[inicio, fim],
	);

	const total = linhas.reduce((a, l) => a + (Number(l.receita) || 0), 0);
	let acumulado = 0;

	return linhas.map((l) => {
		const receita = Number(l.receita) || 0;
		const percentual = total > 0 ? (receita / total) * 100 : 0;
		acumulado += percentual;
		return {
			produto_nome: l.produto_nome,
			quantidade: Number(l.quantidade) || 0,
			receita,
			percentual,
			acumulado,
			classe: acumulado <= 80 ? "A" : acumulado <= 95 ? "B" : "C",
		};
	});
}

// Comissão por vendedor: soma das vendas finalizadas atribuídas a cada
// usuário no período, multiplicada pelo percentual de comissão dele.
async function getComissoes(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const linhas = await allAsync(
		`SELECT u.id AS usuario_id, u.nome, u.login, u.perfil, u.comissao_percentual,
            COUNT(v.id) AS vendas, COALESCE(SUM(v.total), 0) AS total_vendido
     FROM Vendas v
     JOIN Usuarios u ON u.id = v.usuario_id
     WHERE v.status = 'finalizada' AND DATE(v.data_venda) BETWEEN ? AND ?
     GROUP BY u.id
     ORDER BY total_vendido DESC`,
		[inicio, fim],
	);

	return linhas.map((l) => {
		const totalVendido = Number(l.total_vendido) || 0;
		const percentual = Number(l.comissao_percentual) || 0;
		return {
			usuario_id: l.usuario_id,
			nome: l.nome,
			login: l.login,
			perfil: l.perfil,
			vendas: Number(l.vendas) || 0,
			total_vendido: totalVendido,
			comissao_percentual: percentual,
			comissao_valor: (totalVendido * percentual) / 100,
		};
	});
}

/* ============ Log de atividades (auditoria) ============ */

// Nunca deve derrubar a ação real por causa de uma falha de log — quem chama
// isso já está dentro de um try/catch da ação principal, então erros aqui
// são engolidos silenciosamente (loga no console do processo principal).
async function registrarLog(usuarioId, usuarioLogin, acao, entidade, entidadeId, detalhes) {
	try {
		await runAsync(
			"INSERT INTO LogAtividades (usuario_id, usuario_login, acao, entidade, entidade_id, detalhes, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
			[
				usuarioId || null,
				usuarioLogin || null,
				acao,
				entidade || null,
				entidadeId || null,
				detalhes || null,
				new Date().toISOString(),
			],
		);
	} catch (erro) {
		console.error("Falha ao registrar log de atividade:", erro);
	}
}

async function getLogAtividades(filtro) {
	filtro = filtro || {};
	var condicoes = [];
	var params = [];
	if (filtro.usuarioId) {
		condicoes.push("usuario_id = ?");
		params.push(Number(filtro.usuarioId));
	}
	if (filtro.acao) {
		condicoes.push("acao = ?");
		params.push(filtro.acao);
	}
	if (filtro.inicio) {
		condicoes.push("DATE(data) >= ?");
		params.push(filtro.inicio);
	}
	if (filtro.fim) {
		condicoes.push("DATE(data) <= ?");
		params.push(filtro.fim);
	}
	var where = condicoes.length ? "WHERE " + condicoes.join(" AND ") : "";
	var limite = Math.max(1, Math.min(500, Number(filtro.limite) || 200));
	return allAsync(
		"SELECT * FROM LogAtividades " + where + " ORDER BY id DESC LIMIT " + limite,
		params,
	);
}

/* ============ Usuários (login do sistema) ============ */
// Cada usuário tem um login e uma senha. A senha do primeiro login é a chave-mestre
// do banco (SQLCipher). Para permitir vários usuários, a chave-mestre é "embrulhada"
// (AES-256-GCM) por cada login/senha em um arquivo ao lado do banco (erp_usuarios.json).
// Para trocar a senha de um usuário basta reembrulhar a mesma chave-mestre.

function caminhoArquivoUsuarios() {
	return path.join(path.dirname(DB_PATH), "erp_usuarios.json");
}

function derivarChaveUsuario(login, senha) {
	return crypto
		.createHash("sha256")
		.update("erp_usr:" + String(login) + ":" + String(senha))
		.digest();
}

function hashSenhaUsuario(login, senha) {
	return crypto
		.createHash("sha256")
		.update("erp_usr_hash:" + String(login) + ":" + String(senha))
		.digest("hex");
}

function lerArquivoUsuarios() {
	try {
		const caminho = caminhoArquivoUsuarios();
		if (!fs.existsSync(caminho)) return {};
		const dados = JSON.parse(fs.readFileSync(caminho, "utf8"));
		return dados && typeof dados === "object" ? dados : {};
	} catch (e) {
		return {};
	}
}

function gravarArquivoUsuarios(dados) {
	fs.writeFileSync(caminhoArquivoUsuarios(), JSON.stringify(dados, null, 2));
}

function embrulharChave(login, senha) {
	const chavePerfil = derivarChaveUsuario(login, senha);
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", chavePerfil, iv);
	const criptografado = Buffer.concat([
		cipher.update(currentKey, "utf8"),
		cipher.final(),
	]);
	return {
		iv: iv.toString("hex"),
		tag: cipher.getAuthTag().toString("hex"),
		dados: criptografado.toString("hex"),
	};
}

function desembrulharChave(entrada, loginKey) {
	try {
		const decipher = crypto.createDecipheriv(
			"aes-256-gcm",
			loginKey,
			Buffer.from(entrada.iv, "hex"),
		);
		decipher.setAuthTag(Buffer.from(entrada.tag, "hex"));
		return Buffer.concat([
			decipher.update(Buffer.from(entrada.dados, "hex")),
			decipher.final(),
		]).toString("utf8");
	} catch (e) {
		return null;
	}
}

// Login do app: usuário + senha. Pode desbloquear via chave embrulhada (multi-usuário)
// ou via chave-mestre (primeiro acesso / migração de bancos antigos).
async function autenticarUsuario(login, senha) {
	const l = String(login || "")
		.trim()
		.toLowerCase();
	const s = String(senha || "");
	if (!l || !s) throw new Error("Informe usuário e senha.");

	const arquivo = lerArquivoUsuarios();
	const entrada = arquivo[l];
	let desbloqueado = false;

	// 1) Tenta desembrulhar a chave-mestre com a senha deste usuário.
	if (entrada) {
		try {
			const chaveMestre = desembrulharChave(entrada, derivarChaveUsuario(l, s));
			if (!chaveMestre) throw new Error("senha incorreta");
			if (!db) {
				db = await abrirBanco(chaveMestre);
				currentKey = chaveMestre;
				await iniciarBanco();
			} else if (chaveMestre !== currentKey) {
				throw new Error("chave alterada");
			}
			desbloqueado = true;
		} catch (e) {
			desbloqueado = false;
		}
	}

	// 2) Fallback: chave-mestre direta (primeiro acesso, admin legado ou banco plaintext).
	if (!desbloqueado) {
		if (db) {
			if (derivarChave(s) !== currentKey) throw new Error("Senha incorreta.");
		} else {
			await desbloquearBanco(s);
		}
		desbloqueado = true;
	}

	// 3) Se o banco ainda está vazio de usuários, sementeia o primeiro (bootstrap).
	const total = await getAsync("SELECT COUNT(*) AS n FROM Usuarios", []);
	if (Number(total.n) === 0) {
		await runAsync(
			"INSERT INTO Usuarios (login, nome, perfil, ativo, senha_hash, criado_em) VALUES (?, ?, ?, 1, ?, ?)",
			[
				l,
				"Administrador",
				"admin",
				hashSenhaUsuario(l, s),
				new Date().toISOString(),
			],
		);
	}

	// 4) Garante o embrulho da chave para este login (novo/legado).
	if (!arquivo[l]) {
		try {
			arquivo[l] = embrulharChave(l, s);
			gravarArquivoUsuarios(arquivo);
		} catch (e) {
			/* ignora: login continua funcionando pela chave-mestre */
		}
	}

	// 5) Valida o usuário cadastrado e ativo.
	const usr = await getAsync(
		"SELECT id, login, nome, perfil, ativo, permissoes FROM Usuarios WHERE login = ? COLLATE NOCASE",
		[l],
	);
	if (!usr) {
		await bloquearBanco();
		throw new Error("Usuário não cadastrado neste sistema.");
	}
	if (Number(usr.ativo) !== 1) {
		await bloquearBanco();
		throw new Error("Usuário desativado. Contate o administrador.");
	}

	return {
		success: true,
		usuario: {
			id: usr.id,
			login: usr.login,
			nome: usr.nome,
			perfil: usr.perfil,
			permissoes: parsePermissoes(usr.permissoes),
		},
	};
}

// Parse defensivo: permissoes nunca deve derrubar o login por JSON inválido.
function parsePermissoes(texto) {
	try {
		const obj = JSON.parse(texto || "{}");
		return obj && typeof obj === "object" ? obj : {};
	} catch (e) {
		return {};
	}
}

function getUsuario(login) {
	return getAsync(
		"SELECT id, login, nome, perfil, ativo, permissoes FROM Usuarios WHERE login = ? COLLATE NOCASE",
		[String(login)],
	);
}

async function listarUsuarios() {
	return allAsync(
		"SELECT id, login, nome, perfil, ativo, criado_em, comissao_percentual, permissoes FROM Usuarios ORDER BY login",
	);
}

async function salvarUsuario(dados) {
	const l = String(dados.login || "")
		.trim()
		.toLowerCase();
	const nome = String(dados.nome || "").trim();
	if (!l || !/^[a-z0-9._-]{3,}$/i.test(l)) {
		throw new Error(
			"Login deve ter pelo menos 3 caracteres (letras, números, . _ -).",
		);
	}
	if (!nome) throw new Error("Informe o nome do usuário.");
	const perfil = dados.perfil === "vendedor" ? "vendedor" : "admin";
	const comissao = Math.max(0, Number(dados.comissao_percentual) || 0);
	const permissoes = JSON.stringify(
		dados.permissoes && typeof dados.permissoes === "object" ? dados.permissoes : {},
	);

	const inserindo = !dados.id;
	const senha = String(dados.senha || "");
	if (inserindo) {
		if (senha.length < 4)
			throw new Error("Defina uma senha com pelo menos 4 caracteres.");
		const existente = await getAsync(
			"SELECT id FROM Usuarios WHERE login = ? COLLATE NOCASE",
			[l],
		);
		if (existente) throw new Error("Já existe um usuário com esse login.");
		await runAsync(
			"INSERT INTO Usuarios (login, nome, perfil, ativo, senha_hash, criado_em, comissao_percentual, permissoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			[
				l,
				nome,
				perfil,
				dados.ativo ? 1 : 0,
				hashSenhaUsuario(l, senha),
				new Date().toISOString(),
				comissao,
				permissoes,
			],
		);
	} else {
		if (!/^[0-9]+$/.test(String(dados.id)))
			throw new Error("Usuário inválido.");
		await runAsync(
			"UPDATE Usuarios SET nome = ?, ativo = ?, perfil = ?, comissao_percentual = ?, permissoes = ? WHERE id = ?",
			[nome, dados.ativo ? 1 : 0, perfil, comissao, permissoes, Number(dados.id)],
		);
		if (senha) {
			if (senha.length < 4)
				throw new Error("A senha deve ter pelo menos 4 caracteres.");
			await runAsync("UPDATE Usuarios SET senha_hash = ? WHERE id = ?", [
				hashSenhaUsuario(l, senha),
				Number(dados.id),
			]);
		}
	}

	// Embrulha/reescreve a chave-mestre para o login deste usuário.
	if (inserindo || senha) {
		const arquivo = lerArquivoUsuarios();
		arquivo[l] = embrulharChave(l, senha);
		gravarArquivoUsuarios(arquivo);
	}

	return { success: true };
}

async function removerUsuario(id) {
	const usuarioId = Number(id);
	if (!usuarioId) throw new Error("Usuário inválido.");
	const usr = await getAsync("SELECT * FROM Usuarios WHERE id = ?", [
		usuarioId,
	]);
	if (!usr) throw new Error("Usuário não encontrado.");

	// A trava tem que ser sobre admins, não usuários em geral — senão dá pra
	// apagar o último admin e deixar só vendedores, travando a administração.
	if (usr.perfil === "admin") {
		const adminsAtivos = await getAsync(
			"SELECT COUNT(*) AS n FROM Usuarios WHERE ativo = 1 AND perfil = 'admin'",
			[],
		);
		if (Number(adminsAtivos.n) <= 1 && Number(usr.ativo) === 1) {
			throw new Error("Não é possível remover o último administrador ativo.");
		}
	}

	await runAsync("DELETE FROM Usuarios WHERE id = ?", [usuarioId]);

	const arquivo = lerArquivoUsuarios();
	if (arquivo[usr.login]) {
		delete arquivo[usr.login];
		gravarArquivoUsuarios(arquivo);
	}
	return { success: true };
}
