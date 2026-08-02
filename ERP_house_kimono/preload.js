const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  unlockDB: (senha) => ipcRenderer.invoke("unlock-db", senha),
  changeDBKey: (novaSenha) => ipcRenderer.invoke("change-db-key", novaSenha),
  buscarProdutos: () => ipcRenderer.invoke("buscar-produtos"),
  listarProdutosDetalhados: () => ipcRenderer.invoke("listar-produtos-detalhados"),
  salvarProduto: (dados) => ipcRenderer.invoke("salvar-produto", dados),
  atualizarProduto: (id, dados) => ipcRenderer.invoke("atualizar-produto", id, dados),
  removerProduto: (id) => ipcRenderer.invoke("remover-produto", id),
  buscarSKU: (sku) => ipcRenderer.invoke("buscar-sku", sku),
  finalizarVenda: (dados) => ipcRenderer.invoke("finalizar-venda", dados),
  dashboardStats: () => ipcRenderer.invoke("dashboard-stats"),
  getClientes: () => ipcRenderer.invoke("get-clientes"),
  salvarCliente: (dados) => ipcRenderer.invoke("salvar-cliente", dados),
  removerCliente: (id) => ipcRenderer.invoke("remover-cliente", id),
  buscarCliente: (filtro) => ipcRenderer.invoke("buscar-cliente", filtro),
  getVendas: (filtro) => ipcRenderer.invoke("get-vendas", filtro),
  getVendasHoje: () => ipcRenderer.invoke("get-vendas-hoje"),
  getItensVenda: (vendaId) => ipcRenderer.invoke("get-itens-venda", vendaId),
  getEstoqueNegativo: () => ipcRenderer.invoke("get-estoque-negativo"),
  getCategorias: () => ipcRenderer.invoke("get-categorias"),
  salvarCategoria: (nome, categoriaPaiId) => ipcRenderer.invoke("salvar-categoria", nome, categoriaPaiId),
  salvarCategoriaComSubcategorias: (dados) => ipcRenderer.invoke("salvar-categoria-com-subcategorias", dados),
  exportBackup: () => ipcRenderer.invoke("export-backup"),
  importBackup: (caminho) => ipcRenderer.invoke("import-backup", caminho),
  backupAutomatico: () => ipcRenderer.invoke("backup-automatico"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  quitAndInstall: () => ipcRenderer.invoke("quit-and-install"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
});

ipcRenderer.on("update-status", (event, data) => {
  window.dispatchEvent(new CustomEvent("update-status", { detail: data }));
});