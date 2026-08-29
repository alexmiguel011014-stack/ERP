const { app, BrowserWindow, ipcMain, Menu, protocol } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");
const {
	setDBPath,
	setPastaExecutavel,
	registrarLog,
	backupAutomatico,
} = require("./database");

// Fase 0 (spike) do novo frontend Next.js/React — ver plano de migração.
// Protocolo customizado, não servidor HTTP local: zero porta escutando na
// máquina do cliente (evita falso-positivo de antivírus numa loja sem TI
// dedicado) e resolve os caminhos raiz-absolutos (/_next/...) que o export
// estático do Next gera, o que file:// não consegue (sem origin). Precisa
// ser registrado antes de app.whenReady().
protocol.registerSchemesAsPrivileged([
	{
		scheme: "app",
		privileges: { standard: true, secure: true, supportFetchAPI: true },
	},
]);
// Cutover (2026-08-28): o frontend novo (Next.js) é o padrão agora — antes
// era opt-in via ERP_SPIKE_FRONTEND=1. `modules/` (HTML/CSS/JS puro) continua
// no repo como rede de segurança, não apagado ainda (ver AGENTS.md) — essa
// env var é só uma válvula de escape interna pra voltar pro antigo se algo
// aparecer quebrado, nunca documentada/usada pelo usuário final.
const CARREGAR_FRONTEND_ANTIGO = process.env.ERP_LEGACY_FRONTEND === "1";
// frontend/out fica FORA do asar (extraResources, não `files`) — achado real
// (2026-08-29): o glob `frontend/out/**/*` em `files` nunca incluía nenhum
// arquivo no pacote final (bug/comportamento do electron-builder com essa
// combinação específica de padrões, confirmado empiricamente comparando
// `dist/builder-debug.yml`, que mostrava o padrão resolvido corretamente,
// contra o asar de saída, que não tinha nem um arquivo de frontend/ dentro).
// Empacotado, extraResources copia pra `resources/frontend/out`
// (`process.resourcesPath`), fora do asar — daí o app não estar mais em
// `__dirname` nesse caso. Em dev (`electron .` direto do source, não
// empacotado), `__dirname` já é a raiz do projeto e continua correto.
const DIR_FRONTEND_NOVO = app.isPackaged
	? path.join(process.resourcesPath, "frontend", "out")
	: path.join(__dirname, "frontend", "out");

// Carrega .env (chaves Pix/NF-e etc.) se existir — nunca obrigatório, o app
// funciona normalmente sem ele (integrações opcionais caem no fallback
// manual). Só cobre modo dev (.env na raiz do app); produção empacotada
// ainda não tem um local definido pra isso — ver GOALS.md.
try {
	process.loadEnvFile(path.join(__dirname, ".env"));
} catch {
	/* sem .env: segue com as integrações opcionais desligadas */
}

// Conta de suporte do desenvolvedor (db/usuarios.js:garantirContaSuporte):
// num build empacotado não existe .env (o .gitignore garante que ele nunca
// entra no repo, e build.files também não o inclui no pacote — de propósito,
// um .env sem criptografia dentro do instalador seria trivial de extrair).
// O valor chega aqui embrulhado em package.json.build.extraMetadata.erpSuporte
// (setado só na máquina de quem publica a release, nunca commitado — ver
// AGENTS.md, seção de processo de release). Só usa esse fallback quando o
// .env não já forneceu os dois valores.
if (!process.env.ERP_SUPORTE_LOGIN || !process.env.ERP_SUPORTE_SENHA) {
	try {
		const pkg = require("./package.json");
		if (pkg.erpSuporte?.login && pkg.erpSuporte?.senha) {
			process.env.ERP_SUPORTE_LOGIN = pkg.erpSuporte.login;
			process.env.ERP_SUPORTE_SENHA = pkg.erpSuporte.senha;
		}
	} catch {
		/* sem campo embutido: segue sem a conta de suporte nesta instalação */
	}
}

// Isolamento pros testes e2e (Playwright, ver e2e/): precisa vir ANTES do
// requestSingleInstanceLock() abaixo, senão uma instância de teste rodando
// junto com o app real de verdade colide no lock (o lock é por userData) e
// a instância de teste simplesmente fecha sozinha. Só tem efeito com a env
// var setada — no-op em qualquer uso normal do app.
if (process.env.ERP_TEST_USERDATA_DIR) {
	app.setPath("userData", process.env.ERP_TEST_USERDATA_DIR);
}

