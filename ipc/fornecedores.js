const {
	getFornecedores,
	salvarFornecedor,
	atualizarFornecedor,
	removerFornecedor,
	listarProdutosFornecedor,
	salvarProdutoFornecedor,
	removerProdutoFornecedor,
	getCustoFornecedorProduto,
	getCotacaoProduto,
} = require("../database");

function registrar(ipcMain, deps) {
	const { exigirPermissao } = deps;

	ipcMain.handle("get-fornecedores", async () => {
		try {
			exigirPermissao("fornecedores");
			return await getFornecedores();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("salvar-fornecedor", async (event, dados) => {
		try {
			exigirPermissao("fornecedores");
			return await salvarFornecedor(dados);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("atualizar-fornecedor", async (event, id, dados) => {
		try {
			exigirPermissao("fornecedores");
			return await atualizarFornecedor(id, dados);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("remover-fornecedor", async (event, id) => {
		try {
			exigirPermissao("fornecedores");
			return await removerFornecedor(id);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("listar-produtos-fornecedor", async (event, fornecedorId) => {
		try {
			exigirPermissao("fornecedores");
			return await listarProdutosFornecedor(fornecedorId);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("salvar-produto-fornecedor", async (event, dados) => {
		try {
			exigirPermissao("fornecedores");
			return await salvarProdutoFornecedor(dados);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("remover-produto-fornecedor", async (event, id) => {
		try {
			exigirPermissao("fornecedores");
			return await removerProdutoFornecedor(id);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle(
		"get-custo-fornecedor-produto",
		async (event, fornecedorId, variacaoId) => {
			try {
				exigirPermissao("fornecedores");
				return await getCustoFornecedorProduto(fornecedorId, variacaoId);
			} catch (erro) {
				throw erro.message;
			}
		},
	);

	ipcMain.handle("get-cotacao-produto", async (event, variacaoId) => {
		try {
			exigirPermissao("fornecedores");
			return await getCotacaoProduto(variacaoId);
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
