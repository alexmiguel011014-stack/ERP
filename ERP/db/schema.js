const { getConexao, runOn } = require("./conexao");
const { criarVariacoesPadrao } = require("./produtos");

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

	// Recebimentos (Pix/Boleto/etc.) vinculados a uma venda.
	await runOn(
		conexao,
		`
    CREATE TABLE IF NOT EXISTS Pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER,
      cliente_id INTEGER,
      metodo TEXT,
      numero_identificador TEXT,
      data_recebimento TEXT,
      valor_recebido REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pendente',
      observacao TEXT,
      criado_em TEXT,
      FOREIGN KEY (venda_id) REFERENCES Vendas(id) ON DELETE SET NULL,
      FOREIGN KEY (cliente_id) REFERENCES Clientes(id) ON DELETE SET NULL
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
module.exports = {
	iniciarBanco,
	colunasDaTabela,
	migrarColunas,
};
