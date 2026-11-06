#!/usr/bin/env node
/* global window */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron, expect } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LOGIN = "demo34";
const PASSWORD = "estoque34demo";
const SUPPORT_LOGIN = "demo34suporte";
const SUPPORT_PASSWORD = "suporte-demo-34";

const PRODUTOS = [
	{
		nome: "Kimono demo",
		variacoes: [
			{
				sku: "DEMO-A1",
				preco: 100,
				preco_custo: 50,
				quantidade_estoque: 5,
				estoque_minimo: 2,
				atributos: [{ chave: "Tamanho", valor: "A1" }],
			},
			{
				sku: "DEMO-A2",
				preco: 100,
				preco_custo: 50,
				quantidade_estoque: 5,
				estoque_minimo: 2,
				atributos: [{ chave: "Tamanho", valor: "A2" }],
			},
		],
	},
	{
		nome: "Faixa demo",
		variacoes: [
			{
				sku: "DEMO-FAIXA",
				preco: 100,
				preco_custo: 50,
				quantidade_estoque: 1,
				estoque_minimo: 2,
				atributos: [{ chave: "Tamanho", valor: "A1" }],
			},
		],
	},
];

function canonizarCaminho(caminho) {
	const resolvido = path.resolve(caminho);
	return process.platform === "win32" ? resolvido.toLowerCase() : resolvido;
}

function compararCaminhos(rotulo, atual, esperado) {
	assert.equal(
		canonizarCaminho(atual),
		canonizarCaminho(esperado),
		`${rotulo} fora do perfil demo. Esperado: ${esperado}; recebido: ${atual}`,
	);
}

function criarAmbiente(profileDir) {
	const env = { ...process.env };
	delete env.ELECTRON_RUN_AS_NODE;
	Object.assign(env, {
		ERP_TEST_USERDATA_DIR: profileDir,
		ERP_MOCK_UPDATER: "1",
		ERP_SUPORTE_LOGIN: SUPPORT_LOGIN,
		ERP_SUPORTE_SENHA: SUPPORT_PASSWORD,
	});
	return env;
}

async function iniciarElectron(apps, profileDir) {
	const app = await electron.launch({
		args: ["."],
		cwd: ROOT,
		env: criarAmbiente(profileDir),
	});
	apps.push(app);
	const page = await app.firstWindow();
	page.setDefaultTimeout(15000);
	await page.waitForLoadState("domcontentloaded");
	return { app, page };
}

async function verificarCaminhosPrincipais(app, profileDir) {
	const esperadoBanco = path.join(profileDir, "erp_housekimono.sqlite");
	const caminhos = await app.evaluate(({ app: electronApp }) => ({
		userData: electronApp.getPath("userData"),
		banco: process.mainModule.require("./database.js").getDBPath(),
	}));
	compararCaminhos("app.getPath(userData)", caminhos.userData, profileDir);
	compararCaminhos("database.getDBPath()", caminhos.banco, esperadoBanco);
}

async function verificarCaminhoPelaApi(page, profileDir) {
	const recebido = await page.evaluate(() => window.api.getDBPath());
	compararCaminhos(
		"window.api.getDBPath()",
		recebido,
		path.join(profileDir, "erp_housekimono.sqlite"),
	);
}

async function autenticar(page) {
	await page.getByPlaceholder("Seu login de acesso").fill(LOGIN);
	await page.getByPlaceholder("Digite a senha de acesso").fill(PASSWORD);
	await page.getByRole("button", { name: "Entrar", exact: true }).click();
	await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toBeVisible({
		timeout: 30000,
	});
}

function listarVariacoesDemo() {
	return PRODUTOS.flatMap((produto) =>
		produto.variacoes.map((variacao) => ({
			...variacao,
			nome: produto.nome,
		})),
	);
}

async function criarProdutosPeloApp(page) {
	const resultados = await page.evaluate(async (produtos) => {
		const salvos = [];
		for (const produto of produtos) {
			salvos.push(await window.api.salvarProduto(produto));
		}
		return salvos;
	}, PRODUTOS);
	assert.equal(resultados.length, PRODUTOS.length);
	for (const resultado of resultados) {
		assert.equal(resultado.success, true, "O IPC não confirmou o cadastro do produto.");
		assert.ok(Number.isInteger(resultado.produtoId), "O IPC não devolveu o ID do produto.");
	}
}

async function verificarDadosPeloApp(page) {
	const esperados = listarVariacoesDemo();
	const encontrados = await page.evaluate(async (skus) => {
		const itens = [];
		for (const sku of skus) itens.push(await window.api.buscarSKU(sku));
		return itens;
	}, esperados.map((item) => item.sku));

	for (let i = 0; i < esperados.length; i += 1) {
		const esperado = esperados[i];
		const atual = encontrados[i];
		assert.ok(atual, `Variação ausente depois da reautenticação: ${esperado.sku}`);
		assert.equal(atual.nome, esperado.nome);
		assert.equal(atual.sku, esperado.sku);
		assert.equal(atual.quantidade_estoque, esperado.quantidade_estoque);
		assert.equal(atual.estoque_minimo, esperado.estoque_minimo);
		assert.equal(atual.preco, esperado.preco);
		assert.equal(atual.preco_custo, esperado.preco_custo);
	}
}

