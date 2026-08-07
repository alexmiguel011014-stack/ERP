/* Refatora módulos de window.api.X para window.erpBanco.domain.X
   Este script mapeia as chamadas corretas via banco centralizado.
   Uso: node scripts/refactor-api-to-banco.js */
const fs = require('fs');
const path = require('path');

// Mapeamento de window.api.X → window.erpBanco.domain.X
const MAPEAMENTO = {
  // Produtos
  'buscarSKU': 'erpBanco.produtos.buscarSKU',
  'buscarProdutosTermo': 'erpBanco.produtos.buscarPorTermo',
  'listarProdutosDetalhados': 'erpBanco.produtos.detalhados',
  'proximoSkuProduto': 'erpBanco.produtos.proximoSku',
  'salvarProduto': 'erpBanco.produtos.salvar',
  'atualizarProduto': 'erpBanco.produtos.atualizar',
  'removerProduto': 'erpBanco.produtos.remover',
  'buscarProdutos': 'erpBanco.produtos.buscar',

  // Categorias
  'getCategorias': 'erpBanco.categorias.listar',
  'categoriasWithUsage': 'erpBanco.categorias.comUso',
  'salvarCategoria': 'erpBanco.categorias.salvar',
  'removerCategoria': 'erpBanco.categorias.remover',
  'proximoCodigoCategoria': 'erpBanco.categorias.proximoCodigo',

  // Clientes
  'getClientes': 'erpBanco.clientes.listar',
  'salvarCliente': 'erpBanco.clientes.salvar',
  'atualizarCliente': 'erpBanco.clientes.atualizar',
  'removerCliente': 'erpBanco.clientes.remover',
  'buscarCliente': 'erpBanco.clientes.buscar',
  'movimentacoesCliente': 'erpBanco.clientes.movimentacoes',
  'proximoCodigoCliente': 'erpBanco.clientes.proximoCodigo',

  // Vendas
  'getVendas': 'erpBanco.vendas.listar',
  'getVendasHoje': 'erpBanco.vendas.hoje',
  'finalizarVenda': 'erpBanco.vendas.finalizar',
  'getItensVenda': 'erpBanco.vendas.itens',
  'converterOrcamento': 'erpBanco.vendas.converterOrcamento',

  // Estoque
  'getEstoqueNegativo': 'erpBanco.estoque.negativo',
  'getEstoqueBaixo': 'erpBanco.estoque.baixo',
  'registrarEntradaEstoque': 'erpBanco.estoque.registrarEntrada',
  'getMovimentacoesEstoque': 'erpBanco.estoque.movimentacoes',
  'salvarEstoqueMinimo': 'erpBanco.estoque.salvarMinimo',
  'ajustarEstoqueManual': 'erpBanco.estoque.ajustarManual',

  // Precificação
  'getPricingData': 'erpBanco.precificacao.dados',
  'getGlobalMargin': 'erpBanco.precificacao.margemGlobal',
  'saveGlobalMargin': 'erpBanco.precificacao.salvarMargemGlobal',
  'saveProductMargin': 'erpBanco.precificacao.salvarMargemProduto',
  'saveProductPrice': 'erpBanco.precificacao.salvarPreco',
  'saveProductCost': 'erpBanco.precificacao.salvarCusto',
  'saveProductTaxes': 'erpBanco.precificacao.salvarImpostos',
  'massUpdateMargem': 'erpBanco.precificacao.aplicarMargemEmLote',

  // Fornecedores
  'getFornecedores': 'erpBanco.fornecedores.listar',
  'salvarFornecedor': 'erpBanco.fornecedores.salvar',
  'atualizarFornecedor': 'erpBanco.fornecedores.atualizar',
  'removerFornecedor': 'erpBanco.fornecedores.remover',

  // Compras
  'criarPedidoCompra': 'erpBanco.compras.criarPedido',
  'getPedidosCompra': 'erpBanco.compras.pedidos',
  'getItensPedidoCompra': 'erpBanco.compras.itensPedido',
  'receberPedidoCompra': 'erpBanco.compras.receberPedido',
  'cancelarPedidoCompra': 'erpBanco.compras.cancelarPedido',

  // Financeiro
  'getLancamentos': 'erpBanco.financeiro.lancamentos',
  'criarLancamento': 'erpBanco.financeiro.criarLancamento',
  'baixarLancamento': 'erpBanco.financeiro.baixar',
  'excluirLancamento': 'erpBanco.financeiro.excluir',
  'getFluxoCaixa': 'erpBanco.financeiro.fluxoCaixa',

  // Relatórios
  'getRelatorioVendas': 'erpBanco.relatorios.vendasPeriodo',
  'getCurvaABC': 'erpBanco.relatorios.curvaABC',

  // Dashboard
  'dashboardStats': 'erpBanco.dashboard.stats',

  // Sistema
  'backupAutomatico': 'erpBanco.sistema.backupAutomatico',
  'exportBackup': 'erpBanco.sistema.exportBackup',
  'importBackup': 'erpBanco.sistema.importBackup',
  'getDBPath': 'erpBanco.sistema.caminhoBanco',
  'getAppVersion': 'erpBanco.sistema.versaoApp',
  'checkForUpdates': 'erpBanco.sistema.verificarUpdate',
  'downloadUpdate': 'erpBanco.sistema.baixarUpdate',
  'quitAndInstall': 'erpBanco.sistema.sairEInstalar',

  // Usuários
  'listarUsuarios': 'erpBanco.usuarios.listar',
  'salvarUsuario': 'erpBanco.usuarios.salvar',
  'removerUsuario': 'erpBanco.usuarios.remover',

  // Auth (DEIXAR INTACTO - específico do preload)
  'getAuthSession': null,
  'unlockWithProfile': null,
  'logout': null,
};

const MODULOS = [
  'modules/entrada/entrada.js',
  'modules/precificacao/precificacao.js',
  'modules/compras/compras.js',
  'modules/clientes/clientes.js',
  'modules/atualizacao/atualizacao.js',
  'modules/pdv/pdv.js',
  'modules/financeiro/financeiro.js',
  'modules/acessos/acessos.js',
  'modules/fornecedores/fornecedores.js',
  'modules/relatorios/relatorios.js',
  'modules/clientes/lista-clientes.js',
  'modules/vendas/vendas.js',
  'modules/entrada/estoquenegativo.js',
];

let alterados = 0;
let trocas = 0;

for (const arquivo of MODULOS) {
  const caminho = path.join(__dirname, '..', arquivo);
  if (!fs.existsSync(caminho)) continue;

  let conteudo = fs.readFileSync(caminho, 'utf8');
  const antes = conteudo;

  // Substitui window.api.X → window.erpBanco.domain.X
  for (const [apiFunc, bancoPath] of Object.entries(MAPEAMENTO)) {
    if (bancoPath === null) continue; // Pula auth
    const regex = new RegExp(`\\bwindow\\.api\\.${apiFunc}\\b`, 'g');
    conteudo = conteudo.replace(regex, `window.${bancoPath}`);
  }

  if (conteudo !== antes) {
    alterados++;
    const changesCount = (antes.match(/\bwindow\.api\./g) || []).length -
                         (conteudo.match(/\bwindow\.api\./g) || []).length;
    trocas += changesCount;
    fs.writeFileSync(caminho, conteudo, 'utf8');
    console.log(`✓ ${arquivo.split('/').slice(-1)[0]}: ${changesCount} substituições`);
  }
}

console.log(`\n${alterados} arquivos modificados, ${trocas} chamadas refatoradas`);
