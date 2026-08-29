import { _electron as electron, expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import type { ElectronApplication, Page } from "playwright-core";

const ROOT = path.join(__dirname, "..");

// Regressão real desta suíte: `frontend/next.config.ts` usa
// `trailingSlash: true` (obrigatório pro export estático), então
// `usePathname()` sempre devolve a rota COM barra no final
// ("/financeiro/"), enquanto `hrefDoModulo()` (hooks/useModulos.ts) gerava
// hrefs SEM barra. `TabsContext.tsx` comparava os dois direto — nunca
// batia pra nenhum módulo fora a raiz "/", então só o Dashboard virava aba
// de verdade no header, não importa em qual módulo o usuário estivesse.
// Corrigido com `normalizarPathname()`. Este teste existe pra nunca deixar
// essa classe de bug voltar sem ser notada.
test.describe("sistema de abas do header (frontend novo)", () => {
	let electronApp: ElectronApplication;
	let window: Page;
	let userDataDir: string;

	test.beforeAll(async () => {
		userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-e2e-"));
		electronApp = await electron.launch({
			args: ["."],
			cwd: ROOT,
			env: {
				...process.env,
				// Frontend novo é o padrão desde o cutover (2026-08-28) — não
				// precisa mais de env var pra ligar.
				ERP_TEST_USERDATA_DIR: userDataDir,
				// checkForUpdates() bate rede de verdade (GitHub) — sem isso, o
				// teste de navegação pós-Atualizações dependeria de
				// conectividade real, inconsistente em CI/sandbox (ver
				// ipc/sistema.js).
				ERP_MOCK_UPDATER: "1",
			},
		});
		window = await electronApp.firstWindow();
		await window.waitForLoadState("domcontentloaded");
	});

	test.afterAll(async () => {
		await electronApp.close();
		fs.rmSync(userDataDir, { recursive: true, force: true });
	});

	test("login (bootstrap em banco vazio) leva ao Dashboard, sem X pra fechar", async () => {
		await window.getByPlaceholder("Seu login de acesso").fill("teste");
		await window.getByPlaceholder("Digite a senha de acesso").fill("teste123");
		await window.getByRole("button", { name: "Entrar" }).click();

		// "Dashboard" existe tanto no link da sidebar quanto na aba do header
		// depois do login — escopar por contêiner evita ambiguidade.
		await expect(
			window.locator("header").getByTitle("Dashboard", { exact: true }),
		).toBeVisible();
		await expect(window.getByTitle("Fechar Dashboard")).toHaveCount(0);
	});

	test("navegar para Financeiro registra a aba (não fica preso só no Dashboard)", async () => {
		await window
			.locator("aside")
			.getByTitle("Financeiro", { exact: true })
			.click();
		await expect(window.getByTitle("Fechar Financeiro")).toBeVisible();
	});

	test("navegar para Produtos registra outra aba, SEM fechar a de Financeiro", async () => {
		await window
			.locator("aside")
			.getByTitle("Produtos", { exact: true })
			.click();
		await expect(window.getByTitle("Fechar Produtos")).toBeVisible();
		// O ponto central do recurso: múltiplas abas abertas ao mesmo tempo,
		// não uma navegação simples que substitui a anterior.
		await expect(window.getByTitle("Fechar Financeiro")).toBeVisible();
		await expect(
			window.locator("header").getByTitle("Dashboard", { exact: true }),
		).toBeVisible();
	});

	test("fechar uma aba não fechável (Dashboard) — botão não existe", async () => {
		await expect(window.getByTitle("Fechar Dashboard")).toHaveCount(0);
	});

	// Regressão real (2026-08-29): depois de visitar Atualizações, toda
	// navegação subsequente ficava travada — o pathname mudava (a sidebar
	// reagia), mas o conteúdo/abas do header nunca trocavam.
	// ERP_MOCK_UPDATER=1 (ipc/sistema.js) faz checkForUpdates() resolver na
	// hora, sem bater rede — prova que essa trava NÃO é sobre rede/DNS (duas
	// correções nessa linha de investigação, fs.readFile no protocolo
	// app://renderer/ e normalizarPathname em AbasAtivasWrapper, continuam
	// válidas por si só, mas não foram a causa raiz). Causa raiz real, achada
	// via instrumentação temporária + repro isolado fora da suíte
	// (2026-08-29): `atualizacao/page.tsx` passava um elemento JSX inline
	// como `subtitulo` pra `usePageHeader(titulo, subtitulo)` — um objeto
	// NOVO a cada render, então o `useEffect` de `usePageHeader`
	// (`context/PageHeaderContext.tsx`) reexecutava a CADA render dessa
	// página. Como `AtualizacaoPage` fica genuinamente montada mesmo
	// escondida (`AbasAtivasWrapper`) e `useAtualizacao()` mantém o listener
	// de "update-status" vivo pra sempre, todo evento reacendia o ciclo — e
	// `PageHeaderProvider` embrulha a árvore inteira sem memo em nenhum
	// filho, então cada `setCabecalho` re-renderizava TODAS as abas em
	// cache, competindo com o commit da aba pra qual o usuário tinha acabado
	// de navegar. Corrigido com `useMemo` no `subtitulo` (só esse arquivo —
	// as outras 15 páginas que chamam `usePageHeader` passam strings
	// literais, já estáveis por natureza). Confirmado ao vivo: este teste
	// passou a passar depois do fix, exatamente como o comentário abaixo do
	// antigo `test.fail()` previa que aconteceria.
	test("navegar pra Atualizações e depois pra outro módulo continua funcionando", async () => {
		await window
			.locator("aside")
			.getByTitle("Atualizações", { exact: true })
			.click();
		await expect(window.getByTitle("Fechar Atualizações")).toBeVisible();

		// Espera a checagem (mockada, resolve na hora) terminar antes de
		// navegar — a trava observada ao vivo acontecia especificamente
		// DEPOIS do "Aplicativo atualizado" já estar na tela.
		// `p:visible` (não só getByText) porque o cache-de-abas mantém uma
		// cópia oculta (`AbasAtivasWrapper`) — getByText sozinho vê as duas.
		await expect(
			window.locator("p:visible", { hasText: "Aplicativo atualizado" }),
		).toBeVisible();

		await window
			.locator("aside")
			.getByTitle("Compras", { exact: true })
			.click();
		await expect(window.getByTitle("Fechar Compras")).toBeVisible();
	});
});
