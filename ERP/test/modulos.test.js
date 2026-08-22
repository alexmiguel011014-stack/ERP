const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { carregarModulos, aplicarEntitlements } = require("../modulos.js");

function criarDiretorioTemp() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "erp-modulos-"));
}

function escreverManifesto(dirModulos, pastaModulo, nomeArquivo, conteudo) {
	const dirDestino = path.join(dirModulos, pastaModulo);
	fs.mkdirSync(dirDestino, { recursive: true });
	fs.writeFileSync(
		path.join(dirDestino, nomeArquivo),
		JSON.stringify(conteudo, null, 2),
	);
	return dirDestino;
}

function manifestoBase(overrides) {
	return Object.assign(
		{
			id: "teste",
			nome: "Teste",
			versao: "1.0.0",
			tipo: "workspace-dashboard",
			entrada: null,
			ipc: [],
			permissao: { tipo: "sempre" },
			dependeDe: [],
		},
		overrides,
	);
}

// Cria um diretório modules/ e um ipc/ irmão (o loader resolve ipc/ como
// path.join(diretorioModulos, "..", "ipc"), igual à estrutura real do repo).
function prepararProjetoTemp() {
	const raiz = criarDiretorioTemp();
	const dirModulos = path.join(raiz, "modules");
	fs.mkdirSync(dirModulos, { recursive: true });
	fs.mkdirSync(path.join(raiz, "ipc"), { recursive: true });
	return { raiz, dirModulos };
}

test("carregarModulos: contra o projeto real, carrega todos os manifestos sem lançar erro", () => {
	const modulos = carregarModulos(path.join(__dirname, "..", "modules"));
	assert.ok(
		modulos.length >= 19,
		`esperava pelo menos 19 manifestos, achou ${modulos.length}`,
	);
	const ids = modulos.map((m) => m.id);
	assert.ok(ids.includes("dashboard"));
	assert.ok(ids.includes("pdv"));
	assert.ok(ids.includes("cadastro"));
});

test("carregarModulos: módulos pai (dependeDe) vêm antes dos filhos na ordem devolvida", () => {
	const modulos = carregarModulos(path.join(__dirname, "..", "modules"));
	const posicao = (id) => modulos.findIndex((m) => m.id === id);
	assert.ok(
		posicao("produtos") < posicao("cadastro"),
		"produtos deve vir antes de cadastro",
	);
	assert.ok(
		posicao("produtos") < posicao("categorias"),
		"produtos deve vir antes de categorias",
	);
	assert.ok(
		posicao("entrada") < posicao("estoque-lista"),
		"entrada deve vir antes de estoque-lista",
	);
	assert.ok(
		posicao("financeiro") < posicao("pagamentos"),
		"financeiro deve vir antes de pagamentos",
	);
});

test("carregarModulos: JSON malformado lança erro citando o caminho do arquivo", () => {
	const { dirModulos } = prepararProjetoTemp();
	const dirDestino = path.join(dirModulos, "quebrado");
	fs.mkdirSync(dirDestino, { recursive: true });
	fs.writeFileSync(path.join(dirDestino, "modulo.json"), "{ isso não é json");

	assert.throws(() => carregarModulos(dirModulos), /quebrado[\\/]modulo\.json/);
});

test("carregarModulos: campo obrigatório ausente lança erro nomeando o campo", () => {
	const { dirModulos } = prepararProjetoTemp();
	const manifesto = manifestoBase({});
	delete manifesto.nome;
	escreverManifesto(dirModulos, "semnome", "modulo.json", manifesto);

	assert.throws(() => carregarModulos(dirModulos), /"nome"/);
});

test("carregarModulos: dependeDe apontando pra um id inexistente lança erro", () => {
	const { dirModulos } = prepararProjetoTemp();
	escreverManifesto(
		dirModulos,
		"orfao",
		"modulo.json",
		manifestoBase({ id: "orfao", dependeDe: ["nao-existe"] }),
	);

	assert.throws(() => carregarModulos(dirModulos), /nao-existe/);
});

test("carregarModulos: ciclo de dependência entre dois módulos lança erro", () => {
	const { dirModulos } = prepararProjetoTemp();
	escreverManifesto(
		dirModulos,
		"a",
		"modulo.json",
		manifestoBase({ id: "a", dependeDe: ["b"] }),
	);
	escreverManifesto(
		dirModulos,
		"b",
		"modulo.json",
		manifestoBase({ id: "b", dependeDe: ["a"] }),
	);

	assert.throws(() => carregarModulos(dirModulos), /[Cc]iclo/);
});

test("carregarModulos: ipc referenciando arquivo inexistente lança erro", () => {
	const { dirModulos } = prepararProjetoTemp();
	escreverManifesto(
		dirModulos,
		"semipc",
		"modulo.json",
		manifestoBase({ id: "semipc", ipc: ["nao-existe.js"] }),
	);

	assert.throws(() => carregarModulos(dirModulos), /nao-existe\.js/);
});

test("carregarModulos: entrada apontando pra arquivo inexistente lança erro", () => {
	const { dirModulos } = prepararProjetoTemp();
	escreverManifesto(
		dirModulos,
		"sempagina",
		"modulo.json",
		manifestoBase({
			id: "sempagina",
			tipo: "pagina",
			entrada: "nao-existe.html",
		}),
	);

	assert.throws(() => carregarModulos(dirModulos), /nao-existe\.html/);
});

test("carregarModulos: ids duplicados entre manifestos lança erro", () => {
	const { dirModulos } = prepararProjetoTemp();
	escreverManifesto(
		dirModulos,
		"um",
		"modulo.json",
		manifestoBase({ id: "duplicado" }),
	);
	escreverManifesto(
		dirModulos,
		"dois",
		"modulo.json",
		manifestoBase({ id: "duplicado" }),
	);

	assert.throws(() => carregarModulos(dirModulos), /duplicado/);
});

