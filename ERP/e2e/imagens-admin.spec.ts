import { _electron as electron, expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import type { ElectronApplication, Locator, Page } from "playwright-core";

const ROOT = path.join(__dirname, "..");

// Ver GOALS.md "Image Database & Management": "Gerenciar Imagens" vive DENTRO
// de /banco (botão no topo, não item separado na sidebar — pedido do dono
// depois de ver a primeira versão ao vivo), reusando o mesmo gate de senha.
test.describe("Gerenciar Imagens (dentro de Banco de Dados)", () => {
	let electronApp: ElectronApplication;
	let window: Page;
	let userDataDir: string;
	let imagemFalsaPath: string;

	function visible(): Locator {
		return window.locator(":visible");
	}

	test.beforeAll(async () => {
		userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-e2e-imagens-"));
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

		// Cria dois produtos com imagem — um deles serve pra provar que a busca
		// dinâmica por nome realmente filtra, não só lista tudo.
		await window
			.locator("aside")
			.getByTitle("Produtos", { exact: true })
			.click();

		for (const nomeProduto of [
			"Produto Com Imagem Admin E2E",
			"Outro Produto Com Foto",
		]) {
			const nome = window
				.getByPlaceholder("Ex: Quimono Trançado")
				.and(visible());
			await expect(nome).toBeVisible();
			await nome.fill(nomeProduto);
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

			await window
				.getByRole("button", { name: "Cancelar Edição" })
				.and(visible())
				.click();
		}
	});

	test.afterAll(async () => {
		await electronApp.close();
		fs.rmSync(userDataDir, { recursive: true, force: true });
	});

	test("botão 'Gerenciar Imagens' só aparece depois da senha, dentro de Banco de Dados", async () => {
		await window
			.locator("aside")
			.getByTitle("Banco de Dados", { exact: true })
			.click();
		// Mesmo formulário de reautenticação de sempre (Label "Sua senha" +
		// placeholder "Senha do seu login").
		await expect(
			window.getByPlaceholder("Senha do seu login").and(visible()),
		).toBeVisible();
		await expect(
			window.getByRole("button", { name: "Gerenciar Imagens" }).and(visible()),
		).toHaveCount(0);

		await window
			.getByPlaceholder("Senha do seu login")
			.and(visible())
			.fill("teste123");
		await window
			.getByRole("button", { name: "Confirmar" })
			.and(visible())
			.click();

		await expect(
			window.getByRole("button", { name: "Gerenciar Imagens" }).and(visible()),
		).toBeVisible();
	});

	test("clicar em 'Gerenciar Imagens' mostra o grid com as imagens dos produtos criados", async () => {
		await window
			.getByRole("button", { name: "Gerenciar Imagens" })
			.and(visible())
			.click();

		await expect(
			window.getByRole("button", { name: /Produtos \(2\)/ }).and(visible()),
		).toBeVisible();
		await expect(
			window.getByText("Produto Com Imagem Admin E2E").and(visible()),
		).toBeVisible();
		await expect(
			window.getByText("Outro Produto Com Foto").and(visible()),
		).toBeVisible();
	});

	test("busca dinâmica filtra por nome do produto sem precisar confirmar", async () => {
		await window
			.getByPlaceholder("Buscar por nome do produto...")
			.and(visible())
			.fill("Outro Produto");

		await expect(
			window.getByText("Outro Produto Com Foto").and(visible()),
		).toBeVisible();
		await expect(
			window.getByText("Produto Com Imagem Admin E2E").and(visible()),
		).toHaveCount(0);

		await window
			.getByPlaceholder("Buscar por nome do produto...")
			.and(visible())
			.fill("");
	});

	test("aba Outros começa vazia (nenhuma entidade além de produto ainda)", async () => {
		await window
			.getByRole("button", { name: /Outros \(0\)/ })
			.and(visible())
			.click();
		await expect(
			window
				.getByText("Nenhuma outra entidade além de produtos")
				.and(visible()),
		).toBeVisible();
	});

	test("aba Órfãs começa vazia (produtos criados ainda existem)", async () => {
		await window
			.getByRole("button", { name: /Órfãs \(0\)/ })
			.and(visible())
			.click();
		await expect(
			window.getByText("Nenhuma imagem órfã.").and(visible()),
		).toBeVisible();
		await window
			.getByRole("button", { name: /Produtos \(/ })
			.and(visible())
			.click();
	});

	test("excluir uma imagem pelo grid remove do grid e do formulário do produto", async () => {
		await window
			.getByText("Produto Com Imagem Admin E2E")
			.and(visible())
			.locator("..")
			.getByRole("button", { name: "Excluir" })
			.click();
		await window
			.getByPlaceholder("Confirme sua senha para continuar")
			.and(visible())
			.fill("teste123");
		await window
			.getByRole("button", { name: "Confirmar" })
			.and(visible())
			.click();

		await expect(
			window.getByText("Imagem removida.").and(visible()),
		).toBeVisible();
		await expect(
			window.getByRole("button", { name: /Produtos \(1\)/ }).and(visible()),
		).toBeVisible();

		// A mesma imagem some do formulário de edição do produto — prova que
		// excluir pela tela de administração também limpa Produtos.imagem_id
		// (via ON DELETE SET NULL), não só a linha em Imagens.
		await window
			.locator("aside")
			.getByTitle("Produtos", { exact: true })
			.click();
		const produtos = await window.evaluate(() =>
			window.api.listarProdutosDetalhados(false),
		);
		const produto = produtos.find(
			(p: { nome: string }) => p.nome === "Produto Com Imagem Admin E2E",
		);
		expect(produto?.imagem).toBeFalsy();
	});
});
