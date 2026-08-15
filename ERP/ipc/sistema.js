const { app } = require("electron");
const { autoUpdater } = require("electron-updater");
const {
	backupAutomatico,
	exportBackup,
	importBackup,
	getDBPath,
} = require("../database");

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
}

module.exports = { registrar };
