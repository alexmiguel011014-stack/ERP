const {
	getLancamentos,
	criarLancamento,
	baixarLancamento,
	excluirLancamento,
	getFluxoCaixa,
	getAliquotaDAS,
	saveAliquotaDAS,
	getProvisaoDAS,
	getMetaFaturamentoMensal,
	saveMetaFaturamentoMensal,
	getLancamentosVencendoHoje,
	getAgingRecebiveis,
	getFluxoCaixaProjetado,
	criarLancamentoRecorrente,
	listarLancamentosRecorrentes,
	alternarLancamentoRecorrente,
	removerLancamentoRecorrente,
} = require("../database");

function registrar(ipcMain, deps) {
	const { exigirPermissao, exigirSessao, log } = deps;

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

	ipcMain.handle("get-aliquota-das", async () => {
		try {
			exigirSessao("admin");
			return await getAliquotaDAS();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("save-aliquota-das", async (event, valor) => {
		try {
			exigirSessao("admin");
			return await saveAliquotaDAS(valor);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-provisao-das", async (event, dataInicio, dataFim) => {
		try {
			exigirPermissao("financeiro");
			return await getProvisaoDAS(dataInicio || null, dataFim || null);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-meta-faturamento-mensal", async () => {
		try {
			exigirSessao("admin");
			return await getMetaFaturamentoMensal();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("save-meta-faturamento-mensal", async (event, valor) => {
		try {
			exigirSessao("admin");
			return await saveMetaFaturamentoMensal(valor);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-lancamentos-vencendo-hoje", async () => {
		try {
			exigirPermissao("financeiro");
			return await getLancamentosVencendoHoje();
		} catch (erro) {
			throw erro.message;
		}
	});

	// Gated por "relatorios", não "financeiro": o painel que consome isso vive
	// na página de Relatórios (ver GOALS.md), não na de Financeiro — evita um
	// vendedor com permissão de relatorios mas não financeiro ver a página
	// carregar parcialmente com esse painel quebrado sozinho.
	ipcMain.handle("get-aging-recebiveis", async () => {
		try {
			exigirPermissao("relatorios");
			return await getAgingRecebiveis();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle(
		"get-fluxo-caixa-projetado",
		async (event, dataInicio, dataFim) => {
			try {
				exigirPermissao("financeiro");
				return await getFluxoCaixaProjetado(
					dataInicio || null,
					dataFim || null,
				);
			} catch (erro) {
				throw erro.message;
			}
		},
	);

	ipcMain.handle("criar-lancamento-recorrente", async (event, dados) => {
		try {
			exigirSessao("admin");
			const resultado = await criarLancamentoRecorrente(dados);
			log(
				"criar-lancamento-recorrente",
				"LancamentosRecorrentes",
				resultado.id,
				dados.descricao,
			);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("listar-lancamentos-recorrentes", async () => {
		try {
			exigirSessao("admin");
			return await listarLancamentosRecorrentes();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("alternar-lancamento-recorrente", async (event, id, ativo) => {
		try {
			exigirSessao("admin");
			const resultado = await alternarLancamentoRecorrente(id, ativo);
			log("alternar-lancamento-recorrente", "LancamentosRecorrentes", id, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("remover-lancamento-recorrente", async (event, id) => {
		try {
			exigirSessao("admin");
			const resultado = await removerLancamentoRecorrente(id);
			log("remover-lancamento-recorrente", "LancamentosRecorrentes", id, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
