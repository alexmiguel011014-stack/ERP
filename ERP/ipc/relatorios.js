const {
	getDRE,
	getRelatorioVendas,
	getCurvaABC,
	getComissoes,
} = require("../database");

function registrar(ipcMain, deps) {
	const { exigirPermissao } = deps;

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
}

module.exports = { registrar };