async function verificarListaDoEstoque(page) {
	await page.locator("aside").getByTitle("Produtos", { exact: true }).click();
	await page.getByRole("link", { name: "Estoque", exact: true }).click();
	const lista = page
		.getByRole("region", { name: "Lista completa do estoque", exact: true })
		.and(page.locator(":visible"));
	await expect(lista).toBeVisible();
	const busca = lista.getByPlaceholder("Buscar por nome, SKU, código de barras ou ID...");

	for (const esperado of listarVariacoesDemo()) {
		await busca.fill(esperado.sku);
		const linha = lista.getByRole("row", {
			name: new RegExp(`^${esperado.sku}(?:\\s|$)`),
		});
		await expect(linha).toBeVisible();
		await expect(linha.getByRole("cell").nth(3)).toHaveText(
			String(esperado.quantidade_estoque),
		);
		await expect(
			linha.getByRole("spinbutton", {
				name: `Estoque mínimo de ${esperado.nome}, SKU ${esperado.sku}`,
			}),
		).toHaveValue(String(esperado.estoque_minimo));
		await expect(linha.getByRole("cell").nth(5)).toContainText(/R\$\s?50,00/);
	}
}


async function fecharAplicativo(app, apps) {
	await app.close();
	const indice = apps.indexOf(app);
	if (indice !== -1) apps.splice(indice, 1);
}

async function fecharAplicativos(apps) {
	const erros = [];
	for (const app of [...apps].reverse()) {
		try {
			await fecharAplicativo(app, apps);
		} catch (erro) {
			erros.push(erro);
		}
	}
	return erros;
}

function citarPowerShell(valor) {
	return `'${String(valor).replace(/'/g, "''")}'`;
}

function imprimirInstrucoes(profileDir) {
	console.log("Demonstração isolada preparada e conferida.");
	console.log(`Pasta demo: ${profileDir}`);
	console.log(`Banco demo: ${path.join(profileDir, "erp_housekimono.sqlite")}`);
	console.log(`Acesso à loja demo: usuário ${LOGIN} · senha ${PASSWORD}`);
	console.log(`Suporte fictício: usuário ${SUPPORT_LOGIN} · senha ${SUPPORT_PASSWORD}`);
	console.log("PowerShell para abrir a demonstração com DevTools:");
	console.log(`Set-Location ${citarPowerShell(ROOT)}`);
	console.log(`$env:ERP_TEST_USERDATA_DIR = ${citarPowerShell(profileDir)}`);
	console.log("$env:ERP_MOCK_UPDATER = '1'");
	console.log("$env:ERP_DEBUG_DEVTOOLS = '1'");
	console.log(`$env:ERP_SUPORTE_LOGIN = ${citarPowerShell(SUPPORT_LOGIN)}`);
	console.log(`$env:ERP_SUPORTE_SENHA = ${citarPowerShell(SUPPORT_PASSWORD)}`);
	console.log("npm start");
}

async function executarCheck() {
	fs.mkdirSync(DATA_DIR, { recursive: true });
	compararCaminhos("Diretório de dados", fs.realpathSync(DATA_DIR), DATA_DIR);
	const profileDir = fs.mkdtempSync(path.join(DATA_DIR, "demo-estoque-"));
	assert.deepEqual(fs.readdirSync(profileDir), [], "A pasta demo recém-criada não está vazia.");
	const apps = [];
	let falha = null;
	let errosFechamento = [];

	try {
		let { app, page } = await iniciarElectron(apps, profileDir);
		await verificarCaminhosPrincipais(app, profileDir);
		await autenticar(page);
		await verificarCaminhoPelaApi(page, profileDir);
		await criarProdutosPeloApp(page);
		await verificarDadosPeloApp(page);

		await fecharAplicativo(app, apps);
		({ app, page } = await iniciarElectron(apps, profileDir));
		await verificarCaminhosPrincipais(app, profileDir);
		await autenticar(page);
		await verificarCaminhoPelaApi(page, profileDir);
		await verificarDadosPeloApp(page);
		await verificarListaDoEstoque(page);
	} catch (erro) {
		falha = erro;
	} finally {
		errosFechamento = await fecharAplicativos(apps);
	}

	if (!falha && errosFechamento.length > 0) {
		falha = errosFechamento[0];
	}
	if (falha) {
		console.error(`A demonstração falhou. Pasta preservada para diagnóstico: ${profileDir}`);
		console.error(falha instanceof Error ? falha.stack : String(falha));
		process.exitCode = 1;
		return;
	}

	imprimirInstrucoes(profileDir);
}

if (process.argv.length !== 3 || process.argv[2] !== "--check") {
	console.error("Uso: node scripts/preparar-demo-estoque.js --check");
	process.exitCode = 2;
} else {
	executarCheck().catch((erro) => {
		console.error("Falha ao preparar a demonstração de estoque.");
		console.error(erro instanceof Error ? erro.stack : String(erro));
		process.exitCode = 1;
	});
}
