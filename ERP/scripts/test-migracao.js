/* Simula uma instalação antiga (schema legado, sem as colunas/tabelas novas)
   e verifica se o app abre, migra e continua integrando todos os módulos.
   Uso: node scripts/test-migracao.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('@journeyapps/sqlcipher').verbose();

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-mig-'));
const ARQUIVO = path.join(TMP, 'erp_housekimono.sqlite');
const SENHA = 'senha-antiga';
const CHAVE = require('crypto').createHash('sha256').update('erp_housekimono:' + SENHA).digest('hex');

let ok = 0;
let fail = 0;
const falhas = [];
function check(nome, cond, extra) {
  if (cond) { ok++; console.log('  PASS  ' + nome); }
  else { fail++; falhas.push(nome); console.log('  FAIL  ' + nome + (extra ? ' -> ' + extra : '')); }
}

// Schema da versão antiga: sem categoria_id/subcategoria_id, sem preco_custo,
// atributos e estoque_minimo, sem ProdutoCategorias/Precificacao/Usuarios etc.
const SCHEMA_LEGADO = [
  `CREATE TABLE Categorias (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, categoria_pai_id INTEGER)`,
  `CREATE TABLE Produtos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, categoria TEXT)`,
  `CREATE TABLE Variacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, produto_id INTEGER NOT NULL,
     sku TEXT UNIQUE NOT NULL, tamanho TEXT, cor TEXT, preco REAL NOT NULL, quantidade_estoque INTEGER DEFAULT 0)`,
  `CREATE TABLE Clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, telefone TEXT, academia TEXT, faixa TEXT)`,
  `CREATE TABLE Vendas (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, total REAL NOT NULL,
     forma_pagamento TEXT, data_venda TEXT)`,
  `CREATE TABLE ItensVenda (id INTEGER PRIMARY KEY AUTOINCREMENT, venda_id INTEGER NOT NULL,
     variacao_id INTEGER NOT NULL, quantidade INTEGER NOT NULL, preco_unitario REAL NOT NULL)`,
  `INSERT INTO Categorias (nome, categoria_pai_id) VALUES ('Kimonos', NULL)`,
  `INSERT INTO Categorias (nome, categoria_pai_id) VALUES ('A2', 1)`,
  `INSERT INTO Produtos (nome, categoria) VALUES ('Quimono Trançado', 'Kimonos')`,
  `INSERT INTO Variacoes (produto_id, sku, tamanho, cor, preco, quantidade_estoque)
     VALUES (1, 'P0001', 'A2', 'Branco', 350.0, 4)`,
  `INSERT INTO Clientes (nome, telefone) VALUES ('João Conceição', '11999990000')`,
  `INSERT INTO Vendas (cliente_id, total, forma_pagamento, data_venda)
     VALUES (1, 350.0, 'dinheiro', datetime('now'))`,
  `INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario) VALUES (1, 1, 1, 350.0)`,
];

function criarBancoLegado() {
  return new Promise((resolve, reject) => {
    const conn = new sqlite3.Database(ARQUIVO, (e) => {
      if (e) return reject(e);
      conn.run("PRAGMA key = '" + CHAVE + "'", (e2) => {
        if (e2) return reject(e2);
        conn.serialize(() => {
          let pendente = SCHEMA_LEGADO.length;
          let erro = null;
          SCHEMA_LEGADO.forEach((sql) => {
            conn.run(sql, (e3) => {
              if (e3 && !erro) erro = e3;
              if (--pendente === 0) conn.close(() => (erro ? reject(erro) : resolve()));
            });
          });
        });
      });
    });
  });
}

(async () => {
  console.log('Banco legado em:', ARQUIVO);
  await criarBancoLegado();
  check('banco legado criado', fs.existsSync(ARQUIVO));

  const db = require('../database');
  db.setDBPath(TMP);

  console.log('\n== Abertura e migração automática ==');
  await db.desbloquearBanco(SENHA);
  check('abre banco antigo e migra schema', db.isDesbloqueado());

  const tabelas = JSON.stringify(await db.listarTabelasBanco());
  for (const t of ['ProdutoCategorias', 'Precificacao', 'Usuarios', 'MovimentacoesEstoque',
                   'Fornecedores', 'PedidosCompra', 'ItensPedidoCompra', 'LancamentosFinanceiros', 'Configuracao']) {
    check('tabela nova criada: ' + t, tabelas.indexOf('"' + t + '"') !== -1 || tabelas.indexOf(t) !== -1, tabelas);
  }

  console.log('\n== Dados antigos preservados ==');
  const produtos = await db.listProdutosDetalhados();
  check('produto legado presente', produtos.length === 1 && produtos[0].nome === 'Quimono Trançado', JSON.stringify(produtos));
  check('variação legada presente', produtos[0] && produtos[0].variacoes.length === 1, JSON.stringify(produtos[0] && produtos[0].variacoes));
  const cats = await db.getListCategoriasWithUsage();
  check('categorias legadas presentes', cats.length === 2, JSON.stringify(cats));
  const clientes = await db.getClientes();
  check('cliente legado presente', clientes.length === 1, JSON.stringify(clientes));
  const vendas = await db.getVendas(null);
  check('venda legada presente', vendas.length === 1, JSON.stringify(vendas));

  console.log('\n== Módulos sobre o banco migrado ==');
  const chamadas = {
    'dashboard.stats': () => db.getDashboardStats(),
    'precificacao.dados': () => db.getPricingData(),
    'estoque.baixo': () => db.getEstoqueBaixo(),
    'estoque.negativo': () => db.getEstoqueNegativo(),
    'estoque.movimentacoes': () => db.getMovimentacoesEstoque(50),
    'fornecedores.listar': () => db.getFornecedores(),
    'compras.pedidos': () => db.getPedidosCompra(),
    'financeiro.lancamentos': () => db.getLancamentos({}),
    'financeiro.fluxoCaixa': () => db.getFluxoCaixa(null, null),
    'relatorios.vendas': () => db.getRelatorioVendas(null, null),
    'relatorios.curvaABC': () => db.getCurvaABC(null, null),
    'vendas.hoje': () => db.getVendasHoje(),
    'vendas.itens': () => db.getItensVenda(1),
    'clientes.movimentacoes': () => db.getMovimentacoesCliente(1),
    'usuarios.listar': () => db.listarUsuarios(),
  };
  for (const nome of Object.keys(chamadas)) {
    try {
      await chamadas[nome]();
      check(nome, true);
    } catch (e) {
      check(nome, false, e && e.message ? e.message : String(e));
    }
  }

  console.log('\n== Busca com acento (corrigida) ==');
  const acento = await db.buscarProdutosPorTermo('trançado');
  check('busca produto minúsculo com cedilha', acento.length === 1, JSON.stringify(acento));
  const semAcento = await db.buscarProdutosPorTermo('trancado');
  check('busca produto sem acento', semAcento.length === 1, JSON.stringify(semAcento));
  const maiuscula = await db.buscarProdutosPorTermo('QUIMONO');
  check('busca produto maiúscula', maiuscula.length === 1, JSON.stringify(maiuscula));
  const cli = await db.buscarCliente('conceicao');
  check('busca cliente sem acento', cli.length === 1, JSON.stringify(cli));
  const cliAcento = await db.buscarCliente('CONCEIÇÃO');
  check('busca cliente maiúscula com acento', cliAcento.length === 1, JSON.stringify(cliAcento));

  console.log('\n== Escrita sobre o banco migrado ==');
  const novaCat = await db.salvarCategoria('Faixas', null);
  check('cria categoria no banco migrado', novaCat.success);
  const sku = await db.getProximoSkuProduto();
  const novo = await db.salvarProduto(
    { nome: 'Faixa Preta', categoriasSelecionadas: [novaCat.id],
      variacoes: [{ sku, preco: 120, preco_custo: 0, quantidade_estoque: 3, atributos: [{ chave: 'Unidade', valor: 'Padrão' }] }] },
    [{ sku, preco: 120, preco_custo: 0, quantidade_estoque: 3, atributos: [{ chave: 'Unidade', valor: 'Padrão' }] }]
  );
  check('cria produto no banco migrado', novo.success, JSON.stringify(novo));
  check('próximo SKU não colide com o legado', sku === 'P0002', sku);
  const depois = await db.listProdutosDetalhados();
  check('agora há 2 produtos', depois.length === 2, JSON.stringify(depois.map((p) => p.nome)));

  await db.bloquearBanco();
  console.log('\n================================');
  console.log('PASS: ' + ok + '   FAIL: ' + fail);
  if (falhas.length) falhas.forEach((f) => console.log(' - ' + f));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* ignora */ }
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nERRO FATAL:', e && e.stack ? e.stack : e);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (er) { /* ignora */ }
  process.exit(2);
});
