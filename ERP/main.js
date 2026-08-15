const { app, BrowserWindow, ipcMain, Menu, dialog } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");
const {
	iniciarBanco,
	salvarProduto,
	atualizarProduto,
	removerProduto,
	restaurarProduto,
	excluirProdutoPermanente,
	listProdutosDetalhados,
	getProximoSkuProduto,
	getProximoCodigoCategoria,
	getProximoCodigoCliente,
	buscarSKU,
	buscarProdutosPorTermo,
	finalizarVenda,
	setDBPath,
	getDBPath,
	getDashboardStats,
	getClientes,
	salvarCliente,
	atualizarCliente,
	removerCliente,
	restaurarCliente,
	excluirClientePermanente,
	getMovimentacoesCliente,
	buscarCliente,
	getVendas,
	getVendasHoje,
	importarVendasHistoricas,
	getItensVenda,
	getEstoqueNegativo,
	getCategorias,
	getListCategoriasWithUsage,
	removerCategoria,
	getPricingData,
	getGlobalMargin,
	saveGlobalMargin,
	getCustoFixoConfig,
	saveCustoFixoConfig,
	saveAplicarCustoFixo,
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
	getEstoqueVisaoGeral,
	salvarEstoqueMinimo,
	ajustarEstoqueManual,
	converterOrcamento,
	getFornecedores,
	salvarFornecedor,
	atualizarFornecedor,
	removerFornecedor,
	listarProdutosFornecedor,
	salvarProdutoFornecedor,
	removerProdutoFornecedor,
	getCustoFornecedorProduto,
	criarPedidoCompra,
	getPedidosCompra,
	getItensPedidoCompra,
	receberPedidoCompra,
	cancelarPedidoCompra,
	getLancamentos,
	criarLancamento,
	baixarLancamento,
	excluirLancamento,
	abrirCaixa,
	fecharCaixa,
	getCaixaAberto,
	getResumoCaixaAberto,
	getHistoricoCaixa,
	getFluxoCaixa,
	getDRE,
	getRelatorioVendas,
	getCurvaABC,
	getComissoes,
	registrarLog,
	getLogAtividades,
	listarTabelasBanco,
	resumoTabelasBanco,
	consultarTabelaBanco,
	exportarBancoJSON,
	verificarSenhaAdmin,
	autenticarUsuario,
	listarUsuarios,
	salvarUsuario,
	removerUsuario,
	bloquearBanco,
	cancelarOrcamento,
	registrarDevolucao,
	getDevolucoes,
	getItensDevolucao,
	getCotacaoProduto,
	listarPrecosCliente,
	salvarPrecoCliente,
	removerPrecoCliente,
	getPrecoCliente,
	salvarImagemProduto,
	removerImagemProduto,
	getCaminhoImagemProduto,
	buscaGlobal,
} = require("./database");

