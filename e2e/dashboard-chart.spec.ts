import { _electron as electron, expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import type { ElectronApplication, Page } from "playwright-core";

const ROOT = path.join(__dirname, "..");

test.describe("gráfico de faturamento do dashboard", () => {
	let electronApp: ElectronApplication;
	let window: Page;
	let userDataDir: string;
	const errosResize: string[] = [];

	test.beforeAll(async () => {
		userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-e2e-dashboard-"));
		electronApp = await electron.launch({
			args: ["."],
			cwd: ROOT,
			env: {
				...process.env,
				ERP_TEST_USERDATA_DIR: userDataDir,
				ERP_MOCK_UPDATER: "1",
			},
		});
		window = await electronApp.firstWindow();
		window.on("console", (mensagem) => {
			if (/ResizeObserver loop/i.test(mensagem.text())) {
				errosResize.push(mensagem.text());
			}
		});
		window.on("pageerror", (erro) => {
			if (/ResizeObserver loop/i.test(erro.message)) {
				errosResize.push(erro.message);
			}
		});
		await window.getByPlaceholder("Seu login de acesso").fill("teste");
		await window.getByPlaceholder("Digite a senha de acesso").fill("teste123");
		await window.getByRole("button", { name: "Entrar" }).click();
		await expect(
			window.locator("header").getByTitle("Dashboard", { exact: true }),
		).toBeVisible();
	}, { timeout: 60_000 });

	test.afterAll(async () => {
		await electronApp.close();
		fs.rmSync(userDataDir, { recursive: true, force: true });
	});

	test("não cria rolagem nem loop ao redimensionar e passar o mouse", async () => {
		test.setTimeout(60_000);
		await electronApp.evaluate(({ BrowserWindow }) =>
			BrowserWindow.getAllWindows()[0].setSize(480, 720),
		);
		await window.getByRole("button", { name: "1 mês", exact: true }).click();
		await window.getByRole("button", { name: "7 dias", exact: true }).click();

		const host = window.getByTestId("dashboard-faturamento-chart-host");
		await expect(host.locator(".apexcharts-canvas")).toBeVisible();
		const medidas = await host.evaluate((elemento) => {
			const estilo = getComputedStyle(elemento);
			return {
				scrollWidth: elemento.scrollWidth,
				clientWidth: elemento.clientWidth,
				scrollHeight: elemento.scrollHeight,
				clientHeight: elemento.clientHeight,
				overflowX: estilo.overflowX,
				overflowY: estilo.overflowY,
			};
		});
		expect(medidas.scrollWidth).toBeLessThanOrEqual(medidas.clientWidth);
		expect(["auto", "scroll"]).not.toContain(medidas.overflowX);
		expect(["auto", "scroll"]).not.toContain(medidas.overflowY);

		const canvas = host.locator(".apexcharts-canvas");
		const caixa = await canvas.boundingBox();
		if (!caixa) throw new Error("Canvas do gráfico não foi renderizado.");
		await window.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
		await expect(window.locator(".apexcharts-tooltip:visible")).toBeVisible();
		expect(errosResize).toEqual([]);

		await electronApp.evaluate(({ BrowserWindow }) =>
			BrowserWindow.getAllWindows()[0].setSize(1100, 720),
		);
		await window.locator("aside").hover();
		await window.waitForTimeout(450);
		await window.locator("header").hover();
		await window.waitForTimeout(450);
		const limites = await host.evaluate((elemento) => {
			const hostRect = elemento.getBoundingClientRect();
			const canvasRect = elemento
				.querySelector(".apexcharts-canvas")!
				.getBoundingClientRect();
			return { hostRect, canvasRect };
		});
		expect(limites.canvasRect.right).toBeLessThanOrEqual(
			limites.hostRect.right + 1,
		);
		expect(errosResize).toEqual([]);
	});
});
