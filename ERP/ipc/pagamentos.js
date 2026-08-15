const {
	registrarPagamento,
	listarPagamentos,
	pagarPagamento,
	listarPagamentosPendentes,
} = require("../db/pagamentos");

function registrar(ipcMain, deps) {
	const { exigirSessao } = deps;

	ipcMain.handle("listar-pagamentos", async (event, metodo) => {
		try {
			exigirSessao();
			return await listarPagamentos(metodo);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("registrar-pagamento", async (event, dados) => {
		try {
			exigirSessao();
			return await registrarPagamento(dados);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("pagar-pagamento", async (event, id) => {
		try {
			exigirSessao("admin");
			return await pagarPagamento(id);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("listar-pagamentos-pendentes", async () => {
		try {
			exigirSessao();
			return await listarPagamentosPendentes();
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