const instanciaUnica = app.requestSingleInstanceLock();
if (!instanciaUnica) {
	app.quit();
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow = null;
let sessao = null;

const CAMINHO_LOG_ERRO = () =>
	path.join(app.getPath("userData"), "erp-crash.log");
const LIMITE_LOG_ERRO_BYTES = 2 * 1024 * 1024; // 2MB, evita crescimento indefinido

// Log de erro persistente (sobrevive ao Temp ser limpo pelo SO): captura
// falhas de preload, console.error/warn e erros de carregamento de página.
function logErro(texto) {
	try {
		const caminho = CAMINHO_LOG_ERRO();
		if (
			fs.existsSync(caminho) &&
			fs.statSync(caminho).size > LIMITE_LOG_ERRO_BYTES
		) {
			fs.writeFileSync(caminho, "");
		}
		fs.appendFileSync(
			caminho,
			"[" + new Date().toISOString() + "] " + texto + "\n",
		);
	} catch {
		// Nunca deixa uma falha de log quebrar o app.
	}
}

// "dono" tem o mesmo nível de acesso de "admin" em todo o app (só existem
// regras específicas a mais restringindo dono nas rotas de usuários — ver
// db/usuarios.js). Por isso o gate de "admin" aqui aceita os dois perfis,
// num único ponto, em vez de espalhar `perfil === "admin" || perfil === "dono"`
// pelos ~15 arquivos de ipc/*.js que chamam exigirSessao("admin").
function ehNivelAdmin(perfil) {
	return perfil === "admin" || perfil === "dono";
}

function exigirSessao(perfil) {
	if (!sessao) throw new Error("Sessão encerrada. Faça login novamente.");
	if (perfil === "admin" && !ehNivelAdmin(sessao.perfil))
		throw new Error("Acesso permitido somente ao administrador.");
}

// Módulos com toggle liberável para o perfil vendedor (ver PERMISSOES_MODULOS
// na tela de Acessos). Admin/dono sempre passam, independente do que estiver
// salvo em sessao.permissoes — o campo só existe para restringir o vendedor.
function exigirPermissao(modulo) {
	if (!sessao) throw new Error("Sessão encerrada. Faça login novamente.");
	if (ehNivelAdmin(sessao.perfil)) return;
	if (!sessao.permissoes || sessao.permissoes[modulo] !== true) {
		throw new Error(
			"Seu usuário não tem acesso a este módulo. Solicite liberação ao administrador.",
		);
	}
}

// Atalho para registrar uma ação no log de auditoria com o usuário da sessão
// atual. Nunca deve interromper o fluxo principal (fire-and-forget).
function log(acao, entidade, entidadeId, detalhes) {
	registrarLog(
		sessao ? sessao.id : null,
		sessao ? sessao.login : null,
		acao,
		entidade,
		entidadeId,
		detalhes,
	).catch(() => {});
}

var intervaloBackup = null;

// Roda logo no login (não só no intervalo) porque a sessão raramente fica
// aberta 24h seguidas — sem isso, quem fecha o app todo dia nunca gera backup.
// backupAutomatico() é idempotente por dia, então chamar de novo não duplica.
function iniciarBackupAutomatico() {
	if (intervaloBackup) clearInterval(intervaloBackup);
	try {
		backupAutomatico();
	} catch (e) {
		console.error("Erro no backup automatico:", e.message);
	}
	intervaloBackup = setInterval(
		() => {
			try {
				backupAutomatico();
			} catch (e) {
				console.error("Erro no backup automatico:", e.message);
			}
		},
		24 * 60 * 60 * 1000,
	);
}

function pararBackupAutomatico() {
	if (intervaloBackup) {
		clearInterval(intervaloBackup);
		intervaloBackup = null;
	}
}

// Fluxo de checagem automática de atualização — extraído pra
// atualizacao-automatica.js (2026-08-29, achado do /scanproject: main.js
// crescendo demais). getMainWindow como função (não a variável mainWindow
// direto) porque o módulo é carregado antes da janela existir.
const atualizacaoAutomatica = require("./atualizacao-automatica");
atualizacaoAutomatica.registrarEventosDeStatus(() => mainWindow);

function criarJanelaPrincipal() {
	const janela = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 1024,
		minHeight: 640,
		show: false,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			nodeIntegrationInSubFrames: true,
			preload: path.join(__dirname, "preload.js"),
		},
	});

	mainWindow = janela;
	janela.maximize();
	janela.show();

	// Diagnóstico opt-in (2026-08-29, investigação do travamento em
	// Atualizações): F12 não abriu DevTools numa tentativa ao vivo e a causa
	// nunca foi confirmada (nada aqui desativa `devTools` nem intercepta F12
	// explicitamente) — em vez de depender do atalho, abre sozinho quando essa
	// var estiver setada, inclusive em build empacotado.
	if (process.env.ERP_DEBUG_DEVTOOLS === "1") {
		janela.webContents.openDevTools({ mode: "detach" });
	}

	janela.webContents.on("preload-error", (event, preloadPath, error) => {
		logErro(
			"PRELOAD-ERROR " +
				preloadPath +
				" -> " +
				(error && error.message ? error.message : error),
		);
	});

	// Cobre console.error/console.warn e os erros que o script errorlog.js
	// (carregado em toda página) reencaminha via console.error: exceções JS
	// não tratadas (window.onerror) e promises sem catch.
	// Bug real encontrado e corrigido aqui: a partir do Electron 35, esse
	// evento passa a detalhar tudo num ÚNICO parâmetro (não mais
	// `(event, level, message, ...)` nem `(event, detail)`), e o "level"
	// virou string ("info"/"warning"/"error"/"debug"), não mais número. O
	// código antigo desestruturava de um segundo parâmetro que não existe
	// mais nessa versão do Electron (^43) — `detail` sempre undefined,
	// lançando exceção dentro do próprio handler a cada mensagem de console,
	// silenciosamente, sem nunca gravar nada no log. Erro raiz do "nenhum
	// diagnóstico aparece no erp-crash.log" — não causado por nenhuma feature
	// nova, já existia antes.
	janela.webContents.on(
		"console-message",
		({ level, message, lineNumber, sourceId }) => {
			if (level === "error" || level === "warning") {
				logErro(
					"[L" +
						level +
						"] " +
						message +
						" (" +
						sourceId +
						":" +
						lineNumber +
						")",
				);
			}
		},
	);

	janela.webContents.on(
		"did-fail-load",
		(event, errorCode, errorDescription, validatedURL) => {
			logErro(
				"DID-FAIL-LOAD " +
					errorCode +
					" " +
					errorDescription +
					" url=" +
					validatedURL,
			);
		},
	);

	if (CARREGAR_FRONTEND_ANTIGO) {
		janela.loadFile("modules/dashboard/index.html");
	} else {
		janela.loadURL("app://renderer/");
	}
}

