const {
	getLancamentos,
	criarLancamento,
	baixarLancamento,
	excluirLancamento,
	getFluxoCaixa,
} = require("../database");

function registrar(ipcMain, deps) {
	const { exigirPermissao, log } = deps;

	ipcMain.handle("get-lancamentos", async (event, filtro) => {
		try {
			exigirPermissao("financeiro");
			return await getLancamentos(filtro || {});
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("criar-lancamento", async (event, dados) => {
		try {
			exigirPermissao("financeiro");
			const resultado = await criarLancamento(dados);
			log(
				"criar-lancamento",
				"LancamentosFinanceiros",
				resultado.lancamentoId,
				dados.descricao,
			);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("baixar-lancamento", async (event, id) => {
		try {
			exigirPermissao("financeiro");
			const resultado = await baixarLancamento(id);
			log("baixar-lancamento", "LancamentosFinanceiros", id, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("excluir-lancamento", async (event, id) => {
		try {
			exigirPermissao("financeiro");
			const resultado = await excluirLancamento(id);
			log("excluir-lancamento", "LancamentosFinanceiros", id, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-fluxo-caixa", async (event, dataInicio, dataFim) => {
		try {
			exigirPermissao("financeiro");
			return await getFluxoCaixa(dataInicio || null, dataFim || null);
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
