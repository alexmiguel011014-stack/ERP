const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { iniciarBanco, salvarProduto } = require('./database');

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
  try {
    await iniciarBanco();
    console.log('Banco de dados inicializado com sucesso.');
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});