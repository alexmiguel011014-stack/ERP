import { _electron as electron, expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import type { ElectronApplication, Locator, Page } from "playwright-core";

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

	// O sistema de abas (Header Tab System) mantém painéis de rotas
	// anteriormente visitadas montados no DOM (keep-alive) — inclusive o
	// stub de redirect `/produtos` → `/produtos/cadastro`. Isso faz
	// getByPlaceholder/getByRole baterem em mais de um elemento com o mesmo
	// texto (só um de fato visível). `.and(visible())` restringe ao que
	// está realmente na tela, sem depender de conhecer a estrutura exata do
	// cache de abas.
	function visible(): Locator {
		return window.locator(":visible");
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
	});

	test.afterAll(async () => {
		await electronApp.close();
		fs.rmSync(userDataDir, { recursive: true, force: true });
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
});
