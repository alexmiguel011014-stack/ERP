const {
	listarUsuarios,
	salvarUsuario,
	removerUsuario,
} = require("../database");

function registrar(ipcMain, deps) {
	const { exigirSessao, log } = deps;

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
			const resultado = await salvarUsuario(dados);
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
}

module.exports = { registrar };
