const {
	app,
	BrowserWindow,
	ipcMain,
	Menu,
	protocol,
	net,
} = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const { autoUpdater } = require("electron-updater");
const { setDBPath, registrarLog, backupAutomatico } = require("./database");

// Fase 0 (spike) do novo frontend Next.js/React — ver plano de migração.
// Protocolo customizado, não servidor HTTP local: zero porta escutando na
// máquina do cliente (evita falso-positivo de antivírus numa loja sem TI
// dedicado) e resolve os caminhos raiz-absolutos (/_next/...) que o export
// estático do Next gera, o que file:// não consegue (sem origin). Precisa
// ser registrado antes de app.whenReady().
protocol.registerSchemesAsPrivileged([
	{
		scheme: "app",
		privileges: { standard: true, secure: true, supportFetchAPI: true },
	},
]);
const CARREGAR_FRONTEND_NOVO = process.env.ERP_SPIKE_FRONTEND === "1";
const DIR_FRONTEND_NOVO = path.join(__dirname, "frontend", "out");

// Carrega .env (chaves Pix/NF-e etc.) se existir — nunca obrigatório, o app
// funciona normalmente sem ele (integrações opcionais caem no fallback
// manual). Só cobre modo dev (.env na raiz do app); produção empacotada
// ainda não tem um local definido pra isso — ver GOALS.md.
try {
	process.loadEnvFile(path.join(__dirname, ".env"));
} catch {
	/* sem .env: segue com as integrações opcionais desligadas */
}

const instanciaUnica = app.requestSingleInstanceLock();
if (!instanciaUnica) {
	app.quit();
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

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
	} catch {
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

function pararBackupAutomatico() {
	if (intervaloBackup) {
		clearInterval(intervaloBackup);
		intervaloBackup = null;
	}
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
		(event, errorCode, errorDescription, validatedURL) => {
			logErro(
				"DID-FAIL-LOAD " +
					errorCode +
					" " +
					errorDescription +
					" url=" +
					validatedURL,
			);
		},
	);

	if (CARREGAR_FRONTEND_NOVO) {
		janela.loadURL("app://renderer/");
	} else {
		janela.loadFile("modules/dashboard/index.html");
	}
}

// Serve o export estático do Next.js (frontend/out/) via app://renderer/...
// — mesma técnica de pacotes como electron-serve. Só registrado quando o
// spike está ligado; o app antigo (file://) nunca passa por aqui.
function registrarProtocoloFrontendNovo() {
	protocol.handle("app", (request) => {
		const url = new URL(request.url);
		let caminhoRelativo = decodeURIComponent(url.pathname);
		if (caminhoRelativo === "" || caminhoRelativo.endsWith("/")) {
			caminhoRelativo += "index.html";
		}
		const caminhoArquivo = path.join(DIR_FRONTEND_NOVO, caminhoRelativo);
		// Nunca resolver fora de DIR_FRONTEND_NOVO (bloqueia path traversal via ../).
		if (
			!caminhoArquivo.startsWith(DIR_FRONTEND_NOVO + path.sep) &&
			caminhoArquivo !== DIR_FRONTEND_NOVO
		) {
			return new Response("Forbidden", { status: 403 });
		}
		return net.fetch(pathToFileURL(caminhoArquivo).toString());
	});
}

app.whenReady().then(async () => {
	Menu.setApplicationMenu(null);

	setDBPath(app.getPath("userData"));

	if (CARREGAR_FRONTEND_NOVO) {
		registrarProtocoloFrontendNovo();
	}

	criarJanelaPrincipal();

	if (app.isPackaged) {
		autoUpdater.checkForUpdates();
	}
});

const deps = {
	exigirSessao,
	exigirPermissao,
	log,
	logErro,
	getSessao: () => sessao,
	setSessao: (s) => {
		sessao = s;
	},
	iniciarBackupAutomatico,
	pararBackupAutomatico,
	getMainWindow: () => mainWindow,
};

// auth e fiscal são infraestrutura do core (sessão central + integração
// fiscal cross-cutting, usada internamente por vendas/caixa) — não são
// "módulos" plugáveis no sentido de docs/MODULE_MANIFEST.md, então ficam de
// fora do loop de manifesto, registrados direto, como sempre foram.
require("./ipc/auth").registrar(ipcMain, deps);
require("./ipc/fiscal").registrar(ipcMain, deps);

// Registro de IPC dos módulos plugáveis, orientado por manifesto — ver
// docs/MODULE_MANIFEST.md e modulos.js. Substitui a lista fixa de 19
// requires que existia aqui antes; o mesmo conjunto de arquivos ipc/*.js é
// registrado, só que descoberto a partir de modules/**/modulo.json em vez de
// hardcoded. Um mesmo ipc/*.js pode ser referenciado por mais de um módulo
// (ex.: "estoque.js" por entrada/estoque-lista/importacao) — dedupe por nome
// de arquivo, senão ipcMain.handle() lança "second handler" no boot.
//
// aplicarEntitlements: desligado por padrão (sem entitlements.json na raiz,
// todo módulo continua habilitado) — ver GOALS.md "Security: dormant
// entitlements design". Um módulo desativado não tem nem o IPC registrado
// nem aparece na sidebar (ipc/sistema.js aplica o mesmo filtro do lado do
// navbar.js) — desligar por entitlement bloqueia os dois lados, não só a UI.
const { carregarModulos, aplicarEntitlements } = require("./modulos.js");
const ipcJaRegistrado = new Set();
const modulosHabilitados = aplicarEntitlements(
	carregarModulos(path.join(__dirname, "modules")),
	path.join(__dirname, "entitlements.json"),
);
for (const modulo of modulosHabilitados) {
	for (const nomeIpc of modulo.ipc) {
		if (ipcJaRegistrado.has(nomeIpc)) continue;
		ipcJaRegistrado.add(nomeIpc);
		require("./ipc/" + nomeIpc).registrar(ipcMain, deps);
	}
}

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
