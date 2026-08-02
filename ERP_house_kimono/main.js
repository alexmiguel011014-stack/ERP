const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const {
  iniciarBanco,
  salvarProduto,
  atualizarProduto,
  removerProduto,
  listProdutosDetalhados,
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
  getCategorias,
  salvarCategoria,
  salvarCategoriaComSubcategorias,
  exportBackup,
  importBackup,
  backupAutomatico,
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

ipcMain.handle('salvar-categoria', async (event, nome, categoriaPaiId) => {
  try {
    return await salvarCategoria(nome, categoriaPaiId);
  } catch (erro) {
    throw erro.message;
  }
});

ipcMain.handle('salvar-categoria-com-subcategorias', async (event, dados) => {
  try {
    return await salvarCategoriaComSubcategorias(dados);
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