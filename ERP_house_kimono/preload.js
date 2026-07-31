const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  buscarProdutos: () => ipcRenderer.invoke("buscar-produtos"),
  salvarProduto: (dados) => ipcRenderer.invoke("salvar-produto", dados),
  buscarSKU: (sku) => ipcRenderer.invoke("buscar-sku", sku),
  finalizarVenda: (dados) => ipcRenderer.invoke("finalizar-venda", dados),
});