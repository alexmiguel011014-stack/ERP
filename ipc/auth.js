const {
	autenticarUsuario,
	desbloquearBanco,
	trocarChave,
	bloquearBanco,
	gerarLancamentosRecorrentesDoMes,
} = require("../database");

// Mesmo padrão fire-and-forget de log() em main.js — nunca deve interromper
// o login se o gerador falhar por qualquer motivo.
function gerarRecorrentesSemQuebrarLogin() {
	gerarLancamentosRecorrentesDoMes().catch(() => {});
}

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
				corAvatar: resultado.usuario.corAvatar,
				foto: resultado.usuario.foto,
			});
			iniciarBackupAutomatico();
			gerarRecorrentesSemQuebrarLogin();
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
			gerarRecorrentesSemQuebrarLogin();
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
					usuario: {
						id: sessao.id,
						login: sessao.login,
						nome: sessao.nome,
						corAvatar: sessao.corAvatar,
						foto: sessao.foto,
					},
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
