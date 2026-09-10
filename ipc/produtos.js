const { dialog } = require("electron");
const {
	salvarProduto,
	atualizarProduto,
	atribuirCategoriaEmLote,
	removerProduto,
	restaurarProduto,
	excluirProdutoPermanente,
	listProdutosDetalhados,
	getProximoSkuProduto,
	buscarSKU,
	buscarProdutosPorTermo,
	salvarImagemProduto,
	removerImagemProduto,
	obterImagemProduto,
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

	ipcMain.handle(
		"atribuir-categoria-produtos-lote",
		async (event, produtoIds, categoriaId) => {
			try {
				exigirPermissao("produtos");
				const resultado = await atribuirCategoriaEmLote(
					produtoIds,
					categoriaId,
				);
				log(
					"atribuir-categoria-produtos-lote",
					"Produtos",
					null,
					categoriaId + " → " + resultado.quantidade + " produto(s)",
				);
				return resultado;
			} catch (erro) {
				throw erro.message;
			}
		},
	);

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

	// Produto ainda sem id (formulário de criação): só abre o diálogo e lê o
	// arquivo escolhido como preview — não grava nada no banco/disco ainda,
	// porque salvarImagemProduto exige um produtoId real pra nomear/organizar
	// o arquivo copiado. O caminho volta pro renderer e só é efetivamente
	// salvo (ver salvar-imagem-produto-caminho) depois que o produto for
	// criado e a gente souber o id de verdade.
	ipcMain.handle("escolher-imagem-pendente", async () => {
		try {
			exigirPermissao("produtos");
			const escolha = await dialog.showOpenDialog(getMainWindow(), {
				title: "Escolher imagem do produto",
				properties: ["openFile"],
				filters: [
					{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp"] },
				],
			});
			if (escolha.canceled || !escolha.filePaths[0]) return { cancelado: true };
			const caminho = escolha.filePaths[0];
			const fs = require("fs");
			const path = require("path");
			const buffer = fs.readFileSync(caminho);
			const ext = path.extname(caminho).slice(1).toLowerCase();
			const mime = ext === "jpg" ? "jpeg" : ext;
			return {
				cancelado: false,
				caminho,
				dataUrl: "data:image/" + mime + ";base64," + buffer.toString("base64"),
			};
		} catch (erro) {
			throw erro.message;
		}
	});

	// Grava a imagem já escolhida (caminho vindo de escolher-imagem-pendente)
	// assim que o produto novo ganha um id — sem reabrir o diálogo de novo.
	ipcMain.handle(
		"salvar-imagem-produto-caminho",
		async (event, produtoId, caminho) => {
			try {
				exigirPermissao("produtos");
				const resultado = await salvarImagemProduto(produtoId, caminho);
				log("alterar-imagem-produto", "Produtos", produtoId, null);
				return resultado;
			} catch (erro) {
				throw erro.message;
			}
		},
	);

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

	// Lê a imagem do banco (Imagens, ver db/imagens.js) e retorna como data URL
	// — evita expor bytes crus ao renderer e contorna a CSP em contexto isolado.
	// `imagemId` é o valor devolvido em `imagem` por salvarImagemProduto/pelas
	// queries de listagem (Produtos.imagem_id), não mais um nome de arquivo.
	ipcMain.handle("get-imagem-produto", async (event, imagemId) => {
		try {
			exigirSessao();
			const imagem = await obterImagemProduto(imagemId);
			if (!imagem) return null;
			return (
				"data:image/" +
				imagem.mimetype +
				";base64," +
				imagem.dados.toString("base64")
			);
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
