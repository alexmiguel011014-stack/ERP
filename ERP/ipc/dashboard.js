const { getDashboardStats } = require("../database");

function registrar(ipcMain, deps) {
	const { exigirSessao } = deps;

	ipcMain.handle("dashboard-stats", async () => {
		try {
			exigirSessao();
			const stats = await getDashboardStats();
			return stats;
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
