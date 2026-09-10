/* Hook beforePack do electron-builder (ver package.json:build.beforePack).
   Achado real (2026-08-29): a v1.1.7 publicada no GitHub Releases saiu SEM
   frontend/out/ dentro — o build local que eu verifiquei manualmente tinha
   os arquivos, mas o build que efetivamente foi empacotado e publicado, não.
   A causa não foi um bug de config (extraResources em si funciona, testado
   repetidas vezes) — foi processo: nada garantia que `frontend/out/` estava
   FRESCO e PRESENTE no exato momento em que o electron-builder rodava,
   dependendo de eu lembrar de rodar `npm run build` no frontend logo antes
   de cada publish, manualmente, sem nenhuma trava.

   Este hook roda automaticamente ANTES do electron-builder copiar qualquer
   arquivo pro pacote (beforePack), goste ou não de como electron-builder foi
   invocado (CLI direto, npm script, --publish, --dir) — não dá pra esquecer
   de novo. Falha o build inteiro (lança erro) se o build do frontend falhar
   ou se o index.html não existir depois — nunca deixa passar um pacote sem
   o frontend novo dentro. */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

module.exports = async function beforePack() {
	// __dirname é scripts/ — o pai é a raiz do projeto. Não depende de
	// nenhuma propriedade específica do context do electron-builder (API
	// interna que pode mudar entre versões) — resolve sozinho, sempre certo.
	const raizProjeto = path.join(__dirname, "..");
	const dirFrontend = path.join(raizProjeto, "frontend");

	console.log("[beforePack] buildando frontend/ antes de empacotar...");
	execSync("npm run build", { cwd: dirFrontend, stdio: "inherit" });

	const indexHtml = path.join(dirFrontend, "out", "index.html");
	if (!fs.existsSync(indexHtml)) {
		throw new Error(
			"[beforePack] frontend/out/index.html não existe depois do build — " +
				"empacotar assim geraria um app com tela em branco/'Not Found'. " +
				"Abortando o build.",
		);
	}
	console.log(
		"[beforePack] frontend/out/index.html confirmado, ok pra empacotar.",
	);
};