// Extensão -> Content-Type, só o necessário pro export estático do Next.js
// (ver frontend/out/ — nenhum outro tipo de arquivo aparece lá hoje).
const TIPOS_MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".txt": "text/plain; charset=utf-8",
};

// Serve o export estático do Next.js (frontend/out/) via app://renderer/...
// Lê o arquivo direto do disco (fs), não via net.fetch — bug real achado
// (2026-08-29): net.fetch passa pela MESMA stack de rede do Chromium que o
// electron-updater usa pra falar com o GitHub. Depois de visitar a tela de
// Atualizações, navegar pra qualquer rota nova ficava pendurada
// indefinidamente (usePathname() atualizava — a sidebar reagia — mas o
// conteúdo/abas do header nunca chegavam a trocar, sinal de que o fetch da
// PRÓXIMA rota nunca resolvia). Servir arquivo local não tem nenhum motivo
// pra depender da stack de rede — fs.readFile decepara completamente a
// leitura de arquivo estático de qualquer atividade de rede real do app.
function registrarProtocoloFrontendNovo() {
	protocol.handle("app", async (request) => {
		const url = new URL(request.url);
		let caminhoRelativo = decodeURIComponent(url.pathname);
		if (caminhoRelativo === "" || caminhoRelativo.endsWith("/")) {
			caminhoRelativo += "index.html";
		}
		const caminhoArquivo = path.join(DIR_FRONTEND_NOVO, caminhoRelativo);
		// Nunca resolver fora de DIR_FRONTEND_NOVO (bloqueia path traversal via ../).
		if (
			!caminhoArquivo.startsWith(DIR_FRONTEND_NOVO + path.sep) &&
			caminhoArquivo !== DIR_FRONTEND_NOVO
		) {
			return new Response("Forbidden", { status: 403 });
		}
		try {
			const dados = await fs.promises.readFile(caminhoArquivo);
			const tipo =
				TIPOS_MIME[path.extname(caminhoArquivo).toLowerCase()] ||
				"application/octet-stream";
			return new Response(dados, { headers: { "Content-Type": tipo } });
		} catch {
			return new Response("Not Found", { status: 404 });
		}
	});
}

