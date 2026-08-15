const {
	getProximoCodigoCliente,
	getClientes,
	salvarCliente,
	removerCliente,
	restaurarCliente,
	excluirClientePermanente,
	atualizarCliente,
	getMovimentacoesCliente,
	buscarCliente,
	buscaGlobal,
	listarPrecosCliente,
	salvarPrecoCliente,
	removerPrecoCliente,
	getPrecoCliente,
} = require("../database");

function registrar(ipcMain, deps) {
	const { exigirSessao, log } = deps;

	ipcMain.handle("proximo-codigo-cliente", async () => {
		try {
			exigirSessao();
			return await getProximoCodigoCliente();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-clientes", async (event, incluirInativos) => {
		try {
			exigirSessao();
			return await getClientes(!!incluirInativos);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("salvar-cliente", async (event, dados) => {
		try {
			exigirSessao();
			return await salvarCliente(dados);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("remover-cliente", async (event, id) => {
		try {
			exigirSessao("admin");
			const resultado = await removerCliente(id);
			log("excluir-cliente", "Clientes", id, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("restaurar-cliente", async (event, id) => {
		try {
			exigirSessao("admin");
			const resultado = await restaurarCliente(id);
			log("restaurar-cliente", "Clientes", id, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("excluir-cliente-permanente", async (event, id) => {
		try {
			exigirSessao("admin");
			const resultado = await excluirClientePermanente(id);
			log("excluir-cliente-permanente", "Clientes", id, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("atualizar-cliente", async (event, id, dados) => {
		try {
			exigirSessao();
			return await atualizarCliente(id, dados);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("movimentacoes-cliente", async (event, clienteId) => {
		try {
			exigirSessao();
			return await getMovimentacoesCliente(clienteId);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("buscar-cliente", async (event, filtro) => {
		try {
			exigirSessao();
			return await buscarCliente(filtro);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("busca-global", async (event, termo) => {
		try {
			exigirSessao();
			return await buscaGlobal(termo);
		} catch (erro) {
			throw erro.message;
		}
	});

	/* ============ Tabela de preço por cliente ============ */

	ipcMain.handle("listar-precos-cliente", async (event, clienteId) => {
		try {
			exigirSessao("admin");
			return await listarPrecosCliente(clienteId);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("salvar-preco-cliente", async (event, dados) => {
		try {
			exigirSessao("admin");
			const resultado = await salvarPrecoCliente(dados);
			log(
				"salvar-preco-cliente",
				"PrecoCliente",
				dados.cliente_id,
				"SKU var " + dados.variacao_id,
			);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("remover-preco-cliente", async (event, id) => {
		try {
			exigirSessao("admin");
			const resultado = await removerPrecoCliente(id);
			log("remover-preco-cliente", "PrecoCliente", id, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	// Consulta usada pelo PDV (vendedor) ao escanear SKU com cliente selecionado —
	// sessão comum, sem restrição de perfil.
	ipcMain.handle("get-preco-cliente", async (event, clienteId, variacaoId) => {
		try {
			exigirSessao();
			return await getPrecoCliente(clienteId, variacaoId);
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