const instanciaUnica = app.requestSingleInstanceLock();
if (!instanciaUnica) {
	app.quit();
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let downloadedUpdateExePath = null;

let mainWindow = null;
let sessao = null;

const CAMINHO_LOG_ERRO = () =>
	path.join(app.getPath("userData"), "erp-crash.log");
const LIMITE_LOG_ERRO_BYTES = 2 * 1024 * 1024; // 2MB, evita crescimento indefinido

// Log de erro persistente (sobrevive ao Temp ser limpo pelo SO): captura
// falhas de preload, console.error/warn e erros de carregamento de página.
function logErro(texto) {
	try {
		const caminho = CAMINHO_LOG_ERRO();
		const fs = require("fs");
		if (
			fs.existsSync(caminho) &&
			fs.statSync(caminho).size > LIMITE_LOG_ERRO_BYTES
		) {
			fs.writeFileSync(caminho, "");
		}
		fs.appendFileSync(
			caminho,
			"[" + new Date().toISOString() + "] " + texto + "\n",
		);
	} catch (e) {
		// Nunca deixa uma falha de log quebrar o app.
	}
}

function exigirSessao(perfil) {
	if (!sessao) throw new Error("Sessão encerrada. Faça login novamente.");
	if (perfil && sessao.perfil !== perfil)
		throw new Error("Acesso permitido somente ao administrador.");
}

// Módulos com toggle liberável para o perfil vendedor (ver PERMISSOES_MODULOS
// na tela de Acessos). Admin sempre passa, independente do que estiver salvo
// em sessao.permissoes — o campo só existe para restringir o vendedor.
function exigirPermissao(modulo) {
	if (!sessao) throw new Error("Sessão encerrada. Faça login novamente.");
	if (sessao.perfil === "admin") return;
	if (!sessao.permissoes || sessao.permissoes[modulo] !== true) {
		throw new Error(
			"Seu usuário não tem acesso a este módulo. Solicite liberação ao administrador.",
		);
	}
}

// Atalho para registrar uma ação no log de auditoria com o usuário da sessão
// atual. Nunca deve interromper o fluxo principal (fire-and-forget).
function log(acao, entidade, entidadeId, detalhes) {
	registrarLog(
		sessao ? sessao.id : null,
		sessao ? sessao.login : null,
		acao,
		entidade,
		entidadeId,
		detalhes,
	).catch(() => {});
}

autoUpdater.on("checking-for-update", () => {
	if (mainWindow)
		mainWindow.webContents.send("update-status", { status: "checking" });
});

autoUpdater.on("update-available", (info) => {
	if (mainWindow)
		mainWindow.webContents.send("update-status", {
			status: "available",
			version: info.version,
		});
});

autoUpdater.on("update-not-available", (info) => {
	if (mainWindow)
		mainWindow.webContents.send("update-status", {
			status: "not-available",
			version: info.version,
		});
});

autoUpdater.on("error", (err) => {
	if (mainWindow)
		mainWindow.webContents.send("update-status", {
			status: "error",
			message: err.message,
		});
});

autoUpdater.on("download-progress", (progress) => {
	if (mainWindow)
		mainWindow.webContents.send("update-status", {
			status: "download-progress",
			progress: progress.percent,
		});
});

autoUpdater.on("update-downloaded", (info) => {
	if (mainWindow)
		mainWindow.webContents.send("update-status", {
			status: "update-downloaded",
			version: info.version,
		});
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
			nodeIntegrationInSubFrames: true,
			preload: path.join(__dirname, "preload.js"),
		},
	});

	mainWindow = janela;
	janela.maximize();
	janela.show();

	janela.webContents.on("preload-error", (event, preloadPath, error) => {
		logErro(
			"PRELOAD-ERROR " +
				preloadPath +
				" -> " +
				(error && error.message ? error.message : error),
		);
	});

	// Nível >=2 cobre console.error/console.warn e os erros que o script
	// errorlog.js (carregado em toda página) reencaminha via console.error:
	// exceções JS não tratadas (window.onerror) e promises sem catch.
	janela.webContents.on("console-message", (event, detail) => {
		const { level, message, lineNumber, sourceId } = detail;
		if (level === "error" || level === "warning") {
			logErro(
				"[L" +
					level +
					"] " +
					message +
					" (" +
					sourceId +
					":" +
					lineNumber +
					")",
			);
		}
	});

	janela.webContents.on(
		"did-fail-load",
		(event, errorCode, errorDescription) => {
			logErro("DID-FAIL-LOAD " + errorCode + " " + errorDescription);
		},
	);

	janela.loadFile("modules/dashboard/index.html");
}

app.whenReady().then(async () => {
	Menu.setApplicationMenu(null);

	setDBPath(app.getPath("userData"));

	criarJanelaPrincipal();

	if (app.isPackaged) {
		autoUpdater.checkForUpdates();
	}
});

