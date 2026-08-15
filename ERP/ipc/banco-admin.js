const {
	listarTabelasBanco,
	consultarTabelaBanco,
	resumoTabelasBanco,
	getLogAtividades,
	exportarBancoJSON,
	verificarSenhaAdmin,
} = require("../database");

function registrar(ipcMain, deps) {
	const { exigirSessao, getSessao } = deps;

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
			const sessao = getSessao();
			const login = sessao ? sessao.login : null;
			const ok = await verificarSenhaAdmin(login, senha);
			return { ok };
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
