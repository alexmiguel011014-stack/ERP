import { _electron as electron, expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import type { ElectronApplication, Locator, Page } from "playwright-core";

const ROOT = path.join(__dirname, "..");

test.describe("Acessibilidade do estoque", () => {
	let electronApp: ElectronApplication;
	let window: Page;
	let userDataDir: string;
	let sku: string;
	let nome: string;

	function visible(): Locator {
		return window.locator(":visible");
	}

	function listaEstoque(): Locator {
		return window.getByRole("region", { name: "Lista completa do estoque", exact: true }).and(visible());
	}

	async function abrirEstoque() {
		await window.getByRole("link", { name: "Estoque", exact: true }).and(visible()).click();
		const lista = listaEstoque();
		await expect(lista).toBeVisible();
		await lista.getByRole("button", { name: "Todos", exact: true }).click();
		await lista.getByPlaceholder("Buscar por nome, SKU, código de barras ou ID...").fill(sku);
		await expect(lista.getByRole("row", { name: new RegExp(`^${sku}(?:\\s|$)`) })).toBeVisible();
		return lista;
	}

	test.beforeAll(async () => {
		userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-e2e-estoque-acessibilidade-"));
		electronApp = await electron.launch({
			args: ["."],
			cwd: ROOT,
			env: { ...process.env, ERP_TEST_USERDATA_DIR: userDataDir, ERP_MOCK_UPDATER: "1" },
		});
		window = await electronApp.firstWindow();
		await window.waitForLoadState("domcontentloaded");
		const caminhos = await electronApp.evaluate(({ app }) => ({
			userData: app.getPath("userData"),
			banco: process.mainModule.require("./database.js").getDBPath(),
		}));
		const bancoEsperado = path.join(userDataDir, "erp_housekimono.sqlite");
		expect(path.resolve(caminhos.userData)).toBe(path.resolve(userDataDir));
		expect(path.resolve(caminhos.banco)).toBe(path.resolve(bancoEsperado));
		await window.getByPlaceholder("Seu login de acesso").fill("teste");
		await window.getByPlaceholder("Digite a senha de acesso").fill("teste123");
		await window.getByRole("button", { name: "Entrar" }).click();
		await window.locator("aside").getByTitle("Produtos", { exact: true }).click();
		await expect(window.getByPlaceholder("Ex: Quimono Trançado").and(visible())).toBeVisible();
		const bancoPelaApi = await window.evaluate(() => window.api.getDBPath());
		expect(path.resolve(bancoPelaApi)).toBe(path.resolve(bancoEsperado));

		sku = `A11Y-${Date.now()}`;
		nome = `Produto acessibilidade ${sku}`;
		await window.evaluate(async ({ nome, sku }) => {
			await window.api.salvarProduto({
				nome,
				variacoes: [{ sku, preco: 100, preco_custo: 50, quantidade_estoque: 10, estoque_minimo: 1, atributos: [{ chave: "Tamanho", valor: "A1" }] }],
			});
		}, { nome, sku });
		const reserva = await window.evaluate(async (codigo) => {
			const variacao = await window.api.buscarSKU(codigo);
			return window.api.finalizarVenda({
				itens: [{ variacao_id: variacao.id, quantidade: 9, preco_unitario: 100 }],
				status: "orcamento", total: 900, request_id: `stock-a11y-${codigo}`, observacao: "Reserva acessibilidade",
			});
		}, sku);
		if (!reserva.success) throw new Error("Não foi possível criar a reserva de teste");
	});

	test.afterAll(async () => {
		try {
			if (electronApp) await electronApp.close();
		} finally {
			if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
		}
	});

	test("diálogo de entrada tem nome, foco inicial, limites de teclado e retorno de foco", async () => {
		const lista = await abrirEstoque();
		const acao = lista.getByRole("row", { name: new RegExp(`^${sku}(?:\\s|$)`) })
			.getByRole("button", { name: `Adicionar estoque para ${nome}, SKU ${sku}` });
		await acao.click();
		const dialog = window.getByRole("dialog", { name: "Adicionar estoque", exact: true }).and(visible());
		const titulo = dialog.getByRole("heading", { name: "Adicionar estoque", exact: true });
		await expect(titulo).toBeFocused();
		await expect(dialog.getByLabel("Quantidade recebida")).toBeVisible();

		await window.keyboard.press("Tab");
		await expect(dialog.getByRole("button", { name: "Fechar", exact: true })).toBeFocused();
		await window.keyboard.press("Shift+Tab");
		await expect(dialog.getByRole("button", { name: "Registrar entrada individual", exact: true })).toBeFocused();
		await window.keyboard.press("Tab");
		await expect(dialog.getByRole("button", { name: "Fechar", exact: true })).toBeFocused();
		await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
		await expect(dialog).toHaveCount(0);
		await expect(acao).toBeFocused();
	});

	test("Voltar preserva campos e foco; descarte de entrada e saída fica no diálogo", async () => {
		const lista = await abrirEstoque();
		const linha = lista.getByRole("row", { name: new RegExp(`^${sku}(?:\\s|$)`) });
		await linha.getByRole("button", { name: `Adicionar estoque para ${nome}, SKU ${sku}` }).click();
		const entrada = window.getByRole("dialog", { name: "Adicionar estoque", exact: true }).and(visible());
		const quantidadeEntrada = entrada.getByLabel("Quantidade recebida");
		await quantidadeEntrada.fill("3");
		await entrada.getByLabel("Custo unitário (R$)").fill("48,50");
		await entrada.getByRole("button", { name: "Registrar entrada individual", exact: true }).click();
		const confirmarEntrada = entrada.getByRole("group", { name: "Confirmar entrada individual" });
		await expect(confirmarEntrada).toBeVisible();
		await confirmarEntrada.getByRole("button", { name: "Voltar", exact: true }).click();
		await expect(quantidadeEntrada).toHaveValue("3");
		await expect(entrada.getByLabel("Custo unitário (R$)")).toHaveValue("48,50");
		await expect(entrada.getByRole("button", { name: "Registrar entrada individual", exact: true })).toBeFocused();
		await entrada.getByRole("button", { name: "Fechar", exact: true }).click();
		const descartarEntrada = entrada.getByRole("group", { name: "Confirmar descarte das alterações" });
		await expect(descartarEntrada).toBeVisible();
		await descartarEntrada.getByRole("button", { name: "Continuar editando", exact: true }).click();
		await expect(quantidadeEntrada).toHaveValue("3");
		await expect(entrada.getByRole("heading", { name: "Adicionar estoque", exact: true })).toBeFocused();
		await entrada.getByRole("button", { name: "Fechar", exact: true }).click();
		await entrada.getByRole("group", { name: "Confirmar descarte das alterações" }).getByRole("button", { name: "Descartar alterações", exact: true }).click();
		await expect(entrada).toHaveCount(0);

		await linha.getByRole("button", { name: `Retirar estoque para ${nome}, SKU ${sku}` }).click();
		const saida = window.getByRole("dialog", { name: "Retirar estoque", exact: true }).and(visible());
		await saida.getByLabel("Quantidade a dar baixa").fill("2");
		await saida.getByLabel("Motivo").selectOption("Perda");
		await saida.getByRole("button", { name: "Fechar", exact: true }).click();
		const descartarSaida = saida.getByRole("group", { name: "Confirmar descarte das alterações" });
		await expect(descartarSaida).toBeVisible();
		await descartarSaida.getByRole("button", { name: "Continuar editando", exact: true }).click();
		await expect(saida.getByLabel("Quantidade a dar baixa")).toHaveValue("2");
		await expect(saida.getByLabel("Motivo")).toHaveValue("Perda");
		await expect(saida.getByRole("heading", { name: "Retirar estoque", exact: true })).toBeFocused();
		const confirmarBaixa = saida.getByRole("button", { name: "Confirmar Baixa", exact: true });
		await confirmarBaixa.click();
		const confirmarReserva = saida.getByRole("group", { name: "Confirmar baixa abaixo do reservado" });
		await expect(confirmarReserva).toBeVisible();
		await confirmarReserva.getByRole("button", { name: "Cancelar", exact: true }).click();
		await expect(saida.getByLabel("Quantidade a dar baixa")).toHaveValue("2");
		await expect(confirmarBaixa).toBeFocused();
		await saida.getByRole("button", { name: "Fechar", exact: true }).click();
		await saida.getByRole("group", { name: "Confirmar descarte das alterações" }).getByRole("button", { name: "Descartar alterações", exact: true }).click();
		await expect(saida).toHaveCount(0);
		await expect(linha.getByRole("button", { name: `Retirar estoque para ${nome}, SKU ${sku}` })).toBeFocused();
	});

	test("Escape fecha primeiro os resultados e depois o diálogo de lote", async () => {
		const lista = await abrirEstoque();
		await window.getByRole("button", { name: "Entrada em lote", exact: true }).click();
		const dialog = window.getByRole("dialog", { name: "Entrada em lote", exact: true }).and(visible());
		await expect(dialog.getByRole("heading", { name: "Entrada em lote", exact: true })).toBeFocused();
		await expect.poll(() => window.evaluate(() => document.body.style.overflow)).toBe("hidden");
		const campo = dialog.locator('input[role="combobox"]');
		await expect(dialog.getByLabel("Quantidade recebida")).toBeVisible();
		await expect(dialog.getByLabel("Custo unitário (R$)")).toBeVisible();
		await campo.fill(sku);
		await expect(dialog.getByRole("option")).toHaveCount(1);
		await campo.press("Escape");
		await expect(dialog.getByRole("option")).toHaveCount(0);
		await expect(dialog).toBeVisible();
		await campo.press("Escape");
		await expect(dialog).toHaveCount(0);
		await expect.poll(() => window.evaluate(() => document.body.style.overflow)).toBe("unset");
		await expect(lista).toBeVisible();
	});

	test("confirmação de lote permanece dentro do diálogo e mantém a rolagem bloqueada", async () => {
		const lista = await abrirEstoque();
		await window.getByRole("button", { name: "Entrada em lote", exact: true }).click();
		const dialog = window.getByRole("dialog", { name: "Entrada em lote", exact: true }).and(visible());
		const campo = dialog.locator('input[role="combobox"]');
		await campo.fill(sku);
		await dialog.getByRole("option").click();
		await dialog.locator('input[type="number"]').fill("2");
		await dialog.getByRole("button", { name: "Adicionar à reposição", exact: true }).click();
		await expect(dialog.getByText(new RegExp(`SKU: ${sku} \\| Qtd: 2`))).toBeVisible();
		await dialog.getByRole("button", { name: "Confirmar Reposição", exact: true }).click();
		const confirmacao = dialog.getByRole("group", { name: "Confirmar reposição" });
		await expect(confirmacao).toBeVisible();
		await expect(confirmacao.getByRole("button", { name: "Confirmar entrada", exact: true })).toBeVisible();
		await expect.poll(() => window.evaluate(() => document.body.style.overflow)).toBe("hidden");
		await confirmacao.getByRole("button", { name: "Voltar", exact: true }).click();
		await expect(dialog.getByText(new RegExp(`SKU: ${sku} \\| Qtd: 2`))).toBeVisible();
		await expect(lista).toBeVisible();
		await dialog.getByRole("button", { name: "Limpar", exact: true }).click();
		await dialog.getByRole("group", { name: "Descartar rascunho de lote" }).getByRole("button", { name: "Descartar rascunho", exact: true }).click();
		await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
	});

	test("tema e dimensões mantêm ações, cabeçalho sticky e superfície legíveis", async () => {
		const lista = await abrirEstoque();
		const antesEscuro = await window.evaluate(() => document.documentElement.classList.contains("dark"));
		const modoAntes = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.isMaximized() ?? false);
		try {
			await electronApp.evaluate(({ BrowserWindow }) => {
				const win = BrowserWindow.getFocusedWindow();
				if (!win) throw new Error("Janela Electron não encontrada");
				win.unmaximize();
				win.setContentSize(1024, 640);
			});
			await expect.poll(() => window.evaluate(() => document.documentElement.clientWidth)).toBe(1024);
			for (const modo of ["1024x640", "maximizada"] as const) {
				if (modo === "maximizada") {
					await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.maximize());
					await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.isMaximized() ?? false)).toBe(true);
				}
				for (const tema of ["claro", "escuro"] as const) {
					await window.evaluate((escuro) => document.documentElement.classList.toggle("dark", escuro), tema === "escuro");
					const linha = lista.getByRole("row", { name: new RegExp(`^${sku}(?:\\s|$)`) });
					await expect(linha.getByRole("button", { name: `Adicionar estoque para ${nome}, SKU ${sku}` })).toBeVisible();
					await expect(linha.getByRole("button", { name: `Retirar estoque para ${nome}, SKU ${sku}` })).toBeVisible();
					const cabecalho = lista.getByRole("columnheader", { name: "SKU", exact: true });
					await expect.poll(() => cabecalho.evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
					if (tema === "escuro") {
						await expect.poll(() => cabecalho.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(23, 31, 46)");
						const superficie = lista.locator(":scope > div").first();
						await expect.poll(() => superficie.evaluate((element) => getComputedStyle(element).backgroundColor)).toContain("0.03");
					}
				}
			}
		} finally {
			await window.evaluate((escuro) => document.documentElement.classList.toggle("dark", escuro), antesEscuro);
			await electronApp.evaluate(({ BrowserWindow }, maximizada) => {
				const win = BrowserWindow.getFocusedWindow();
				if (!win) return;
				if (maximizada) win.maximize();
				else win.unmaximize();
			}, modoAntes);
		}
	});
});
