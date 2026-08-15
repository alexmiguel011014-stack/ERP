const { dialog } = require("electron");
const {
	salvarProduto,
	atualizarProduto,
	removerProduto,
	restaurarProduto,
	excluirProdutoPermanente,
	listProdutosDetalhados,
	getProximoSkuProduto,
	buscarSKU,
	buscarProdutosPorTermo,
	salvarImagemProduto,
	removerImagemProduto,
	getCaminhoImagemProduto,
} = require("../database");

function registrar(ipcMain, deps) {
	const { exigirPermissao, exigirSessao, log, getMainWindow } = deps;

	ipcMain.handle("buscar-produtos", async () => {
		exigirPermissao("produtos");
		const conexao = require("../database").getConexao();
		return new Promise((resolver, rejeitar) => {
			conexao.all("SELECT * FROM Produtos", [], (erro, linhas) => {
				if (erro) return rejeitar(erro.message);
				resolver(linhas);
			});
		});
	});

	ipcMain.handle("salvar-produto", async (event, dados) => {
		try {
			exigirPermissao("produtos");
			const resultado = await salvarProduto(dados, dados.variacoes);
			log("criar-produto", "Produtos", resultado.produtoId, dados.nome);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle(
		"listar-produtos-detalhados",
		async (event, incluirInativos) => {
			try {
				exigirPermissao("produtos");
				return await listProdutosDetalhados(!!incluirInativos);
			} catch (erro) {
				throw erro.message;
			}
		},
	);

	ipcMain.handle("proximo-sku-produto", async () => {
		try {
			exigirPermissao("produtos");
			return await getProximoSkuProduto();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("atualizar-produto", async (event, id, dados) => {
		try {
			exigirPermissao("produtos");
			const resultado = await atualizarProduto(id, dados, dados.variacoes);
			log("editar-produto", "Produtos", id, dados.nome);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("remover-produto", async (event, id) => {
		try {
			exigirPermissao("produtos");
			const resultado = await removerProduto(id);
			log("excluir-produto", "Produtos", id, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("restaurar-produto", async (event, id) => {
		try {
			exigirPermissao("produtos");
			const resultado = await restaurarProduto(id);
			log("restaurar-produto", "Produtos", id, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("excluir-produto-permanente", async (event, id) => {
		try {
			exigirPermissao("produtos");
			const resultado = await excluirProdutoPermanente(id);
			log("excluir-produto-permanente", "Produtos", id, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	/* ============ Imagem do produto ============ */

	ipcMain.handle("escolher-imagem-produto", async (event, produtoId) => {
		try {
			exigirPermissao("produtos");
			const escolha = await dialog.showOpenDialog(getMainWindow(), {
				title: "Escolher imagem do produto",
				properties: ["openFile"],
				filters: [
					{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp"] },
				],
			});
			if (escolha.canceled || !escolha.filePaths[0])
				return { success: false, cancelado: true };
			const resultado = await salvarImagemProduto(
				produtoId,
				escolha.filePaths[0],
			);
			log("alterar-imagem-produto", "Produtos", produtoId, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("remover-imagem-produto", async (event, produtoId) => {
		try {
			exigirPermissao("produtos");
			const resultado = await removerImagemProduto(produtoId);
			log("remover-imagem-produto", "Produtos", produtoId, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	// Lê a imagem do disco e retorna como data URL — evita expor caminhos de
	// arquivo ao renderer e contorna a CSP em contexto isolado (sem file://).
	ipcMain.handle("get-imagem-produto", async (event, nomeArquivo) => {
		try {
			exigirSessao();
			const caminho = getCaminhoImagemProduto(nomeArquivo);
			if (!caminho || !require("fs").existsSync(caminho)) return null;
			const buffer = require("fs").readFileSync(caminho);
			const ext = require("path").extname(caminho).slice(1).toLowerCase();
			const mime = ext === "jpg" ? "jpeg" : ext;
			return "data:image/" + mime + ";base64," + buffer.toString("base64");
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("buscar-sku", async (event, sku) => {
		try {
			exigirSessao();
			return await buscarSKU(sku);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("buscar-produtos-termo", async (event, termo) => {
		try {
			exigirSessao();
			return await buscarProdutosPorTermo(termo);
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
