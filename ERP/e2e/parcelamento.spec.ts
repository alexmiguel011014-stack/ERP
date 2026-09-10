import { _electron as electron, expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import type { ElectronApplication, Locator, Page } from "playwright-core";

const ROOT = path.join(__dirname, "..");
const PRODUTO = "Produto Parcelamento E2E";
const SKU = "PARCELAMENTO-E2E";
const CLIENTE = "Cliente Parcelamento E2E";

test.describe("parcelamento no Electron", () => {
	let electronApp: ElectronApplication;
	let window: Page;
	let userDataDir: string;

	function visible(): Locator {
		return window.locator(":visible");
	}

	async function confirmarClique(botao: Locator) {
		window.once("dialog", (dialogo) => {
			void dialogo.accept();
		});
		await botao.click();
	}

	async function adicionarProdutoNoPdv() {
		const busca = window
			.getByPlaceholder("Escaneie ou digite o SKU/nome e pressione Enter")
			.and(visible());
		await busca.fill(SKU);
		await busca.press("Enter");
		const resultado = window
			.getByRole("button", { name: new RegExp(PRODUTO) })
			.and(visible());
		await expect(resultado).toBeVisible();
		await resultado.click();
	}

	test.beforeAll(async () => {
		userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-e2e-parcelamento-"));
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
		await window.waitForLoadState("domcontentloaded");
		await window.getByPlaceholder("Seu login de acesso").fill("teste");
		await window.getByPlaceholder("Digite a senha de acesso").fill("teste123");
		await window.getByRole("button", { name: "Entrar" }).click();
		await expect(
			window.locator("header").getByTitle("Dashboard", { exact: true }),
		).toBeVisible();

		await window.evaluate(async () => {
			await window.api.salvarProduto({
				nome: "Produto Parcelamento E2E",
				variacoes: [
					{
						sku: "PARCELAMENTO-E2E",
						preco: 100,
						preco_custo: 0,
						quantidade_estoque: 10,
						atributos: [{ chave: "Tamanho", valor: "Único" }],
					},
				],
			});
			await window.api.salvarCliente({ nome: "Cliente Parcelamento E2E" });
			await window.api.abrirCaixa(0);
		});
	}, { timeout: 60_000 });

	test.afterAll(async () => {
		await electronApp.close();
		fs.rmSync(userDataDir, { recursive: true, force: true });
	}, { timeout: 60_000 });

	test("configura condições e finaliza Fiado e Cartão com o comportamento financeiro correto", async () => {
		test.setTimeout(60_000);
		await window.locator("aside").getByTitle("Produtos", { exact: true }).click();
		await window.locator('a[href="/produtos/precificacao/"]').evaluateAll((links) => {
			const link = links.find((item) => item.getClientRects().length > 0);
			if (!link) throw new Error("Aba de Precificação não está visível.");
			(link as HTMLElement).click();
		});
		const tituloCondicoes = window
			.getByRole("heading", { name: "Condições de parcelamento" })
			.and(visible());
		await expect(tituloCondicoes).toBeVisible();
		const condicoes = tituloCondicoes.locator("xpath=ancestor::section");

		await condicoes.getByPlaceholder("Ex.: Cartão 3x").fill("Fiado E2E 2x");
		await condicoes.locator("select").first().selectOption("Fiado");
		await condicoes.locator('input[type="number"]').nth(0).fill("2");
		await condicoes.locator('input[type="number"]').nth(1).fill("10");
		await condicoes.getByRole("button", { name: "Salvar condição" }).click();
		await expect(
			window
				.getByText("Condição salva. O preço-base dos produtos não foi alterado.")
				.and(visible()),
		).toBeVisible();

		await condicoes.getByRole("button", { name: "Nova condição" }).click();
		await condicoes.getByPlaceholder("Ex.: Cartão 3x").fill("Cartão E2E 3x");
		await condicoes.locator("select").first().selectOption("Cartão");
		await condicoes.locator('input[type="number"]').nth(0).fill("3");
		await condicoes.locator('input[type="number"]').nth(1).fill("5");
		await condicoes.getByRole("button", { name: "Salvar condição" }).click();
		await expect(
			window.getByText("Cartão E2E 3x", { exact: true }).and(visible()).first(),
		).toBeVisible();

		await window
			.locator("aside")
			.getByTitle("Frente de Caixa", { exact: true })
			.click();
		await adicionarProdutoNoPdv();
		const cliente = window
			.getByPlaceholder("Buscar cliente (opcional)...")
			.and(visible());
		await cliente.fill(CLIENTE);
		await window.getByRole("button", { name: CLIENTE }).and(visible()).click();

		const forma = window
			.getByText("Forma de pagamento", { exact: true })
			.and(visible())
			.locator("xpath=following-sibling::select");
		await forma.selectOption("Fiado");
		const condicao = window
			.getByText("Condição de parcelamento", { exact: true })
			.and(visible())
			.locator("xpath=following-sibling::select");
		await condicao.selectOption({ label: "Fiado E2E 2x — 10.00%" });
		await window
			.getByText("Primeiro vencimento", { exact: true })
			.and(visible())
			.locator("xpath=following-sibling::*//input")
			.fill(new Date().toISOString().slice(0, 10));
		await expect(window.getByText("1/2: R$ 55,00").and(visible())).toBeVisible();
		await confirmarClique(
			window.getByRole("button", { name: "Finalizar Venda" }).and(visible()),
		);
		await expect(
			window.getByText("Parcelamento", { exact: true }).and(visible()),
		).toBeVisible();
		await expect(window.getByText(/vence/).and(visible()).first()).toBeVisible();
		await window
			.getByRole("button", { name: "Fechar", exact: true })
			.and(visible())
			.click();

		const vendaFiado = await window.evaluate(async () => {
			const vendas = await window.api.getVendas();
			return vendas.find((v: { forma_pagamento: string; parcelas: number }) =>
				v.forma_pagamento === "Fiado" && v.parcelas === 2,
			);
		});
		const parcelasFiado = await window.evaluate((vendaId) =>
			window.api.getParcelasVenda(vendaId),
			vendaFiado.id,
		);
		expect(parcelasFiado).toHaveLength(2);

		await window.locator("aside").getByTitle("Financeiro", { exact: true }).click();
		await expect(window.getByText(CLIENTE).and(visible()).first()).toBeVisible();
		await confirmarClique(
			window.getByRole("button", { name: "Receber" }).and(visible()).first(),
		);
		await expect(
			window.getByText("Lançamento baixado e fluxo atualizado.").and(visible()),
		).toBeVisible();

		await window
			.locator("aside")
			.getByTitle("Frente de Caixa", { exact: true })
			.click();
		await adicionarProdutoNoPdv();
		await forma.selectOption("Cartão");
		await condicao.selectOption({ label: "Cartão E2E 3x — 5.00%" });
		await expect(
			window
				.getByText(
					"O parcelamento fica registrado na venda; não cria contas a receber do cliente.",
				)
				.and(visible()),
		).toBeVisible();
		await confirmarClique(
			window.getByRole("button", { name: "Finalizar Venda" }).and(visible()),
		);
		await expect(
			window
				.getByText(
					"Parcelas registradas no cartão; não há agenda de recebimento do cliente.",
				)
				.and(visible()),
		).toBeVisible();
		const vendaCartao = await window.evaluate(async () => {
			const vendas = await window.api.getVendas();
			return vendas.find((v: { forma_pagamento: string; parcelas: number }) =>
				v.forma_pagamento === "Cartão" && v.parcelas === 3,
			);
		});
		await expect(vendaCartao).toBeTruthy();
		await expect(
			window.evaluate((vendaId) => window.api.getParcelasVenda(vendaId), vendaCartao.id),
		).resolves.toHaveLength(0);
	});

	test("mantém condições de parcelamento utilizáveis no tamanho mínimo, claro e escuro", async () => {
		await electronApp.evaluate(({ BrowserWindow }) => {
			BrowserWindow.getAllWindows()[0]?.setSize(1024, 700);
		});
		await window.evaluate(() => localStorage.setItem("theme", "dark"));
		await window.reload();
		await expect(window.locator("html")).toHaveClass(/dark/);

		await window.locator("aside").getByTitle("Produtos", { exact: true }).click();
		await window.getByRole("link", { name: "Precificação", exact: true }).click();
		await expect(
			window
				.getByRole("heading", { name: "Condições de parcelamento" })
				.and(visible()),
		).toBeVisible();
		await expect(
			window.getByText("Cartão E2E 3x", { exact: true }).and(visible()).first(),
		).toBeVisible();

		await window.evaluate(() => localStorage.setItem("theme", "light"));
		await window.reload();
		await expect(window.locator("html")).not.toHaveClass(/dark/);
		await expect(
			window
				.getByRole("heading", { name: "Condições de parcelamento" })
				.and(visible()),
		).toBeVisible();
	});
});
