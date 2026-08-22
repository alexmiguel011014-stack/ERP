const path = require("path");
const { app } = require("electron");
const { autoUpdater } = require("electron-updater");
const {
	backupAutomatico,
	exportBackup,
	importBackup,
	getDBPath,
} = require("../database");
const { carregarModulos, aplicarEntitlements } = require("../modulos.js");

// Estado local a este domínio: só usado por download-update / quit-and-install,
// abaixo. autoUpdater.autoDownload/autoInstallOnAppQuit são configurados uma
// vez em main.js — o electron-updater é um singleton (módulo cacheado pelo
// Node), então a config feita lá continua valendo aqui.
let downloadedUpdateExePath = null;

function registrar(ipcMain, deps) {
	const { exigirSessao } = deps;

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

	// navbar.js roda no renderer (sem fs/require de Node) e precisa da lista
	// de módulos pra montar a sidebar — ver docs/MODULE_MANIFEST.md e
	// modulos.js. Barato (19 JSONs pequenos), chamado direto a cada request
	// em vez de cacheado, então nunca fica desatualizado durante o dev.
	// aplicarEntitlements: mesmo filtro dormant do main.js — um módulo
	// desativado some da sidebar, não só do registro de IPC.
	ipcMain.handle("get-modulos-carregados", async () => {
		return aplicarEntitlements(
			carregarModulos(path.join(__dirname, "..", "modules")),
			path.join(__dirname, "..", "entitlements.json"),
		);
	});
}

module.exports = { registrar };
