const {
	registrarConsignacao,
	marcarDevolvida,
	marcarPerdida,
	marcarVendida,
	listarConsignacoes,
} = require("../database");

function registrar(ipcMain, deps) {
	const { exigirPermissao, log } = deps;

	ipcMain.handle("consignacoes:registrar", async (event, dados) => {
		try {
			exigirPermissao("produtos");
			const resultado = await registrarConsignacao(dados);
			log(
				"registrar-consignacao",
				"Consignacoes",
				resultado.consignacaoId,
				null,
			);
			return resultado;
		} catch (erro) {
			return { erro: erro.message };
		}
	});

	ipcMain.handle("consignacoes:marcar-devolvida", async (event, id) => {
		try {
			exigirPermissao("produtos");
			const resultado = await marcarDevolvida(id);
			log("marcar-devolvida-consignacao", "Consignacoes", id, null);
			return resultado;
		} catch (erro) {
			return { erro: erro.message };
		}
	});

	ipcMain.handle("consignacoes:marcar-perdida", async (event, id) => {
		try {
			exigirPermissao("produtos");
			const resultado = await marcarPerdida(id);
			log("marcar-perdida-consignacao", "Consignacoes", id, null);
			return resultado;
		} catch (erro) {
			return { erro: erro.message };
		}
	});

	ipcMain.handle("consignacoes:marcar-vendida", async (event, id, dados) => {
		try {
			exigirPermissao("produtos");
			const resultado = await marcarVendida(id, dados);
			log("marcar-vendida-consignacao", "Consignacoes", id, null);
			return resultado;
		} catch (erro) {
			return { erro: erro.message };
		}
	});

	ipcMain.handle("consignacoes:listar", async (event, filtro) => {
		try {
			exigirPermissao("produtos");
			return await listarConsignacoes(filtro);
		} catch (erro) {
			return { erro: erro.message };
		}
	});
}

module.exports = { registrar };
