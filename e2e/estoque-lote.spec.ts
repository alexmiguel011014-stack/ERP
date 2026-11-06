import { _electron as electron, expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import type { ElectronApplication, Locator, Page } from "playwright-core";

const ROOT = path.join(__dirname, "..");
const CHAVE_ITENS = "estoque_reposicao_itens";
const CHAVE_OBSERVACAO = "estoque_reposicao_observacao";
const CHAVE_SENTINELA = "s34.17-preservar";

test.describe("Rascunho e seletor de estoque em lote", () => {
	let electronApp: ElectronApplication;
	let window: Page;
	let userDataDir: string;
	let skuA: string;
	let skuB: string;
	let skuInativo: string;
	let skuColisaoA: string;
	let skuColisaoB: string;
	let codigoA: string;
	let codigoB: string;
	let codigoColisao: string;
	let nomeA: string;
	let nomeB: string;
	let nomeInativo: string;
	let nomeColisaoA: string;
	let nomeColisaoB: string;
	let produtoInativoId: number;
	let variacaoInativaId: number;
	let variacaoAId: number;

	function visible(): Locator {
		return window.locator(":visible");
	}

	function listaEstoque(): Locator {
		return window.getByRole("region", { name: "Lista completa do estoque", exact: true }).and(visible());
	}

	function dialogLote(): Locator {
		return window.getByRole("dialog", { name: "Entrada em lote", exact: true }).and(visible());
	}

	async function iniciarElectron() {
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
	}

	async function abrirEstoque() {
		await window.getByRole("link", { name: "Estoque", exact: true }).and(visible()).click();
		const lista = listaEstoque();
		await expect(lista).toBeVisible();
		await lista.getByRole("button", { name: "Todos", exact: true }).click();
		await lista.getByPlaceholder("Buscar por nome, SKU, código de barras ou ID...").fill("");
		await lista.getByRole("button", { name: "Atualizar lista", exact: true }).click();
		await expect(lista.getByRole("status")).toHaveText("Lista atualizada");
		return lista;
	}

	async function abrirLote() {
		const dialog = dialogLote();
		if (!(await dialog.isVisible())) {
			await window.getByRole("button", { name: "Entrada em lote", exact: true }).and(visible()).click();
		}
		await expect(dialog).toBeVisible();
		return dialog;
	}

	async function criarProduto(nome: string, sku: string, codigo_barras: string, estoque: number, custo: number) {
		await window.evaluate(async ({ nome, sku, codigo_barras, estoque, custo }) => {
			await window.api.salvarProduto({
				nome,
				variacoes: [{ sku, codigo_barras, preco: 100, preco_custo: custo, quantidade_estoque: estoque, estoque_minimo: 1, atributos: [{ chave: "Tamanho", valor: "A1" }] }],
			});
		}, { nome, sku, codigo_barras, estoque, custo });
	}

	async function selecionar(dialog: Locator, termo: string, sku: string, porTeclado = false) {
		const campo = dialog.locator('input[role="combobox"]');
		await campo.fill(termo);
		const opcao = dialog.getByRole("option", { name: new RegExp(`SKU: ${sku}`) });
		await expect(opcao).toBeVisible();
		if (porTeclado) await campo.press("Enter");
		else await opcao.click();
		await expect(dialog.getByText(new RegExp(`SKU: ${sku} \\| Estoque atual`))).toBeVisible();
	}

	async function adicionar(dialog: Locator, sku: string, quantidade: number, custo: string | null, termo = sku, quantidadeEsperada = quantidade) {
		await selecionar(dialog, termo, sku);
		await dialog.locator('input[type="number"]').fill(String(quantidade));
		const campoCusto = dialog.locator('input[inputmode="decimal"]');
		if (custo !== null) await campoCusto.fill(custo);
		await dialog.getByRole("button", { name: "Adicionar à reposição", exact: true }).click();
		await expect(dialog.getByText(new RegExp(`SKU: ${sku} \\| Qtd: ${quantidadeEsperada}`))).toBeVisible();
	}

	async function rascunho() {
		return window.evaluate(() => ({
			itens: JSON.parse(window.localStorage.getItem("estoque_reposicao_itens") ?? "[]"),
			observacao: JSON.parse(window.localStorage.getItem("estoque_reposicao_observacao") ?? '""'),
			sentinela: window.localStorage.getItem("s34.17-preservar"),
		}));
	}

	async function esperarRascunhoVazio() {
		await expect.poll(async () => {
			const atual = await rascunho();
			return [atual.itens.length, atual.observacao, atual.sentinela];
		}).toEqual([0, "", JSON.stringify("nao-apagar")]);
	}

	test.beforeAll(async () => {
		userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-e2e-estoque-lote-"));
		await iniciarElectron();
		const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
		skuA = `LOTE-A-${sufixo}`;
		skuB = `LOTE-B-${sufixo}`;
		skuInativo = `LOTE-OFF-${sufixo}`;
		skuColisaoA = `LOTE-COL-A-${sufixo}`;
		skuColisaoB = `LOTE-COL-B-${sufixo}`;
		codigoA = `EAN-A-${sufixo}`;
		codigoB = `EAN-B-${sufixo}`;
		codigoColisao = `EAN-COL-${sufixo}`;
		nomeA = `Kimono lote A ${sufixo}`;
		nomeB = `Faixa lote B ${sufixo}`;
		nomeInativo = `Produto lote inativo ${sufixo}`;
		nomeColisaoA = `Produto colisão A ${sufixo}`;
		nomeColisaoB = `Produto colisão B ${sufixo}`;
		await criarProduto(nomeA, skuA, codigoA, 10, 50);
		await criarProduto(nomeB, skuB, codigoB, 6, 20);
		await criarProduto(nomeInativo, skuInativo, `EAN-OFF-${sufixo}`, 9, 30);
		await criarProduto(nomeColisaoA, skuColisaoA, codigoColisao, 4, 15);
		await criarProduto(nomeColisaoB, skuColisaoB, codigoColisao, 5, 18);
		const ids = await window.evaluate(async (sku) => {
			const produto = await window.api.buscarSKU(sku);
			return { produto_id: produto.produto_id, variacao_id: produto.id };
		}, skuInativo);
		produtoInativoId = ids.produto_id;
		variacaoInativaId = ids.variacao_id;
		variacaoAId = await window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).id, skuA);
	});

	test.afterAll(async () => {
		try {
			if (electronApp) await electronApp.close();
		} finally {
			if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
		}
	});

	test("rascunho legado sobrevive a fechar, reload, ações unitárias, erro e reinício do app", async () => {
		const legado = [{
			variacao_id: variacaoAId,
			nome: nomeA,
			detalhes: "Tamanho: A1",
			sku: skuA,
			quantidade: 2,
			custo_unitario: null,
		}];
		await window.evaluate(({ itens, observacao }) => {
			window.localStorage.setItem("estoque_reposicao_itens", JSON.stringify(itens));
			window.localStorage.setItem("estoque_reposicao_observacao", JSON.stringify(observacao));
			window.localStorage.setItem("s34.17-preservar", JSON.stringify("nao-apagar"));
		}, { itens: legado, observacao: "Rascunho legado isolado" });
		await window.reload();
		await window.waitForLoadState("domcontentloaded");
		const lista = await abrirEstoque();
		let dialog = await abrirLote();
		await expect(dialog.getByText(new RegExp(`SKU: ${skuA} \\| Qtd: 2`))).toBeVisible();
		await expect(dialog.getByPlaceholder("Ex: NF 1234, reposição semanal...")).toHaveValue("Rascunho legado isolado");
		const original = await rascunho();
		expect(original.itens).toEqual(legado);

		await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
		const linhaB = lista.getByRole("row", { name: new RegExp(`^${skuB}(?:\\s|$)`) });
		await expect(linhaB).toBeVisible();
		await linhaB.getByRole("button", { name: `Adicionar estoque para ${nomeB}, SKU ${skuB}` }).click();
		const entrada = window.getByRole("dialog", { name: "Adicionar estoque", exact: true }).and(visible());
		await entrada.getByLabel("Quantidade recebida").fill("1");
		await entrada.getByRole("button", { name: "Registrar entrada individual", exact: true }).click();
		await entrada.getByRole("group", { name: "Confirmar entrada individual" }).getByRole("button", { name: "Confirmar entrada", exact: true }).click();
		await expect(entrada).toHaveCount(0);
		expect(await rascunho()).toEqual(original);
		await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).quantidade_estoque, skuB)).toBe(7);

		await linhaB.getByRole("button", { name: `Retirar estoque para ${nomeB}, SKU ${skuB}` }).click();
		const saida = window.getByRole("dialog", { name: "Retirar estoque", exact: true }).and(visible());
		await saida.getByLabel("Quantidade a dar baixa").fill("1");
		await saida.getByLabel("Motivo").selectOption("Perda");
		await expect(saida.getByRole("button", { name: "Confirmar Baixa", exact: true })).toBeVisible();
		await saida.getByRole("button", { name: "Confirmar Baixa", exact: true }).click();
		await expect(saida).toHaveCount(0);
		expect(await rascunho()).toEqual(original);
		await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).quantidade_estoque, skuB)).toBe(6);

		await electronApp.evaluate(({ ipcMain }) => {
			type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
			type State = { original: Handler; chamadas: number };
			const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers;
			const original = handlers.get("registrar-entrada-estoque");
			if (!original) throw new Error("Handler de entrada de estoque não encontrado");
			const state: State = { original, chamadas: 0 };
			(globalThis as typeof globalThis & { testeFalhaLote?: State }).testeFalhaLote = state;
			ipcMain.removeHandler("registrar-entrada-estoque");
			ipcMain.handle("registrar-entrada-estoque", async () => {
				state.chamadas += 1;
				throw new Error("Falha simulada de lote");
			});
		});
		try {
			dialog = await abrirLote();
			await dialog.getByRole("button", { name: "Confirmar Reposição", exact: true }).click();
			await dialog.getByRole("group", { name: "Confirmar reposição" }).getByRole("button", { name: "Confirmar entrada", exact: true }).click();
			await expect(dialog.getByRole("alert")).toContainText("Falha simulada de lote");
			await expect.poll(async () => (await rascunho()).itens).toEqual(legado);
			await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).quantidade_estoque, skuA)).toBe(10);
			await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
			await window.reload();
			await window.waitForLoadState("domcontentloaded");
			await expect(listaEstoque()).toBeVisible();
			dialog = await abrirLote();
			await expect(dialog.getByText(new RegExp(`SKU: ${skuA} \\| Qtd: 2`))).toBeVisible();
			await expect.poll(async () => (await rascunho()).observacao).toBe("Rascunho legado isolado");
		} finally {
			await electronApp.evaluate(({ ipcMain }) => {
				type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
				const state = (globalThis as typeof globalThis & { testeFalhaLote?: { original: Handler } }).testeFalhaLote;
				if (state) {
					ipcMain.removeHandler("registrar-entrada-estoque");
					ipcMain.handle("registrar-entrada-estoque", (event, ...args) => state.original(event, ...args));
				}
				delete (globalThis as typeof globalThis & { testeFalhaLote?: unknown }).testeFalhaLote;
			});
		}
		await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
		await electronApp.close();
		await iniciarElectron();
		await expect.poll(async () => (await window.evaluate(() => window.api.getDBPath()))).toBe(path.join(userDataDir, "erp_housekimono.sqlite"));
		await window.getByRole("link", { name: "Estoque", exact: true }).and(visible()).click();
		dialog = await abrirLote();
		await expect(dialog.getByText(new RegExp(`SKU: ${skuA} \\| Qtd: 2`))).toBeVisible();
		await expect(dialog.getByPlaceholder("Ex: NF 1234, reposição semanal...")).toHaveValue("Rascunho legado isolado");
		expect(await rascunho()).toEqual(original);
		await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
	});

	test("custos, duplicidade e descarte preservam apenas o rascunho correto", async () => {
		const lista = await abrirEstoque();
		let dialog = await abrirLote();
		await dialog.getByRole("button", { name: "Limpar", exact: true }).click();
		await dialog.getByRole("group", { name: "Descartar rascunho de lote" }).getByRole("button", { name: "Descartar rascunho", exact: true }).click();
		await esperarRascunhoVazio();

		await adicionar(dialog, skuA, 2, null);
		await adicionar(dialog, skuA, 3, "0", skuA, 5);
		await expect(dialog.getByText(new RegExp(`SKU: ${skuA} \\| Qtd: 5`))).toBeVisible();
		await expect(dialog.getByText("Custo: R$ 0,00", { exact: false })).toBeVisible();
		await adicionar(dialog, skuB, 1, null);
		await expect(dialog.getByText(new RegExp(`SKU: ${skuB} \\| Qtd: 1 \\| Custo: não informado`))).toBeVisible();
		const removerB = dialog.getByText(new RegExp(`SKU: ${skuB} \\| Qtd: 1`)).locator("xpath=../..").getByRole("button", { name: "Remover", exact: true });
		await removerB.click();
		await expect(dialog.getByText(new RegExp(`SKU: ${skuB} \\| Qtd: 1`))).toHaveCount(0);
		const salvoAntes = await rascunho();
		expect(salvoAntes.itens).toHaveLength(1);
		expect(salvoAntes.itens[0]).toMatchObject({ sku: skuA, quantidade: 5, custo_unitario: 0 });
		expect(salvoAntes.sentinela).toBe(JSON.stringify("nao-apagar"));

		await dialog.getByPlaceholder("Ex: NF 1234, reposição semanal...").fill("S34.17-lote-sucesso");
		const confirmarBotao = dialog.getByRole("button", { name: "Confirmar Reposição", exact: true });
		await confirmarBotao.click();
		const confirmacao = dialog.getByRole("group", { name: "Confirmar reposição" });
		await expect(confirmacao).toBeVisible();
		await confirmacao.getByRole("button", { name: "Voltar", exact: true }).click();
		await expect(dialog.getByText(new RegExp(`SKU: ${skuA} \\| Qtd: 5`))).toBeVisible();
		await expect(confirmarBotao).toBeFocused();
		await confirmarBotao.click();
		await dialog.getByRole("group", { name: "Confirmar reposição" }).getByRole("button", { name: "Confirmar entrada", exact: true }).click();
		await expect(dialog).toHaveCount(0);
		await expect.poll(async () => (await rascunho()).itens).toEqual([]);
		await esperarRascunhoVazio();
		const aposLote = await window.evaluate(async (sku) => window.api.buscarSKU(sku), skuA);
		expect(aposLote.quantidade_estoque).toBe(15);
		expect(aposLote.preco_custo).toBe(33.33);
		const movimentoLote = await window.evaluate(async (sku) =>
			(await window.api.getMovimentacoesEstoque(100)).filter((movimento: { sku: string; observacao: string; quantidade: number; custo_unitario: number | null }) =>
				movimento.sku === sku && movimento.observacao === "S34.17-lote-sucesso" && movimento.quantidade === 5 && movimento.custo_unitario === 0,
		), skuA);
		expect(movimentoLote).toHaveLength(1);
		await expect(window.getByRole("status").filter({ hasText: "Rascunho pendente" })).toHaveCount(0);
		await expect(lista).toBeVisible();
	});

	test("variação inativa aborta o lote inteiro e permite nova tentativa após removê-la", async () => {
		const saldoAntes = await window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).quantidade_estoque, skuA);
		const dialog = await abrirLote();
		const nota = `S34.17-inativo-${Date.now()}`;
		await adicionar(dialog, skuA, 1, null);
		await adicionar(dialog, skuInativo, 2, null);
		await dialog.getByPlaceholder("Ex: NF 1234, reposição semanal...").fill(nota);
		const movimentosAntes = await window.evaluate(async (sku) =>
			(await window.api.getMovimentacoesEstoque(100)).filter((item: { sku: string; observacao: string }) => item.sku === sku && item.observacao.includes("S34.17-inativo-")), skuA);
		await window.evaluate((id) => window.api.removerProduto(id), produtoInativoId);
		await dialog.getByRole("button", { name: "Confirmar Reposição", exact: true }).click();
		await dialog.getByRole("group", { name: "Confirmar reposição" }).getByRole("button", { name: "Confirmar entrada", exact: true }).click();
		await expect(dialog.getByRole("alert").first()).toContainText(`variação ${variacaoInativaId}`);
		await expect(dialog.getByText("Produto inativo. Remova este item para registrar os demais.", { exact: true })).toBeVisible();
		await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).quantidade_estoque, skuA)).toBe(saldoAntes);
		const movimentosFalha = await window.evaluate(async ({ sku, nota }) =>
			(await window.api.getMovimentacoesEstoque(100)).filter((item: { sku: string; observacao: string }) => item.sku === sku && item.observacao === nota), { sku: skuA, nota });
		expect(movimentosFalha).toHaveLength(0);
		expect(movimentosAntes).toHaveLength(0);
		const persistido = await rascunho();
		expect(persistido.itens).toHaveLength(2);
		expect(persistido.observacao).toBe(nota);
		const linhaInativa = dialog.getByText(new RegExp(`SKU: ${skuInativo} \\| Qtd: 2`)).locator("xpath=../..");
		await linhaInativa.getByRole("button", { name: "Remover", exact: true }).click();
		await expect(dialog.getByText("Produto inativo. Remova este item para registrar os demais.", { exact: true })).toHaveCount(0);
		await dialog.getByRole("button", { name: "Confirmar Reposição", exact: true }).click();
		await dialog.getByRole("group", { name: "Confirmar reposição" }).getByRole("button", { name: "Confirmar entrada", exact: true }).click();
		await expect(dialog).toHaveCount(0);
		await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).quantidade_estoque, skuA)).toBe(saldoAntes + 1);
		const movimentosFinal = await window.evaluate(async ({ sku, nota }) =>
			(await window.api.getMovimentacoesEstoque(100)).filter((item: { sku: string; observacao: string; quantidade: number }) => item.sku === sku && item.observacao === nota && item.quantidade === 1), { sku: skuA, nota });
		expect(movimentosFinal).toHaveLength(1);
		await esperarRascunhoVazio();
	});

	test("scanner resolve resultados únicos, colisões e respostas atrasadas pelo teclado", async () => {
		await abrirEstoque();
		let dialog = await abrirLote();
		let campo = dialog.locator('input[role="combobox"]');
		await campo.fill(codigoA);
		await campo.press("Enter");
		await expect(dialog.getByText(new RegExp(`SKU: ${skuA} \\| Estoque atual`))).toBeVisible();
		await campo.fill(codigoB);
		const opcaoB = dialog.getByRole("option", { name: new RegExp(`SKU: ${skuB}`) });
		await expect(opcaoB).toBeVisible();
		await campo.press("Enter");
		await expect(dialog.getByText(new RegExp(`SKU: ${skuB} \\| Estoque atual`))).toBeVisible();

		await electronApp.evaluate(({ ipcMain }) => {
			type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
			type State = { original: Handler; chamadas: number; liberarPrimeira?: () => void; primeiraTerminou: boolean };
			const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers;
			const original = handlers.get("buscar-produtos-termo");
			if (!original) throw new Error("Handler de busca de produtos não encontrado");
			const state: State = { original, chamadas: 0, primeiraTerminou: false };
			(globalThis as typeof globalThis & { testeBuscaAtrasada?: State }).testeBuscaAtrasada = state;
			ipcMain.removeHandler("buscar-produtos-termo");
			ipcMain.handle("buscar-produtos-termo", async (event, ...args) => {
				state.chamadas += 1;
				if (state.chamadas === 1) {
					await new Promise<void>((resolve) => { state.liberarPrimeira = resolve; });
					state.primeiraTerminou = true;
				}
				return state.original(event, ...args);
			});
		});
		try {
			await campo.fill(codigoA);
			await expect.poll(() => electronApp.evaluate(() => (globalThis as typeof globalThis & { testeBuscaAtrasada?: { chamadas: number } }).testeBuscaAtrasada?.chamadas)).toBe(1);
			await campo.fill(codigoB);
			await expect(dialog.getByRole("option", { name: new RegExp(`SKU: ${skuB}`) })).toBeVisible();
			await electronApp.evaluate(() => (globalThis as typeof globalThis & { testeBuscaAtrasada?: { liberarPrimeira?: () => void } }).testeBuscaAtrasada?.liberarPrimeira?.());
			await expect.poll(() => electronApp.evaluate(() => (globalThis as typeof globalThis & { testeBuscaAtrasada?: { primeiraTerminou: boolean } }).testeBuscaAtrasada?.primeiraTerminou)).toBe(true);
			await expect(dialog.getByRole("option", { name: new RegExp(`SKU: ${skuB}`) })).toBeVisible();
		} finally {
			await electronApp.evaluate(({ ipcMain }) => {
				type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
				const state = (globalThis as typeof globalThis & { testeBuscaAtrasada?: { original: Handler; liberarPrimeira?: () => void } }).testeBuscaAtrasada;
				state?.liberarPrimeira?.();
				if (state) {
					ipcMain.removeHandler("buscar-produtos-termo");
					ipcMain.handle("buscar-produtos-termo", (event, ...args) => state.original(event, ...args));
				}
				delete (globalThis as typeof globalThis & { testeBuscaAtrasada?: unknown }).testeBuscaAtrasada;
			});
		}
		await campo.press("Enter");
		await expect(dialog.getByText(new RegExp(`SKU: ${skuB} \\| Estoque atual`))).toBeVisible();

		await campo.fill(codigoColisao);
		await campo.press("Enter");
		const opcoesColisao = dialog.getByRole("option");
		await expect(opcoesColisao).toHaveCount(2);
		await campo.press("Enter");
		await expect(opcoesColisao).toHaveCount(2);
		await expect(dialog.getByText(new RegExp(`SKU: ${skuColisaoA} \\| Estoque atual`))).toHaveCount(0);
		await campo.press("ArrowDown");
		await expect(opcoesColisao.first()).toHaveAttribute("aria-selected", "true");
		await expect(campo).toHaveAttribute("aria-activedescendant", await opcoesColisao.first().getAttribute("id"));
		const skuPrimeiro = (await opcoesColisao.first().innerText()).match(/SKU: (\S+)/)?.[1];
		expect([skuColisaoA, skuColisaoB]).toContain(skuPrimeiro);
		await campo.press("Enter");
		await expect(opcoesColisao).toHaveCount(0);
		await expect(dialog.getByText(new RegExp(`SKU: ${skuPrimeiro} \\| Estoque atual`))).toBeVisible();

		await campo.fill(codigoColisao);
		await expect(opcoesColisao).toHaveCount(2);
		await campo.press("Escape");
		await expect(opcoesColisao).toHaveCount(0);
		await expect(dialog).toBeVisible();
		await campo.press("Escape");
		await expect(dialog).toHaveCount(0);
	});
});
