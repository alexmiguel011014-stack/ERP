import { defineConfig } from "@playwright/test";

// Testa o app Electron de verdade (não um browser solto) — ver e2e/README.md
// pro porquê. Sem servidor pra subir (webServer), o próprio teste lança o
// Electron via _electron.launch().
export default defineConfig({
	testDir: "./e2e",
	timeout: 30_000,
	fullyParallel: false, // um Electron por vez — cada worker abriria sua própria janela
	workers: 1,
	reporter: "list",
});
