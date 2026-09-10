import { _electron as electron, expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import type { ElectronApplication, Locator, Page } from "playwright-core";

const ROOT = path.join(__dirname, "..");

// Ver GOALS.md "Image Database & Management": tela nova de administração
// pra ver/excluir as imagens salvas no banco (Imagens), separada do
// visualizador cru de tabelas (/banco) e reusando o mesmo gate de senha.
test.describe("Gerenciar Imagens (admin)", () => {
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

		// Cria um produto com imagem primeiro — a tela de Gerenciar Imagens
		// precisa de pelo menos uma imagem real salva pra testar visualizar/excluir.
		await window
			.locator("aside")
			.getByTitle("Produtos", { exact: true })
			.click();
		const nome = window.getByPlaceholder("Ex: Quimono Trançado").and(visible());
		await expect(nome).toBeVisible();
		await nome.fill("Produto Com Imagem Admin E2E");
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
	});

	test.afterAll(async () => {
		await electronApp.close();
		fs.rmSync(userDataDir, { recursive: true, force: true });
	});

	test("pede senha antes de mostrar qualquer imagem", async () => {
		await window
			.locator("aside")
			.getByTitle("Gerenciar Imagens", { exact: true })
			.click();
		// Mesmo formulário de reautenticação do /banco (Label "Sua senha" +
		// placeholder "Senha do seu login") — prova o gate sem depender de onde
		// o subtítulo do cabeçalho de página é (ou não) renderizado.
		await expect(
			window.getByPlaceholder("Senha do seu login").and(visible()),
		).toBeVisible();
		// Nenhum grid de imagens deve aparecer antes da senha ser confirmada.
		await expect(window.getByText("Todas (").and(visible())).toHaveCount(0);
	});

	test("senha correta mostra o grid com a imagem do produto criado", async () => {
		await window
			.getByPlaceholder("Senha do seu login")
			.and(visible())
			.fill("teste123");
		await window
			.getByRole("button", { name: "Confirmar" })
			.and(visible())
			.click();

		await expect(
			window.getByText("Produto Com Imagem Admin E2E").and(visible()),
		).toBeVisible();
	});

	test("aba Órfãs começa vazia (produto criado ainda existe)", async () => {
		await window
			.getByRole("button", { name: /Órfãs \(0\)/ })
			.and(visible())
			.click();
		await expect(
			window.getByText("Nenhuma imagem órfã.").and(visible()),
		).toBeVisible();
		await window
			.getByRole("button", { name: /Todas \(/ })
			.and(visible())
			.click();
	});

	test("excluir a imagem pelo grid remove do grid e do formulário do produto", async () => {
		await window
			.getByRole("button", { name: "Excluir" })
			.and(visible())
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
			window.getByText("Nenhuma imagem salva ainda.").and(visible()),
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
