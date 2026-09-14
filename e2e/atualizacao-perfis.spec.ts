import { _electron as electron, expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import type { ElectronApplication, Page } from "playwright-core";

const ROOT = path.join(__dirname, "..");

test.describe("atualização para admin e dono", () => {
	test.setTimeout(90_000);
	let electronApp: ElectronApplication;
	let window: Page;
	let userDataDir: string;

	test.beforeAll(async () => {
		userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-e2e-update-profiles-"));
		electronApp = await electron.launch({
			args: ["."],
			cwd: ROOT,
			env: {
				...process.env,
				ERP_TEST_USERDATA_DIR: userDataDir,
				ERP_MOCK_UPDATER: "available",
			},
		});
		window = await electronApp.firstWindow();
		await window.waitForLoadState("domcontentloaded");
		await window.getByPlaceholder("Seu login de acesso").fill("teste");
		await window.getByPlaceholder("Digite a senha de acesso").fill("teste123");
		await window.getByRole("button", { name: "Entrar" }).click();
		await expect(window.locator("header").getByTitle("Dashboard", { exact: true })).toBeVisible();
		await window.locator("aside").getByTitle("Atualizações", { exact: true }).click();
		await expect(window.getByRole("heading", { name: /Notas da atualização/ })).toBeVisible();
		await expect(window.getByRole("button", { name: "Baixar atualização" })).toBeVisible();

		await window.evaluate(async () => {
			await window.api.salvarUsuario({
				login: "dono-e2e",
				nome: "Dono E2E",
				perfil: "dono",
				ativo: true,
				senha: "dono123",
				permissoes: {},
			});
			await window.api.logout();
		});
		await window.reload();
		await window.getByPlaceholder("Seu login de acesso").fill("dono-e2e");
		await window.getByPlaceholder("Digite a senha de acesso").fill("dono123");
		await window.getByRole("button", { name: "Entrar" }).click();
		await expect(window.locator("header").getByTitle("Dashboard", { exact: true })).toBeVisible();
	}, { timeout: 60_000 });

	test.afterAll(async () => {
		await electronApp.close();
		fs.rmSync(userDataDir, { recursive: true, force: true });
	}, { timeout: 60_000 });

	test("o Dono recebe o mesmo fluxo de atualização do administrador", async () => {
		const sessao = await window.evaluate(() => window.api.getAuthSession());
		expect(sessao.perfil).toBe("dono");

		await window.locator("aside").getByTitle("Atualizações", { exact: true }).click();
		await expect(window.getByRole("heading", { name: /Notas da atualização/ })).toBeVisible();
		await expect(window.getByRole("button", { name: "Baixar atualização" })).toBeVisible();

		await window.getByRole("button", { name: "Baixar atualização" }).click();
		await expect(window.getByRole("button", { name: "Instalar" })).toBeVisible();
		await window.getByRole("button", { name: "Instalar" }).click();
		await expect(window.getByText("Baixar atualização faz com que o app reinicie, deseja prosseguir?")).toBeVisible();
		await window.getByRole("button", { name: "Sim" }).click();
		await expect(window.getByText("Erro ao instalar")).toHaveCount(0);
	});
});
