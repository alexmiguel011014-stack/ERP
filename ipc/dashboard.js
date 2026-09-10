const { getDashboardStats, getFaturamentoPorPeriodo } = require("../database");

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

	ipcMain.handle("dashboard-faturamento-periodo", async (event, range) => {
		try {
			exigirSessao();
			return await getFaturamentoPorPeriodo(range);
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
