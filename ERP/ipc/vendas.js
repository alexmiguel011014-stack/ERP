const {
	finalizarVenda,
	getVendas,
	getVendasHoje,
	importarVendasHistoricas,
	getItensVenda,
	converterOrcamento,
	cancelarOrcamento,
	registrarDevolucao,
	getDevolucoes,
	getItensDevolucao,
	atualizarNotaFiscal,
} = require("../database");

function registrar(ipcMain, deps) {
	const { exigirSessao, exigirPermissao, log, getSessao } = deps;

	ipcMain.handle("finalizar-venda", async (event, dados) => {
		try {
			exigirSessao();
			const sessao = getSessao();
			const resultado = await finalizarVenda(dados, sessao ? sessao.id : null);
			log(
				dados.status === "orcamento" ? "criar-orcamento" : "finalizar-venda",
				"Vendas",
				resultado.vendaId,
				"Total: " + (dados.total || 0),
			);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-vendas", async (event, filtroData) => {
		try {
			exigirSessao("admin");
			return await getVendas(filtroData || null);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-vendas-hoje", async () => {
		try {
			exigirSessao();
			return await getVendasHoje();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("importar-vendas-historicas", async (event, linhas) => {
		try {
			exigirPermissao("estoque");
			return await importarVendasHistoricas(linhas);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-itens-venda", async (event, vendaId) => {
		try {
			exigirSessao("admin");
			return await getItensVenda(vendaId);
		} catch (erro) {
			throw erro.message;
		}
	});

	/* ============ Orçamentos ============ */

	ipcMain.handle("converter-orcamento", async (event, vendaId) => {
		try {
			exigirPermissao("vendas");
			return await converterOrcamento(vendaId);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("cancelar-orcamento", async (event, vendaId) => {
		try {
			exigirPermissao("vendas");
			const resultado = await cancelarOrcamento(vendaId);
			log("cancelar-orcamento", "Vendas", vendaId, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	/* ============ Devoluções / trocas ============ */

	ipcMain.handle("registrar-devolucao", async (event, dados) => {
		try {
			exigirSessao();
			const sessao = getSessao();
			const resultado = await registrarDevolucao(
				dados,
				sessao ? sessao.id : null,
			);
			log(
				"registrar-devolucao",
				"Devolucoes",
				resultado.devolucaoId,
				"Venda #" + dados.venda_id,
			);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-devolucoes", async (event, filtro) => {
		try {
			exigirSessao();
			return await getDevolucoes(filtro);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-itens-devolucao", async (event, devolucaoId) => {
		try {
			exigirSessao();
			return await getItensDevolucao(devolucaoId);
		} catch (erro) {
			throw erro.message;
		}
	});

	/* ============ Rastreamento fiscal ============ */

	ipcMain.handle("atualizar-nota-fiscal", async (event, vendaId, dados) => {
		try {
			exigirSessao();
			const resultado = await atualizarNotaFiscal(vendaId, dados);
			log("atualizar-nota-fiscal", "Vendas", vendaId, dados && dados.status);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
