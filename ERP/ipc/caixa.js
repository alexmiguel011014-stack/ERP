const {
	abrirCaixa,
	fecharCaixa,
	getCaixaAberto,
	getResumoCaixaAberto,
	getHistoricoCaixa,
} = require("../database");

// Fechamento de caixa: sessão comum (não módulo-gated) para abrir/fechar —
// operação do dia a dia do PDV, igual finalizar venda, qualquer vendedor
// logado pode operar. Histórico já exige o módulo financeiro.
function registrar(ipcMain, deps) {
	const { exigirSessao, exigirPermissao, log, getSessao } = deps;

	ipcMain.handle("abrir-caixa", async (event, valorAbertura) => {
		try {
			exigirSessao();
			const sessao = getSessao();
			const resultado = await abrirCaixa(
				valorAbertura,
				sessao ? sessao.id : null,
			);
			log(
				"abrir-caixa",
				"FechamentosCaixa",
				resultado.caixaId,
				"Abertura: " + valorAbertura,
			);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("fechar-caixa", async (event, valorInformado, observacao) => {
		try {
			exigirSessao();
			const sessao = getSessao();
			const resultado = await fecharCaixa(
				valorInformado,
				observacao,
				sessao ? sessao.id : null,
			);
			log(
				"fechar-caixa",
				"FechamentosCaixa",
				null,
				"Diferença: " + resultado.diferenca,
			);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-caixa-aberto", async () => {
		try {
			exigirSessao();
			return await getCaixaAberto();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-resumo-caixa-aberto", async () => {
		try {
			exigirSessao();
			return await getResumoCaixaAberto();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-historico-caixa", async (event, limite) => {
		try {
			exigirPermissao("financeiro");
			return await getHistoricoCaixa(limite);
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
