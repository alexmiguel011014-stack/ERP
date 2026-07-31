// preload.js - Scripts executados ANTES do renderer (index.html) carregar.
// Roda em um contexto isolado, permitido pelo Node.js, e expoe apenas APIs
// selecionadas para o processo renderer via contextBridge. Isso mantem a seguranca do main.js.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  buscarProdutos: () => ipcRenderer.invoke("buscar-produtos"),
  salvarProduto: (dados) => ipcRenderer.invoke("salvar-produto", dados),
});