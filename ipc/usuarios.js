const { dialog } = require("electron");
const {
	listarUsuarios,
	salvarUsuario,
	removerUsuario,
	atualizarCorAvatar,
	salvarFotoUsuario,
	removerFotoUsuario,
	getCaminhoFotoUsuario,
} = require("../database");

function registrar(ipcMain, deps) {
	const { exigirSessao, log, getSessao, setSessao, getMainWindow } = deps;

	ipcMain.handle("listar-usuarios", async () => {
		try {
			exigirSessao("admin");
			return await listarUsuarios();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("salvar-usuario", async (event, dados) => {
		try {
			exigirSessao("admin");
			const resultado = await salvarUsuario(dados, getSessao());
			log(
				dados.id ? "editar-usuario" : "criar-usuario",
				"Usuarios",
				dados.id || null,
				dados.login,
			);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("remover-usuario", async (event, id) => {
		try {
			exigirSessao("admin");
			const resultado = await removerUsuario(id);
			log("excluir-usuario", "Usuarios", id, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	/* ============ Avatar do usuário logado (cor + foto) ============ */
	// Autoatendimento: exigirSessao() sem "admin" (qualquer sessão autenticada,
	// não só admin/dono) porque o dono deste avatar é sempre quem está logado —
	// nunca um id vindo do renderer, sempre getSessao().id. Ver GOALS.md "Avatar
	// do Usuário Logado" pro porquê dessa exceção às demais rotas deste arquivo.

	ipcMain.handle("salvar-minha-cor-avatar", async (event, cor) => {
		try {
			exigirSessao();
			const sessao = getSessao();
			const resultado = await atualizarCorAvatar(sessao.id, cor);
			// getSessao()/setSessao() guardam a sessão em memória (main.js), não
			// relida do banco a cada chamada — sem isto, get-auth-session
			// continuaria devolvendo o corAvatar antigo até o próximo login.
			setSessao({ ...sessao, corAvatar: resultado.corAvatar });
			log("alterar-cor-avatar", "Usuarios", sessao.id, cor);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("escolher-minha-foto", async () => {
		try {
			exigirSessao();
			const sessao = getSessao();
			const escolha = await dialog.showOpenDialog(getMainWindow(), {
				title: "Escolher foto de perfil",
				properties: ["openFile"],
				filters: [
					{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp"] },
				],
			});
			if (escolha.canceled || !escolha.filePaths[0])
				return { success: false, cancelado: true };
			const resultado = await salvarFotoUsuario(
				sessao.id,
				escolha.filePaths[0],
			);
			setSessao({ ...sessao, foto: resultado.foto });
			log("alterar-foto-usuario", "Usuarios", sessao.id, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("remover-minha-foto", async () => {
		try {
			exigirSessao();
			const sessao = getSessao();
			const resultado = await removerFotoUsuario(sessao.id);
			setSessao({ ...sessao, foto: null });
			log("remover-foto-usuario", "Usuarios", sessao.id, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	// Lê a foto do disco e retorna como data URL — mesma razão de
	// get-imagem-produto (ipc/produtos.js): renderer não alcança file://
	// sob o protocolo app:// deste app.
	ipcMain.handle("get-foto-usuario", async (event, nomeArquivo) => {
		try {
			exigirSessao();
			const caminho = getCaminhoFotoUsuario(nomeArquivo);
			if (!caminho || !require("fs").existsSync(caminho)) return null;
			const buffer = require("fs").readFileSync(caminho);
			const ext = require("path").extname(caminho).slice(1).toLowerCase();
			const mime = ext === "jpg" ? "jpeg" : ext;
			return "data:image/" + mime + ";base64," + buffer.toString("base64");
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
