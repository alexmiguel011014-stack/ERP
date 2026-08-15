const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");
const { setDBPath, registrarLog, backupAutomatico } = require("./database");

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
			nodeIntegrationInSubFrames: false,
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

require("./ipc/produtos").registrar(ipcMain, deps);
require("./ipc/categorias").registrar(ipcMain, deps);
require("./ipc/clientes").registrar(ipcMain, deps);
require("./ipc/vendas").registrar(ipcMain, deps);
require("./ipc/estoque").registrar(ipcMain, deps);
require("./ipc/precificacao").registrar(ipcMain, deps);
require("./ipc/fornecedores").registrar(ipcMain, deps);
require("./ipc/compras").registrar(ipcMain, deps);
require("./ipc/financeiro").registrar(ipcMain, deps);
require("./ipc/caixa").registrar(ipcMain, deps);
require("./ipc/relatorios").registrar(ipcMain, deps);
require("./ipc/dashboard").registrar(ipcMain, deps);
require("./ipc/banco-admin").registrar(ipcMain, deps);
require("./ipc/sistema").registrar(ipcMain, deps);
require("./ipc/usuarios").registrar(ipcMain, deps);
require("./ipc/auth").registrar(ipcMain, deps);
require("./ipc/pagamentos").registrar(ipcMain, deps);

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
