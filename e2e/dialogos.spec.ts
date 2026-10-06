import { _electron as electron, expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import type { ElectronApplication, Locator, Page } from "playwright-core";
import { vigiarDialogosNativos } from "./helpers/dialogos-nativos";

const ROOT = path.join(__dirname, "..");

// GOALS 31: fluxo "excluir produto" relatado por um cliente (o campo de senha
// "não respondia") e os diálogos in-app que substituem alert()/confirm().
//
// Honestidade sobre o alcance: o bug original (Electron/Windows perde o foco
// do teclado depois de um alert()/confirm() NATIVO) é do SO/Chromium e o
// Playwright injeta teclado via CDP, que não passa por esse caminho — então
// este spec NÃO prova o conserto do Electron (isso é a verificação manual com
// teclado de verdade, GOALS 31-04). Ele prova o que dá pra provar
// automaticamente: nenhum diálogo nativo abre nesses fluxos (tripwire), o
// campo de senha já nasce focado, o Esc fecha só o modal do topo e o foco
// volta pra quem abriu.
test.describe.configure({ mode: "serial" });

test.describe("diálogos in-app e fluxo de exclusão", () => {
	let electronApp: ElectronApplication;
	let window: Page;
	let userDataDir: string;
	let vigia: ReturnType<typeof vigiarDialogosNativos>;

	function visible(): Locator {
		return window.locator(":visible");
	}

	const SENHA_PLACEHOLDER = "Confirme sua senha para continuar";
	const cabecalhoLista = () =>
		window.getByRole("heading", { name: "Lista de Produtos" });
	const dialogo = () => window.getByRole("alertdialog");

	async function abrirListaDeProdutos() {
		await window
			.locator("aside")
			.getByTitle("Produtos", { exact: true })
			.click();
		await expect(
			window.getByPlaceholder("Ex: Quimono Trançado").and(visible()),
		).toBeVisible();
		await window
			.getByRole("button", { name: "Lista de Produtos" })
			.and(visible())
			.click();
		await expect(cabecalhoLista()).toBeVisible();
	}

	test.beforeAll(async () => {
		userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-e2e-dialogos-"));
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
		vigia = vigiarDialogosNativos(window);
		await window.waitForLoadState("domcontentloaded");
		await window.getByPlaceholder("Seu login de acesso").fill("teste");
		await window.getByPlaceholder("Digite a senha de acesso").fill("teste123");
		await window.getByRole("button", { name: "Entrar" }).click();
		await expect(
			window.locator("header").getByTitle("Dashboard", { exact: true }),
		).toBeVisible();

		await window.evaluate(async () => {
			await window.api.salvarProduto({
				nome: "Produto Exclusao E2E",
				variacoes: [
					{
						sku: "EXCLUSAO-E2E",
						preco: 10,
						preco_custo: 0,
						quantidade_estoque: 1,
						atributos: [{ chave: "Tamanho", valor: "Único" }],
					},
				],
			});
			await window.api.salvarFornecedor({
				nome: "Fornecedor Dialogo E2E",
				cnpj: "",
				telefone: "",
			});
		});
	}, { timeout: 90_000 });

	test.afterEach(() => {
		vigia.garantirNenhum();
	});

	test.afterAll(async () => {
		await electronApp.close();
		fs.rmSync(userDataDir, { recursive: true, force: true });
	});

	test("excluir produto: a senha já abre focada, aceita digitação, Esc fecha só o modal do topo e devolve o foco ao botão", async () => {
		await abrirListaDeProdutos();
		const excluir = window
			.getByRole("button", { name: "Excluir", exact: true })
			.and(visible());
		await excluir.click();

		const senha = window.getByPlaceholder(SENHA_PLACEHOLDER);
		// Antes: sem autoFocus, o usuário precisava clicar no campo — e qualquer
		// perda de foco parecia um campo "morto".
		await expect(senha).toBeFocused();
		await window.keyboard.type("senha-errada");
		await expect(senha).toHaveValue("senha-errada");

		await window.keyboard.press("Enter");
		await expect(
			window.getByText("Senha incorreta ou usuário sem perfil admin/dono."),
		).toBeVisible();

		// Esc fecha só a senha; a Lista de Produtos continua aberta.
		await window.keyboard.press("Escape");
		await expect(senha).toBeHidden();
		await expect(cabecalhoLista()).toBeVisible();
		// ...e o foco volta pro botão "Excluir" que abriu o modal.
		await expect(excluir).toBeFocused();
	});

	test("excluir produto: a senha correta manda o produto pra Lixeira", async () => {
		const excluir = window
			.getByRole("button", { name: "Excluir", exact: true })
			.and(visible());
		await excluir.click();
		const senha = window.getByPlaceholder(SENHA_PLACEHOLDER);
		await expect(senha).toBeFocused();
		await window.keyboard.type("teste123");
		await window.keyboard.press("Enter");

		await expect(senha).toBeHidden();
		await expect(
			window.getByText("Nenhum produto cadastrado ainda."),
		).toBeVisible();

		await window.getByRole("button", { name: "Lixeira" }).click();
		await expect(
			window.getByRole("cell", { name: "Produto Exclusao E2E" }),
		).toBeVisible();
	});

	test("aviso in-app (substitui alert): abre com o foco no OK, Enter fecha e o foco volta ao botão que o disparou", async () => {
		// Estamos na Lixeira com 1 produto; sem produtos não haveria o que
		// exportar — então volta pros ativos (agora vazios) e exporta.
		await window.getByRole("button", { name: "Ver ativos" }).click();
		const exportar = window.getByRole("button", { name: "Exportar CSV" });
		await exportar.click();

		await expect(dialogo()).toBeVisible();
		await expect(dialogo()).toContainText("Nenhum produto para exportar.");
		const ok = dialogo().getByRole("button", { name: "OK" });
		await expect(ok).toBeFocused();

		await window.keyboard.press("Enter");
		await expect(dialogo()).toBeHidden();
		await expect(exportar).toBeFocused();
		// A lista por baixo continua aberta (o Esc/Enter do aviso não a fecha).
		await expect(cabecalhoLista()).toBeVisible();
		await window.keyboard.press("Escape");
		await expect(cabecalhoLista()).toBeHidden();
	});

	test("confirmação destrutiva in-app: o foco inicial é o Cancelar, Esc cancela, e só 'Excluir' confirma", async () => {
		await window
			.locator("aside")
			.getByTitle("Fornecedores", { exact: true })
			.click();
		const linhaExcluir = window
			.getByRole("button", { name: "Excluir", exact: true })
			.and(visible());
		await expect(linhaExcluir).toBeVisible();

		await linhaExcluir.click();
		await expect(dialogo()).toContainText('Excluir "Fornecedor Dialogo E2E"?');
		// Destrutivo: Enter acidental não confirma.
		await expect(
			dialogo().getByRole("button", { name: "Cancelar" }),
		).toBeFocused();
		await window.keyboard.press("Escape");
		await expect(dialogo()).toBeHidden();
		await expect(linhaExcluir).toBeFocused();
		await expect(
			window.getByText("Fornecedor Dialogo E2E").and(visible()),
		).toBeVisible();

		await linhaExcluir.click();
		await dialogo().getByRole("button", { name: "Excluir" }).click();
		await expect(
			window.getByText("Fornecedor Dialogo E2E").and(visible()),
		).toHaveCount(0);
	});
});