ipcMain.handle("buscar-produtos", async () => {
	exigirPermissao("produtos");
	const conexao = require("./database").getConexao();
	return new Promise((resolver, rejeitar) => {
		conexao.all("SELECT * FROM Produtos", [], (erro, linhas) => {
			if (erro) return rejeitar(erro.message);
			resolver(linhas);
		});
	});
});

ipcMain.handle("salvar-produto", async (event, dados) => {
	try {
		exigirPermissao("produtos");
		const resultado = await salvarProduto(dados, dados.variacoes);
		log("criar-produto", "Produtos", resultado.produtoId, dados.nome);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("listar-produtos-detalhados", async (event, incluirInativos) => {
	try {
		exigirPermissao("produtos");
		return await listProdutosDetalhados(!!incluirInativos);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("proximo-sku-produto", async () => {
	try {
		exigirPermissao("produtos");
		return await getProximoSkuProduto();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("proximo-codigo-categoria", async () => {
	try {
		exigirPermissao("produtos");
		return await getProximoCodigoCategoria();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("proximo-codigo-cliente", async () => {
	try {
		exigirSessao();
		return await getProximoCodigoCliente();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("atualizar-produto", async (event, id, dados) => {
	try {
		exigirPermissao("produtos");
		const resultado = await atualizarProduto(id, dados, dados.variacoes);
		log("editar-produto", "Produtos", id, dados.nome);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("remover-produto", async (event, id) => {
	try {
		exigirPermissao("produtos");
		const resultado = await removerProduto(id);
		log("excluir-produto", "Produtos", id, null);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("restaurar-produto", async (event, id) => {
	try {
		exigirPermissao("produtos");
		const resultado = await restaurarProduto(id);
		log("restaurar-produto", "Produtos", id, null);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("excluir-produto-permanente", async (event, id) => {
	try {
		exigirPermissao("produtos");
		const resultado = await excluirProdutoPermanente(id);
		log("excluir-produto-permanente", "Produtos", id, null);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

/* ============ Imagem do produto ============ */

ipcMain.handle("escolher-imagem-produto", async (event, produtoId) => {
	try {
		exigirPermissao("produtos");
		const escolha = await dialog.showOpenDialog(mainWindow, {
			title: "Escolher imagem do produto",
			properties: ["openFile"],
			filters: [
				{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp"] },
			],
		});
		if (escolha.canceled || !escolha.filePaths[0])
			return { success: false, cancelado: true };
		const resultado = await salvarImagemProduto(
			produtoId,
			escolha.filePaths[0],
		);
		log("alterar-imagem-produto", "Produtos", produtoId, null);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("remover-imagem-produto", async (event, produtoId) => {
	try {
		exigirPermissao("produtos");
		const resultado = await removerImagemProduto(produtoId);
		log("remover-imagem-produto", "Produtos", produtoId, null);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

// Lê a imagem do disco e retorna como data URL — evita expor caminhos de
// arquivo ao renderer e contorna a CSP em contexto isolado (sem file://).
ipcMain.handle("get-imagem-produto", async (event, nomeArquivo) => {
	try {
		exigirSessao();
		const caminho = getCaminhoImagemProduto(nomeArquivo);
		if (!caminho || !require("fs").existsSync(caminho)) return null;
		const buffer = require("fs").readFileSync(caminho);
		const ext = require("path").extname(caminho).slice(1).toLowerCase();
		const mime = ext === "jpg" ? "jpeg" : ext;
		return "data:image/" + mime + ";base64," + buffer.toString("base64");
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("buscar-sku", async (event, sku) => {
	try {
		exigirSessao();
		return await buscarSKU(sku);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("buscar-produtos-termo", async (event, termo) => {
	try {
		exigirSessao();
		return await buscarProdutosPorTermo(termo);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("finalizar-venda", async (event, dados) => {
	try {
		exigirSessao();
		const resultado = await finalizarVenda(dados, sessao ? sessao.id : null);
		log(
			dados.status === "orcamento" ? "criar-orcamento" : "finalizar-venda",
			"Vendas",
			resultado.vendaId,
			"Total: " + (dados.total || 0),
		);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("dashboard-stats", async () => {
	try {
		exigirSessao();
		const stats = await getDashboardStats();
		return stats;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-clientes", async (event, incluirInativos) => {
	try {
		exigirSessao();
		return await getClientes(!!incluirInativos);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("salvar-cliente", async (event, dados) => {
	try {
		exigirSessao();
		return await salvarCliente(dados);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("remover-cliente", async (event, id) => {
	try {
		exigirSessao("admin");
		const resultado = await removerCliente(id);
		log("excluir-cliente", "Clientes", id, null);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("restaurar-cliente", async (event, id) => {
	try {
		exigirSessao("admin");
		const resultado = await restaurarCliente(id);
		log("restaurar-cliente", "Clientes", id, null);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("excluir-cliente-permanente", async (event, id) => {
	try {
		exigirSessao("admin");
		const resultado = await excluirClientePermanente(id);
		log("excluir-cliente-permanente", "Clientes", id, null);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("atualizar-cliente", async (event, id, dados) => {
	try {
		exigirSessao();
		return await atualizarCliente(id, dados);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("movimentacoes-cliente", async (event, clienteId) => {
	try {
		exigirSessao();
		return await getMovimentacoesCliente(clienteId);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("buscar-cliente", async (event, filtro) => {
	try {
		exigirSessao();
		return await buscarCliente(filtro);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("busca-global", async (event, termo) => {
	try {
		exigirSessao();
		return await buscaGlobal(termo);
	} catch (erro) {
		throw erro.message;
	}
});

/* ============ Tabela de preço por cliente ============ */

ipcMain.handle("listar-precos-cliente", async (event, clienteId) => {
	try {
		exigirSessao("admin");
		return await listarPrecosCliente(clienteId);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("salvar-preco-cliente", async (event, dados) => {
	try {
		exigirSessao("admin");
		const resultado = await salvarPrecoCliente(dados);
		log(
			"salvar-preco-cliente",
			"PrecoCliente",
			dados.cliente_id,
			"SKU var " + dados.variacao_id,
		);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("remover-preco-cliente", async (event, id) => {
	try {
		exigirSessao("admin");
		const resultado = await removerPrecoCliente(id);
		log("remover-preco-cliente", "PrecoCliente", id, null);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

// Consulta usada pelo PDV (vendedor) ao escanear SKU com cliente selecionado —
// sessão comum, sem restrição de perfil.
ipcMain.handle("get-preco-cliente", async (event, clienteId, variacaoId) => {
	try {
		exigirSessao();
		return await getPrecoCliente(clienteId, variacaoId);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-vendas", async (event, filtroData) => {
	try {
		exigirSessao("admin");
		return await getVendas(filtroData || null);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-vendas-hoje", async () => {
	try {
		exigirSessao();
		return await getVendasHoje();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("importar-vendas-historicas", async (event, linhas) => {
	try {
		exigirPermissao("estoque");
		return await importarVendasHistoricas(linhas);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-itens-venda", async (event, vendaId) => {
	try {
		exigirSessao("admin");
		return await getItensVenda(vendaId);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-estoque-negativo", async () => {
	try {
		exigirPermissao("estoque");
		return await getEstoqueNegativo();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-categorias", async () => {
	try {
		exigirPermissao("produtos");
		return await getCategorias();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("categorias-with-usage", async () => {
	try {
		exigirPermissao("produtos");
		return await getListCategoriasWithUsage();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("remover-categoria", async (event, id) => {
	try {
		exigirPermissao("produtos");
		const resultado = await removerCategoria(id);
		if (mainWindow) mainWindow.webContents.send("categorias-changed");
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-pricing-data", async () => {
	try {
		exigirPermissao("produtos");
		return await getPricingData();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-global-margin", async () => {
	try {
		exigirSessao("admin");
		return await getGlobalMargin();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("save-global-margin", async (event, valor) => {
	try {
		exigirSessao("admin");
		return await saveGlobalMargin(valor);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-custo-fixo-config", async () => {
	try {
		exigirSessao("admin");
		return await getCustoFixoConfig();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle(
	"save-custo-fixo-config",
	async (event, mensal, volumeMensal) => {
		try {
			exigirSessao("admin");
			return await saveCustoFixoConfig(mensal, volumeMensal);
		} catch (erro) {
			throw erro.message;
		}
	},
);

ipcMain.handle("save-aplicar-custo-fixo", async (event, produtoId, aplicar) => {
	try {
		exigirPermissao("produtos");
		return await saveAplicarCustoFixo(produtoId, aplicar);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("save-product-margin", async (event, produtoId, margem) => {
	try {
		exigirPermissao("produtos");
		return await saveProductMargin(produtoId, margem);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("save-product-price", async (event, produtoId, precoVenda) => {
	try {
		exigirPermissao("produtos");
		const resultado = await saveProductPrice(produtoId, precoVenda);
		log("alterar-preco", "Produtos", produtoId, "Novo preço: " + precoVenda);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("save-product-cost", async (event, produtoId, precoCusto) => {
	try {
		exigirPermissao("produtos");
		return await saveProductCost(produtoId, precoCusto);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("save-product-taxes", async (event, produtoId, valor) => {
	try {
		exigirPermissao("produtos");
		return await saveProductTaxes(produtoId, valor);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("mass-update-margem", async (event, produtoIds, margem) => {
	try {
		exigirPermissao("produtos");
		return await massUpdateMargem(produtoIds, margem);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("salvar-categoria", async (event, nome, categoriaPaiId) => {
	try {
		exigirPermissao("produtos");
		const resultado = await salvarCategoria(nome, categoriaPaiId);
		if (mainWindow) mainWindow.webContents.send("categorias-changed");
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("salvar-categoria-com-subcategorias", async (event, dados) => {
	try {
		exigirPermissao("produtos");
		const resultado = await salvarCategoriaComSubcategorias(dados);
		if (mainWindow) mainWindow.webContents.send("categorias-changed");
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("backup-automatico", async () => {
	try {
		exigirSessao("admin");
		const result = backupAutomatico();
		return { success: true, caminho: result };
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("export-backup", async () => {
	try {
		exigirSessao("admin");
		return exportBackup();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("import-backup", async (event, caminho) => {
	try {
		exigirSessao("admin");
		return await importBackup(caminho);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("check-for-updates", async () => {
	try {
		const result = await autoUpdater.checkForUpdates();
		return result;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("download-update", async () => {
	try {
		exigirSessao("admin");
		const result = await autoUpdater.downloadUpdate();
		if (result && result.path) {
			downloadedUpdateExePath = result.path;
		}
		return { success: true };
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("quit-and-install", async () => {
	exigirSessao("admin");
	if (downloadedUpdateExePath) {
		setImmediate(() => {
			autoUpdater.quitAndInstall(false, true);
			downloadedUpdateExePath = null;
		});
	}
});

ipcMain.handle("get-app-version", async () => {
	return app.getVersion();
});

ipcMain.handle("get-db-path", async () => getDBPath());

/* ============ Estoque: entradas ============ */

ipcMain.handle("registrar-entrada-estoque", async (event, dados) => {
	try {
		exigirPermissao("estoque");
		return await registrarEntradaEstoque(dados);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-movimentacoes-estoque", async (event, limite) => {
	try {
		exigirPermissao("estoque");
		return await getMovimentacoesEstoque(limite);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-estoque-baixo", async () => {
	try {
		exigirPermissao("estoque");
		return await getEstoqueBaixo();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-estoque-visao-geral", async () => {
	try {
		exigirPermissao("estoque");
		return await getEstoqueVisaoGeral();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("salvar-estoque-minimo", async (event, variacaoId, valor) => {
	try {
		exigirPermissao("estoque");
		return await salvarEstoqueMinimo(variacaoId, valor);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("ajustar-estoque-manual", async (event, dados) => {
	try {
		exigirPermissao("estoque");
		return await ajustarEstoqueManual(dados);
	} catch (erro) {
		throw erro.message;
	}
});

/* ============ Orçamentos ============ */

ipcMain.handle("converter-orcamento", async (event, vendaId) => {
	try {
		exigirPermissao("vendas");
		return await converterOrcamento(vendaId);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("cancelar-orcamento", async (event, vendaId) => {
	try {
		exigirPermissao("vendas");
		const resultado = await cancelarOrcamento(vendaId);
		log("cancelar-orcamento", "Vendas", vendaId, null);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

/* ============ Devoluções / trocas ============ */

ipcMain.handle("registrar-devolucao", async (event, dados) => {
	try {
		exigirSessao();
		const resultado = await registrarDevolucao(
			dados,
			sessao ? sessao.id : null,
		);
		log(
			"registrar-devolucao",
			"Devolucoes",
			resultado.devolucaoId,
			"Venda #" + dados.venda_id,
		);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-devolucoes", async (event, filtro) => {
	try {
		exigirSessao();
		return await getDevolucoes(filtro);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-itens-devolucao", async (event, devolucaoId) => {
	try {
		exigirSessao();
		return await getItensDevolucao(devolucaoId);
	} catch (erro) {
		throw erro.message;
	}
});

/* ============ Fornecedores ============ */

ipcMain.handle("get-fornecedores", async () => {
	try {
		exigirPermissao("fornecedores");
		return await getFornecedores();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("salvar-fornecedor", async (event, dados) => {
	try {
		exigirPermissao("fornecedores");
		return await salvarFornecedor(dados);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("atualizar-fornecedor", async (event, id, dados) => {
	try {
		exigirPermissao("fornecedores");
		return await atualizarFornecedor(id, dados);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("remover-fornecedor", async (event, id) => {
	try {
		exigirPermissao("fornecedores");
		return await removerFornecedor(id);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("listar-produtos-fornecedor", async (event, fornecedorId) => {
	try {
		exigirPermissao("fornecedores");
		return await listarProdutosFornecedor(fornecedorId);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("salvar-produto-fornecedor", async (event, dados) => {
	try {
		exigirPermissao("fornecedores");
		return await salvarProdutoFornecedor(dados);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("remover-produto-fornecedor", async (event, id) => {
	try {
		exigirPermissao("fornecedores");
		return await removerProdutoFornecedor(id);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle(
	"get-custo-fornecedor-produto",
	async (event, fornecedorId, variacaoId) => {
		try {
			exigirPermissao("fornecedores");
			return await getCustoFornecedorProduto(fornecedorId, variacaoId);
		} catch (erro) {
			throw erro.message;
		}
	},
);

ipcMain.handle("get-cotacao-produto", async (event, variacaoId) => {
	try {
		exigirPermissao("fornecedores");
		return await getCotacaoProduto(variacaoId);
	} catch (erro) {
		throw erro.message;
	}
});

/* ============ Compras ============ */

ipcMain.handle("criar-pedido-compra", async (event, dados) => {
	try {
		exigirPermissao("compras");
		const resultado = await criarPedidoCompra(dados);
		log("criar-pedido-compra", "PedidosCompra", resultado.pedidoId, null);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-pedidos-compra", async () => {
	try {
		exigirPermissao("compras");
		return await getPedidosCompra();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-itens-pedido-compra", async (event, pedidoId) => {
	try {
		exigirPermissao("compras");
		return await getItensPedidoCompra(pedidoId);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle(
	"receber-pedido-compra",
	async (event, pedidoId, itensRecebidos) => {
		try {
			exigirPermissao("compras");
			const resultado = await receberPedidoCompra(pedidoId, itensRecebidos);
			log(
				"receber-pedido-compra",
				"PedidosCompra",
				pedidoId,
				resultado.status === "parcial" ? "recebimento parcial" : null,
			);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	},
);

ipcMain.handle("cancelar-pedido-compra", async (event, pedidoId) => {
	try {
		exigirPermissao("compras");
		const resultado = await cancelarPedidoCompra(pedidoId);
		log("cancelar-pedido-compra", "PedidosCompra", pedidoId, null);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

/* ============ Financeiro ============ */

ipcMain.handle("get-lancamentos", async (event, filtro) => {
	try {
		exigirPermissao("financeiro");
		return await getLancamentos(filtro || {});
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("criar-lancamento", async (event, dados) => {
	try {
		exigirPermissao("financeiro");
		const resultado = await criarLancamento(dados);
		log(
			"criar-lancamento",
			"LancamentosFinanceiros",
			resultado.lancamentoId,
			dados.descricao,
		);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("baixar-lancamento", async (event, id) => {
	try {
		exigirPermissao("financeiro");
		const resultado = await baixarLancamento(id);
		log("baixar-lancamento", "LancamentosFinanceiros", id, null);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("excluir-lancamento", async (event, id) => {
	try {
		exigirPermissao("financeiro");
		const resultado = await excluirLancamento(id);
		log("excluir-lancamento", "LancamentosFinanceiros", id, null);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-fluxo-caixa", async (event, dataInicio, dataFim) => {
	try {
		exigirPermissao("financeiro");
		return await getFluxoCaixa(dataInicio || null, dataFim || null);
	} catch (erro) {
		throw erro.message;
	}
});

/* ============ Fechamento de caixa ============ */
// Sessão comum (não módulo-gated): abrir/fechar caixa é operação do dia a dia
// do PDV, igual finalizar venda — qualquer vendedor logado pode operar.

ipcMain.handle("abrir-caixa", async (event, valorAbertura) => {
	try {
		exigirSessao();
		const resultado = await abrirCaixa(
			valorAbertura,
			sessao ? sessao.id : null,
		);
		log(
			"abrir-caixa",
			"FechamentosCaixa",
			resultado.caixaId,
			"Abertura: " + valorAbertura,
		);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("fechar-caixa", async (event, valorInformado, observacao) => {
	try {
		exigirSessao();
		const resultado = await fecharCaixa(
			valorInformado,
			observacao,
			sessao ? sessao.id : null,
		);
		log(
			"fechar-caixa",
			"FechamentosCaixa",
			null,
			"Diferença: " + resultado.diferenca,
		);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-caixa-aberto", async () => {
	try {
		exigirSessao();
		return await getCaixaAberto();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-resumo-caixa-aberto", async () => {
	try {
		exigirSessao();
		return await getResumoCaixaAberto();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-historico-caixa", async (event, limite) => {
	try {
		exigirPermissao("financeiro");
		return await getHistoricoCaixa(limite);
	} catch (erro) {
		throw erro.message;
	}
});

/* ============ Relatórios ============ */

ipcMain.handle("get-dre", async (event, dataInicio, dataFim) => {
	try {
		exigirPermissao("relatorios");
		return await getDRE(dataInicio || null, dataFim || null);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-relatorio-vendas", async (event, dataInicio, dataFim) => {
	try {
		exigirPermissao("relatorios");
		return await getRelatorioVendas(dataInicio || null, dataFim || null);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-curva-abc", async (event, dataInicio, dataFim) => {
	try {
		exigirPermissao("relatorios");
		return await getCurvaABC(dataInicio || null, dataFim || null);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-comissoes", async (event, dataInicio, dataFim) => {
	try {
		exigirPermissao("relatorios");
		return await getComissoes(dataInicio || null, dataFim || null);
	} catch (erro) {
		throw erro.message;
	}
});

/* ============ Banco de Dados (via sessão admin) ============ */

ipcMain.handle("listar-tabelas-banco", async () => {
	try {
		exigirSessao("admin");
		return await listarTabelasBanco();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("consultar-tabela-banco", async (event, tabela, limite) => {
	try {
		exigirSessao("admin");
		return await consultarTabelaBanco(tabela, limite);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("resumo-tabelas-banco", async () => {
	try {
		exigirSessao("admin");
		return await resumoTabelasBanco();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-log-atividades", async (event, filtro) => {
	try {
		exigirSessao("admin");
		return await getLogAtividades(filtro || {});
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("exportar-banco-json", async () => {
	try {
		exigirSessao("admin");
		return await exportarBancoJSON();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("verificar-senha-admin", async (event, senha) => {
	try {
		exigirSessao("admin");
		const login = sessao ? sessao.login : null;
		const ok = await verificarSenhaAdmin(login, senha);
		return { ok };
	} catch (erro) {
		throw erro.message;
	}
});

/* ============ Usuários (login do sistema) ============ */

ipcMain.handle("unlock-with-profile", async (event, login, senha) => {
	try {
		const resultado = await autenticarUsuario(login, senha);
		sessao = {
			perfil: resultado.usuario.perfil,
			login: resultado.usuario.login,
			nome: resultado.usuario.nome,
			id: resultado.usuario.id,
			permissoes: resultado.usuario.permissoes || {},
		};
		iniciarBackupAutomatico();
		log("login", "Usuarios", resultado.usuario.id, null);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("listar-usuarios", async () => {
	try {
		exigirSessao("admin");
		return await listarUsuarios();
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("salvar-usuario", async (event, dados) => {
	try {
		exigirSessao("admin");
		const resultado = await salvarUsuario(dados);
		log(
			dados.id ? "editar-usuario" : "criar-usuario",
			"Usuarios",
			dados.id || null,
			dados.login,
		);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("remover-usuario", async (event, id) => {
	try {
		exigirSessao("admin");
		const resultado = await removerUsuario(id);
		log("excluir-usuario", "Usuarios", id, null);
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

var intervaloBackup = null;

// Roda logo no login (não só no intervalo) porque a sessão raramente fica
// aberta 24h seguidas — sem isso, quem fecha o app todo dia nunca gera backup.
// backupAutomatico() é idempotente por dia, então chamar de novo não duplica.
function iniciarBackupAutomatico() {
	if (intervaloBackup) clearInterval(intervaloBackup);
	try {
		backupAutomatico();
	} catch (e) {
		console.error("Erro no backup automatico:", e.message);
	}
	intervaloBackup = setInterval(
		() => {
			try {
				backupAutomatico();
			} catch (e) {
				console.error("Erro no backup automatico:", e.message);
			}
		},
		24 * 60 * 60 * 1000,
	);
}

ipcMain.handle("unlock-db", async (event, senha) => {
	try {
		const { desbloquearBanco } = require("./database");
		const resultado = await desbloquearBanco(senha);
		sessao = { perfil: "admin" };
		iniciarBackupAutomatico();
		return resultado;
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("change-db-key", async (event, novaSenha) => {
	try {
		exigirSessao("admin");
		const { trocarChave } = require("./database");
		return await trocarChave(novaSenha);
	} catch (erro) {
		throw erro.message;
	}
});

ipcMain.handle("get-auth-session", async () => {
	return sessao
		? {
				autenticado: true,
				perfil: sessao.perfil,
				permissoes: sessao.permissoes || {},
				usuario: { id: sessao.id, login: sessao.login, nome: sessao.nome },
			}
		: { autenticado: false };
});

ipcMain.handle("logout", async () => {
	await bloquearBanco();
	sessao = null;
	if (intervaloBackup) {
		clearInterval(intervaloBackup);
		intervaloBackup = null;
	}
	return { success: true };
});

app.on("before-quit", () => {
	if (sessao) {
		try {
			backupAutomatico();
		} catch (e) {
			console.error("Erro no backup automatico (before-quit):", e.message);
		}
	}
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
