const {
	listarImagens,
	listarImagensOrfas,
	obterImagemPorId,
	excluirImagemPorId,
	excluirImagensEmLote,
} = require("../database");

// Tela "Gerenciar Imagens" (admin) — ver GOALS.md "Image Database & Management".
// Mesmo gate que /banco já usa: exigirSessao("admin") aqui, mais a
// reautenticação por senha (verificar-senha-admin, ipc/banco-admin.js) do
// lado do frontend antes de sequer mostrar a tela — não uma trava nova.
function registrar(ipcMain, deps) {
	const { exigirSessao, log } = deps;

	ipcMain.handle("listar-imagens", async (event, opcoes) => {
		try {
			exigirSessao("admin");
			return await listarImagens(opcoes || {});
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("listar-imagens-orfas", async () => {
		try {
			exigirSessao("admin");
			return await listarImagensOrfas();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("obter-imagem-por-id", async (event, id) => {
		try {
			exigirSessao("admin");
			const imagem = await obterImagemPorId(id);
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

	ipcMain.handle("excluir-imagem-por-id", async (event, id) => {
		try {
			exigirSessao("admin");
			const resultado = await excluirImagemPorId(id);
			log("excluir-imagem", "Imagens", id, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("excluir-imagens-em-lote", async (event, ids) => {
		try {
			exigirSessao("admin");
			const resultado = await excluirImagensEmLote(ids);
			log(
				"excluir-imagens-em-lote",
				"Imagens",
				null,
				resultado.removidas + " imagem(ns) removida(s)",
			);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
