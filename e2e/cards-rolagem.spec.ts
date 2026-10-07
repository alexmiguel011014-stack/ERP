import { _electron as electron, expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import type { ElectronApplication, Locator, Page } from "playwright-core";

const ROOT = path.join(__dirname, "..");

// GOALS 32: cards que renderizam linhas do banco têm teto de altura fixo (rem,
// limitado por uma fração da janela), rolam por dentro sem barra visível, mantêm
// o cabeçalho da tabela à vista e mostram um degradê enquanto há mais abaixo.
// O Modal também se limita à janela, pra um modal alto nunca perder o topo.
test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("cards com altura máxima e rolagem interna", () => {
	let electronApp: ElectronApplication;
	let window: Page;
	let userDataDir: string;

	function visible(): Locator {
		return window.locator(":visible");
	}

	const regiaoPorDia = () =>
		window.getByTestId("rolagem-faturamento-por-dia").and(visible());

	// Mesma conta do preset `md` do ScrollArea: min(24rem, 55dvh).
	async function tetoMd(): Promise<number> {
		const altura = await window.evaluate(() => window.innerHeight);
		return Math.min(24 * 16, 0.55 * altura);
	}

	test.beforeAll(async () => {
		userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-e2e-rolagem-"));
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
			// 120 dias de faturamento: uma linha por dia na tabela "Faturamento por dia".
			const inicio = Date.UTC(2026, 0, 1);
			for (let i = 0; i < 120; i++) {
				const dia = new Date(inicio + i * 86_400_000).toISOString().slice(0, 10);
				await window.api.registrarVendaHistorica({
					nome: `Venda histórica E2E ${i}`,
					total: 100 + i,
					data_venda: dia,
					cliente_id: null,
					forma_pagamento: "PIX",
				});
			}

			// Uma venda com 40 itens: o detalhe dela é o modal alto do teste do Modal.
			const variacoes = Array.from({ length: 40 }, (_, i) => ({
				sku: `ROLAGEM-${i}`,
				preco: 7.77,
				preco_custo: 1,
				quantidade_estoque: 5,
				atributos: [{ chave: "Tamanho", valor: `T${i}` }],
			}));
			await window.api.salvarProduto({ nome: "Produto Rolagem E2E", variacoes });
			const produtos = await window.api.listarProdutosDetalhados(false);
			const produto = produtos.find(
				(p: { nome: string }) => p.nome === "Produto Rolagem E2E",
			);
			await window.api.abrirCaixa(0);
			await window.api.finalizarVenda({
				itens: produto.variacoes.map((v: { variacao_id: number }) => ({
					variacao_id: v.variacao_id,
					quantidade: 1,
					preco_unitario: 7.77,
				})),
				total: 7.77 * 40,
				desconto: 0,
				forma_pagamento: "Dinheiro",
				valor_recebido: 7.77 * 40,
			});
		});
	});

	test.afterAll(async () => {
		await electronApp?.close();
		fs.rmSync(userDataDir, { recursive: true, force: true });
	});

	test("Faturamento por dia: teto fixo, rolagem interna sem barra e cabeçalho fixo", async () => {
		await window.locator("aside").getByTitle("Relatórios", { exact: true }).click();
		await window.getByRole("button", { name: "Período todo", exact: true }).click();
		await expect(regiaoPorDia()).toBeVisible();

		const m = await regiaoPorDia().evaluate((el) => ({
			altura: el.getBoundingClientRect().height,
			clientHeight: el.clientHeight,
			scrollHeight: el.scrollHeight,
			barraVertical: el.offsetWidth - el.clientWidth,
			barraHorizontal: el.offsetHeight - el.clientHeight,
			linhas: el.querySelectorAll("tbody tr").length,
		}));
		expect(m.linhas).toBeGreaterThanOrEqual(120);
		expect(m.altura).toBeLessThanOrEqual((await tetoMd()) + 1);
		expect(m.scrollHeight).toBeGreaterThan(m.clientHeight);
		// Rola, mas sem barra visível (nada de largura/altura reservada pra ela).
		expect(m.barraVertical).toBe(0);
		expect(m.barraHorizontal).toBe(0);

		// Cabeçalho sticky: depois de rolar, o `th` continua colado no topo da
		// região enquanto as linhas passaram por baixo dele.
		await regiaoPorDia().evaluate((el) => {
			el.scrollTop = 400;
		});
		const depois = await regiaoPorDia().evaluate((el) => {
			const topo = el.getBoundingClientRect().top;
			const th = el.querySelector("thead th") as HTMLElement;
			const primeiraLinha = el.querySelector("tbody tr td") as HTMLElement;
			return {
				topoDoTh: th.getBoundingClientRect().top - topo,
				primeiraLinhaAcima: primeiraLinha.getBoundingClientRect().bottom - topo,
			};
		});
		expect(Math.abs(depois.topoDoTh)).toBeLessThanOrEqual(1);
		expect(depois.primeiraLinhaAcima).toBeLessThan(1);
	});

	test("degradê do rodapé só enquanto há mais conteúdo abaixo", async () => {
		await regiaoPorDia().evaluate((el) => {
			el.scrollTop = 0;
		});
		await expect(regiaoPorDia()).toHaveAttribute("data-mais-abaixo", "true");
		await regiaoPorDia().evaluate((el) => {
			el.scrollTop = el.scrollHeight;
		});
		await expect(regiaoPorDia()).toHaveAttribute("data-mais-abaixo", "false");
	});

	test("na impressão o teto e a máscara somem (nada sai cortado)", async () => {
		await window.emulateMedia({ media: "print" });
		try {
			// Na impressão `body * { visibility: hidden }` (só #print-area aparece),
			// então o filtro `:visible` deixaria de achar a região.
			const estilo = await window
				.getByTestId("rolagem-faturamento-por-dia")
				.evaluate((el) => {
					const css = getComputedStyle(el);
					return { maxHeight: css.maxHeight, overflowY: css.overflowY };
				});
			expect(estilo.maxHeight).toBe("none");
			expect(estilo.overflowY).toBe("visible");
		} finally {
			await window.emulateMedia({ media: "screen" });
		}
	});

	test("janela baixa (640 de altura): o teto encolhe junto, e o Modal alto mantém topo e botão de fechar à vista", async () => {
		await electronApp.evaluate(({ BrowserWindow }) => {
			const janela = BrowserWindow.getAllWindows()[0];
			janela.unmaximize();
			janela.setSize(1280, 640);
		});
		await expect
			.poll(() => window.evaluate(() => window.innerHeight))
			.toBeLessThan(700);

		// 1) o card do relatório segue a fração da janela (55dvh < 24rem aqui)
		const altura = await regiaoPorDia().evaluate(
			(el) => el.getBoundingClientRect().height,
		);
		expect(altura).toBeLessThanOrEqual((await tetoMd()) + 1);
		expect(await tetoMd()).toBeLessThan(24 * 16);

		// 2) Modal: detalhe da venda de 40 itens, mais alto que a janela
		await window.getByRole("button", { name: "Vendas", exact: true }).and(visible()).click();
		const linha = window.locator("tr").filter({ hasText: "310,80" }).and(visible());
		await linha.first().click();
		await window
			.getByRole("button", { name: "Ver detalhes completos" })
			.and(visible())
			.click();

		const modal = window.locator(".modal > .relative");
		await expect(modal).toBeVisible();
		const m = await modal.evaluate((caixa) => {
			const rolagem = caixa.querySelector(":scope > .scroll-area") as HTMLElement;
			const fechar = caixa.querySelector(":scope > button") as HTMLElement;
			const r = caixa.getBoundingClientRect();
			return {
				janela: window.innerHeight,
				topo: r.top,
				base: r.bottom,
				fecharTopo: fechar.getBoundingClientRect().top,
				rolagemOverflow: rolagem.scrollHeight - rolagem.clientHeight,
			};
		});
		expect(m.base - m.topo).toBeLessThanOrEqual(m.janela - 47);
		expect(m.topo).toBeGreaterThanOrEqual(0);
		expect(m.fecharTopo).toBeGreaterThanOrEqual(0);
		// o conteúdo que não coube rola dentro do modal, em vez de vazar
		expect(m.rolagemOverflow).toBeGreaterThan(0);

		await window.keyboard.press("Escape");
		await expect(modal).toBeHidden();
	});
});
