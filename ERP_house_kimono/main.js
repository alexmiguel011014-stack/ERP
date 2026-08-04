const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const {
  iniciarBanco,
  salvarProduto,
  atualizarProduto,
  removerProduto,
  listProdutosDetalhados,
  getProximoCodigoProduto,
  getProximoCodigoCategoria,
  getProximoCodigoCliente,
  buscarSKU,
  finalizarVenda,
  setDBPath,
  getDBPath,
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
  registrarEntradaEstoque,
  getMovimentacoesEstoque,
  getEstoqueBaixo,
  salvarEstoqueMinimo,
  converterOrcamento,
  getFornecedores,
  salvarFornecedor,
  atualizarFornecedor,
  removerFornecedor,
  criarPedidoCompra,
  getPedidosCompra,
  getItensPedidoCompra,
  receberPedidoCompra,
  cancelarPedidoCompra,
  getLancamentos,
  criarLancamento,
  baixarLancamento,
  excluirLancamento,
  getFluxoCaixa,
  getRelatorioVendas,
  getCurvaABC,
  definirSenhaVendedor,
  removerSenhaVendedor,
  temSenhaVendedor,
  desbloquearComPerfil,
} = require('./database');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow = null;

autoUpdater.on('checking-for-update', () => {
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'available', version: info.version });
});

autoUpdater.on('update-not-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'not-available', version: info.version });
});

autoUpdater.on('error', (err) => {
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'error', message: err.message });
});

autoUpdater.on('download-progress', (progress) => {
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloading', progress: progress.percent });
});

autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloaded', version: info.version });
});

function criarJanelaPrincipal() {
  const janela = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow = janela;
  janela.maximize();
  janela.show();
  janela.loadFile('public/index.html');
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  if (app.isPackaged) {
    const userData = app.getPath('userData');
    setDBPath(userData);
  } else {
    setDBPath(path.join(__dirname, 'data'));
  }

  criarJanelaPrincipal();
});

ipcMain.handle('buscar-produtos', async () => {
  const conexao = require('./database').getConexao();
  return new Promise((resolver, rejeitar) => {
    conexao.all('SELECT * FROM Produtos', [], (erro, linhas) => {
      if (erro) return rejeitar(erro.message);
      resolver(linhas);
    });
  });
});

