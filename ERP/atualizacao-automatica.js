const { app } = require("electron");
const { autoUpdater } = require("electron-updater");

// Extraído de main.js (2026-08-29, achado do /scanproject: main.js estava
// crescendo demais) — todo o fluxo de checagem automática de atualização
// isolado aqui, mesmo padrão dos módulos em ipc/*.js: recebe uma função pra
// pegar a janela atual (getMainWindow) em vez de depender de uma variável
// de módulo compartilhada com main.js. autoUpdater é um singleton (módulo
// cacheado pelo Node) — a config feita em main.js (autoDownload,
// autoInstallEvent) continua valendo aqui, igual já acontece com
// ipc/sistema.js.

let intervaloAtualizacao = null;

function registrarEventosDeStatus(getMainWindow) {
	function enviar(dados) {
		const janela = getMainWindow();
		if (janela) janela.webContents.send("update-status", dados);
	}

	autoUpdater.on("checking-for-update", () => enviar({ status: "checking" }));
	autoUpdater.on("update-available", (info) =>
		enviar({ status: "available", version: info.version }),
	);
	autoUpdater.on("update-not-available", (info) =>
		enviar({ status: "not-available", version: info.version }),
	);
	autoUpdater.on("error", (err) =>
		enviar({ status: "error", message: err.message }),
	);
	autoUpdater.on("download-progress", (progress) =>
		enviar({ status: "download-progress", progress: progress.percent }),
	);
	autoUpdater.on("update-downloaded", (info) =>
		enviar({ status: "update-downloaded", version: info.version }),
	);
}

// electron-updater não tem timeout embutido — numa conexão ruim,
// checkForUpdates() fica pendente pra sempre, e o Promise.race sozinho não
// é garantia suficiente (ver ipc/sistema.js:temConectividade — resolução de
// DNS sem resposta pode prender a threadpool do libuv, a mesma que
// fs.readFile usa pra servir o frontend, travando a navegação do app
// inteiro). Confirma conectividade com um pré-check cancelável de verdade
// antes de chamar checkForUpdates() — mesma função que o check manual usa.
async function checarComTimeout() {
	const online = await require("./ipc/sistema")
		.temConectividade(5000)
		.catch(() => false);
	if (!online) return;
	Promise.race([
		autoUpdater.checkForUpdates(),
		new Promise((_resolver, rejeitar) =>
			setTimeout(() => rejeitar(new Error("timeout")), 20000),
		),
	]).catch(() => {});
}

// Checa 1x no boot (já existia) + de novo a cada 24h enquanto o app fica
// aberto — sem o intervalo, uma loja que deixa o PDV ligado o dia inteiro só
// veria uma atualização no dia seguinte, quando reabrisse o app.
function iniciarChecagemAutomatica() {
	if (!app.isPackaged) return;
	if (intervaloAtualizacao) clearInterval(intervaloAtualizacao);
	checarComTimeout();
	intervaloAtualizacao = setInterval(
		() => {
			checarComTimeout();
		},
		24 * 60 * 60 * 1000,
	);
}

module.exports = { registrarEventosDeStatus, iniciarChecagemAutomatica };
