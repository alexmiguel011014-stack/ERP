const {
	getEstoqueNegativo,
	registrarEntradaEstoque,
	getMovimentacoesEstoque,
	getEstoqueBaixo,
	getEstoqueVisaoGeral,
	salvarEstoqueMinimo,
	ajustarEstoqueManual,
} = require("../database");

function registrar(ipcMain, deps) {
	const { exigirPermissao } = deps;

	ipcMain.handle("get-estoque-negativo", async () => {
		try {
			exigirPermissao("estoque");
			return await getEstoqueNegativo();
		} catch (erro) {
			throw erro.message;
		}
	});

	/* ============ Estoque: entradas ============ */

	ipcMain.handle("registrar-entrada-estoque", async (event, dados) => {
		try {
			exigirPermissao("estoque");
			return await registrarEntradaEstoque(dados);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-movimentacoes-estoque", async (event, limite) => {
		try {
			exigirPermissao("estoque");
			return await getMovimentacoesEstoque(limite);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-estoque-baixo", async () => {
		try {
			exigirPermissao("estoque");
			return await getEstoqueBaixo();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-estoque-visao-geral", async () => {
		try {
			exigirPermissao("estoque");
			return await getEstoqueVisaoGeral();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("salvar-estoque-minimo", async (event, variacaoId, valor) => {
		try {
			exigirPermissao("estoque");
			return await salvarEstoqueMinimo(variacaoId, valor);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("ajustar-estoque-manual", async (event, dados) => {
		try {
			exigirPermissao("estoque");
			return await ajustarEstoqueManual(dados);
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