ipcMain.handle('salvar-produto', async (event, dados) => {
  try {
    const resultado = await salvarProduto(dados, dados.variacoes);
    return resultado;
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('listar-produtos-detalhados', async () => {
  try {
    return await listProdutosDetalhados();
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('proximo-codigo-produto', async () => {
  try {
    return await getProximoCodigoProduto();
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('proximo-codigo-categoria', async () => {
  try {
    return await getProximoCodigoCategoria();
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('proximo-codigo-cliente', async () => {
  try {
    return await getProximoCodigoCliente();
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('atualizar-produto', async (event, id, dados) => {
  try {
    return await atualizarProduto(id, dados, dados.variacoes);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('remover-produto', async (event, id) => {
  try {
    return await removerProduto(id);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('buscar-sku', async (event, sku) => {
  try {
    const resultado = await buscarSKU(sku);
    return resultado;
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('finalizar-venda', async (event, dados) => {
  try {
    const resultado = await finalizarVenda(dados);
    return resultado;
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('dashboard-stats', async () => {
  try {
    const stats = await getDashboardStats();
    return stats;
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('get-clientes', async () => {
  try {
    return await getClientes();
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('salvar-cliente', async (event, dados) => {
  try {
    return await salvarCliente(dados);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('remover-cliente', async (event, id) => {
  try {
    return await removerCliente(id);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('atualizar-cliente', async (event, id, dados) => {
  try {
    return await atualizarCliente(id, dados);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('buscar-cliente', async (event, filtro) => {
  try {
    return await buscarCliente(filtro);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('get-vendas', async (event, filtroData) => {
  try {
    return await getVendas(filtroData || null);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('get-vendas-hoje', async () => {
  try {
    return await getVendasHoje();
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('get-itens-venda', async (event, vendaId) => {
  try {
    return await getItensVenda(vendaId);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('get-estoque-negativo', async () => {
  try {
    return await getEstoqueNegativo();
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('get-categorias', async () => {
  try {
    return await getCategorias();
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('categorias-with-usage', async () => {
  try {
    return await getListCategoriasWithUsage();
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('remover-categoria', async (event, id) => {
  try {
    const resultado = await removerCategoria(id);
    if (mainWindow) mainWindow.webContents.send('categorias-changed');
    return resultado;
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('get-pricing-data', async () => {
  try {
    return await getPricingData();
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('get-global-margin', async () => {
  try {
    return await getGlobalMargin();
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('save-global-margin', async (event, valor) => {
  try {
    return await saveGlobalMargin(valor);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('save-product-margin', async (event, produtoId, margem) => {
  try {
    return await saveProductMargin(produtoId, margem);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('save-product-price', async (event, produtoId, precoVenda) => {
  try {
    return await saveProductPrice(produtoId, precoVenda);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('save-product-cost', async (event, produtoId, precoCusto) => {
  try {
    return await saveProductCost(produtoId, precoCusto);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('save-product-taxes', async (event, produtoId, valor) => {
  try {
    return await saveProductTaxes(produtoId, valor);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('mass-update-margem', async (event, produtoIds, margem) => {
  try {
    return await massUpdateMargem(produtoIds, margem);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('salvar-categoria', async (event, nome, categoriaPaiId) => {
  try {
    const resultado = await salvarCategoria(nome, categoriaPaiId);
    if (mainWindow) mainWindow.webContents.send('categorias-changed');
    return resultado;
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('salvar-categoria-com-subcategorias', async (event, dados) => {
  try {
    const resultado = await salvarCategoriaComSubcategorias(dados);
    if (mainWindow) mainWindow.webContents.send('categorias-changed');
    return resultado;
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('backup-automatico', async () => {
  try {
    const result = backupAutomatico();
    return { success: true, caminho: result };
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('export-backup', async () => {
  try {
    return exportBackup();
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('import-backup', async (event, caminho) => {
  try {
    return await importBackup(caminho);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return result;
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('quit-and-install', async () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

/* ============ Estoque: entradas ============ */

ipcMain.handle('registrar-entrada-estoque', async (event, dados) => {
  try {
    return await registrarEntradaEstoque(dados);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('get-movimentacoes-estoque', async (event, limite) => {
  try {
    return await getMovimentacoesEstoque(limite);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('get-estoque-baixo', async () => {
  try {
    return await getEstoqueBaixo();
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('salvar-estoque-minimo', async (event, variacaoId, valor) => {
  try {
    return await salvarEstoqueMinimo(variacaoId, valor);
  } catch (erro) {
    throw erro.message;
  }
});

/* ============ Orçamentos ============ */

ipcMain.handle('converter-orcamento', async (event, vendaId) => {
  try {
    return await converterOrcamento(vendaId);
  } catch (erro) {
    throw erro.message;
  }
});

/* ============ Fornecedores ============ */

ipcMain.handle('get-fornecedores', async () => {
  try {
    return await getFornecedores();
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('salvar-fornecedor', async (event, dados) => {
  try {
    return await salvarFornecedor(dados);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('atualizar-fornecedor', async (event, id, dados) => {
  try {
    return await atualizarFornecedor(id, dados);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('remover-fornecedor', async (event, id) => {
  try {
    return await removerFornecedor(id);
  } catch (erro) {
    throw erro.message;
  }
});

/* ============ Compras ============ */

ipcMain.handle('criar-pedido-compra', async (event, dados) => {
  try {
    return await criarPedidoCompra(dados);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('get-pedidos-compra', async () => {
  try {
    return await getPedidosCompra();
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('get-itens-pedido-compra', async (event, pedidoId) => {
  try {
    return await getItensPedidoCompra(pedidoId);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('receber-pedido-compra', async (event, pedidoId) => {
  try {
    return await receberPedidoCompra(pedidoId);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('cancelar-pedido-compra', async (event, pedidoId) => {
  try {
    return await cancelarPedidoCompra(pedidoId);
  } catch (erro) {
    throw erro.message;
  }
});

/* ============ Financeiro ============ */

ipcMain.handle('get-lancamentos', async (event, filtro) => {
  try {
    return await getLancamentos(filtro || {});
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('criar-lancamento', async (event, dados) => {
  try {
    return await criarLancamento(dados);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('baixar-lancamento', async (event, id) => {
  try {
    return await baixarLancamento(id);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('excluir-lancamento', async (event, id) => {
  try {
    return await excluirLancamento(id);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('get-fluxo-caixa', async (event, dataInicio, dataFim) => {
  try {
    return await getFluxoCaixa(dataInicio || null, dataFim || null);
  } catch (erro) {
    throw erro.message;
  }
});

/* ============ Relatórios ============ */

ipcMain.handle('get-relatorio-vendas', async (event, dataInicio, dataFim) => {
  try {
    return await getRelatorioVendas(dataInicio || null, dataFim || null);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('get-curva-abc', async (event, dataInicio, dataFim) => {
  try {
    return await getCurvaABC(dataInicio || null, dataFim || null);
  } catch (erro) {
    throw erro.message;
  }
});

/* ============ Perfis de acesso ============ */

ipcMain.handle('unlock-with-profile', async (event, senha) => {
  try {
    const resultado = await desbloquearComPerfil(senha);
    iniciarBackupAutomatico();
    return resultado;
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('set-vendedor-key', async (event, senha) => {
  try {
    return await definirSenhaVendedor(senha);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('remove-vendedor-key', async () => {
  try {
    return removerSenhaVendedor();
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('has-vendedor-key', async () => {
  try {
    return temSenhaVendedor();
  } catch (erro) {
    throw erro.message;
  }
});

var intervaloBackup = null;

function iniciarBackupAutomatico() {
  if (intervaloBackup) clearInterval(intervaloBackup);
  intervaloBackup = setInterval(function () {
    try {
      backupAutomatico();
    } catch (e) {
      console.error("Erro no backup automatico:", e.message);
    }
  }, 24 * 60 * 60 * 1000);
}

ipcMain.handle('unlock-db', async (event, senha) => {
  try {
    const { desbloquearBanco } = require('./database');
    const resultado = await desbloquearBanco(senha);
    iniciarBackupAutomatico();
    return resultado;
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('change-db-key', async (event, novaSenha) => {
  try {
    const { trocarChave } = require('./database');
    return await trocarChave(novaSenha);
  } catch (erro) {
    throw erro.message;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});