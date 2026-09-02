const path = require("path");
const { app } = require("electron");
const { autoUpdater } = require("electron-updater");
const {
	backupAutomatico,
	exportBackup,
	importBackup,
	getDBPath,
} = require("../database");
const { carregarModulos, aplicarEntitlements } = require("../modulos.js");

// Estado local a este domínio: só usado por download-update / quit-and-install,
// abaixo. autoUpdater.autoDownload/autoInstallOnAppQuit são configurados uma
// vez em main.js — o electron-updater é um singleton (módulo cacheado pelo
// Node), então a config feita lá continua valendo aqui.
let downloadConcluido = false;

// electron-updater não tem timeout embutido pras próprias chamadas de rede —
// numa conexão ruim (ou bloqueada por firewall), checkForUpdates()/
// downloadUpdate() ficam pendentes pra sempre, e a tela de Atualizações
// (useAtualizacao.ts) fica presa em "Verificando..." sem erro, sem jeito de
// sair (bug real reportado: "travou" ao clicar em Atualizações num PC
// diferente). Envolve a chamada com um timeout próprio, garantindo que o
// IPC sempre resolve ou rejeita num tempo limitado.
function comTimeout(promessa, ms, mensagemErro) {
	return Promise.race([
		promessa,
		new Promise((_resolver, rejeitar) =>
			setTimeout(() => rejeitar(new Error(mensagemErro)), ms),
		),
	]);
}

// Achado real (2026-08-29): o `comTimeout` acima não é suficiente sozinho —
// quando a rede está genuinamente inalcançável (DNS não resolve, sem
// resposta nenhuma), a chamada interna do electron-updater pode ficar presa
// de um jeito que nem o próprio setTimeout do comTimeout dispara a tempo
// (resolução de DNS via getaddrinfo usa a threadpool do libuv — a MESMA
// usada por fs.readFile, inclusive pelo protocolo app://renderer/ que serve
// o frontend inteiro). Resultado observado: não só a checagem trava, a
// navegação inteira do app trava junto, porque as leituras de arquivo do
// próximo módulo ficam sem thread livre na pool pra rodar.
// Correção: nunca chama checkForUpdates() sem antes confirmar conectividade
// com um pré-check curto e genuinamente cancelável (fetch nativo +
// AbortController — ao contrário da chamada do electron-updater, um
// AbortController de verdade interrompe a requisição, não só desiste de
// esperar por ela).
async function temConectividade(timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		await fetch("https://api.github.com/", {
			method: "HEAD",
			signal: controller.signal,
		});
		return true;
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
}

function registrar(ipcMain, deps) {
	const { exigirSessao } = deps;

	ipcMain.handle("backup-automatico", async () => {
		try {
			exigirSessao("admin");
			const result = backupAutomatico();
			return { success: true, caminho: result };
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("export-backup", async () => {
		try {
			exigirSessao("admin");
			return exportBackup();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("import-backup", async (event, caminho) => {
		try {
			exigirSessao("admin");
			return await importBackup(caminho);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("check-for-updates", async () => {
		try {
			// Achado real (2026-09-01, auditoria de segurança): faltava esse gate
			// — era o único handler de atualização sem exigirSessao, diferente de
			// download-update/quit-and-install/backup-automatico, que já exigem
			// admin. Único chamador de verdade é a tela de Atualizações
			// (useAtualizacao.ts), que só é alcançável logado (o (admin)/layout.tsx
			// redireciona pra /signin sem sessão) — não quebra o e2e, que sempre
			// loga antes de visitar essa aba.
			exigirSessao("admin");
			// Só pra e2e (ver e2e/tab-system.spec.ts) — sem isso, testar o fluxo
			// de Atualizações exige rede real de verdade, o que não dá pra
			// confiar num sandbox de CI. Emite os MESMOS eventos que
			// main.js:autoUpdater.on(...) já escuta e repassa pro renderer, então
			// o frontend não sabe a diferença de um check de verdade.
			if (process.env.ERP_MOCK_UPDATER === "1") {
				autoUpdater.emit("checking-for-update");
				autoUpdater.emit("update-not-available", {
					version: require("../package.json").version,
				});
				return null;
			}
			const online = await temConectividade(5000);
			if (!online) {
				throw new Error(
					"Sem conexão com a internet. Verifique sua rede e tente de novo.",
				);
			}
			const result = await comTimeout(
				autoUpdater.checkForUpdates(),
				20000,
				"Tempo esgotado ao verificar atualizações. Verifique sua conexão.",
			);
			return result;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("download-update", async () => {
		try {
			exigirSessao("admin");
			const online = await temConectividade(5000);
			if (!online) {
				throw new Error(
					"Sem conexão com a internet. Verifique sua rede e tente de novo.",
				);
			}
			// Achado real (2026-09-01): autoUpdater.downloadUpdate() resolve com
			// um ARRAY de caminhos de arquivo (ver
			// node_modules/electron-updater/out/AppUpdater.js:601 —
			// `return packageFile == null ? [updateFile] : [updateFile, packageFile]`),
			// nunca um objeto com propriedade `.path`. `result.path` sempre dava
			// undefined, então downloadConcluido nunca ficava truthy — quit-and-install
			// (abaixo) sempre entrava no if() e não fazia nada, silenciosamente.
			// Era a causa raiz de "baixou mas não fechou/reabriu sozinho" — não é
			// sobre o CAMINHO do arquivo (o autoUpdater já sabe onde está o que
			// baixou, internamente), só precisa saber SE terminou.
			await comTimeout(
				autoUpdater.downloadUpdate(),
				120000,
				"Tempo esgotado ao baixar a atualização. Verifique sua conexão.",
			);
			downloadConcluido = true;
			return { success: true };
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("quit-and-install", async () => {
		exigirSessao("admin");
		if (downloadConcluido) {
			setImmediate(() => {
				autoUpdater.quitAndInstall(false, true);
				downloadConcluido = false;
			});
		}
	});

	ipcMain.handle("get-app-version", async () => {
		return app.getVersion();
	});

	// Achado real (2026-09-01, auditoria de segurança): sem gate nenhum,
	// qualquer chamador descobria o caminho absoluto do banco no disco
	// (revela o usuário do Windows e a estrutura de pastas). Não tem
	// nenhum chamador de verdade hoje (nem frontend novo, nem legado) —
	// gate por consistência/least-privilege, não porque algo quebraria.
	ipcMain.handle("get-db-path", async () => {
		exigirSessao("admin");
		return getDBPath();
	});

	// navbar.js roda no renderer (sem fs/require de Node) e precisa da lista
	// de módulos pra montar a sidebar — ver docs/MODULE_MANIFEST.md e
	// modulos.js. Barato (19 JSONs pequenos), chamado direto a cada request
	// em vez de cacheado, então nunca fica desatualizado durante o dev.
	// aplicarEntitlements: mesmo filtro dormant do main.js — um módulo
	// desativado some da sidebar, não só do registro de IPC.
	ipcMain.handle("get-modulos-carregados", async () => {
		return aplicarEntitlements(
			carregarModulos(path.join(__dirname, "..", "modules")),
			path.join(__dirname, "..", "entitlements.json"),
		);
	});
}

module.exports = { registrar, temConectividade };
