import { _electron as electron, expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import type { ElectronApplication, Locator, Page } from "playwright-core";

const ROOT = path.join(__dirname, "..");

test.describe("Relatórios: faturamento bruto", () => {
	let electronApp: ElectronApplication;
	let window: Page;
	let userDataDir: string;

	function visible(): Locator {
		return window.locator(":visible");
	}

	test.beforeAll(async () => {
		userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-e2e-relatorios-"));
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
		await window.getByPlaceholder("Seu login de acesso").fill("teste");
		await window.getByPlaceholder("Digite a senha de acesso").fill("teste123");
		await window.getByRole("button", { name: "Entrar" }).click();
		await expect(
			window.locator("header").getByTitle("Dashboard", { exact: true }),
		).toBeVisible();

		await window.evaluate(async () => {
			await window.api.salvarProduto({
				nome: "Produto Relatórios E2E",
				variacoes: [
					{
						sku: "RELATORIOS-E2E",
						preco: 4104.2,
						preco_custo: 0,
						quantidade_estoque: 2,
						atributos: [{ chave: "Unidade", valor: "Único" }],
					},
				],
			});
			const produtos = await window.api.listarProdutosDetalhados(false);
			const produto = produtos.find((p: { nome: string }) => p.nome === "Produto Relatórios E2E");
			const variacao = produto.variacoes[0];
			await window.api.abrirCaixa(0);
			await window.api.finalizarVenda({
				itens: [
					{
						variacao_id: variacao.variacao_id,
						quantidade: 1,
						preco_unitario: 4104.2,
					},
				],
				total: 4104.2,
				desconto: 0,
				forma_pagamento: "Dinheiro",
			});
		});
	});

	test.afterAll(async () => {
		await electronApp.close();
		fs.rmSync(userDataDir, { recursive: true, force: true });
	});

	test("mostra os dois rótulos e um eixo sem ruído de ponto flutuante", async () => {
		await window.locator("aside").getByTitle("Relatórios", { exact: true }).click();
		await window.getByRole("button", { name: "Este mês", exact: true }).click();
		await expect(window.getByText("Faturamento bruto", { exact: true }).and(visible())).toBeVisible();

		const ticks = window.locator(".apexcharts-yaxis-texts-g text").and(visible());
		await expect(ticks.first()).toBeVisible();
		for (const tick of await ticks.allTextContents()) {
			expect(tick).not.toMatch(/\.0{4,}/);
		}
		await window.locator(".apexcharts-bar-area").and(visible()).first().hover();
		await expect(
			window.locator(".apexcharts-tooltip.apexcharts-active").and(visible()),
		).toContainText("R$ 4.104,20");

		await window.getByRole("button", { name: "Vendas", exact: true }).click();
		await expect(window.getByText("Faturamento bruto", { exact: true }).and(visible())).toBeVisible();
		await window.getByRole("button", { name: "Fluxo de Caixa", exact: true }).click();
		for (const label of [
			"Entradas realizadas",
			"Saídas realizadas",
			"Entradas projetadas",
			"Saídas projetadas",
			"Lucro bruto",
			"Saldo final estimado",
		]) {
			await expect(window.getByText(label, { exact: true }).and(visible())).toBeVisible();
		}
	});
});
