import { _electron as electron, expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import type { ElectronApplication, Locator, Page } from "playwright-core";

const ROOT = path.join(__dirname, "..");

// GOALS 30: botão "Ordenar" + cabeçalhos clicáveis + coluna "Modificado em"
// nas listas de Produtos e Categorias, rodando contra o Electron de verdade
// (a data vem dos triggers do banco, não de mock).
test.describe.configure({ mode: "serial" });

test.describe("Listas de Produtos e Categorias: ordenação", () => {
	let electronApp: ElectronApplication;
	let window: Page;
	let userDataDir: string;

	// O sistema de abas mantém telas já abertas montadas e escondidas (ver
	// e2e/produtos-cadastro.spec.ts): `.and(visible())` restringe ao que está
	// realmente na tela.
	function visible(): Locator {
		return window.locator(":visible");
	}

	const esperar = (ms: number) => window.waitForTimeout(ms);

	async function abrirPaginaProdutos() {
		await window
			.locator("aside")
			.getByTitle("Produtos", { exact: true })
			.click();
		await expect(
			window.getByPlaceholder("Ex: Quimono Trançado").and(visible()),
		).toBeVisible();
	}

	async function abrirLista(botao: string, titulo: string) {
		await window.getByRole("button", { name: botao }).and(visible()).click();
		await expect(window.getByRole("heading", { name: titulo })).toBeVisible();
	}

	const linhas = () => window.locator("div.modal table tbody tr");
	const celulas = (n: number) => linhas().locator(`td:nth-child(${n})`);

	async function escolherOrdem(rotulo: string) {
		await window.getByRole("button", { name: "Ordenar" }).and(visible()).click();
		await window.getByRole("menuitemradio", { name: rotulo }).click();
	}

	test.beforeAll(async () => {
		userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-e2e-ordenacao-"));
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

		// Três produtos criados com ~30 ms de intervalo; depois o primeiro é
		// editado — então "mais recente" = Alfa, Charlie, Bravo.
		await window.evaluate(async () => {
			const espera = () => new Promise((r) => setTimeout(r, 30));
			const criar = async (nome: string, sku: string) => {
				const r = await window.api.salvarProduto({
					nome,
					variacoes: [
						{
							sku,
							preco: 10,
							preco_custo: 0,
							quantidade_estoque: 1,
							atributos: [{ chave: "Tamanho", valor: "Único" }],
						},
					],
				});
				await espera();
				return r.produtoId as number;
			};
			const alfa = await criar("Alfa Kimono", "ORD-ALFA");
			await criar("Bravo Rashguard", "ORD-BRAVO");
			await criar("Charlie Faixa", "ORD-CHARLIE");
			await window.api.atualizarProduto(alfa, {
				nome: "Alfa Kimono",
				categoriasSelecionadas: [],
				variacoes: [],
			});

			const grupoAlfa = await window.api.salvarCategoria("Alfa Grupo", null);
			await espera();
			await window.api.salvarCategoria("Beta Atributo", grupoAlfa.id);
			await espera();
			const zebra = await window.api.salvarCategoria("Zebra Grupo", null);
			await espera();
			await window.api.atualizarCategoria(zebra.id, {
				nome: "Zebra Grupo",
				categoriaPaiId: null,
			});
		});
		await abrirPaginaProdutos();
	}, { timeout: 90_000 });

	test.afterAll(async () => {
		await electronApp.close();
		fs.rmSync(userDataDir, { recursive: true, force: true });
	});

	test("Lista de Produtos: ordem padrão A→Z e as quatro opções do menu Ordenar", async () => {
		await abrirLista("Lista de Produtos", "Lista de Produtos");
		const nomes = celulas(3);

		await expect(nomes).toHaveText([
			"Alfa Kimono",
			"Bravo Rashguard",
			"Charlie Faixa",
		]);

		await escolherOrdem("Modificação (mais recente)");
		await expect(nomes).toHaveText([
			"Alfa Kimono",
			"Charlie Faixa",
			"Bravo Rashguard",
		]);

		await escolherOrdem("Modificação (mais antiga)");
		await expect(nomes).toHaveText([
			"Bravo Rashguard",
			"Charlie Faixa",
			"Alfa Kimono",
		]);

		await escolherOrdem("Nome (Z → A)");
		await expect(nomes).toHaveText([
			"Charlie Faixa",
			"Bravo Rashguard",
			"Alfa Kimono",
		]);

		await escolherOrdem("Nome (A → Z)");
		await expect(nomes).toHaveText([
			"Alfa Kimono",
			"Bravo Rashguard",
			"Charlie Faixa",
		]);
	});

	test("a coluna Modificado em mostra data e hora formatadas (vindas do trigger)", async () => {
		await expect(celulas(5)).toHaveText([
			/\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}/,
			/\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}/,
			/\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}/,
		]);
	});

	test("clicar no cabeçalho alterna a direção e marca aria-sort (estilo Explorador)", async () => {
		const modificado = window.getByRole("columnheader", {
			name: /Modificado em/,
		});
		const produto = window.getByRole("columnheader", { name: /^Produto/ });

		// Coluna de data: primeiro clique = mais recente primeiro.
		await modificado.getByRole("button").click();
		await expect(modificado).toHaveAttribute("aria-sort", "descending");
		await expect(celulas(3)).toHaveText([
			"Alfa Kimono",
			"Charlie Faixa",
			"Bravo Rashguard",
		]);
		await modificado.getByRole("button").click();
		await expect(modificado).toHaveAttribute("aria-sort", "ascending");
		await expect(celulas(3)).toHaveText([
			"Bravo Rashguard",
			"Charlie Faixa",
			"Alfa Kimono",
		]);

		// Coluna de nome: primeiro clique = A→Z, segundo inverte.
		await produto.getByRole("button").click();
		await expect(produto).toHaveAttribute("aria-sort", "ascending");
		await expect(modificado).toHaveAttribute("aria-sort", "none");
		await produto.getByRole("button").click();
		await expect(produto).toHaveAttribute("aria-sort", "descending");
		await expect(celulas(3)).toHaveText([
			"Charlie Faixa",
			"Bravo Rashguard",
			"Alfa Kimono",
		]);
	});

	test("Esc dentro do menu Ordenar fecha só o menu, não a lista inteira", async () => {
		await window.getByRole("button", { name: "Ordenar" }).and(visible()).click();
		const menu = window.getByRole("menu", { name: "Ordenar por" });
		await expect(menu).toBeVisible();

		await window.keyboard.press("Escape");
		await expect(menu).toBeHidden();
		await expect(
			window.getByRole("heading", { name: "Lista de Produtos" }),
		).toBeVisible();
	});

	test("a ordem escolhida é lembrada ao fechar/reabrir e depois de recarregar a página", async () => {
		await escolherOrdem("Modificação (mais recente)");
		await expect(celulas(3).first()).toHaveText("Alfa Kimono");

		// Fecha a lista (Esc, com o menu já fechado) e reabre.
		await window.keyboard.press("Escape");
		await expect(
			window.getByRole("heading", { name: "Lista de Produtos" }),
		).toBeHidden();
		await abrirLista("Lista de Produtos", "Lista de Produtos");
		await expect(celulas(3)).toHaveText([
			"Alfa Kimono",
			"Charlie Faixa",
			"Bravo Rashguard",
		]);

		// Reload da página inteira: a escolha vem do localStorage.
		// (A sessão vive no processo principal, então o reload continua logado.)
		await window.reload();
		await abrirPaginaProdutos();
		await abrirLista("Lista de Produtos", "Lista de Produtos");
		await expect(celulas(3)).toHaveText([
			"Alfa Kimono",
			"Charlie Faixa",
			"Bravo Rashguard",
		]);
		await window.keyboard.press("Escape");
	});

	test("Lista de Categorias: padrão (grupos primeiro) e ordenação por modificação", async () => {
		await abrirLista("Lista de Categorias", "Categorias Cadastradas");
		const nomes = celulas(2);

		// "Padrão": grupos A→Z, depois os atributos.
		await expect(nomes).toHaveText([
			/^Alfa Grupo/,
			/^Zebra Grupo/,
			/^Beta Atributo/,
		]);

		// Zebra foi renomeada por último; Beta criada depois de Alfa.
		await escolherOrdem("Modificação (mais recente)");
		await expect(nomes).toHaveText([
			/^Zebra Grupo/,
			/^Beta Atributo/,
			/^Alfa Grupo/,
		]);

		await escolherOrdem("Nome (Z → A)");
		await expect(nomes).toHaveText([
			/^Zebra Grupo/,
			/^Beta Atributo/,
			/^Alfa Grupo/,
		]);

		await escolherOrdem("Nome (A → Z)");
		await expect(nomes).toHaveText([
			/^Alfa Grupo/,
			/^Beta Atributo/,
			/^Zebra Grupo/,
		]);

		await expect(celulas(6)).toHaveText([
			/\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}/,
			/\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}/,
			/\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}/,
		]);

		await escolherOrdem("Padrão (grupos primeiro, depois A → Z)");
		await expect(nomes).toHaveText([
			/^Alfa Grupo/,
			/^Zebra Grupo/,
			/^Beta Atributo/,
		]);
	});
});
