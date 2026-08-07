const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
	unlockDB: (senha) => ipcRenderer.invoke("unlock-db", senha),
	changeDBKey: (novaSenha) => ipcRenderer.invoke("change-db-key", novaSenha),
	buscarProdutos: () => ipcRenderer.invoke("buscar-produtos"),
	listarProdutosDetalhados: () =>
		ipcRenderer.invoke("listar-produtos-detalhados"),
	proximoSkuProduto: () => ipcRenderer.invoke("proximo-sku-produto"),
	proximoCodigoCategoria: () => ipcRenderer.invoke("proximo-codigo-categoria"),
	proximoCodigoCliente: () => ipcRenderer.invoke("proximo-codigo-cliente"),
	salvarProduto: (dados) => ipcRenderer.invoke("salvar-produto", dados),
	atualizarProduto: (id, dados) =>
		ipcRenderer.invoke("atualizar-produto", id, dados),
	removerProduto: (id) => ipcRenderer.invoke("remover-produto", id),
	buscarSKU: (sku) => ipcRenderer.invoke("buscar-sku", sku),
	buscarProdutosTermo: (termo) =>
		ipcRenderer.invoke("buscar-produtos-termo", termo),
	finalizarVenda: (dados) => ipcRenderer.invoke("finalizar-venda", dados),
	dashboardStats: () => ipcRenderer.invoke("dashboard-stats"),
	getClientes: () => ipcRenderer.invoke("get-clientes"),
	salvarCliente: (dados) => ipcRenderer.invoke("salvar-cliente", dados),
	atualizarCliente: (id, dados) =>
		ipcRenderer.invoke("atualizar-cliente", id, dados),
	removerCliente: (id) => ipcRenderer.invoke("remover-cliente", id),
	movimentacoesCliente: (id) => ipcRenderer.invoke("movimentacoes-cliente", id),
	buscarCliente: (filtro) => ipcRenderer.invoke("buscar-cliente", filtro),
	getVendas: (filtro) => ipcRenderer.invoke("get-vendas", filtro),
	getVendasHoje: () => ipcRenderer.invoke("get-vendas-hoje"),
	getItensVenda: (vendaId) => ipcRenderer.invoke("get-itens-venda", vendaId),
	getEstoqueNegativo: () => ipcRenderer.invoke("get-estoque-negativo"),
	getCategorias: () => ipcRenderer.invoke("get-categorias"),
	categoriasWithUsage: () => ipcRenderer.invoke("categorias-with-usage"),
	removerCategoria: (id) => ipcRenderer.invoke("remover-categoria", id),
	getPricingData: () => ipcRenderer.invoke("get-pricing-data"),
	getGlobalMargin: () => ipcRenderer.invoke("get-global-margin"),
	saveGlobalMargin: (valor) => ipcRenderer.invoke("save-global-margin", valor),
	saveProductMargin: (produtoId, margem) =>
		ipcRenderer.invoke("save-product-margin", produtoId, margem),
	saveProductPrice: (produtoId, precoVenda) =>
		ipcRenderer.invoke("save-product-price", produtoId, precoVenda),
	saveProductCost: (produtoId, custo) =>
		ipcRenderer.invoke("save-product-cost", produtoId, custo),
	saveProductTaxes: (produtoId, valor) =>
		ipcRenderer.invoke("save-product-taxes", produtoId, valor),
	massUpdateMargem: (produtoIds, margem) =>
		ipcRenderer.invoke("mass-update-margem", produtoIds, margem),
	salvarCategoria: (nome, categoriaPaiId) =>
		ipcRenderer.invoke("salvar-categoria", nome, categoriaPaiId),
	salvarCategoriaComSubcategorias: (dados) =>
		ipcRenderer.invoke("salvar-categoria-com-subcategorias", dados),
	exportBackup: () => ipcRenderer.invoke("export-backup"),
	importBackup: (caminho) => ipcRenderer.invoke("import-backup", caminho),
	backupAutomatico: () => ipcRenderer.invoke("backup-automatico"),
	checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
	downloadUpdate: () => ipcRenderer.invoke("download-update"),
	quitAndInstall: () => ipcRenderer.invoke("quit-and-install"),
	getAppVersion: () => ipcRenderer.invoke("get-app-version"),
	getDBPath: () => ipcRenderer.invoke("get-db-path"),
	registrarEntradaEstoque: (dados) =>
		ipcRenderer.invoke("registrar-entrada-estoque", dados),
	getMovimentacoesEstoque: (limite) =>
		ipcRenderer.invoke("get-movimentacoes-estoque", limite),
	getEstoqueBaixo: () => ipcRenderer.invoke("get-estoque-baixo"),
	salvarEstoqueMinimo: (variacaoId, valor) =>
		ipcRenderer.invoke("salvar-estoque-minimo", variacaoId, valor),
	ajustarEstoqueManual: (dados) =>
		ipcRenderer.invoke("ajustar-estoque-manual", dados),
	converterOrcamento: (vendaId) =>
		ipcRenderer.invoke("converter-orcamento", vendaId),
	getFornecedores: () => ipcRenderer.invoke("get-fornecedores"),
	salvarFornecedor: (dados) => ipcRenderer.invoke("salvar-fornecedor", dados),
	atualizarFornecedor: (id, dados) =>
		ipcRenderer.invoke("atualizar-fornecedor", id, dados),
	removerFornecedor: (id) => ipcRenderer.invoke("remover-fornecedor", id),
	criarPedidoCompra: (dados) =>
		ipcRenderer.invoke("criar-pedido-compra", dados),
	getPedidosCompra: () => ipcRenderer.invoke("get-pedidos-compra"),
	getItensPedidoCompra: (pedidoId) =>
		ipcRenderer.invoke("get-itens-pedido-compra", pedidoId),
	receberPedidoCompra: (pedidoId) =>
		ipcRenderer.invoke("receber-pedido-compra", pedidoId),
	cancelarPedidoCompra: (pedidoId) =>
		ipcRenderer.invoke("cancelar-pedido-compra", pedidoId),
	getLancamentos: (filtro) => ipcRenderer.invoke("get-lancamentos", filtro),
	criarLancamento: (dados) => ipcRenderer.invoke("criar-lancamento", dados),
	baixarLancamento: (id) => ipcRenderer.invoke("baixar-lancamento", id),
	excluirLancamento: (id) => ipcRenderer.invoke("excluir-lancamento", id),
	getFluxoCaixa: (inicio, fim) =>
		ipcRenderer.invoke("get-fluxo-caixa", inicio, fim),
	getRelatorioVendas: (inicio, fim) =>
		ipcRenderer.invoke("get-relatorio-vendas", inicio, fim),
	getCurvaABC: (inicio, fim) =>
		ipcRenderer.invoke("get-curva-abc", inicio, fim),
	unlockWithProfile: (login, senha) =>
		ipcRenderer.invoke("unlock-with-profile", login, senha),
	listarUsuarios: () => ipcRenderer.invoke("listar-usuarios"),
	salvarUsuario: (dados) => ipcRenderer.invoke("salvar-usuario", dados),
	removerUsuario: (id) => ipcRenderer.invoke("remover-usuario", id),
	getAuthSession: () => ipcRenderer.invoke("get-auth-session"),
	logout: () => ipcRenderer.invoke("logout"),
	listarTabelasBanco: () => ipcRenderer.invoke("listar-tabelas-banco"),
	consultarTabelaBanco: (tabela, limite) =>
		ipcRenderer.invoke("consultar-tabela-banco", tabela, limite),
	verificarSenhaAdmin: (senha) =>
		ipcRenderer.invoke("verificar-senha-admin", senha),
});

ipcRenderer.on("update-status", (event, data) => {
	window.dispatchEvent(new CustomEvent("update-status", { detail: data }));
});

ipcRenderer.on("categorias-changed", () => {
	window.dispatchEvent(new CustomEvent("categorias-changed"));
});
