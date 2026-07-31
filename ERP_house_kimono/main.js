const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const {
  iniciarBanco,
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
} = require('./database');

function criarJanelaPrincipal() {
  const janela = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  janela.loadFile('public/index.html');
}

app.whenReady().then(async () => {
  if (app.isPackaged) {
    const userData = app.getPath('userData');
    setDBPath(userData);
  } else {
    setDBPath(path.join(__dirname, 'data'));
  }

  try {
    await iniciarBanco();
    console.log('Banco de dados inicializado em:', getDBPath());
  } catch (erro) {
    console.error('Erro ao inicializar o banco de dados:', erro.message);
  }

  criarJanelaPrincipal();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      criarJanelaPrincipal();
    }
  });
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});