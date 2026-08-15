const {
	autenticarUsuario,
	desbloquearBanco,
	trocarChave,
	bloquearBanco,
} = require("../database");

function registrar(ipcMain, deps) {
	const {
		exigirSessao,
		log,
		getSessao,
		setSessao,
		iniciarBackupAutomatico,
		pararBackupAutomatico,
	} = deps;

	ipcMain.handle("unlock-with-profile", async (event, login, senha) => {
		try {
			const resultado = await autenticarUsuario(login, senha);
			setSessao({
				perfil: resultado.usuario.perfil,
				login: resultado.usuario.login,
				nome: resultado.usuario.nome,
				id: resultado.usuario.id,
				permissoes: resultado.usuario.permissoes || {},
			});
			iniciarBackupAutomatico();
			log("login", "Usuarios", resultado.usuario.id, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("unlock-db", async (event, senha) => {
		try {
			const resultado = await desbloquearBanco(senha);
			setSessao({ perfil: "admin" });
			iniciarBackupAutomatico();
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("change-db-key", async (event, novaSenha) => {
		try {
			exigirSessao("admin");
			return await trocarChave(novaSenha);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-auth-session", async () => {
		const sessao = getSessao();
		return sessao
			? {
					autenticado: true,
					perfil: sessao.perfil,
					permissoes: sessao.permissoes || {},
					usuario: { id: sessao.id, login: sessao.login, nome: sessao.nome },
				}
			: { autenticado: false };
	});

	ipcMain.handle("logout", async () => {
		await bloquearBanco();
		setSessao(null);
		pararBackupAutomatico();
		return { success: true };
	});
}

module.exports = { registrar };
