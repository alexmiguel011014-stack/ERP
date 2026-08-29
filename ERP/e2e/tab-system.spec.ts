import { _electron as electron, expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import type { ElectronApplication, Page } from "playwright-core";

const ROOT = path.join(__dirname, "..");

// Regressão real desta suíte: `frontend/next.config.ts` usa
// `trailingSlash: true` (obrigatório pro export estático), então
// `usePathname()` sempre devolve a rota COM barra no final
// ("/financeiro/"), enquanto `hrefDoModulo()` (hooks/useModulos.ts) gerava
// hrefs SEM barra. `TabsContext.tsx` comparava os dois direto — nunca
// batia pra nenhum módulo fora a raiz "/", então só o Dashboard virava aba
// de verdade no header, não importa em qual módulo o usuário estivesse.
// Corrigido com `normalizarPathname()`. Este teste existe pra nunca deixar
// essa classe de bug voltar sem ser notada.
test.describe("sistema de abas do header (frontend novo)", () => {
	let electronApp: ElectronApplication;
	let window: Page;
	let userDataDir: string;

	test.beforeAll(async () => {
		userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-e2e-"));
		electronApp = await electron.launch({
			args: ["."],
			cwd: ROOT,
			env: {
				...process.env,
				// Frontend novo é o padrão desde o cutover (2026-08-28) — não
				// precisa mais de env var pra ligar.
				ERP_TEST_USERDATA_DIR: userDataDir,
			},
		});
		window = await electronApp.firstWindow();
		await window.waitForLoadState("domcontentloaded");
	});

	test.afterAll(async () => {
		await electronApp.close();
		fs.rmSync(userDataDir, { recursive: true, force: true });
	});

	test("login (bootstrap em banco vazio) leva ao Dashboard, sem X pra fechar", async () => {
		await window.getByPlaceholder("Seu login de acesso").fill("teste");
		await window.getByPlaceholder("Digite a senha de acesso").fill("teste123");
		await window.getByRole("button", { name: "Entrar" }).click();

		// "Dashboard" existe tanto no link da sidebar quanto na aba do header
		// depois do login — escopar por contêiner evita ambiguidade.
		await expect(
			window.locator("header").getByTitle("Dashboard", { exact: true }),
		).toBeVisible();
		await expect(window.getByTitle("Fechar Dashboard")).toHaveCount(0);
	});

	test("navegar para Financeiro registra a aba (não fica preso só no Dashboard)", async () => {
		await window
			.locator("aside")
			.getByTitle("Financeiro", { exact: true })
			.click();
		await expect(window.getByTitle("Fechar Financeiro")).toBeVisible();
	});

	test("navegar para Produtos registra outra aba, SEM fechar a de Financeiro", async () => {
		await window
			.locator("aside")
			.getByTitle("Produtos", { exact: true })
			.click();
		await expect(window.getByTitle("Fechar Produtos")).toBeVisible();
		// O ponto central do recurso: múltiplas abas abertas ao mesmo tempo,
		// não uma navegação simples que substitui a anterior.
		await expect(window.getByTitle("Fechar Financeiro")).toBeVisible();
		await expect(
			window.locator("header").getByTitle("Dashboard", { exact: true }),
		).toBeVisible();
	});

	test("fechar uma aba não fechável (Dashboard) — botão não existe", async () => {
		await expect(window.getByTitle("Fechar Dashboard")).toHaveCount(0);
	});

	// NOTA (2026-08-29): um teste de regressão pra "navegar pra Atualizações
	// e depois pra outro módulo" foi tentado aqui e removido — checkForUpdates
	// bate rede de verdade (GitHub), e o comportamento em CI/sandbox sem
	// conectividade previsível não deu pra distinguir de forma confiável do
	// bug real observado ao vivo (que acontecia mesmo com a checagem já
	// concluída com sucesso). Precisa de uma forma de mockar
	// autoUpdater.checkForUpdates() nesta suíte antes de reintroduzir esse
	// teste — ver GOALS.md.
});
