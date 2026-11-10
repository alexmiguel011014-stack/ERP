import { _electron as electron, expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import type { ElectronApplication, Locator, Page } from "playwright-core";

const ROOT = path.join(__dirname, "..");

test.describe("Estoque workspace isolado", () => {
	let electronApp: ElectronApplication;
	let window: Page;
	let userDataDir: string;

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
		await lista.getByPlaceholder("Buscar por nome, SKU, código de barras ou ID...").fill("");
		return lista;
	}

	async function atualizarLista(lista: Locator) {
		await lista.getByRole("button", { name: "Atualizar lista", exact: true }).click();
		await expect(lista.getByRole("status")).toHaveText("Lista atualizada");
	}

	async function criarProduto(nome: string, variacoes: Array<{
		sku: string;
		preco: number;
		preco_custo: number;
		quantidade_estoque: number;
		estoque_minimo: number;
		atributos: Array<{ chave: string; valor: string }>;
	}>) {
		await window.evaluate(async ({ nome, variacoes }) => {
			await window.api.salvarProduto({ nome, variacoes });
		}, { nome, variacoes });
	}

	test.beforeAll(async () => {
		userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-e2e-estoque-workspace-"));
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
	});

	test.afterAll(async () => {
		try {
			if (electronApp) await electronApp.close();
		} finally {
			if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
		}
	});

	test("busca, filtros, mínimo e valores do estoque", async () => {
		const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
		const nome = `Produto workspace ${sufixo}`;
		const skuNormal = `WS-${sufixo}-NORMAL`;
		const skuBaixo = `WS-${sufixo}-BAIXO`;
		const skuNegativo = `WS-${sufixo}-NEG`;
		await criarProduto(nome, [
			{ sku: skuNormal, preco: 100, preco_custo: 12.5, quantidade_estoque: 8, estoque_minimo: 2, atributos: [{ chave: "Tamanho", valor: "A1" }] },
			{ sku: skuBaixo, preco: 100, preco_custo: 7.25, quantidade_estoque: 2, estoque_minimo: 2, atributos: [{ chave: "Tamanho", valor: "A2" }] },
			{ sku: skuNegativo, preco: 100, preco_custo: 5, quantidade_estoque: 0, estoque_minimo: 0, atributos: [{ chave: "Tamanho", valor: "A3" }] },
		]);
		const variacaoNegativa = await window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).id, skuNegativo);
		await electronApp.evaluate(({ app }, { variacaoId, userDataEsperado }) => {
			if (app.getPath("userData") !== userDataEsperado) throw new Error("O teste saiu do perfil temporário.");
			const conexao = process.mainModule.require("./database.js").getConexao();
			return new Promise<void>((resolve, reject) => {
				conexao.run("UPDATE Variacoes SET quantidade_estoque = -2 WHERE id = ?", [variacaoId], (erro: Error | null) => erro ? reject(erro) : resolve());
			});
		}, { variacaoId: variacaoNegativa, userDataEsperado: userDataDir });

		const lista = await abrirEstoque();
		await atualizarLista(lista);
		const busca = lista.getByPlaceholder("Buscar por nome, SKU, código de barras ou ID...");
		const linha = (sku: string) => lista.getByRole("row", { name: new RegExp(`^${sku}(?:\\s|$)`) });
		await busca.fill(nome.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
		await expect(lista.getByRole("row")).toHaveCount(4);
		await expect(linha(skuNormal)).toBeVisible();
		await expect(linha(skuBaixo)).toBeVisible();
		await expect(linha(skuNegativo)).toBeVisible();
		await expect(linha(skuNormal).getByText(/R\$\s?12,50/)).toBeVisible();
		await expect(linha(skuNormal).getByText(/R\$\s?100,00/)).toBeVisible();
		await expect(lista.getByText(/114,50/)).toBeVisible();

		for (const [filtro, esperado] of [["Normal", skuNormal], ["Baixo", skuBaixo], ["Negativo", skuNegativo]] as const) {
			await lista.getByRole("button", { name: filtro, exact: true }).click();
			await expect(lista.getByRole("row")).toHaveCount(2);
			await expect(linha(esperado)).toBeVisible();
		}
		await lista.getByRole("button", { name: "Todos", exact: true }).click();
		const minimo = lista.getByRole("spinbutton", { name: `Estoque mínimo de ${nome}, SKU ${skuNormal}` });
		await minimo.fill("8");
		await minimo.blur();
		await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).estoque_minimo, skuNormal)).toBe(8);
		await expect.poll(() => linha(skuNormal).getByText("Baixo", { exact: true }).count()).toBe(1);
		await busca.fill(`sem-resultado-${sufixo}`);
		await expect(lista.getByText("Nenhum item encontrado.", { exact: true })).toBeVisible();
	});

	test("entrada, baixa reservada e histórico mantêm os saldos corretos", async () => {
		const sufixo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
		const skuEntrada = `WS-IN-${sufixo}`;
		const skuSaida = `WS-OUT-${sufixo}`;
		const nomeEntrada = `Entrada workspace ${sufixo}`;
		const nomeSaida = `Saída workspace ${sufixo}`;
		await criarProduto(nomeEntrada, [{ sku: skuEntrada, preco: 100, preco_custo: 50, quantidade_estoque: 5, estoque_minimo: 1, atributos: [{ chave: "Unidade", valor: "Único" }] }]);
		await criarProduto(nomeSaida, [{ sku: skuSaida, preco: 100, preco_custo: 50, quantidade_estoque: 10, estoque_minimo: 1, atributos: [{ chave: "Unidade", valor: "Único" }] }]);
		const reserva = await window.evaluate(async ({ sku, sufixo }) => {
			const variacao = await window.api.buscarSKU(sku);
			return window.api.finalizarVenda({
				itens: [{ variacao_id: variacao.id, quantidade: 9, preco_unitario: 100 }],
				status: "orcamento", total: 900, request_id: `stock-workspace-${sufixo}`, observacao: "Reserva de teste isolado",
			});
		}, { sku: skuSaida, sufixo });
		expect(reserva.success).toBe(true);

		const lista = await abrirEstoque();
		await atualizarLista(lista);
		const entrada = lista.getByRole("row", { name: new RegExp(`^${skuEntrada}(?:\\s|$)`) });
		await expect(entrada).toBeVisible();
		await entrada.getByRole("button", { name: `Adicionar estoque para ${nomeEntrada}, SKU ${skuEntrada}` }).click();
		const dialogEntrada = window.getByRole("dialog", { name: "Adicionar estoque", exact: true }).and(visible());
		await dialogEntrada.getByLabel("Quantidade recebida").fill("2");
		await expect(dialogEntrada.getByText("Saldo estimado: 7")).toBeVisible();
		await dialogEntrada.getByRole("button", { name: "Registrar entrada individual", exact: true }).click();
		await dialogEntrada.getByRole("group", { name: "Confirmar entrada individual" }).getByRole("button", { name: "Confirmar entrada", exact: true }).click();
		await expect(dialogEntrada).toHaveCount(0);
		await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).quantidade_estoque, skuEntrada)).toBe(7);
		await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).preco_custo, skuEntrada)).toBe(50);
		await lista.getByRole("row", { name: new RegExp(`^${skuEntrada}(?:\\s|$)`) }).getByRole("button", { name: `Adicionar estoque para ${nomeEntrada}, SKU ${skuEntrada}` }).click();
		const entradaComCusto = window.getByRole("dialog", { name: "Adicionar estoque", exact: true }).and(visible());
		await entradaComCusto.getByLabel("Quantidade recebida").fill("1");
		await entradaComCusto.getByLabel("Custo unitário (R$)").fill("0");
		await entradaComCusto.getByRole("button", { name: "Registrar entrada individual", exact: true }).click();
		await entradaComCusto.getByRole("group", { name: "Confirmar entrada individual" }).getByRole("button", { name: "Confirmar entrada", exact: true }).click();
		await expect(entradaComCusto).toHaveCount(0);
		await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).quantidade_estoque, skuEntrada)).toBe(8);
		await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).preco_custo, skuEntrada)).toBe(43.75);
		const entradasComCusto = await window.evaluate(async (sku) =>
			(await window.api.getMovimentacoesEstoque(100)).filter((item: { sku: string; tipo: string; custo_unitario: number | null }) =>
				item.sku === sku && item.tipo === "entrada" && item.custo_unitario === 0,
		), skuEntrada);
		expect(entradasComCusto).toHaveLength(1);

		const saida = lista.getByRole("row", { name: new RegExp(`^${skuSaida}(?:\\s|$)`) });
		await expect(saida).toBeVisible();
		await electronApp.evaluate(({ ipcMain }) => {
			type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
			type State = { original: Handler; chamadas: number };
			const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers;
			const original = handlers.get("registrar-saida-estoque");
			if (!original) throw new Error("Handler de baixa não encontrado");
			const state: State = { original, chamadas: 0 };
			(globalThis as typeof globalThis & { testeBaixaUnicaEstoque?: State }).testeBaixaUnicaEstoque = state;
			ipcMain.removeHandler("registrar-saida-estoque");
			ipcMain.handle("registrar-saida-estoque", (event, ...args) => {
				state.chamadas += 1;
				return state.original(event, ...args);
			});
		});
		try {
			await saida.getByRole("button", { name: `Retirar estoque para ${nomeSaida}, SKU ${skuSaida}` }).click();
			const dialogSaida = window.getByRole("dialog", { name: "Retirar estoque", exact: true }).and(visible());
			await dialogSaida.getByLabel("Quantidade a dar baixa").fill("2");
			await expect(dialogSaida.getByText(/Saldo estimado: 8/)).toBeVisible();
			await expect(dialogSaida.getByRole("status")).toContainText("deixará parte dos orçamentos abertos sem cobertura");
			await dialogSaida.getByRole("button", { name: "Confirmar Baixa", exact: true }).click();
			const confirmarSaida = dialogSaida.getByRole("group", { name: "Confirmar baixa abaixo do reservado" }).getByRole("button", { name: "Registrar mesmo assim", exact: true });
			await confirmarSaida.evaluate((botao) => {
				const clique = () => botao.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				clique();
				clique();
			});
			await expect(dialogSaida).toHaveCount(0);
			await expect.poll(() => electronApp.evaluate(() => (globalThis as typeof globalThis & { testeBaixaUnicaEstoque?: { chamadas: number } }).testeBaixaUnicaEstoque?.chamadas)).toBe(1);
			await expect.poll(() => window.evaluate(async (sku) => {
				const produto = await window.api.buscarSKU(sku);
				return [produto.quantidade_estoque, produto.quantidade_reservada];
			}, skuSaida)).toEqual([8, 9]);
			await expect(window.getByText(/novo saldo \(8\).*reservado.*\(9\)/)).toBeVisible();
			const saidasRegistradas = await window.evaluate(async (codigo) =>
				(await window.api.getMovimentacoesEstoque(100)).filter((item: { sku: string; tipo: string; quantidade: number; observacao: string }) =>
					item.sku === codigo && item.tipo === "ajuste" && item.quantidade === -2 && item.observacao.includes("baixa de 2 un."),
			), skuSaida);
			expect(saidasRegistradas).toHaveLength(1);
		} finally {
			await electronApp.evaluate(({ ipcMain }) => {
				type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
				const state = (globalThis as typeof globalThis & { testeBaixaUnicaEstoque?: { original: Handler } }).testeBaixaUnicaEstoque;
				if (!state) return;
				ipcMain.removeHandler("registrar-saida-estoque");
				ipcMain.handle("registrar-saida-estoque", (event, ...args) => state.original(event, ...args));
				delete (globalThis as typeof globalThis & { testeBaixaUnicaEstoque?: unknown }).testeBaixaUnicaEstoque;
			});
		}
		await window.getByRole("button", { name: "Ver movimentações", exact: true }).click();
		const historico = window.getByRole("dialog", { name: "Últimas movimentações", exact: true }).and(visible());
		await expect(historico.getByText(new RegExp(nomeEntrada))).toHaveCount(2);
		await expect(historico.getByText(new RegExp(nomeSaida))).toBeVisible();
		await historico.getByRole("button", { name: "Fechar", exact: true }).click();
	});

	test("erro ao atualizar após entrada não repete a gravação", async () => {
		const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
		const sku = `WS-ONCE-${sufixo}`;
		const nome = `Escrita única ${sufixo}`;
		await criarProduto(nome, [{ sku, preco: 100, preco_custo: 20, quantidade_estoque: 1, estoque_minimo: 0, atributos: [{ chave: "Unidade", valor: "Único" }] }]);
		const lista = await abrirEstoque();
		await atualizarLista(lista);

		await electronApp.evaluate(({ ipcMain }) => {
			type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
			type State = { original: Handler; chamadas: number };
			const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers;
			const original = handlers.get("get-estoque-visao-geral");
			if (!original) throw new Error("Handler da visão geral não encontrado");
			const state: State = { original, chamadas: 0 };
			(globalThis as typeof globalThis & { testeFalhaAtualizacaoEstoque?: State }).testeFalhaAtualizacaoEstoque = state;
			ipcMain.removeHandler("get-estoque-visao-geral");
			ipcMain.handle("get-estoque-visao-geral", async (event, ...args) => {
				state.chamadas += 1;
				if (state.chamadas === 1) throw new Error("Falha simulada de atualização após entrada");
				return state.original(event, ...args);
			});
		});
		try {
			const linha = lista.getByRole("row", { name: new RegExp(`^${sku}(?:\\s|$)`) });
			await expect(linha).toBeVisible();
			await linha.getByRole("button", { name: `Adicionar estoque para ${nome}, SKU ${sku}` }).click();
			const dialog = window.getByRole("dialog", { name: "Adicionar estoque", exact: true }).and(visible());
			await dialog.getByLabel("Quantidade recebida").fill("2");
			await dialog.getByRole("button", { name: "Registrar entrada individual", exact: true }).click();
			const confirmar = dialog.getByRole("group", { name: "Confirmar entrada individual" }).getByRole("button", { name: "Confirmar entrada", exact: true });
			await confirmar.evaluate((botao) => {
				const clique = () => botao.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				clique();
				clique();
			});
			await expect(dialog).toHaveCount(0);
			await expect(window.getByText("Entrada de 2 unidade(s) registrada com sucesso!", { exact: true })).toBeVisible();
			await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).quantidade_estoque, sku)).toBe(3);
			await expect.poll(() => electronApp.evaluate(() => (globalThis as typeof globalThis & { testeFalhaAtualizacaoEstoque?: { chamadas: number } }).testeFalhaAtualizacaoEstoque?.chamadas)).toBe(1);
			const movimentos = await window.evaluate(async (sku) => (await window.api.getMovimentacoesEstoque(100)).filter((item: { sku: string }) => item.sku === sku), sku);
			expect(movimentos).toHaveLength(1);
			await expect(lista.getByText("Falha simulada de atualização após entrada")).toBeVisible();
		} finally {
			await electronApp.evaluate(({ ipcMain }) => {
				type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
				const state = (globalThis as typeof globalThis & { testeFalhaAtualizacaoEstoque?: { original: Handler } }).testeFalhaAtualizacaoEstoque;
				if (!state) return;
				ipcMain.removeHandler("get-estoque-visao-geral");
				ipcMain.handle("get-estoque-visao-geral", (event, ...args) => state.original(event, ...args));
				delete (globalThis as typeof globalThis & { testeFalhaAtualizacaoEstoque?: unknown }).testeFalhaAtualizacaoEstoque;
			});
		}
	});

	test("recarga mais recente vence e aba estoque reflete remoção e restauração", async () => {
		const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
		const sku = `WS-RELOAD-${sufixo}`;
		await criarProduto(`Recarga workspace ${sufixo}`, [{ sku, preco: 100, preco_custo: 20, quantidade_estoque: 4, estoque_minimo: 1, atributos: [{ chave: "Unidade", valor: "Único" }] }]);
		const lista = await abrirEstoque();
		await lista.getByRole("button", { name: "Atualizar lista", exact: true }).click();
		const linha = lista.getByRole("row", { name: new RegExp(`^${sku}(?:\\s|$)`) });
		await expect(linha).toBeVisible();
		const produtoId = await window.evaluate(async (codigo) => (await window.api.buscarSKU(codigo)).produto_id, sku);

		await electronApp.evaluate(({ ipcMain }) => {
			type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
			type State = { original: Handler; chamadas: number; liberarPrimeira?: () => void; primeiraConcluida: boolean };
			const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers;
			const original = handlers.get("get-estoque-visao-geral");
			if (!original) throw new Error("Handler da visão geral não encontrado");
			const state: State = { original, chamadas: 0, primeiraConcluida: false };
			(globalThis as typeof globalThis & { testeOrdemRecargaEstoque?: State }).testeOrdemRecargaEstoque = state;
			ipcMain.removeHandler("get-estoque-visao-geral");
			ipcMain.handle("get-estoque-visao-geral", async (event, ...args) => {
				state.chamadas += 1;
				if (state.chamadas === 1) {
					await new Promise<void>((resolve) => { state.liberarPrimeira = resolve; });
					state.primeiraConcluida = true;
					throw new Error("Resposta obsoleta de recarga");
				}
				return state.original(event, ...args);
			});
		});
		try {
			await lista.getByRole("button", { name: "Atualizar lista", exact: true }).click();
			await expect.poll(() => electronApp.evaluate(() => (globalThis as typeof globalThis & { testeOrdemRecargaEstoque?: { chamadas: number } }).testeOrdemRecargaEstoque?.chamadas)).toBe(1);
			await expect(lista.getByRole("button", { name: "Atualizando...", exact: true })).toBeDisabled();
			await window.getByRole("link", { name: "Precificação", exact: true }).and(visible()).click();
			await expect(window.getByPlaceholder("Buscar por SKU ou nome...").and(visible())).toBeVisible();
			await window.getByRole("link", { name: "Estoque", exact: true }).and(visible()).click();
			await expect.poll(() => electronApp.evaluate(() => (globalThis as typeof globalThis & { testeOrdemRecargaEstoque?: { chamadas: number } }).testeOrdemRecargaEstoque?.chamadas)).toBe(2);
			await expect(linha).toBeVisible();
			await electronApp.evaluate(() => (globalThis as typeof globalThis & { testeOrdemRecargaEstoque?: { liberarPrimeira?: () => void } }).testeOrdemRecargaEstoque?.liberarPrimeira?.());
			await expect.poll(() => electronApp.evaluate(() => (globalThis as typeof globalThis & { testeOrdemRecargaEstoque?: { primeiraConcluida: boolean } }).testeOrdemRecargaEstoque?.primeiraConcluida)).toBe(true);
			await expect(lista.getByText(/Resposta obsoleta de recarga/)).toHaveCount(0);

			await window.getByRole("link", { name: "Precificação", exact: true }).and(visible()).click();
			await expect(window.getByPlaceholder("Buscar por SKU ou nome...").and(visible())).toBeVisible();
			await window.evaluate((id) => window.api.removerProduto(id), produtoId);
			await window.getByRole("link", { name: "Estoque", exact: true }).and(visible()).click();
			await expect.poll(() => electronApp.evaluate(() => (globalThis as typeof globalThis & { testeOrdemRecargaEstoque?: { chamadas: number } }).testeOrdemRecargaEstoque?.chamadas)).toBe(3);
			await expect(linha).toHaveCount(0);
			await window.evaluate((id) => window.api.restaurarProduto(id), produtoId);
			await lista.getByRole("button", { name: "Atualizar lista", exact: true }).click();
			await expect(linha).toBeVisible();
		} finally {
			await electronApp.evaluate(({ ipcMain }) => {
				type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
				const state = (globalThis as typeof globalThis & { testeOrdemRecargaEstoque?: { original: Handler; liberarPrimeira?: () => void } }).testeOrdemRecargaEstoque;
				state?.liberarPrimeira?.();
				if (!state) return;
				ipcMain.removeHandler("get-estoque-visao-geral");
				ipcMain.handle("get-estoque-visao-geral", (event, ...args) => state.original(event, ...args));
				delete (globalThis as typeof globalThis & { testeOrdemRecargaEstoque?: unknown }).testeOrdemRecargaEstoque;
			});
		}
	});

	test("Estoque: menu Ordenar lista as quatro opções e inverte a ordem por nome", async () => {
		const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
		await criarProduto(`Alfa ordem ${sufixo}`, [{ sku: `WS-ORD-A-${sufixo}`, preco: 100, preco_custo: 10, quantidade_estoque: 3, estoque_minimo: 1, atributos: [{ chave: "Unidade", valor: "Único" }] }]);
		await criarProduto(`Zeta ordem ${sufixo}`, [{ sku: `WS-ORD-Z-${sufixo}`, preco: 100, preco_custo: 10, quantidade_estoque: 3, estoque_minimo: 1, atributos: [{ chave: "Unidade", valor: "Único" }] }]);

		const lista = await abrirEstoque();
		await atualizarLista(lista);
		await lista.getByRole("button", { name: "Ordenar", exact: true }).click();
		await expect(window.getByRole("menuitemradio").and(visible())).toHaveCount(4);
		await expect(window.getByRole("menuitemradio", { name: "Nome (A → Z)" }).and(visible())).toHaveAttribute("aria-checked", "true");
		await window.getByRole("menuitemradio", { name: "Nome (Z → A)" }).and(visible()).click();

		const celulasProduto = lista.locator("tbody tr td:nth-child(2)");
		expect(await celulasProduto.count()).toBeGreaterThanOrEqual(2);
		const nomes = (await celulasProduto.allTextContents()).map((t) => t.trim());
		const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
		expect(nomes).toEqual([...nomes].sort((a, b) => collator.compare(b, a)));

		await window.reload();
		await window.waitForLoadState("domcontentloaded");
		expect(await window.evaluate(() => JSON.parse(localStorage.getItem("erp.ordenacao.estoque") ?? "null"))).toBe("nome-desc");
	});
});
