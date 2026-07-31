const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  buscarProdutos: () => ipcRenderer.invoke("buscar-produtos"),
  salvarProduto: (dados) => ipcRenderer.invoke("salvar-produto", dados),
  buscarSKU: (sku) => ipcRenderer.invoke("buscar-sku", sku),
  finalizarVenda: (dados) => ipcRenderer.invoke("finalizar-venda", dados),
  dashboardStats: () => ipcRenderer.invoke("dashboard-stats"),
  getClientes: () => ipcRenderer.invoke("get-clientes"),
  salvarCliente: (dados) => ipcRenderer.invoke("salvar-cliente", dados),
  removerCliente: (id) => ipcRenderer.invoke("remover-cliente", id),
  buscarCliente: (filtro) => ipcRenderer.invoke("buscar-cliente", filtro),
  getVendas: (filtro) => ipcRenderer.invoke("get-vendas", filtro),
  getVendasHoje: () => ipcRenderer.invoke("get-vendas-hoje"),
  exportBackup: () => ipcRenderer.invoke("export-backup"),
  importBackup: (caminho) => ipcRenderer.invoke("import-backup", caminho),
});