app.whenReady().then(async () => {
	Menu.setApplicationMenu(null);

	setDBPath(app.getPath("userData"));
	// Backup local (db/banco-admin.js:exportarBancoJSON) precisa ficar do
	// lado de fora do app, visível pro dono — pasta do .exe empacotado, ou
	// raiz do projeto em dev (mesma lógica de DIR_FRONTEND_NOVO acima).
	setPastaExecutavel(
		app.isPackaged ? path.dirname(app.getPath("exe")) : __dirname,
	);

	if (!CARREGAR_FRONTEND_ANTIGO) {
		registrarProtocoloFrontendNovo();
	}

	criarJanelaPrincipal();

	atualizacaoAutomatica.iniciarChecagemAutomatica();
});

const deps = {
	exigirSessao,
	exigirPermissao,
	log,
	logErro,
	getSessao: () => sessao,
	setSessao: (s) => {
		sessao = s;
	},
	iniciarBackupAutomatico,
	pararBackupAutomatico,
	getMainWindow: () => mainWindow,
};

// auth e fiscal são infraestrutura do core (sessão central + integração
// fiscal cross-cutting, usada internamente por vendas/caixa) — não são
// "módulos" plugáveis no sentido de docs/MODULE_MANIFEST.md, então ficam de
// fora do loop de manifesto, registrados direto, como sempre foram.
require("./ipc/auth").registrar(ipcMain, deps);
require("./ipc/fiscal").registrar(ipcMain, deps);

// Registro de IPC dos módulos plugáveis, orientado por manifesto — ver
// docs/MODULE_MANIFEST.md e modulos.js. Substitui a lista fixa de 19
// requires que existia aqui antes; o mesmo conjunto de arquivos ipc/*.js é
// registrado, só que descoberto a partir de modules/**/modulo.json em vez de
// hardcoded. Um mesmo ipc/*.js pode ser referenciado por mais de um módulo
// (ex.: "estoque.js" por entrada/estoque-lista/importacao) — dedupe por nome
// de arquivo, senão ipcMain.handle() lança "second handler" no boot.
//
// aplicarEntitlements: desligado por padrão (sem entitlements.json na raiz,
// todo módulo continua habilitado) — ver GOALS.md "Security: dormant
// entitlements design". Um módulo desativado não tem nem o IPC registrado
// nem aparece na sidebar (ipc/sistema.js aplica o mesmo filtro do lado do
// navbar.js) — desligar por entitlement bloqueia os dois lados, não só a UI.
const { carregarModulos, aplicarEntitlements } = require("./modulos.js");
const ipcJaRegistrado = new Set();
const modulosHabilitados = aplicarEntitlements(
	carregarModulos(path.join(__dirname, "modules")),
	path.join(__dirname, "entitlements.json"),
);
for (const modulo of modulosHabilitados) {
	for (const nomeIpc of modulo.ipc) {
		if (ipcJaRegistrado.has(nomeIpc)) continue;
		ipcJaRegistrado.add(nomeIpc);
		require("./ipc/" + nomeIpc).registrar(ipcMain, deps);
	}
}

app.on("before-quit", () => {
	if (sessao) {
		try {
			backupAutomatico();
		} catch (e) {
			console.error("Erro no backup automatico (before-quit):", e.message);
		}
	}
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