// Prova real de que main.js's ipc registration loop registra exatamente o
// mesmo conjunto de arquivos ipc/*.js que a lista hardcoded de 19 requires
// que existia antes (ver histórico do GOALS.md) — não um subconjunto, não
// duplicado. Recalcula a mesma lógica de dedupe que main.js usa (Set por
// nome de arquivo) e compara contra a lista antiga, registrada aqui como
// dado fixo justamente para detectar se algum handler silenciosamente
// deixasse de ser registrado numa mudança futura.
test("carregarModulos: loop de registro de IPC cobre o mesmo conjunto de arquivos que a lista antiga hardcoded", () => {
	const ANTIGA_LISTA_HARDCODED = [
		"produtos.js",
		"categorias.js",
		"clientes.js",
		"vendas.js",
		"estoque.js",
		"precificacao.js",
		"fornecedores.js",
		"compras.js",
		"financeiro.js",
		"caixa.js",
		"relatorios.js",
		"dashboard.js",
		"banco-admin.js",
		"sistema.js",
		"usuarios.js",
		"auth.js",
		"pagamentos.js",
		"pix.js",
		"fiscal.js",
	].sort();

	const modulos = carregarModulos(path.join(__dirname, "..", "modules"));
	const registradosPeloLoop = new Set(["auth.js", "fiscal.js"]); // registrados direto no main.js, fora do loop
	for (const modulo of modulos) {
		for (const nomeIpc of modulo.ipc) registradosPeloLoop.add(nomeIpc);
	}

	assert.deepStrictEqual(
		[...registradosPeloLoop].sort(),
		ANTIGA_LISTA_HARDCODED,
	);
});

test("carregarModulos: reconhece tanto modulo.json quanto <id>.modulo.json na mesma pasta", () => {
	const { dirModulos } = prepararProjetoTemp();
	const pasta = escreverManifesto(
		dirModulos,
		"pai",
		"modulo.json",
		manifestoBase({ id: "pai" }),
	);
	fs.writeFileSync(
		path.join(pasta, "filho.modulo.json"),
		JSON.stringify(
			manifestoBase({ id: "filho", paiWorkspace: "pai", dependeDe: ["pai"] }),
		),
	);

	const modulos = carregarModulos(dirModulos);
	assert.deepStrictEqual(modulos.map((m) => m.id).sort(), ["filho", "pai"]);
});

test("aplicarEntitlements: sem entitlements.json, todo módulo continua habilitado (default dormant)", () => {
	const { raiz, dirModulos } = prepararProjetoTemp();
	escreverManifesto(dirModulos, "a", "modulo.json", manifestoBase({ id: "a" }));
	const modulos = carregarModulos(dirModulos);

	const habilitados = aplicarEntitlements(
		modulos,
		path.join(raiz, "entitlements.json"),
	);
	assert.deepStrictEqual(
		habilitados.map((m) => m.id),
		["a"],
	);
});

test("aplicarEntitlements: módulo listado como false é excluído", () => {
	const { raiz, dirModulos } = prepararProjetoTemp();
	escreverManifesto(dirModulos, "a", "modulo.json", manifestoBase({ id: "a" }));
	escreverManifesto(dirModulos, "b", "modulo.json", manifestoBase({ id: "b" }));
	const caminhoEntitlements = path.join(raiz, "entitlements.json");
	fs.writeFileSync(
		caminhoEntitlements,
		JSON.stringify({ modulos: { a: false } }),
	);

	const habilitados = aplicarEntitlements(
		carregarModulos(dirModulos),
		caminhoEntitlements,
	);
	assert.deepStrictEqual(
		habilitados.map((m) => m.id),
		["b"],
	);
});

test("aplicarEntitlements: desativar um módulo cascateia pros que dependem dele", () => {
	const { raiz, dirModulos } = prepararProjetoTemp();
	escreverManifesto(
		dirModulos,
		"pai",
		"modulo.json",
		manifestoBase({ id: "pai" }),
	);
	escreverManifesto(
		dirModulos,
		"filho",
		"modulo.json",
		manifestoBase({ id: "filho", dependeDe: ["pai"] }),
	);
	escreverManifesto(
		dirModulos,
		"neto",
		"modulo.json",
		manifestoBase({ id: "neto", dependeDe: ["filho"] }),
	);
	const caminhoEntitlements = path.join(raiz, "entitlements.json");
	fs.writeFileSync(
		caminhoEntitlements,
		JSON.stringify({ modulos: { pai: false } }),
	);

	const habilitados = aplicarEntitlements(
		carregarModulos(dirModulos),
		caminhoEntitlements,
	);
	assert.deepStrictEqual(habilitados, []);
});

test("aplicarEntitlements: entitlements.json malformado lança erro", () => {
	const { raiz, dirModulos } = prepararProjetoTemp();
	escreverManifesto(dirModulos, "a", "modulo.json", manifestoBase({ id: "a" }));
	const caminhoEntitlements = path.join(raiz, "entitlements.json");
	fs.writeFileSync(caminhoEntitlements, "{ isso não é json");

	assert.throws(
		() => aplicarEntitlements(carregarModulos(dirModulos), caminhoEntitlements),
		/entitlements\.json inválido/,
	);
});

test("aplicarEntitlements: contra o projeto real, sem entitlements.json, todos os 19 módulos continuam habilitados", () => {
	const modulos = carregarModulos(path.join(__dirname, "..", "modules"));
	const habilitados = aplicarEntitlements(
		modulos,
		path.join(__dirname, "..", "entitlements.json"),
	);
	assert.strictEqual(habilitados.length, modulos.length);
});
