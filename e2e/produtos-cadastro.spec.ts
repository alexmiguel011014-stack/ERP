import { _electron as electron, expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import type { ElectronApplication, Locator, Page } from "playwright-core";
import {
	formatarSinalMovimentacao,
	mapearCategoriasPorProduto,
	mensagemErroFiltroCategoria,
} from "../frontend/src/lib/estoque/categoriasMovimentacao";

const ROOT = path.join(__dirname, "..");

// Bug A (GOALS.md "Cadastro de Produtos — Review Findings"): editar um
// produto e salvar deixava a tela presa no mesmo produto em modo edição —
// onSalvo remontava o painel (key={refreshTick}) mas nunca limpava
// produtoEditando no componente pai, então o useEffect de [produtoEditando]
// repopulava a mesma edição de novo. Este teste falha contra o código
// anterior ao fix e passa depois.
test.describe("Cadastro de Produto", () => {
	let electronApp: ElectronApplication;
	let window: Page;
	let userDataDir: string;
	let imagemFalsaPath: string;

	// O sistema de abas (layout/AbasHost.tsx) mantém as abas já abertas
	// montadas no DOM (keep-alive, uma instância por aba, inativas em
	// display:none) — um placeholder/texto pode existir em mais de uma aba
	// (só um de fato visível). `.and(visible())` restringe ao que está
	// realmente na tela, sem depender de conhecer a estrutura exata do host.
	function visible(): Locator {
		return window.locator(":visible");
	}

	function estoqueInline(): Locator {
		return window.getByRole("region", { name: "Lista completa do estoque", exact: true }).and(visible());
	}

	function dialogEntradaLote(): Locator {
		return window.getByRole("dialog", { name: "Entrada em lote", exact: true }).and(visible());
	}

	async function abrirEntradaLote(): Promise<Locator> {
		const dialog = dialogEntradaLote();
		if (!(await dialog.isVisible())) {
			await window.getByRole("button", { name: "Entrada em lote", exact: true }).and(visible()).click();
		}
		await expect(dialog).toBeVisible();
		return dialog;
	}

	async function criarProdutosParaTeste(tag: string) {
		const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
		const nomeA = `Produto Estoque ${tag} A ${sufixo}`;
		const nomeB = `Produto Estoque ${tag} B ${sufixo}`;
		const skuA = `ESTOQUE-${tag.toUpperCase()}-A-${sufixo}`;
		const skuB = `ESTOQUE-${tag.toUpperCase()}-B-${sufixo}`;
		await window.evaluate(async ({ nomeA, nomeB, skuA, skuB }) => {
			const criar = (nome: string, sku: string) =>
				window.api.salvarProduto({
					nome,
					variacoes: [
						{
							sku,
							preco: 100,
							preco_custo: 50,
							quantidade_estoque: 5,
							atributos: [{ chave: "Unidade", valor: "Único" }],
						},
					],
				});
			await criar(nomeA, skuA);
			await criar(nomeB, skuB);
		}, { nomeA, nomeB, skuA, skuB });
		return { nomeA, nomeB, skuA, skuB };
	}

	async function abrirEstoque() {
		const dialogAberto = dialogEntradaLote();
		if (await dialogAberto.isVisible()) {
			await dialogAberto.getByRole("button", { name: "Fechar", exact: true }).click();
		}
		await window
			.getByRole("link", { name: "Estoque", exact: true })
			.and(visible())
			.click();
		await expect(estoqueInline()).toBeVisible();
		const dialog = await abrirEntradaLote();
		const limpar = dialog.getByRole("button", { name: "Limpar", exact: true });
		await limpar.click();
		const descartar = dialog.getByRole("group", { name: "Descartar rascunho de lote" }).and(visible());
		if (await descartar.count()) {
			await descartar.getByRole("button", { name: "Descartar rascunho" }).click();
		}
		await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
		await estoqueInline().getByPlaceholder("Buscar por nome, SKU, código de barras ou ID...").fill("");
	}

	async function atualizarListaEstoque() {
		const lista = estoqueInline();
		const atualizar = lista.getByRole("button", { name: "Atualizar lista", exact: true });
		await expect(atualizar).toBeEnabled();
		await atualizar.click();
		await expect(lista.getByRole("status")).toHaveText("Lista atualizada");
	}

	async function abrirRetiradaDaLinha(sku: string, busca = sku): Promise<Locator> {
		const lista = estoqueInline();
		await lista.getByPlaceholder("Buscar por nome, SKU, código de barras ou ID...").fill(busca);
		const linha = lista.getByRole("row", { name: new RegExp(`^${sku}(?:\\s|$)`) });
		await expect(linha).toBeVisible();
		await linha.getByRole("button", { name: new RegExp(`^Retirar estoque .*SKU ${sku}$`) }).click();
		const dialog = window.getByRole("dialog", { name: "Retirar estoque", exact: true }).and(visible());
		await expect(dialog).toBeVisible();
		return dialog;
	}

	test.beforeAll(async () => {
		userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-e2e-produtos-"));
		// salvarImagemProduto só valida extensão + existência do arquivo (não o
		// conteúdo) — bytes arbitrários com extensão .png bastam pro fluxo real
		// de escolher/salvar/ler imagem ser exercitado de ponta a ponta.
		imagemFalsaPath = path.join(userDataDir, "imagem-teste.png");
		fs.writeFileSync(imagemFalsaPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
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
		const caminhosPrincipais = await electronApp.evaluate(({ app }) => ({
			userData: app.getPath("userData"),
			banco: process.mainModule.require("./database.js").getDBPath(),
		}));
		const bancoEsperado = path.join(userDataDir, "erp_housekimono.sqlite");
		expect(path.resolve(caminhosPrincipais.userData)).toBe(
			path.resolve(userDataDir),
		);
		expect(path.resolve(caminhosPrincipais.banco)).toBe(
			path.resolve(bancoEsperado),
		);

		await window.getByPlaceholder("Seu login de acesso").fill("teste");
		await window.getByPlaceholder("Digite a senha de acesso").fill("teste123");
		await window.getByRole("button", { name: "Entrar" }).click();
		await window
			.locator("aside")
			.getByTitle("Produtos", { exact: true })
			.click();
		await expect(
			window.getByPlaceholder("Ex: Quimono Trançado").and(visible()),
		).toBeVisible();
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

	test("stock fixture isolation", async () => {
		const bancoPelaApi = await window.evaluate(() => window.api.getDBPath());
		expect(path.resolve(bancoPelaApi)).toBe(
			path.resolve(path.join(userDataDir, "erp_housekimono.sqlite")),
		);
	});

	test("stock reload latest request", async () => {
		const { skuA } = await criarProdutosParaTeste("reload-latest");
		await electronApp.evaluate(({ ipcMain }) => {
			type Handler = (event: Electron.IpcMainInvokeEvent) => Promise<unknown>;
			type Estado = {
				original: Handler;
				chamadas: number;
				primeiraConcluida: boolean;
				liberarPrimeira?: () => void;
			};
			const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })
				._invokeHandlers;
			const channel = "get-estoque-visao-geral";
			const original = handlers.get(channel);
			if (!original) throw new Error("Handler de visão geral do estoque não encontrado");
			const estado: Estado = { original, chamadas: 0, primeiraConcluida: false };
			(globalThis as typeof globalThis & { testeRecargaEstoque?: Estado }).testeRecargaEstoque = estado;
			ipcMain.removeHandler(channel);
			ipcMain.handle(channel, async (event) => {
				estado.chamadas += 1;
				if (estado.chamadas === 1) {
					await new Promise<void>((resolve) => { estado.liberarPrimeira = resolve; });
					estado.primeiraConcluida = true;
					throw new Error("Falha obsoleta de recarga");
				}
				if (estado.chamadas === 4) throw new Error("Falha atual de recarga");
				return original(event);
			});
		});

		try {
			await abrirEstoque();
			const lista = estoqueInline();
			const linhaProduto = lista.getByRole("row", { name: new RegExp(`^${skuA}(?:\\s|$)`) });
			await expect.poll(() => electronApp.evaluate(() =>
				(globalThis as typeof globalThis & { testeRecargaEstoque?: { chamadas: number } }).testeRecargaEstoque?.chamadas,
			)).toBe(1);
			await expect(lista.getByRole("button", { name: /^(?:Atualizar lista|Atualizando\.\.\.)$/ })).toBeDisabled();

			await window.getByRole("link", { name: "Precificação", exact: true }).and(visible()).click();
			await expect(window.getByPlaceholder("Buscar por SKU ou nome...").and(visible())).toBeVisible();
			await window.getByRole("link", { name: "Estoque", exact: true }).and(visible()).click();
			await expect(lista.getByRole("heading", { name: "Lista completa do estoque" })).toBeVisible();
			await expect.poll(() => electronApp.evaluate(() =>
				(globalThis as typeof globalThis & { testeRecargaEstoque?: { chamadas: number } }).testeRecargaEstoque?.chamadas,
			)).toBe(2);
			await expect(linhaProduto).toBeVisible();
			await lista.getByRole("button", { name: "Atualizar lista", exact: true }).click();
			await expect.poll(() => electronApp.evaluate(() =>
				(globalThis as typeof globalThis & { testeRecargaEstoque?: { chamadas: number } }).testeRecargaEstoque?.chamadas,
			)).toBe(3);
			await expect(lista.getByRole("status").filter({ hasText: "Lista atualizada" })).toHaveText("Lista atualizada");

			await electronApp.evaluate(() => {
				(globalThis as typeof globalThis & { testeRecargaEstoque?: { liberarPrimeira?: () => void } })
					.testeRecargaEstoque?.liberarPrimeira?.();
			});
			await expect.poll(() => electronApp.evaluate(() =>
				(globalThis as typeof globalThis & { testeRecargaEstoque?: { primeiraConcluida: boolean } }).testeRecargaEstoque?.primeiraConcluida,
			)).toBe(true);
			await expect(lista.getByRole("status").filter({ hasText: "Lista atualizada" })).toHaveText("Lista atualizada");
			await expect(lista.getByText(/Falha obsoleta de recarga/)).toHaveCount(0);

			await lista.getByRole("button", { name: "Atualizar lista", exact: true }).click();
			await expect.poll(() => electronApp.evaluate(() =>
				(globalThis as typeof globalThis & { testeRecargaEstoque?: { chamadas: number } }).testeRecargaEstoque?.chamadas,
			)).toBe(4);
			await expect(lista.getByText(/Falha atual de recarga/)).toBeVisible();
			await expect(lista.getByRole("status").filter({ hasText: "Lista atualizada" })).toHaveCount(0);
		} finally {
			await electronApp.evaluate(({ ipcMain }) => {
				type Handler = (event: Electron.IpcMainInvokeEvent) => Promise<unknown>;
				const state = (globalThis as typeof globalThis & { testeRecargaEstoque?: { original: Handler; liberarPrimeira?: () => void } }).testeRecargaEstoque;
				state?.liberarPrimeira?.();
				if (!state) return;
				ipcMain.removeHandler("get-estoque-visao-geral");
				ipcMain.handle("get-estoque-visao-geral", (event) => state.original(event));
				delete (globalThis as typeof globalThis & { testeRecargaEstoque?: unknown }).testeRecargaEstoque;
			});
		}
		await window.getByRole("link", { name: "Cadastro de Produto", exact: true }).and(visible()).click();
		await expect(window.getByPlaceholder("Ex: Quimono Trançado").and(visible())).toBeVisible();
	});

	test("editar produto e salvar volta pro formulário em branco (não fica preso no mesmo produto)", async () => {
		const nome = window.getByPlaceholder("Ex: Quimono Trançado").and(visible());

		await nome.fill("Produto Teste E2E");
		await window
			.getByRole("button", { name: "Salvar Produto" })
			.and(visible())
			.click();

		// Criar já entra em modo edição (pra permitir anexar imagem na hora) —
		// então o botão vira "Salvar Alterações" sem precisar passar pela Lista.
		await expect(
			window.getByRole("button", { name: "Salvar Alterações" }).and(visible()),
		).toBeVisible();
		await expect(
			window.getByRole("button", { name: "Cancelar Edição" }).and(visible()),
		).toBeVisible();

		await nome.fill("Produto Teste E2E Editado");
		await window
			.getByRole("button", { name: "Salvar Alterações" })
			.and(visible())
			.click();

		// Depois de salvar uma edição, a tela deve voltar ao formulário em
		// branco — não continuar mostrando o mesmo produto editado.
		await expect(
			window.getByRole("button", { name: "Salvar Produto" }).and(visible()),
		).toBeVisible();
		await expect(
			window.getByRole("button", { name: "Cancelar Edição" }).and(visible()),
		).toHaveCount(0);
		await expect(nome).toHaveValue("");
	});

	// Reportado pelo dono depois do fix acima: editar um produto EXISTENTE,
	// trocar a imagem e salvar — cenário não coberto pelo teste anterior
	// (que criava um produto do zero). Também serve de regressão pro bug real
	// encontrado nesse relato: o carrinho do PDV usava `Produtos.imagem` (nome
	// de arquivo cru) direto num `<img src>`, que nunca resolve — a imagem
	// precisa passar por getImagemProduto (IPC) primeiro.
	test("editar imagem de um produto existente: sai do modo edição ao salvar, e a imagem salva é resolvível via getImagemProduto", async () => {
		const nome = window.getByPlaceholder("Ex: Quimono Trançado").and(visible());
		await nome.fill("Produto Com Imagem E2E");
		await window
			.getByRole("button", { name: "Salvar Produto" })
			.and(visible())
			.click();
		await expect(
			window.getByRole("button", { name: "Cancelar Edição" }).and(visible()),
		).toBeVisible();

		await electronApp.evaluate(async ({ dialog }, caminho) => {
			dialog.showOpenDialog = (() =>
				Promise.resolve({
					canceled: false,
					filePaths: [caminho],
				})) as typeof dialog.showOpenDialog;
		}, imagemFalsaPath);

		await window
			.getByRole("button", { name: "Escolher imagem..." })
			.and(visible())
			.click();
		await expect(
			window.getByText("Imagem atualizada!").and(visible()),
		).toBeVisible();

		await nome.fill("Produto Com Imagem E2E Editado");
		await window
			.getByRole("button", { name: "Salvar Alterações" })
			.and(visible())
			.click();

		await expect(
			window.getByRole("button", { name: "Salvar Produto" }).and(visible()),
		).toBeVisible();
		await expect(
			window.getByRole("button", { name: "Cancelar Edição" }).and(visible()),
		).toHaveCount(0);

		const produtos = await window.evaluate(() =>
			window.api.listarProdutosDetalhados(false),
		);
		const criado = produtos.find(
			(p: { nome: string }) => p.nome === "Produto Com Imagem E2E Editado",
		);
		expect(criado?.imagem).toBeTruthy();

		const dataUrl = await window.evaluate(
			(nomeArquivo) => window.api.getImagemProduto(nomeArquivo),
			criado.imagem,
		);
		expect(dataUrl).toMatch(/^data:image\//);
	});

	// Bug B (mesma seção do GOALS.md): dono relatou que "Escolher imagem..."
	// às vezes limpa todos os campos do formulário de um produto novo (ainda
	// não salvo). Não reproduzido de forma determinística em revisão de
	// código — este teste investiga o caminho mais provável (o diálogo nativo
	// do SO, mockado aqui pra não bloquear o teste) num produto novo.
	test("investigação Bug B: abrir 'Escolher imagem' num produto novo não deve limpar os outros campos", async () => {
		await electronApp.evaluate(async ({ dialog }) => {
			dialog.showOpenDialog = (() =>
				Promise.resolve({
					canceled: true,
					filePaths: [],
				})) as typeof dialog.showOpenDialog;
		});

		const nome = window.getByPlaceholder("Ex: Quimono Trançado").and(visible());
		await nome.fill("Produto Investigação Bug B");

		await window
			.getByRole("button", { name: "Escolher imagem..." })
			.and(visible())
			.click();
		await window.waitForTimeout(500);

		await expect(nome).toHaveValue("Produto Investigação Bug B");
	});

	test("alterar a busca não adiciona produto sem nova seleção", async () => {
		const { skuA, skuB } = await criarProdutosParaTeste("reposicao");
		await abrirEstoque();
		const formulario = await abrirEntradaLote();
		const campoSku = formulario.locator('input[role="combobox"]');
		await campoSku.fill(skuA);
		await formulario.getByRole("option", { name: new RegExp(skuA) }).click();

		await campoSku.fill(skuB);
		const adicionar = window.getByRole("button", { name: "Adicionar à reposição" }).and(visible());
		if (await adicionar.isEnabled()) await adicionar.click();

		await expect(
			window.getByText(new RegExp(`SKU: ${skuB} \\| Qtd: 1`)).and(visible()),
		).toHaveCount(0);
		await expect(
			window.getByText(new RegExp(`SKU: ${skuA} \\| Qtd: 1`)).and(visible()),
		).toHaveCount(0);
	});

	test("stock exit row action only affects the selected variation", async () => {
		const { skuA, skuB } = await criarProdutosParaTeste("baixa");
		await abrirEstoque();
		await atualizarListaEstoque();
		const dialog = await abrirRetiradaDaLinha(skuA);
		await dialog.getByLabel("Quantidade a dar baixa").fill("1");
		await dialog.getByRole("button", { name: "Confirmar Baixa" }).click();
		await expect.poll(() => window.evaluate(async ({ skuA, skuB }) => [
			(await window.api.buscarSKU(skuA))?.quantidade_estoque,
			(await window.api.buscarSKU(skuB))?.quantidade_estoque,
		], { skuA, skuB })).toEqual([4, 5]);
	});

	test("uma resposta atrasada do SKU A não substitui a seleção mais recente B", async () => {
		const { nomeB, skuA, skuB } = await criarProdutosParaTeste("resposta-atrasada");
		await abrirEstoque();
		await electronApp.evaluate(({ ipcMain }, skuAlvo) => {
			type Handler = (event: Electron.IpcMainInvokeEvent, sku: string) => Promise<unknown>;
			type Estado = { original: Handler; aguardando: boolean; concluida: boolean; liberar?: () => void };
			const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers;
			const original = handlers.get("buscar-sku");
			if (!original) throw new Error("Handler buscar-sku não encontrado");
			const estado: Estado = { original, aguardando: false, concluida: false };
			(globalThis as typeof globalThis & { testeBusca?: Estado }).testeBusca = estado;
			ipcMain.removeHandler("buscar-sku");
			ipcMain.handle("buscar-sku", async (event, sku: string) => {
				if (sku === skuAlvo) {
					estado.aguardando = true;
					await new Promise<void>((resolve) => { estado.liberar = resolve; });
					const resultado = await original(event, sku);
					estado.concluida = true;
					return resultado;
				}
				return original(event, sku);
			});
		}, skuA);

		try {
			const formulario = await abrirEntradaLote();
			const campoSku = formulario.locator('input[role="combobox"]');
			await campoSku.fill(skuA);
			await formulario.getByRole("option", { name: new RegExp(skuA) }).click();
			await expect.poll(() => electronApp.evaluate(() =>
				(globalThis as typeof globalThis & { testeBusca?: { aguardando: boolean } }).testeBusca?.aguardando,
			)).toBe(true);
			await campoSku.fill(skuB);
			await formulario.getByRole("option", { name: new RegExp(skuB) }).click();
			await expect(formulario.getByText(new RegExp(`^${nomeB}.*Estoque atual`))).toBeVisible();
			await electronApp.evaluate(() => {
				(globalThis as typeof globalThis & { testeBusca?: { liberar?: () => void } }).testeBusca?.liberar?.();
			});
			await expect.poll(() => electronApp.evaluate(() =>
				(globalThis as typeof globalThis & { testeBusca?: { concluida: boolean } }).testeBusca?.concluida,
			)).toBe(true);
			await window.waitForTimeout(300);
			await expect(formulario.getByText(new RegExp(`^${nomeB}.*Estoque atual`))).toBeVisible();

			await window
				.getByRole("button", { name: "Adicionar à reposição" })
				.and(visible())
				.click();
			await expect(
				window.getByText(new RegExp(`SKU: ${skuB} \\| Qtd: 1`)).and(visible()),
			).toBeVisible();
		} finally {
			await electronApp.evaluate(({ ipcMain }) => {
				type Handler = (event: Electron.IpcMainInvokeEvent, sku: string) => Promise<unknown>;
				const estado = (globalThis as typeof globalThis & { testeBusca?: { original: Handler; liberar?: () => void } }).testeBusca;
				estado?.liberar?.();
				if (estado) {
					ipcMain.removeHandler("buscar-sku");
					ipcMain.handle("buscar-sku", estado.original);
				}
				delete (globalThis as typeof globalThis & { testeBusca?: unknown }).testeBusca;
			});
		}
	});

	test("busca variações por nome, SKU, código de barras e ID e movimenta o saldo", async () => {
		const sufixo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
		const nome = `Kimono duplicado ${sufixo}`;
		const skuA = `VAR-A-${sufixo}`;
		const skuB = `VAR-B-${sufixo}`;
		const barras = `20${sufixo}`;
		const idB = await window.evaluate(async ({ nome, skuA, skuB, barras }) => {
			for (const [sku, codigo] of [[skuA, `${barras}1`], [skuB, `${barras}2`]]) {
				await window.api.salvarProduto({ nome, variacoes: [{ sku, codigo_barras: codigo, preco: 100, preco_custo: 50, quantidade_estoque: 5, atributos: [{ chave: "Tamanho", valor: sku === skuA ? "A1" : "A2" }] }] });
			}
			return (await window.api.buscarSKU(skuB)).produto_id;
		}, { nome, skuA, skuB, barras });
		await abrirEstoque();
		const entrada = await abrirEntradaLote();
		const campo = entrada.locator('input[role="combobox"]');
		async function selecionar(termo: string, sku: string) {
			await campo.fill(termo);
			await entrada.getByRole("option", { name: new RegExp(sku) }).click();
			await expect(entrada.getByText(new RegExp(`SKU: ${sku} \\| Estoque atual`))).toBeVisible();
		}
		await campo.fill(nome);
		await expect(entrada.getByRole("option")).toHaveCount(2);
		await entrada.getByRole("option", { name: new RegExp(skuB) }).click();
		await expect(entrada.getByText(new RegExp(`SKU: ${skuB} \\| Estoque atual`))).toBeVisible();
		await selecionar(skuA, skuA);
		await selecionar(`${barras}2`, skuB);
		await selecionar(`#${idB}`, skuB);
		await entrada.getByRole("button", { name: "Adicionar à reposição" }).click();
		await expect(entrada.getByText(new RegExp(`SKU: ${skuB} \\| Qtd: 1`))).toBeVisible();
		await entrada.getByRole("button", { name: "Confirmar Reposição" }).click();
		await window.getByRole("group", { name: "Confirmar reposição" }).getByRole("button", { name: "Confirmar entrada" }).click();
		await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).quantidade_estoque, skuB)).toBe(6);
		await atualizarListaEstoque();
		const saida = await abrirRetiradaDaLinha(skuB);
		await saida.getByLabel("Quantidade a dar baixa").fill("1");
		await saida.getByRole("button", { name: "Confirmar Baixa" }).click();
		await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).quantidade_estoque, skuB)).toBe(5);
		const movimentos = await window.evaluate(async (sku) => (await window.api.getMovimentacoesEstoque(100)).filter((m: { sku: string }) => m.sku === sku), skuB);
		expect(movimentos.some((m: { tipo: string; quantidade: number }) => m.tipo === "entrada" && m.quantidade === 1)).toBe(true);
		expect(movimentos.some((m: { tipo: string; quantidade: number; origem: string }) => m.tipo === "ajuste" && m.quantidade === -1 && m.origem === "ajuste_manual")).toBe(true);
		await window.getByRole("button", { name: "Ver movimentações" }).and(visible()).click();
		await expect(window.getByText(/Origem: ajuste_manual/).and(visible()).last()).toBeVisible();
		await window.keyboard.press("Escape");
	});

	test("escolha explícita distingue SKU de código de barras igual", async () => {
		const sufixo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
		const colisao = `COLLISION-${sufixo}`;
		const skuA = `OTHER-${sufixo}`;
		const nomeB = `Colisão B ${sufixo}`;
		await window.evaluate(async ({ sufixo, colisao, skuA, nomeB }) => {
			await window.api.salvarProduto({ nome: `Colisão A ${sufixo}`, variacoes: [{ sku: skuA, codigo_barras: colisao, preco: 100, preco_custo: 40, quantidade_estoque: 5, atributos: [{ chave: "Tamanho", valor: "A1" }] }] });
			await window.api.salvarProduto({ nome: nomeB, variacoes: [{ sku: colisao, codigo_barras: `OUTRO-${sufixo}`, preco: 100, preco_custo: 60, quantidade_estoque: 5, atributos: [{ chave: "Tamanho", valor: "A2" }] }] });
		}, { sufixo, colisao, skuA, nomeB });
		await abrirEstoque();
		const entrada = await abrirEntradaLote();
		const campo = entrada.locator('input[role="combobox"]');
		await campo.fill(colisao);
		await campo.press("Enter");
		await expect(entrada.getByRole("option")).toHaveCount(2);
		await expect(entrada.locator("p").filter({ hasText: /SKU:.*Estoque atual:/ })).toHaveCount(0);
		await entrada.getByRole("option", { name: new RegExp(`SKU: ${colisao}`) }).click();
		await expect(entrada.getByText(new RegExp(`^${nomeB}.*SKU: ${colisao}`))).toBeVisible();
		await entrada.getByRole("button", { name: "Adicionar à reposição" }).click();
		await expect(entrada.getByText(new RegExp(`SKU: ${colisao} \\| Qtd: 1`))).toBeVisible();
		await expect(entrada.getByText(new RegExp(`SKU: ${skuA} \\| Qtd: 1`))).toHaveCount(0);
	});

	test("Enter imediato do leitor seleciona o único código de barras correspondente", async () => {
		const sufixo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
		const sku = `SCANNER-${sufixo}`;
		const barras = `35${sufixo}`;
		await window.evaluate(({ sku, barras }) => window.api.salvarProduto({ nome: `Leitor ${sku}`, variacoes: [{ sku, codigo_barras: barras, preco: 100, preco_custo: 50, quantidade_estoque: 5, atributos: [{ chave: "Tamanho", valor: "A1" }] }] }), { sku, barras });
		await abrirEstoque();
		const entrada = await abrirEntradaLote();
		const campo = entrada.locator('input[role="combobox"]');
		await campo.fill(barras);
		await campo.press("Enter");
		await expect(entrada.getByText(new RegExp(`SKU: ${sku} \\| Estoque atual`))).toBeVisible();
		await entrada.getByRole("button", { name: "Adicionar à reposição" }).click();
		await expect(entrada.getByText(new RegExp(`SKU: ${sku} \\| Qtd: 1`))).toBeVisible();
	});

	test("stock selector keyboard safety", async () => {
		const sufixo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
		const skuAntesDebounce = `KEY-IMMEDIATE-${sufixo}`;
		const skuAposDebounce = `KEY-DELAYED-${sufixo}`;
		const tokenColisao = `KEY-COLLISION-${sufixo}`;
		const skuColisaoA = `KEY-OTHER-${sufixo}`;
		await window.evaluate(async ({ skuAntesDebounce, skuAposDebounce, tokenColisao, skuColisaoA, sufixo }) => {
			const criar = (nome: string, sku: string, codigo_barras: string) => window.api.salvarProduto({
				nome,
				variacoes: [{ sku, codigo_barras, preco: 100, preco_custo: 50, quantidade_estoque: 5, atributos: [{ chave: "Unidade", valor: "Único" }] }],
			});
			await criar(`Leitura imediata ${skuAntesDebounce}`, skuAntesDebounce, `BARRAS-${skuAntesDebounce}`);
			await criar(`Leitura após debounce ${skuAposDebounce}`, skuAposDebounce, `BARRAS-${skuAposDebounce}`);
			await criar(`Colisão A ${sufixo}`, skuColisaoA, tokenColisao);
			await criar(`Colisão B ${sufixo}`, tokenColisao, `OTHER-B-${sufixo}`);
		}, { skuAntesDebounce, skuAposDebounce, tokenColisao, skuColisaoA, sufixo });
		await abrirEstoque();
		const entrada = await abrirEntradaLote();
		const campo = entrada.locator('input[role="combobox"]');
		try {
		await campo.fill(skuAntesDebounce);
		await campo.press("Enter");
		await expect(entrada.getByText(new RegExp(`SKU: ${skuAntesDebounce} \\| Estoque atual`))).toBeVisible();

		await campo.fill(skuAposDebounce);
		await expect(entrada.getByRole("option")).toHaveCount(1);
		await campo.press("Enter");
		await expect(entrada.getByText(new RegExp(`SKU: ${skuAposDebounce} \\| Estoque atual`))).toBeVisible();

			await campo.fill(tokenColisao);
			const opcoes = entrada.getByRole("option");
			await expect(opcoes).toHaveCount(2);
			await expect(campo).toHaveAttribute("aria-expanded", "true");
			await expect(campo).not.toHaveAttribute("aria-activedescendant");
			await campo.press("Enter");
			await expect(opcoes).toHaveCount(2);
			await expect(opcoes.first()).toHaveAttribute("aria-selected", "false");
			await expect(entrada.locator("p").filter({ hasText: /SKU:.*\| Estoque atual:/ })).toHaveCount(0);
			await campo.press("ArrowDown");
			await expect(opcoes.first()).toHaveAttribute("aria-selected", "true");
			await expect(campo).toHaveAttribute("aria-activedescendant", await opcoes.first().getAttribute("id"));
			const skuSelecionado = (await opcoes.first().innerText()).match(/SKU: (\S+)/)?.[1];
			expect(skuSelecionado).toBeTruthy();
			await campo.press("Enter");
			await expect(entrada.getByText(new RegExp(`SKU: ${skuSelecionado} \\| Estoque atual`))).toBeVisible();
			await expect(campo).toHaveAttribute("aria-expanded", "false");
			await expect(campo).not.toHaveAttribute("aria-controls");

			await campo.fill(tokenColisao);
			await expect(opcoes).toHaveCount(2);
			await entrada.getByRole("option", { name: new RegExp(`SKU: ${tokenColisao}`) }).click();
			await expect(entrada.getByText(new RegExp(`SKU: ${tokenColisao} \\| Estoque atual`))).toBeVisible();

			await window.evaluate(() => {
				type E2EWindow = Window & { __estoqueEscapes?: { count: number; handler: (evento: KeyboardEvent) => void } };
				const alvo = window as E2EWindow;
				const estado = { count: 0, handler: (_evento: KeyboardEvent) => {} };
				estado.handler = (evento) => { if (evento.key === "Escape") estado.count += 1; };
				alvo.__estoqueEscapes = estado;
				document.addEventListener("keydown", estado.handler);
			});
			await campo.fill(tokenColisao);
			await expect(opcoes).toHaveCount(2);
			await expect(campo).toHaveAttribute("aria-controls");
			await campo.press("Escape");
			await expect(opcoes).toHaveCount(0);
			await expect(campo).toHaveAttribute("aria-expanded", "false");
			await expect(campo).not.toHaveAttribute("aria-controls");
			await expect.poll(() => window.evaluate(() => (window as Window & { __estoqueEscapes?: { count: number } }).__estoqueEscapes?.count)).toBe(0);
			await campo.press("Escape");
			await expect.poll(() => window.evaluate(() => (window as Window & { __estoqueEscapes?: { count: number } }).__estoqueEscapes?.count)).toBe(1);
		} finally {
			await window.evaluate(() => {
				type E2EWindow = Window & { __estoqueEscapes?: { handler: (evento: KeyboardEvent) => void } };
				const alvo = window as E2EWindow;
				if (alvo.__estoqueEscapes) document.removeEventListener("keydown", alvo.__estoqueEscapes.handler);
				delete alvo.__estoqueEscapes;
			});
		}
	});

	test("precificação e estoque atualizam após lixeira sem perder edições pendentes", async () => {
		const { skuA, skuB } = await criarProdutosParaTeste("precificacao-refresh");
		const idA = await window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).produto_id, skuA);
		const idB = await window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).produto_id, skuB);
		const precificacao = window.getByRole("link", { name: "Precificação", exact: true }).and(visible());
		const estoque = window.getByRole("link", { name: "Estoque", exact: true }).and(visible());
		const linha = (sku: string) => window.getByRole("row").filter({ hasText: sku }).and(visible());
		await precificacao.dispatchEvent("click");
		await expect(linha(skuA)).toBeVisible();
		await estoque.dispatchEvent("click");
		const lista = estoqueInline();
		await expect(lista).toBeVisible();
		await window.evaluate((id) => window.api.removerProduto(id), idA);
		const buscaEstoque = lista.getByPlaceholder("Buscar por nome, SKU, código de barras ou ID...");
		await buscaEstoque.fill(skuA);
		const atualizarEstoque = lista.getByRole("button", { name: "Atualizar lista", exact: true });
		await expect(atualizarEstoque).toBeEnabled();
		await atualizarEstoque.click();
		await expect(lista.getByRole("status")).toHaveText("Lista atualizada");
		await expect(lista.getByRole("row", { name: new RegExp(`^${skuA}(?:\\s|$)`) })).toHaveCount(0);
		await precificacao.dispatchEvent("click");
		await expect(linha(skuA)).toHaveCount(0);
		await estoque.dispatchEvent("click");
		await window.evaluate((id) => window.api.restaurarProduto(id), idA);
		await expect(atualizarEstoque).toBeEnabled();
		await atualizarEstoque.click();
		await expect(lista.getByRole("status")).toHaveText("Lista atualizada");
		await expect(lista.getByRole("row", { name: new RegExp(`^${skuA}(?:\\s|$)`) })).toBeVisible();
		await precificacao.dispatchEvent("click");
		await expect(linha(skuA)).toBeVisible();
		const custo = linha(skuA).locator('input[inputmode="decimal"]').first();
		await custo.fill("63,00");
		await custo.blur();
		await expect(window.getByRole("button", { name: "Atualizar lista" }).and(visible())).toBeVisible();
		await estoque.dispatchEvent("click");
		await window.evaluate((id) => window.api.removerProduto(id), idB);
		await precificacao.dispatchEvent("click");
		await expect(linha(skuB)).toBeVisible();
		await expect(custo).toHaveValue("63,00");
		await window.getByRole("button", { name: "Atualizar lista" }).and(visible()).click();
		await window.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
		await expect(custo).toHaveValue("63,00");
		await window.getByRole("button", { name: "Atualizar lista" }).and(visible()).click();
		await window.getByRole("alertdialog").getByRole("button", { name: "Descartar e atualizar" }).click();
		await expect(linha(skuB)).toHaveCount(0);
	});

	test("stock draft survives reload", async () => {
		const { skuA, skuB } = await criarProdutosParaTeste("draft-reload");
		await abrirEstoque();
		let entrada = await abrirEntradaLote();
		const buscarProduto = entrada.locator('input[role="combobox"]');
		const quantidade = entrada.locator('input[type="number"]');
		const custo = entrada.locator('input[inputmode="decimal"]');
		const adicionar = async (sku: string, qtd: number, custoUnitario: string | null) => {
			await buscarProduto.and(visible()).fill(sku);
			await entrada
				.getByRole("option", { name: new RegExp(`SKU: ${sku}`) })
				.and(visible())
				.click();
			await quantidade.and(visible()).fill(String(qtd));
			if (custoUnitario !== null) await custo.and(visible()).fill(custoUnitario);
			await entrada
				.getByRole("button", { name: "Adicionar à reposição" })
				.and(visible())
				.click();
		};
		await adicionar(skuA, 2, "48,50");
		await adicionar(skuB, 3, null);
		const observacao = "Rascunho de lote E2E";
		await entrada
			.getByPlaceholder("Ex: NF 1234, reposição semanal...")
			.and(visible())
			.fill(observacao);

		const esperarPersistencia = async () => {
			await expect
				.poll(() =>
					window.evaluate((observacaoEsperada) => {
						const itens = window.localStorage.getItem("estoque_reposicao_itens");
						const nota = window.localStorage.getItem("estoque_reposicao_observacao");
						return (
							itens !== null &&
							nota !== null &&
							JSON.parse(itens).length === 2 &&
							JSON.parse(nota) === observacaoEsperada
						);
					}, observacao),
				)
				.toBe(true);
		};
		const conferirRascunho = async () => {
			await esperarPersistencia();
			const persistido = await window.evaluate(() => ({
				itens: window.localStorage.getItem("estoque_reposicao_itens"),
				observacao: window.localStorage.getItem("estoque_reposicao_observacao"),
			}));
			const itens = JSON.parse(persistido.itens as string) as Array<{
				custo_unitario: number | null;
				detalhes: string;
				nome: string;
				quantidade: number;
				sku: string;
				variacao_id: number;
			}>;
			const chaves = [
				"custo_unitario",
				"detalhes",
				"nome",
				"quantidade",
				"sku",
				"variacao_id",
			];
			expect(itens).toHaveLength(2);
			expect(itens.map((item) => item.sku)).toEqual([skuA, skuB]);
			expect(itens.map((item) => item.quantidade)).toEqual([2, 3]);
			expect(itens.map((item) => Object.keys(item).sort())).toEqual([
				chaves,
				chaves,
			]);
			expect(JSON.parse(persistido.observacao as string)).toBe(observacao);
			await expect(
				entrada.getByText(new RegExp(`SKU: ${skuA} \\| Qtd: 2`)).and(visible()),
			).toBeVisible();
			await expect(
				entrada.getByText(new RegExp(`SKU: ${skuB} \\| Qtd: 3`)).and(visible()),
			).toBeVisible();
			await expect(
				entrada
					.getByPlaceholder("Ex: NF 1234, reposição semanal...")
					.and(visible()),
			).toHaveValue(observacao);
		};

		await conferirRascunho();
		await window.reload();
		await window.waitForLoadState("domcontentloaded");
		await expect(estoqueInline()).toBeVisible();
		entrada = await abrirEntradaLote();
		await conferirRascunho();

		await entrada.getByRole("button", { name: "Fechar", exact: true }).click();
		await window
			.getByRole("link", { name: "Cadastro de Produto", exact: true })
			.and(visible())
			.click();
		await expect(
			window.getByPlaceholder("Ex: Quimono Trançado").and(visible()),
		).toBeVisible();
		await window
			.getByRole("link", { name: "Estoque", exact: true })
			.and(visible())
			.click();
		entrada = await abrirEntradaLote();
		await conferirRascunho();
	});

	test("stock batch dialog preserves draft", async () => {
		const { skuA } = await criarProdutosParaTeste("batch-dialog-draft");
		await abrirEstoque();
		let entrada = await abrirEntradaLote();
		const selecionarEAdicionar = async (observacao: string) => {
			const busca = entrada.locator('input[role="combobox"]');
			await busca.fill(skuA);
			await entrada.getByRole("option", { name: new RegExp(`SKU: ${skuA}`) }).click();
			await entrada.locator('input[type="number"]').fill("2");
			await entrada.getByRole("button", { name: "Adicionar à reposição" }).click();
			await entrada.getByPlaceholder("Ex: NF 1234, reposição semanal...").fill(observacao);
		};
		const conferirPersistencia = async (observacao: string) => {
			await expect.poll(() => window.evaluate(() => ({
				itens: window.localStorage.getItem("estoque_reposicao_itens"),
				observacao: window.localStorage.getItem("estoque_reposicao_observacao"),
			}))).toMatchObject({
				itens: expect.stringContaining(skuA),
				observacao: JSON.stringify(observacao),
			});
			await expect(entrada.getByText(new RegExp(`SKU: ${skuA} \\| Qtd: 2`))).toBeVisible();
			await expect(entrada.getByPlaceholder("Ex: NF 1234, reposição semanal...")).toHaveValue(observacao);
		};

		await selecionarEAdicionar("Lote preservado ao fechar");
		await entrada.getByRole("button", { name: "Fechar", exact: true }).click();
		await expect(dialogEntradaLote()).toHaveCount(0);
		await expect(window.getByRole("status").filter({ hasText: "Rascunho pendente · 1 item(ns)" }).and(visible())).toBeVisible();
		entrada = await abrirEntradaLote();
		await conferirPersistencia("Lote preservado ao fechar");

		await entrada.getByRole("button", { name: "Confirmar Reposição" }).click();
		const confirmarEnvio = entrada.getByRole("group", { name: "Confirmar reposição" });
		await confirmarEnvio.getByRole("button", { name: "Voltar" }).click();
		await conferirPersistencia("Lote preservado ao fechar");

		await entrada.getByRole("button", { name: "Limpar" }).click();
		const confirmarDescarte = entrada.getByRole("group", { name: "Descartar rascunho de lote" });
		await confirmarDescarte.getByRole("button", { name: "Continuar editando" }).click();
		await conferirPersistencia("Lote preservado ao fechar");
		await entrada.getByRole("button", { name: "Limpar" }).click();
		await entrada.getByRole("group", { name: "Descartar rascunho de lote" })
			.getByRole("button", { name: "Descartar rascunho" }).click();
		await expect(entrada.getByText("Nenhum item adicionado.")).toBeVisible();
		await expect(window.getByRole("status").filter({ hasText: "Rascunho pendente" })).toHaveCount(0);

		await selecionarEAdicionar("Falha seguida de nova tentativa");
		await entrada.getByRole("button", { name: "Confirmar Reposição" }).click();
		await entrada.getByRole("group", { name: "Confirmar reposição" })
			.getByRole("button", { name: "Voltar" }).click();
		await conferirPersistencia("Falha seguida de nova tentativa");

		await electronApp.evaluate(({ ipcMain }) => {
			type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
			type Estado = { original: Handler; chamadas: number };
			type Globals = typeof globalThis & { testeEntradaLoteS3411a?: Estado };
			const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers;
			const original = handlers.get("registrar-entrada-estoque");
			if (!original) throw new Error("Handler registrar-entrada-estoque não encontrado");
			const estado: Estado = { original, chamadas: 0 };
			(globalThis as Globals).testeEntradaLoteS3411a = estado;
			ipcMain.removeHandler("registrar-entrada-estoque");
			ipcMain.handle("registrar-entrada-estoque", async (event, ...args) => {
				estado.chamadas += 1;
				if (estado.chamadas === 1) throw new Error("Falha simulada para testar nova tentativa.");
				return estado.original(event, ...args);
			});
		});

		try {
			await entrada.getByRole("button", { name: "Confirmar Reposição" }).click();
			const confirmarEntrada = entrada.getByRole("group", { name: "Confirmar reposição" })
				.getByRole("button", { name: "Confirmar entrada" });
			await confirmarEntrada.click();
			await expect(entrada.getByRole("alert")).toContainText("Falha simulada para testar nova tentativa.");
			await expect(entrada.getByRole("group", { name: "Confirmar reposição" })).toBeVisible();
			await conferirPersistencia("Falha seguida de nova tentativa");
			await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).quantidade_estoque, skuA)).toBe(5);

			await entrada.getByRole("group", { name: "Confirmar reposição" })
				.getByRole("button", { name: "Confirmar entrada" }).click();
			await expect(dialogEntradaLote()).toHaveCount(0);
			await expect.poll(() => electronApp.evaluate(() =>
				(globalThis as typeof globalThis & { testeEntradaLoteS3411a?: { chamadas: number } }).testeEntradaLoteS3411a?.chamadas,
			)).toBe(2);
			await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).quantidade_estoque, skuA)).toBe(7);
			const movimentos = await window.evaluate(async (sku) => (await window.api.getMovimentacoesEstoque(100)).filter(
				(item: { sku: string; observacao: string; quantidade: number }) => item.sku === sku && item.observacao === "Falha seguida de nova tentativa" && item.quantidade === 2,
			), skuA);
			expect(movimentos).toHaveLength(1);
			await expect(window.getByRole("status").filter({ hasText: "Rascunho pendente" })).toHaveCount(0);
		} finally {
			await electronApp.evaluate(({ ipcMain }) => {
				type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
				type Globals = typeof globalThis & { testeEntradaLoteS3411a?: { original: Handler } };
				const estado = (globalThis as Globals).testeEntradaLoteS3411a;
				if (estado) {
					ipcMain.removeHandler("registrar-entrada-estoque");
					ipcMain.handle("registrar-entrada-estoque", estado.original);
				}
				delete (globalThis as Globals).testeEntradaLoteS3411a;
			});
		}
	});

	test("stock single entry preserves batch", async () => {
		const { nomeB, skuA, skuB } = await criarProdutosParaTeste("single-preserves-batch");
		await abrirEstoque();
		const entrada = await abrirEntradaLote();
		const buscarLote = entrada.locator('input[role="combobox"]');
		await buscarLote.fill(skuA);
		await entrada.getByRole("option", { name: new RegExp(`SKU: ${skuA}`) }).click();
		await entrada.locator('input[type="number"]').fill("2");
		await entrada.locator('input[inputmode="decimal"]').fill("48,50");
		await entrada.getByRole("button", { name: "Adicionar à reposição" }).click();
		await entrada.getByPlaceholder("Ex: NF 1234, reposição semanal...").fill("Lote preservado no teste");
		await expect.poll(() => window.evaluate(() => ({
			itens: window.localStorage.getItem("estoque_reposicao_itens"),
			observacao: window.localStorage.getItem("estoque_reposicao_observacao"),
		}))).toMatchObject({
			itens: expect.stringContaining(skuA),
			observacao: '"Lote preservado no teste"',
		});
		const rascunhoAntes = await window.evaluate(() => ({
			itens: window.localStorage.getItem("estoque_reposicao_itens"),
			observacao: window.localStorage.getItem("estoque_reposicao_observacao"),
		}));
		await entrada.getByRole("button", { name: "Fechar", exact: true }).click();

		const lista = estoqueInline();
		const buscaLista = lista.getByPlaceholder("Buscar por nome, SKU, código de barras ou ID...");
		const atualizarLista = lista.getByRole("button", { name: "Atualizar lista", exact: true });
		await expect(atualizarLista).toBeEnabled();
		await atualizarLista.click();
		await expect(lista.getByRole("status")).toHaveText("Lista atualizada");
		await buscaLista.fill(skuB);
		const linhaUnica = lista.getByRole("row", { name: new RegExp(`^${skuB}(?:\\s|$)`) });
		await expect(linhaUnica).toBeVisible();
		await linhaUnica.getByRole("button", {
			name: `Adicionar estoque para ${nomeB}, SKU ${skuB}`,
		}).click();
		const dialogUnica = window.getByRole("dialog", { name: "Adicionar estoque" }).and(visible());
		const quantidade = dialogUnica.getByLabel("Quantidade recebida");
		const custo = dialogUnica.getByLabel("Custo unitário (R$)");
		const observacaoUnica = dialogUnica.getByLabel("Observação");
		await quantidade.fill("3");
		await custo.fill("abc");
		await observacaoUnica.fill("Entrada avulsa E2E");
		await expect(dialogUnica.getByText("Saldo estimado: 8")).toBeVisible();
		await expect(dialogUnica.getByRole("status").filter({ hasText: "Alterações não salvas" })).toBeVisible();
		await dialogUnica.getByRole("button", { name: "Registrar entrada individual" }).click();
		const confirmarUnica = dialogUnica.getByRole("group", { name: "Confirmar entrada individual" });
		await confirmarUnica.getByRole("button", { name: "Confirmar entrada" }).click();
		await expect(window.getByText("Custo inválido.", { exact: true }).and(visible())).toBeVisible();
		await expect(quantidade).toHaveValue("3");
		await expect(custo).toHaveValue("abc");
		await expect(observacaoUnica).toHaveValue("Entrada avulsa E2E");
		await expect.poll(() => window.evaluate(() => ({
			itens: window.localStorage.getItem("estoque_reposicao_itens"),
			observacao: window.localStorage.getItem("estoque_reposicao_observacao"),
		}))).toEqual(rascunhoAntes);

		await custo.fill("0");
		await confirmarUnica.getByRole("button", { name: "Confirmar entrada" }).click();
		await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).quantidade_estoque, skuB)).toBe(8);
		const movimento = await window.evaluate(async (sku) => (await window.api.getMovimentacoesEstoque(100)).find((item: { sku: string; observacao: string }) => item.sku === sku && item.observacao === "Entrada avulsa E2E"), skuB);
		expect(movimento).toMatchObject({ custo_unitario: 0, quantidade: 3, origem: "manual" });
		const rascunhoDepois = await window.evaluate(() => ({
			itens: window.localStorage.getItem("estoque_reposicao_itens"),
			observacao: window.localStorage.getItem("estoque_reposicao_observacao"),
		}));
		expect(rascunhoDepois).toEqual(rascunhoAntes);
		await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).quantidade_estoque, skuA)).toBe(5);
	});

	test("stock exit warning and lock", async () => {
		const sufixo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
		const skuA = `EXIT-A-${sufixo}`;
		const skuB = `EXIT-B-${sufixo}`;
		await window.evaluate(async ({ skuA, skuB, sufixo }) => {
			const criar = (sku: string) => window.api.salvarProduto({
				nome: `Baixa E2E ${sku}`,
				variacoes: [{ sku, preco: 100, preco_custo: 50, quantidade_estoque: 10, atributos: [{ chave: "Unidade", valor: "Único" }] }],
			});
			await criar(skuA);
			await criar(skuB);
			const variacaoB = await window.api.buscarSKU(skuB);
			const orcamento = await window.api.finalizarVenda({
				itens: [{ variacao_id: variacaoB.id, quantidade: 9, preco_unitario: 100 }],
				status: "orcamento",
				total: 900,
				request_id: `stock-exit-reserve-${sufixo}`,
				observacao: "Reserva de cobertura E2E",
			});
			if (!orcamento.success) throw new Error("Não foi possível criar o orçamento de teste");
		}, { skuA, skuB, sufixo });

		await abrirEstoque();
		await atualizarListaEstoque();
		const lista = estoqueInline();
		const saidaA = await abrirRetiradaDaLinha(skuA, "EXIT-");
		const quantidadeA = saidaA.getByLabel("Quantidade a dar baixa");
		const motivoA = saidaA.getByLabel("Motivo");
		await quantidadeA.fill("1");
		await motivoA.selectOption("Perda");
		await expect(saidaA.getByText("Alterações não salvas", { exact: true })).toBeVisible();

		const linhaB = lista.getByRole("row", { name: new RegExp(`^${skuB}(?:\\s|$)`) });
		await linhaB.getByRole("button", { name: new RegExp(`^Retirar estoque .*SKU ${skuB}$`) }).dispatchEvent("click");
		const confirmarDescarte = saidaA.getByRole("group", { name: "Confirmar descarte das alterações" });
		await expect(confirmarDescarte).toBeVisible();
		await confirmarDescarte.getByRole("button", { name: "Descartar alterações" }).click();

		const saida = window.getByRole("dialog", { name: "Retirar estoque", exact: true }).and(visible());
		const quantidade = saida.getByLabel("Quantidade a dar baixa");
		const motivo = saida.getByLabel("Motivo");
		await expect(saida.getByText(new RegExp(`SKU: ${skuB} · Saldo atual: 10 · Reservado: 9`))).toBeVisible();
		await expect(saida.getByText("Saldo estimado: —")).toBeVisible();
		await expect(saida.getByLabel("Motivo")).toHaveValue("Avaria");
		await motivo.selectOption("Perda");
		await quantidade.fill("1.5");
		await saida.getByRole("button", { name: "Confirmar Baixa" }).click();
		await expect(saida.getByText("Informe uma quantidade inteira e positiva.", { exact: true }).and(visible())).toBeVisible();
		await expect(quantidade).toHaveValue("1.5");
		await expect.poll(() => window.evaluate(async (sku) => {
			const produto = await window.api.buscarSKU(sku);
			return [produto.quantidade_estoque, produto.quantidade_reservada];
		}, skuB)).toEqual([10, 9]);

		await quantidade.fill("2");
		await expect(saida.getByText("Saldo estimado: 8").and(visible())).toBeVisible();
		await expect(saida.getByText(/Esta baixa deixará parte dos orçamentos abertos sem cobertura/).and(visible())).toBeVisible();
		await saida.getByRole("button", { name: "Confirmar Baixa" }).click();
		const confirmacao = saida.getByRole("group", { name: "Confirmar baixa abaixo do reservado" });
		await expect(confirmacao).toBeVisible();
		await confirmacao.getByRole("button", { name: "Cancelar" }).click();
		await expect(quantidade).toHaveValue("2");
		await expect(saida.getByText("Saldo estimado: 8").and(visible())).toBeVisible();
		await saida.getByRole("button", { name: "Confirmar Baixa" }).click();
		const confirmarMesmoAssim = saida.getByRole("group", { name: "Confirmar baixa abaixo do reservado" }).getByRole("button", { name: "Registrar mesmo assim" });
		await confirmarMesmoAssim.evaluate((button) => {
			button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		await expect.poll(() => window.evaluate(async (sku) => {
			const produto = await window.api.buscarSKU(sku);
			return [produto.quantidade_estoque, produto.quantidade_reservada];
		}, skuB)).toEqual([8, 9]);
		await expect(window.getByText(/Baixa registrada, mas o novo saldo \(8\).*orçamentos abertos \(9\)/).and(visible())).toBeVisible();
		const movimentosB = await window.evaluate(async (sku) => (await window.api.getMovimentacoesEstoque(100)).filter((item: { sku: string; observacao: string }) => item.sku === sku && item.observacao === "Perda (baixa de 2 un.)"), skuB);
		expect(movimentosB).toHaveLength(1);
		await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).quantidade_estoque, skuA)).toBe(10);
		const movimentosA = await window.evaluate(async (sku) => (await window.api.getMovimentacoesEstoque(100)).filter((item: { sku: string }) => item.sku === sku), skuA);
		expect(movimentosA).toHaveLength(0);
	});

	test("stock list dialog keyboard", async () => {
		const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
		const nome = `Produto Dialog Estoque ${sufixo}`;
		const skuInicial = `DIALOG-ESTOQUE-00-${sufixo}`;
		await window.evaluate(async ({ nome, sufixo }) => {
			await window.api.salvarProduto({
				nome,
				variacoes: Array.from({ length: 36 }, (_, indice) => ({
					sku: `DIALOG-ESTOQUE-${String(indice).padStart(2, "0")}-${sufixo}`,
					preco: 100,
					preco_custo: 50,
					quantidade_estoque: 5,
					atributos: [{ chave: "Unidade", valor: String(indice + 1) }],
				})),
			});
		}, { nome, sufixo });

		await abrirEstoque();
		const lista = estoqueInline();
		const titulo = lista.getByRole("heading", { name: "Lista completa do estoque" });
		await expect(lista).toBeVisible();
		await expect(titulo).toBeVisible();
		const atualizarLista = lista.getByRole("button", { name: "Atualizar lista", exact: true });
		await expect(atualizarLista).toBeEnabled();
		await atualizarLista.click();
		await expect(lista.getByRole("status")).toHaveText("Lista atualizada");
		await expect(lista.getByRole("row", { name: new RegExp(`^${skuInicial}(?:\\s|$)`) })).toBeVisible();
		const tabela = lista.getByRole("region", { name: "Variações em estoque" });
		const dimensoes = await tabela.evaluate((element) => ({
			alturaConteudo: element.scrollHeight,
			alturaVisivel: element.clientHeight,
		}));
		expect(dimensoes.alturaConteudo).toBeGreaterThan(dimensoes.alturaVisivel);
		await tabela.evaluate((element) => { element.scrollTop = element.scrollHeight; });
		await expect.poll(() => tabela.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

		const linhaInicial = lista.getByRole("row", { name: new RegExp(`^${skuInicial}(?:\\s|$)`) });
		const adicionarEstoque = linhaInicial.getByRole("button", {
			name: `Adicionar estoque para ${nome}, SKU ${skuInicial}`,
		});
		await adicionarEstoque.click();
		const dialog = window.getByRole("dialog", { name: "Adicionar estoque" }).and(visible());
		const tituloDialogo = dialog.getByRole("heading", { name: "Adicionar estoque" });
		await expect(dialog).toHaveAttribute("aria-modal", "true");
		await expect(tituloDialogo).toBeFocused();

		const focaveis = dialog.locator("button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]");
		const primeiroFocavel = focaveis.first();
		const ultimoFocavel = focaveis.last();
		await window.keyboard.press("Tab");
		await expect(primeiroFocavel).toBeFocused();
		await window.keyboard.press("Shift+Tab");
		await expect(ultimoFocavel).toBeFocused();

		await window.keyboard.press("Escape");
		await expect(dialog).toHaveCount(0);
		await expect(adicionarEstoque).toBeFocused();

		const minimo = lista.getByRole("spinbutton", { name: `Estoque mínimo de ${nome}, SKU ${skuInicial}` });
		await expect(minimo).toBeVisible();
		await minimo.fill("1.5");
		await minimo.blur();
		await expect(minimo).toHaveAttribute("aria-invalid", "true");
		await expect(lista.getByRole("alert")).toHaveText(
			"Informe um número inteiro igual ou maior que zero.",
		);
		await expect(window.getByRole("dialog")).toHaveCount(0);

		await electronApp.evaluate(({ ipcMain }) => {
			type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
			type Estado = { original: Handler; chamadas: number; liberar?: () => void };
			const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers;
			const channel = "salvar-estoque-minimo";
			const original = handlers.get(channel);
			if (!original) throw new Error("Handler de estoque mínimo não encontrado");
			const estado: Estado = { original, chamadas: 0 };
			(globalThis as typeof globalThis & { testeDialogEstoque?: Estado }).testeDialogEstoque = estado;
			ipcMain.removeHandler(channel);
			ipcMain.handle(channel, async (event, ...args) => {
				estado.chamadas += 1;
				await new Promise<void>((resolve) => { estado.liberar = resolve; });
				return original(event, ...args);
			});
		});

		try {
			await minimo.fill("7");
			await minimo.blur();
			await expect.poll(() => electronApp.evaluate(() =>
				(globalThis as typeof globalThis & { testeDialogEstoque?: { chamadas: number } }).testeDialogEstoque?.chamadas,
			)).toBe(1);
			await expect(minimo).toHaveAttribute("aria-busy", "true");
			await expect(minimo).toBeDisabled();
			await window.keyboard.press("Escape");
			await expect(lista).toBeVisible();
			await expect(window.getByRole("dialog")).toHaveCount(0);

			await electronApp.evaluate(() => {
				(globalThis as typeof globalThis & { testeDialogEstoque?: { liberar?: () => void } })
					.testeDialogEstoque?.liberar?.();
			});
			await expect(minimo).toHaveAttribute("aria-busy", "false");
			await expect(minimo).toBeEnabled();
			await expect.poll(() => window.evaluate(async (sku) =>
				(await window.api.buscarSKU(sku)).estoque_minimo,
				skuInicial,
			)).toBe(7);
			await expect(window.getByRole("dialog")).toHaveCount(0);
		} finally {
			await electronApp.evaluate(({ ipcMain }) => {
				type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
				const estado = (globalThis as typeof globalThis & {
					testeDialogEstoque?: { original: Handler; liberar?: () => void };
				}).testeDialogEstoque;
				estado?.liberar?.();
				if (!estado) return;
				ipcMain.removeHandler("salvar-estoque-minimo");
				ipcMain.handle("salvar-estoque-minimo", (event, ...args) => estado.original(event, ...args));
				delete (globalThis as typeof globalThis & { testeDialogEstoque?: unknown }).testeDialogEstoque;
			});
		}
	});

	test("stock list panel filters", async () => {
		const sufixo = Array.from({ length: 6 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
		const nomeBase = `Óculos Jiu-Jitsu Água ${sufixo}`;
		const skuA = `PANEL-${sufixo}-A`;
		const skuB = `PANEL-${sufixo}-B`;
		const skuNegativo = `PANEL-${sufixo}-C`;
		const codigoColisao = `EAN-COLISAO-${sufixo}`;
		const idProdutoBase = await window.evaluate(async ({ nomeBase, sufixo, codigoColisao }) => {
			const resultado = await window.api.salvarProduto({
				nome: nomeBase,
				variacoes: [
					{ sku: `PANEL-${sufixo}-A`, codigo_barras: codigoColisao, preco: 100, preco_custo: 12.5, quantidade_estoque: 8, estoque_minimo: 2, atributos: [{ chave: "Tamanho", valor: "A" }] },
					{ sku: `PANEL-${sufixo}-B`, codigo_barras: `EAN-${sufixo}-B`, preco: 100, preco_custo: 7.25, quantidade_estoque: 2, estoque_minimo: 2, atributos: [{ chave: "Tamanho", valor: "B" }] },
					{ sku: `PANEL-${sufixo}-C`, codigo_barras: `EAN-${sufixo}-C`, preco: 100, preco_custo: 5, quantidade_estoque: 0, estoque_minimo: 0, atributos: [{ chave: "Tamanho", valor: "C" }] },
				],
			});
			return resultado.produtoId;
		}, { nomeBase, sufixo, codigoColisao });

		const skuColisao = `BARCODE-${sufixo}-A`;
		const skuColisaoIrmao = `BARCODE-${sufixo}-B`;
		await window.evaluate(async ({ sufixo, codigoColisao, skuColisao, skuColisaoIrmao }) => {
			await window.api.salvarProduto({
				nome: `Produto Barcode Colisão ${sufixo}`,
				variacoes: [
					{ sku: skuColisao, codigo_barras: codigoColisao, preco: 100, preco_custo: 3, quantidade_estoque: 4, estoque_minimo: 1, atributos: [{ chave: "Tamanho", valor: "D" }] },
					{ sku: skuColisaoIrmao, codigo_barras: `EAN-${sufixo}-E`, preco: 100, preco_custo: 4, quantidade_estoque: 4, estoque_minimo: 1, atributos: [{ chave: "Tamanho", valor: "E" }] },
				],
			});
		}, { sufixo, codigoColisao, skuColisao, skuColisaoIrmao });

		const skuIdExato = String(idProdutoBase);
		const skuIdIrmao = `ID-IRMAO-${sufixo}`;
		await window.evaluate(async ({ sufixo, skuIdExato, skuIdIrmao }) => {
			await window.api.salvarProduto({
				nome: `Produto SKU ID ${sufixo}`,
				variacoes: [
					{ sku: skuIdExato, codigo_barras: `EAN-ID-${sufixo}`, preco: 100, preco_custo: 8, quantidade_estoque: 3, estoque_minimo: 1, atributos: [{ chave: "Tamanho", valor: "F" }] },
					{ sku: skuIdIrmao, codigo_barras: `EAN-ID-IRMAO-${sufixo}`, preco: 100, preco_custo: 9, quantidade_estoque: 3, estoque_minimo: 1, atributos: [{ chave: "Tamanho", valor: "G" }] },
				],
			});
		}, { sufixo, skuIdExato, skuIdIrmao });

		const variacaoNegativaId = await window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).id, skuNegativo);
		await electronApp.evaluate(({ app }, { variacaoId, userDataEsperado }) => {
			if (app.getPath("userData") !== userDataEsperado) throw new Error("O teste saiu do perfil temporário.");
			return new Promise<void>((resolve, reject) => {
				const conexao = process.mainModule.require("./database.js").getConexao();
				conexao.run("UPDATE Variacoes SET quantidade_estoque = -2 WHERE id = ?", [variacaoId], (erro: Error | null) => {
					if (erro) reject(erro);
					else resolve();
				});
			});
		}, { variacaoId: variacaoNegativaId, userDataEsperado: userDataDir });

		await abrirEstoque();
		const lista = estoqueInline();
		await expect(lista).toBeVisible();
		const busca = lista.getByPlaceholder("Buscar por nome, SKU, código de barras ou ID...");
		const atualizarLista = lista.getByRole("button", { name: "Atualizar lista", exact: true });
		await expect(atualizarLista).toBeEnabled();
		await atualizarLista.click();
		const linha = (sku: string) => lista.getByRole("row", { name: new RegExp(`^${sku}(?:\\s|$)`) });

		await busca.fill("OCULOS JIU-JITSU AGUA");
		await expect(lista.getByRole("row")).toHaveCount(4);
		await expect(linha(skuA)).toBeVisible();
		await expect(linha(skuB)).toBeVisible();
		await expect(linha(skuNegativo)).toBeVisible();
		await expect(lista.getByRole("heading", { name: "Resumo e valores" })).toBeVisible();
		await expect(linha(skuA).getByText(/R\$\s?12,50/)).toBeVisible();
		await expect(linha(skuA).getByText(/R\$\s?100,00/)).toBeVisible();

		await lista.getByRole("button", { name: "Normal", exact: true }).click();
		await expect(lista.getByRole("row")).toHaveCount(2);
		await expect(linha(skuA)).toBeVisible();
		await expect(linha(skuB)).toHaveCount(0);
		await lista.getByRole("button", { name: "Baixo", exact: true }).click();
		await expect(lista.getByRole("row")).toHaveCount(2);
		await expect(linha(skuB)).toBeVisible();
		await expect(linha(skuA)).toHaveCount(0);
		await lista.getByRole("button", { name: "Negativo", exact: true }).click();
		await expect(lista.getByRole("row")).toHaveCount(2);
		await expect(linha(skuNegativo)).toBeVisible();
		await lista.getByRole("button", { name: "Todos", exact: true }).click();
		await expect(lista.getByRole("row")).toHaveCount(4);

		await busca.fill(skuA.toLowerCase());
		await expect(lista.getByRole("row")).toHaveCount(2);
		await expect(linha(skuA)).toBeVisible();
		await expect(linha(skuB)).toHaveCount(0);
		await busca.fill(codigoColisao.toLowerCase());
		await expect(lista.getByRole("row")).toHaveCount(3);
		await expect(linha(skuA)).toBeVisible();
		await expect(linha(skuColisao)).toBeVisible();
		await expect(linha(skuB)).toHaveCount(0);
		await expect(linha(skuColisaoIrmao)).toHaveCount(0);
		const skusEsperadosPorId = await window.evaluate(async (termo) => {
			const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
			const consulta = normalizar(termo);
			const idExato = /^\d+$/.test(consulta) ? Number(consulta) : null;
			return (await window.api.getEstoqueVisaoGeral())
				.filter((linha) =>
					normalizar(linha.produto_nome).includes(consulta) ||
					normalizar(linha.sku).includes(consulta) ||
					normalizar(linha.codigo_barras || "").includes(consulta) ||
					(idExato !== null && linha.produto_id === idExato),
				)
				.map((linha) => linha.sku);
		}, skuIdExato);
		await busca.fill(skuIdExato);
		await expect(lista.getByRole("row")).toHaveCount(skusEsperadosPorId.length + 1);
		await expect(linha(skuA)).toBeVisible();
		await expect(linha(skuB)).toBeVisible();
		await expect(linha(skuNegativo)).toBeVisible();
		await expect(linha(skuIdExato)).toBeVisible();
		await expect(linha(skuIdIrmao)).toHaveCount(0);
		for (const sku of skusEsperadosPorId) await expect(linha(sku)).toBeVisible();

		await busca.fill(nomeBase);
		const minimo = lista.getByRole("spinbutton", { name: `Estoque mínimo de ${nomeBase}, SKU ${skuA}` });
		await expect(minimo).toHaveValue("2");
		for (const valor of ["", "1.5", "-1"]) {
			await minimo.fill(valor);
			await minimo.blur();
			await expect(minimo).toHaveValue("2");
			await expect(lista.getByRole("alert")).toHaveText(
				"Informe um número inteiro igual ou maior que zero.",
			);
		}

		await electronApp.evaluate(({ ipcMain }) => {
			type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
			type Estado = { original: Handler };
			const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers;
			const channel = "salvar-estoque-minimo";
			const original = handlers.get(channel);
			if (!original) throw new Error("Handler de estoque mínimo não encontrado");
			(globalThis as typeof globalThis & { testeFalhaMinimo?: Estado }).testeFalhaMinimo = { original };
			ipcMain.removeHandler(channel);
			ipcMain.handle(channel, async () => { throw new Error("Falha simulada ao salvar mínimo"); });
		});
		try {
			await minimo.fill("6");
			await minimo.blur();
			await expect(lista.getByRole("alert")).toContainText("Falha simulada ao salvar mínimo");
			await expect(minimo).toHaveValue("2");
			await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).estoque_minimo, skuA)).toBe(2);
		} finally {
			await electronApp.evaluate(({ ipcMain }) => {
				type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
				const estado = (globalThis as typeof globalThis & { testeFalhaMinimo?: { original: Handler } }).testeFalhaMinimo;
				if (!estado) return;
				ipcMain.removeHandler("salvar-estoque-minimo");
				ipcMain.handle("salvar-estoque-minimo", (event, ...args) => estado.original(event, ...args));
				delete (globalThis as typeof globalThis & { testeFalhaMinimo?: unknown }).testeFalhaMinimo;
			});
		}

		await minimo.fill("7");
		await minimo.blur();
		await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).estoque_minimo, skuA)).toBe(7);
		await expect(minimo).toHaveValue("7");
		await expect(atualizarLista).toBeEnabled();
		const variacaoAId = await window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).id, skuA);
		await electronApp.evaluate(({ app }, { variacaoId, userDataEsperado }) => {
			if (app.getPath("userData") !== userDataEsperado) throw new Error("O teste saiu do perfil temporário.");
			const conexao = process.mainModule.require("./database.js").getConexao();
			return new Promise<void>((resolve, reject) => {
				conexao.run("UPDATE Variacoes SET estoque_minimo = 8 WHERE id = ?", [variacaoId], (erro: Error | null) => {
					if (erro) reject(erro);
					else resolve();
				});
			});
		}, { variacaoId: variacaoAId, userDataEsperado: userDataDir });
		await atualizarLista.dispatchEvent("click");
		await expect(lista.getByRole("status")).toHaveText("Lista atualizada");
		await expect(minimo).toHaveValue("8");

		await minimo.fill("9");
		await expect(minimo).toBeFocused();
		await atualizarLista.dispatchEvent("click");
		await expect(lista.getByRole("status")).toHaveText("Lista atualizada");
		await expect(minimo).toHaveValue("9");
		await expect(minimo).toBeFocused();
		await minimo.fill("8");
		await minimo.blur();
		await expect.poll(() => window.evaluate(async (sku) => (await window.api.buscarSKU(sku)).estoque_minimo, skuA)).toBe(8);

		const darkAntes = await window.evaluate(() => document.documentElement.classList.contains("dark"));
		try {
			await window.evaluate(() => document.documentElement.classList.add("dark"));
			const cabecalhoSku = lista.getByRole("columnheader", { name: "SKU" });
			const corCabecalho = await cabecalhoSku.evaluate((el) => getComputedStyle(el).backgroundColor);
			expect(corCabecalho).toBe("rgb(23, 31, 46)");
		} finally {
			await window.evaluate((estavaEscuro) => {
				if (!estavaEscuro) document.documentElement.classList.remove("dark");
			}, darkAntes);
		}
		await window.keyboard.press("Escape");
		await expect(lista).toBeVisible();
	});

	test("stock workspace actions", async () => {
		const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
		const nome = `Produto Ações Estoque ${sufixo}`;
		const skuEntrada = `WORKSPACE-${sufixo}-00`;
		const skuSaida = `WORKSPACE-${sufixo}-01`;
		await electronApp.evaluate(({ app }, userDataEsperado) => {
			if (app.getPath("userData") !== userDataEsperado) throw new Error("O teste saiu do perfil temporário.");
		}, userDataDir);
		await window.evaluate(async ({ nome, sufixo }) => {
			await window.api.salvarProduto({
				nome,
				variacoes: Array.from({ length: 36 }, (_, indice) => ({
					sku: `WORKSPACE-${sufixo}-${String(indice).padStart(2, "0")}`,
					preco: 100,
					preco_custo: 50,
					quantidade_estoque: 10,
					estoque_minimo: 1,
					atributos: [{ chave: "Unidade", valor: String(indice + 1) }],
				})),
			});
		}, { nome, sufixo });

		await abrirEstoque();
		const lista = estoqueInline();
		await expect(lista).toBeVisible();
		const busca = lista.getByPlaceholder("Buscar por nome, SKU, código de barras ou ID...");
		await busca.fill("");
		const atualizarLista = lista.getByRole("button", { name: "Atualizar lista", exact: true });
		await expect(atualizarLista).toBeEnabled();
		await atualizarLista.click();
		const linhaEntrada = lista.getByRole("row", { name: new RegExp(`^${skuEntrada}(?:\\s|$)`) });
		const linhaSaida = lista.getByRole("row", { name: new RegExp(`^${skuSaida}(?:\\s|$)`) });
		await expect(linhaEntrada).toBeVisible();
		await expect(linhaSaida).toBeVisible();

		const darkAntes = await window.evaluate(() => document.documentElement.classList.contains("dark"));
		try {
			await window.evaluate(() => document.documentElement.classList.add("dark"));
			const cabecalhoSku = lista.getByRole("columnheader", { name: "SKU" });
			await expect.poll(() => cabecalhoSku.evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
			const corCabecalho = await cabecalhoSku.evaluate((element) => getComputedStyle(element).backgroundColor);
			expect(corCabecalho).toBe("rgb(23, 31, 46)");
		} finally {
			await window.evaluate((estavaEscuro) => {
				if (!estavaEscuro) document.documentElement.classList.remove("dark");
			}, darkAntes);
		}

		const canais = ["registrar-entrada-estoque", "registrar-saida-estoque"];
		await electronApp.evaluate(({ ipcMain }, canaisProtegidos) => {
			type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
			type Estado = { original: Handler; chamadas: number; liberar: (() => void) | null };
			type Globals = typeof globalThis & { barreirasWorkspaceS3411?: Record<string, Estado> };
			const estados: Record<string, Estado> = {};
			const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers;
			for (const canal of canaisProtegidos) {
				const original = handlers.get(canal);
				if (!original) throw new Error(`Handler ${canal} não encontrado`);
				const estado: Estado = { original, chamadas: 0, liberar: null };
				estados[canal] = estado;
				ipcMain.removeHandler(canal);
				ipcMain.handle(canal, (event, ...args) => {
					estado.chamadas += 1;
					if (estado.chamadas !== 1) return estado.original(event, ...args);
					return new Promise<unknown>((resolve, reject) => {
						estado.liberar = () => {
							void Promise.resolve(estado.original(event, ...args)).then(resolve, reject);
						};
					});
				});
			}
			(globalThis as Globals).barreirasWorkspaceS3411 = estados;
		}, canais);

		const chamadas = (canal: string) => electronApp.evaluate((_, nomeCanal) => {
			type Globals = typeof globalThis & { barreirasWorkspaceS3411?: Record<string, { chamadas: number }> };
			return (globalThis as Globals).barreirasWorkspaceS3411?.[nomeCanal]?.chamadas ?? 0;
		}, canal);
		const liberar = (canal: string) => electronApp.evaluate((_, nomeCanal) => {
			type Globals = typeof globalThis & { barreirasWorkspaceS3411?: Record<string, { liberar: (() => void) | null }> };
			const estado = (globalThis as Globals).barreirasWorkspaceS3411?.[nomeCanal];
			if (!estado?.liberar) throw new Error(`A escrita de ${nomeCanal} não está pendente`);
			const liberarResposta = estado.liberar;
			estado.liberar = null;
			liberarResposta();
		}, canal);

		try {
			const abrirEntrada = linhaEntrada.getByRole("button", {
				name: `Adicionar estoque para ${nome}, SKU ${skuEntrada}`,
			});
			await abrirEntrada.click();
			const dialogEntrada = window.getByRole("dialog", { name: "Adicionar estoque" }).and(visible());
			await expect(dialogEntrada.getByText(`${nome} · SKU ${skuEntrada}`)).toBeVisible();
			await expect(dialogEntrada.getByText(`Saldo atual: 10 · SKU: ${skuEntrada}`)).toBeVisible();
			await dialogEntrada.getByLabel("Quantidade recebida").fill("3");
			await dialogEntrada.getByLabel("Observação").fill("S34.11-ENTRADA-A");
			await expect(dialogEntrada.getByText("Saldo estimado: 13")).toBeVisible();
			await dialogEntrada.getByRole("button", { name: "Registrar entrada individual", exact: true }).click();
			const confirmarEntrada = dialogEntrada.getByRole("group", { name: "Confirmar entrada individual" })
				.getByRole("button", { name: "Confirmar entrada", exact: true });
			await confirmarEntrada.evaluate((botao) => {
				const clique = () => botao.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				clique();
				clique();
			});
			await expect.poll(() => chamadas("registrar-entrada-estoque")).toBe(1);
			await expect(dialogEntrada).toHaveAttribute("aria-busy", "true");
			await expect(dialogEntrada.getByRole("button", { name: "Fechar", exact: true })).toBeDisabled();
			await window.keyboard.press("Escape");
			await expect(dialogEntrada).toBeVisible();
			await window.locator(".modal > div").first().click({ position: { x: 1, y: 1 } });
			await expect(dialogEntrada).toBeVisible();
			await linhaSaida.getByRole("button", {
				name: `Retirar estoque para ${nome}, SKU ${skuSaida}`,
			}).dispatchEvent("click");
			await expect(dialogEntrada.getByRole("heading", { name: "Adicionar estoque" })).toBeVisible();
			await expect(dialogEntrada.getByText(`${nome} · SKU ${skuEntrada}`)).toBeVisible();
			await expect.poll(() => chamadas("registrar-entrada-estoque")).toBe(1);

			await liberar("registrar-entrada-estoque");
			await expect(dialogEntrada).toHaveCount(0);
			const saldosAposEntrada = await window.evaluate(async ({ skuEntrada, skuSaida }) => [
				(await window.api.buscarSKU(skuEntrada)).quantidade_estoque,
				(await window.api.buscarSKU(skuSaida)).quantidade_estoque,
			], { skuEntrada, skuSaida });
			expect(saldosAposEntrada).toEqual([13, 10]);
			const entradas = await window.evaluate(async (sku) =>
				(await window.api.getMovimentacoesEstoque(100)).filter(
					(movimento: { sku: string; observacao: string }) => movimento.sku === sku && movimento.observacao === "S34.11-ENTRADA-A",
				), skuEntrada);
			expect(entradas).toHaveLength(1);

			const retirarEstoque = linhaSaida.getByRole("button", {
				name: `Retirar estoque para ${nome}, SKU ${skuSaida}`,
			});
			await retirarEstoque.click();
			const dialogSaida = window.getByRole("dialog", { name: "Retirar estoque" }).and(visible());
			await expect(dialogSaida.getByText(`${nome} · SKU ${skuSaida}`)).toBeVisible();
			await expect(dialogSaida.getByText(new RegExp(`SKU: ${skuSaida} · Saldo atual: 10 · Reservado: 0`))).toBeVisible();
			await dialogSaida.getByLabel("Quantidade a dar baixa").fill("3");
			await dialogSaida.getByLabel("Motivo").selectOption("Perda");
			await expect(dialogSaida.getByText("Saldo estimado: 7")).toBeVisible();
			const confirmarSaida = dialogSaida.getByRole("button", { name: "Confirmar Baixa", exact: true });
			await confirmarSaida.evaluate((botao) => {
				const clique = () => botao.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				clique();
				clique();
			});
			await expect.poll(() => chamadas("registrar-saida-estoque")).toBe(1);
			await expect(dialogSaida).toHaveAttribute("aria-busy", "true");
			await expect(dialogSaida.getByRole("button", { name: "Fechar", exact: true })).toBeDisabled();
			await window.keyboard.press("Escape");
			await expect(dialogSaida).toBeVisible();
			await window.locator(".modal > div").first().click({ position: { x: 1, y: 1 } });
			await expect(dialogSaida).toBeVisible();
			await linhaEntrada.getByRole("button", {
				name: `Adicionar estoque para ${nome}, SKU ${skuEntrada}`,
			}).dispatchEvent("click");
			await expect(dialogSaida.getByRole("heading", { name: "Retirar estoque" })).toBeVisible();
			await expect(dialogSaida.getByText(`${nome} · SKU ${skuSaida}`)).toBeVisible();
			await expect.poll(() => chamadas("registrar-saida-estoque")).toBe(1);

			await liberar("registrar-saida-estoque");
			await expect(dialogSaida).toHaveCount(0);
			const saldosAposSaida = await window.evaluate(async ({ skuEntrada, skuSaida }) => [
				(await window.api.buscarSKU(skuEntrada)).quantidade_estoque,
				(await window.api.buscarSKU(skuSaida)).quantidade_estoque,
			], { skuEntrada, skuSaida });
			expect(saldosAposSaida).toEqual([13, 7]);
			const saidas = await window.evaluate(async (sku) =>
				(await window.api.getMovimentacoesEstoque(100)).filter(
					(movimento: { sku: string; observacao: string }) => movimento.sku === sku && movimento.observacao === "Perda (baixa de 3 un.)",
				), skuSaida);
			expect(saidas).toHaveLength(1);
		} finally {
			await electronApp.evaluate(({ ipcMain }, canaisProtegidos) => {
				type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
				type Estado = { original: Handler; liberar: (() => void) | null };
				type Globals = typeof globalThis & { barreirasWorkspaceS3411?: Record<string, Estado> };
				const estados = (globalThis as Globals).barreirasWorkspaceS3411;
				if (!estados) return;
				for (const canal of canaisProtegidos) {
					const estado = estados[canal];
					if (!estado) continue;
					estado.liberar?.();
					estado.liberar = null;
					ipcMain.removeHandler(canal);
					ipcMain.handle(canal, (event, ...args) => estado.original(event, ...args));
				}
				delete (globalThis as Globals).barreirasWorkspaceS3411;
			}, canais);
		}
	});

	test("stock history categories and signs", async () => {
		expect(mensagemErroFiltroCategoria(false)).toBe(
			"Filtro por categoria indisponível para este perfil",
		);
		expect(mensagemErroFiltroCategoria(true)).toBe(
			"Não foi possível carregar as categorias. Tente novamente.",
		);
		expect(formatarSinalMovimentacao("entrada", -2)).toBe("+2");
		expect(formatarSinalMovimentacao("saida", 2)).toBe("−2");
		expect(formatarSinalMovimentacao("ajuste", -3)).toBe("-3");
		expect(formatarSinalMovimentacao("ajuste", 3)).toBe("3");

		const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
		const fixture = await window.evaluate(async ({ sufixo }) => {
			const raizA = await window.api.salvarCategoria(`Categoria Hist A ${sufixo}`, null);
			const subA = await window.api.salvarCategoria(`Subcategoria Hist A ${sufixo}`, raizA.id);
			const raizB = await window.api.salvarCategoria(`Categoria Hist B ${sufixo}`, null);
			const subB = await window.api.salvarCategoria(`Subcategoria Hist B ${sufixo}`, raizB.id);
			const nomeHomônimo = `Produto Homônimo ${sufixo}`;
			const criarProduto = async (
				nome: string,
				sku: string,
				categoriaId: number | null,
				subcategoriaId: number | null,
				categoriasSelecionadas: number[],
				atributo: string,
			) => {
				const salvo = await window.api.salvarProduto({
					nome,
					categoria_id: categoriaId,
					subcategoria_id: subcategoriaId,
					categoriasSelecionadas,
					variacoes: [{
						sku,
						preco: 100,
						preco_custo: 50,
						quantidade_estoque: 20,
						atributos: [{ chave: "Unidade", valor: atributo }],
					}],
				});
				const variacao = await window.api.buscarSKU(sku);
				return { produtoId: salvo.produtoId, variacaoId: variacao.id };
			};
			const produtoA = await criarProduto(
				nomeHomônimo,
				`HIST-${sufixo}-A`,
				raizA.id,
				subA.id,
				[subA.id],
				"A",
			);
			const produtoB = await criarProduto(
				nomeHomônimo,
				`HIST-${sufixo}-B`,
				raizB.id,
				subB.id,
				[subB.id],
				"B",
			);
			const produtoLegado = await criarProduto(
				`Produto Legado ${sufixo}`,
				`HIST-${sufixo}-LEGADO`,
				null,
				null,
				[],
				"L",
			);
			const produtoInativo = await criarProduto(
				`Produto Inativo ${sufixo}`,
				`HIST-${sufixo}-INATIVO`,
				raizA.id,
				subA.id,
				[subA.id],
				"I",
			);
			return {
				raizAId: raizA.id,
				raizBId: raizB.id,
				subAId: subA.id,
				produtoA,
				produtoB,
				produtoLegado,
				produtoInativo,
				skuA: `HIST-${sufixo}-A`,
				skuB: `HIST-${sufixo}-B`,
				skuLegado: `HIST-${sufixo}-LEGADO`,
				skuInativo: `HIST-${sufixo}-INATIVO`,
			};
		}, { sufixo });

		await electronApp.evaluate(({ app }, dados) => {
			if (app.getPath("userData") !== dados.userDataEsperado) {
				throw new Error("O teste saiu do perfil temporário.");
			}
			const conexao = process.mainModule.require("./database.js").getConexao();
			const executar = (sql: string, params: unknown[]) => new Promise<void>((resolve, reject) => {
				conexao.run(sql, params, (erro: Error | null) => erro ? reject(erro) : resolve());
			});
			return (async () => {
				await executar(
					"UPDATE Produtos SET categoria_id = NULL, subcategoria_id = ? WHERE id = ?",
					[dados.subAId, dados.produtoLegado.produtoId],
				);
				await executar("BEGIN IMMEDIATE", []);
				try {
					for (let indice = 0; indice < 31; indice += 1) {
						await executar(
							"INSERT INTO MovimentacoesEstoque (variacao_id, tipo, quantidade, custo_unitario, origem, referencia_id, observacao, data) VALUES (?, 'entrada', 1, NULL, 'e2e', NULL, ?, ?)",
							[
								dados.produtoB.variacaoId,
								`S34.10-ORDEM-${String(indice).padStart(2, "0")}`,
								new Date(Date.now() + indice * 1000).toISOString(),
							],
						);
					}
					await executar("COMMIT", []);
				} catch (erro) {
					await executar("ROLLBACK", []);
					throw erro;
				}
			})();
		}, { ...fixture, userDataEsperado: userDataDir });

		await window.evaluate(async ({ dados }) => {
			const variacaoA = await window.api.buscarSKU(dados.skuA);
			const variacaoB = await window.api.buscarSKU(dados.skuB);
			const variacaoLegada = await window.api.buscarSKU(dados.skuLegado);
			const variacaoInativa = await window.api.buscarSKU(dados.skuInativo);
			await window.api.registrarEntradaEstoque({
				itens: [{ variacao_id: variacaoA.id, quantidade: 3, custo_unitario: null }],
				origem: "e2e",
				observacao: "S34.10-ENTRADA-A",
			});
			await window.api.registrarSaidaEstoque({
				variacao_id: variacaoA.id,
				quantidade: 2,
				observacao: "S34.10-SAIDA-A",
			});
			await window.api.ajustarEstoqueManual({
				variacao_id: variacaoA.id,
				quantidade: 24,
				observacao: "S34.10-AJUSTE-A",
			});
			await window.api.registrarEntradaEstoque({
				itens: [{ variacao_id: variacaoB.id, quantidade: 1, custo_unitario: null }],
				origem: "e2e",
				observacao: "S34.10-HOMONIMO-B",
			});
			await window.api.registrarEntradaEstoque({
				itens: [{ variacao_id: variacaoLegada.id, quantidade: 1, custo_unitario: null }],
				origem: "e2e",
				observacao: "S34.10-LEGADO",
			});
			await window.api.registrarEntradaEstoque({
				itens: [{ variacao_id: variacaoInativa.id, quantidade: 1, custo_unitario: null }],
				origem: "e2e",
				observacao: "S34.10-INATIVO",
			});
		}, { dados: fixture });
		await electronApp.evaluate(({ app }, dados) => {
			if (app.getPath("userData") !== dados.userDataEsperado) {
				throw new Error("O teste saiu do perfil temporário.");
			}
			const conexao = process.mainModule.require("./database.js").getConexao();
			return new Promise<void>((resolve, reject) => {
				conexao.run(
					"UPDATE Produtos SET ativo = 0 WHERE id = ?",
					[dados.produtoId],
					(erro: Error | null) => erro ? reject(erro) : resolve(),
				);
			});
		}, { produtoId: fixture.produtoInativo.produtoId, userDataEsperado: userDataDir });

		const metadados = await window.evaluate(async () => ({
			produtos: await window.api.listarProdutosDetalhados(true),
			categorias: await window.api.categoriasWithUsage(true),
		}));
		const categoriasPorProduto = mapearCategoriasPorProduto(metadados.produtos, metadados.categorias);
		for (const produtoId of [fixture.produtoA.produtoId, fixture.produtoLegado.produtoId, fixture.produtoInativo.produtoId]) {
			expect(categoriasPorProduto.get(produtoId)?.has(fixture.raizAId)).toBe(true);
		}
		expect(categoriasPorProduto.get(fixture.produtoB.produtoId)?.has(fixture.raizBId)).toBe(true);
		expect(metadados.produtos.find((produto) => produto.id === fixture.produtoInativo.produtoId)?.ativo).toBe(0);

		const canalCategorias = "categorias-with-usage";
		let barreiraCategoriasInstalada = false;
		try {
			await electronApp.evaluate(({ ipcMain }, canal) => {
				type HandlerLocal = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
				type BarreiraLocal = {
					original: HandlerLocal;
					chamadas: number;
					liberar: (() => void) | null;
				};
				type Globals = typeof globalThis & { barreiraCategoriasS3410?: BarreiraLocal };
				const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, HandlerLocal> })._invokeHandlers;
				const original = handlers.get(canal);
				if (!original) throw new Error(`Handler ${canal} não encontrado`);
				const estado: BarreiraLocal = { original, chamadas: 0, liberar: null };
				(globalThis as Globals).barreiraCategoriasS3410 = estado;
				ipcMain.removeHandler(canal);
				ipcMain.handle(canal, (event, ...args) => {
					estado.chamadas += 1;
					if (estado.chamadas !== 1) return estado.original(event, ...args);
					return new Promise<unknown>((resolve, reject) => {
						estado.liberar = () => {
							void Promise.resolve(estado.original(event, ...args)).then(resolve, reject);
						};
					});
				});
			}, canalCategorias);
			barreiraCategoriasInstalada = true;

			await abrirEstoque();
			const abrirMovimentacoesInicial = window.getByRole("button", { name: "Ver movimentações", exact: true }).and(visible());
			await abrirMovimentacoesInicial.click();
			const dialogCargaInicial = window.getByRole("dialog", { name: "Últimas movimentações" }).and(visible());
			const filtroCargaInicial = dialogCargaInicial.locator("#filtro-categoria-movimentacoes");
			await expect(filtroCargaInicial).toBeDisabled();
			await expect.poll(() => electronApp.evaluate(() => {
				type Globals = typeof globalThis & { barreiraCategoriasS3410?: { chamadas: number } };
				return (globalThis as Globals).barreiraCategoriasS3410?.chamadas ?? 0;
			})).toBe(1);

			await electronApp.evaluate(() => {
				type Globals = typeof globalThis & { barreiraCategoriasS3410?: { liberar: (() => void) | null } };
				const estado = (globalThis as Globals).barreiraCategoriasS3410;
				if (!estado?.liberar) throw new Error("A resposta inicial de categorias não está pendente");
				const liberar = estado.liberar;
				estado.liberar = null;
				liberar();
			});
			await expect(filtroCargaInicial).toBeEnabled();
			await expect.poll(() => electronApp.evaluate(() => {
				type Globals = typeof globalThis & { barreiraCategoriasS3410?: { chamadas: number } };
				return (globalThis as Globals).barreiraCategoriasS3410?.chamadas ?? 0;
			})).toBe(1);
			await dialogCargaInicial.getByRole("button", { name: "Fechar", exact: true }).click();
			await expect(dialogCargaInicial).toHaveCount(0);
		} finally {
			if (barreiraCategoriasInstalada) {
				await electronApp.evaluate(({ ipcMain }, canal) => {
					type HandlerLocal = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
					type Globals = typeof globalThis & {
						barreiraCategoriasS3410?: { original: HandlerLocal; liberar: (() => void) | null };
					};
					const estado = (globalThis as Globals).barreiraCategoriasS3410;
					if (!estado) return;
					estado.liberar?.();
					estado.liberar = null;
					ipcMain.removeHandler(canal);
					ipcMain.handle(canal, (event, ...args) => estado.original(event, ...args));
					delete (globalThis as Globals).barreiraCategoriasS3410;
				}, canalCategorias);
			}
		}

		const abrirMovimentacoes = window.getByRole("button", { name: "Ver movimentações", exact: true }).and(visible());
		await abrirMovimentacoes.click();
		const dialog = window.getByRole("dialog", { name: "Últimas movimentações" }).and(visible());
		const filtro = dialog.locator("#filtro-categoria-movimentacoes");
		await expect(filtro).toBeEnabled();
		const linhasHistorico = dialog.getByRole("region", { name: "Histórico de movimentações" }).locator(".divide-y > div");
		await expect(linhasHistorico).toHaveCount(30);
		await expect(dialog.getByText("S34.10-ORDEM-30")).toBeVisible();
		await expect(dialog.getByText("S34.10-ORDEM-06")).toHaveCount(0);
		await expect(dialog.getByText("S34.10-ORDEM-07")).toBeVisible();
		await expect(dialog.getByText("S34.10-ENTRADA-A")).toBeVisible();
		await expect(dialog.getByText("S34.10-SAIDA-A")).toBeVisible();
		await expect(dialog.getByText("S34.10-AJUSTE-A")).toBeVisible();
		await expect(dialog.getByText("S34.10-LEGADO")).toBeVisible();
		await expect(dialog.getByText("S34.10-INATIVO")).toBeVisible();
		await expect(dialog.getByText("+3", { exact: true })).toHaveCount(1);
		await expect(dialog.getByText("3", { exact: true })).toBeVisible();
		await expect(dialog.getByText("-2", { exact: true })).toBeVisible();

		await filtro.selectOption(String(fixture.raizAId));
		await expect(dialog.getByText("S34.10-ENTRADA-A")).toBeVisible();
		await expect(dialog.getByText("S34.10-SAIDA-A")).toBeVisible();
		await expect(dialog.getByText("S34.10-AJUSTE-A")).toBeVisible();
		await expect(dialog.getByText("S34.10-LEGADO")).toBeVisible();
		await expect(dialog.getByText("S34.10-INATIVO")).toBeVisible();
		await expect(dialog.getByText("S34.10-HOMONIMO-B")).toHaveCount(0);
		await filtro.selectOption(String(fixture.raizBId));
		await expect(dialog.getByText("S34.10-HOMONIMO-B")).toBeVisible();
		await expect(dialog.getByText("S34.10-ENTRADA-A")).toHaveCount(0);
		await expect(dialog.getByText("S34.10-LEGADO")).toHaveCount(0);

		await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
		await expect(dialog).toHaveCount(0);

		const instalarFalha = async (canal: string) => {
			await electronApp.evaluate(({ ipcMain }, nomeCanal) => {
				type HandlerLocal = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
				type FalhaLocal = { original: HandlerLocal; falhar: boolean; chamadas: number };
				type Globals = typeof globalThis & { falhasS3410?: Record<string, FalhaLocal> };
				const falhas = ((globalThis as Globals).falhasS3410 ||= {});
				const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, HandlerLocal> })._invokeHandlers;
				const original = handlers.get(nomeCanal);
				if (!original) throw new Error(`Handler ${nomeCanal} não encontrado`);
				const estado: FalhaLocal = { original, falhar: true, chamadas: 0 };
				falhas[nomeCanal] = estado;
				ipcMain.removeHandler(nomeCanal);
				ipcMain.handle(nomeCanal, async (event, ...args) => {
					estado.chamadas += 1;
					if (estado.falhar) throw new Error(`Falha de metadata simulada: ${nomeCanal}`);
					return original(event, ...args);
				});
			}, canal);
		};
		const encerrarFalha = async (canal: string, restaurar: boolean) => {
			await electronApp.evaluate(({ ipcMain }, { canal: nomeCanal, restaurar }) => {
				type HandlerLocal = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
				type FalhaLocal = { original: HandlerLocal; falhar: boolean; chamadas: number };
				type Globals = typeof globalThis & { falhasS3410?: Record<string, FalhaLocal> };
				const falhas = (globalThis as Globals).falhasS3410;
				const estado = falhas?.[nomeCanal];
				if (!estado) return;
				if (restaurar) {
					ipcMain.removeHandler(nomeCanal);
					ipcMain.handle(nomeCanal, (event, ...args) => estado.original(event, ...args));
					delete falhas?.[nomeCanal];
				} else {
					estado.falhar = false;
				}
				if (falhas && Object.keys(falhas).length === 0) delete (globalThis as Globals).falhasS3410;
			}, { canal, restaurar });
		};
		const verificarFalhaERetry = async (canal: string) => {
			await instalarFalha(canal);
			try {
				await abrirMovimentacoes.click();
				const dialogFalha = window.getByRole("dialog", { name: "Últimas movimentações" }).and(visible());
				await expect(dialogFalha.getByRole("alert")).toHaveText(
					"Não foi possível carregar as categorias. Tente novamente.",
				);
				await expect(dialogFalha.locator("#filtro-categoria-movimentacoes")).toBeDisabled();
				await expect(dialogFalha.getByText("S34.10-ORDEM-30")).toBeVisible();
				await expect(dialogFalha.getByRole("region", { name: "Histórico de movimentações" }).locator(".divide-y > div")).toHaveCount(30);
				await encerrarFalha(canal, false);
				await dialogFalha.getByRole("button", { name: "Tentar novamente", exact: true }).click();
				await expect(dialogFalha.getByRole("alert")).toHaveCount(0);
				await expect(dialogFalha.locator("#filtro-categoria-movimentacoes")).toBeEnabled();
				await expect(dialogFalha.locator("#filtro-categoria-movimentacoes")).toHaveValue(String(fixture.raizBId));
				await expect(dialogFalha.getByText("S34.10-HOMONIMO-B")).toBeVisible();
				await expect(dialogFalha.getByText("S34.10-ENTRADA-A")).toHaveCount(0);
				await dialogFalha.getByRole("button", { name: "Fechar", exact: true }).click();
				await expect(dialogFalha).toHaveCount(0);
			} finally {
				await encerrarFalha(canal, true);
			}
		};
		await verificarFalhaERetry("categorias-with-usage");
		await verificarFalhaERetry("listar-produtos-detalhados");
	});
});
