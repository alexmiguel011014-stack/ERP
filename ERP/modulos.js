// Carregador de manifestos de módulo (ver docs/MODULE_MANIFEST.md) — parte da
// arquitetura Core + Plugins (GOALS.md). Escaneia modules/**/modulo.json e
// modules/**/*.modulo.json, valida cada um e devolve a lista ordenada por
// dependência (dependeDe). Usado por main.js (registro de IPC) e por
// ipc/sistema.js (sidebar do navbar.js, via IPC).
const fs = require("fs");
const path = require("path");

const TIPOS_VALIDOS = ["pagina", "workspace-dashboard"];
const TIPOS_PERMISSAO_VALIDOS = ["sempre", "admin", "modulo"];

function listarArquivosDeManifesto(diretorioModulos) {
	const encontrados = [];
	function varrer(dir) {
		for (const nome of fs.readdirSync(dir)) {
			const caminho = path.join(dir, nome);
			if (fs.statSync(caminho).isDirectory()) {
				varrer(caminho);
				continue;
			}
			if (nome === "modulo.json" || nome.endsWith(".modulo.json")) {
				encontrados.push(caminho);
			}
		}
	}
	varrer(diretorioModulos);
	return encontrados;
}

function validarManifesto(manifesto, caminhoArquivo, diretorioModulos) {
	const erro = (msg) =>
		new Error(`Manifesto inválido em ${caminhoArquivo}: ${msg}`);

	for (const campo of ["id", "nome", "versao", "tipo", "ipc", "permissao"]) {
		if (manifesto[campo] === undefined)
			throw erro(`campo obrigatório ausente: "${campo}"`);
	}
	if (TIPOS_VALIDOS.indexOf(manifesto.tipo) === -1) {
		throw erro(
			`"tipo" precisa ser um de ${TIPOS_VALIDOS.join("/")}, veio "${manifesto.tipo}"`,
		);
	}
	if (manifesto.tipo === "pagina" && !manifesto.entrada) {
		throw erro('"entrada" é obrigatório quando tipo="pagina"');
	}
	if (manifesto.entrada) {
		const caminhoEntrada = path.join(
			path.dirname(caminhoArquivo),
			manifesto.entrada,
		);
		if (!fs.existsSync(caminhoEntrada)) {
			throw erro(
				`"entrada" aponta para um arquivo que não existe: ${manifesto.entrada}`,
			);
		}
	}
	if (!Array.isArray(manifesto.ipc)) throw erro('"ipc" precisa ser um array');
	for (const nomeIpc of manifesto.ipc) {
		const caminhoIpc = path.join(diretorioModulos, "..", "ipc", nomeIpc);
		if (!fs.existsSync(caminhoIpc)) {
			throw erro(
				`"ipc" referencia um arquivo que não existe em ipc/: ${nomeIpc}`,
			);
		}
	}
	if (
		!manifesto.permissao ||
		TIPOS_PERMISSAO_VALIDOS.indexOf(manifesto.permissao.tipo) === -1
	) {
		throw erro(
			`"permissao.tipo" precisa ser um de ${TIPOS_PERMISSAO_VALIDOS.join("/")}`,
		);
	}
	if (
		manifesto.permissao.tipo === "modulo" &&
		!manifesto.permissao.nomeModulo
	) {
		throw erro(
			'"permissao.nomeModulo" é obrigatório quando permissao.tipo="modulo"',
		);
	}
	if (
		manifesto.dependeDe !== undefined &&
		!Array.isArray(manifesto.dependeDe)
	) {
		throw erro('"dependeDe" precisa ser um array quando presente');
	}
}

// Ordenação topológica simples (Kahn) — lança erro nomeando o ciclo em vez de
// travar num loop infinito ou devolver ordem incompleta silenciosamente.
function ordenarPorDependencia(modulos) {
	const porId = new Map(modulos.map((m) => [m.id, m]));
	for (const m of modulos) {
		for (const dep of m.dependeDe || []) {
			if (!porId.has(dep)) {
				throw new Error(
					`Módulo "${m.id}" declara dependeDe="${dep}", mas nenhum manifesto com esse id foi encontrado.`,
				);
			}
		}
	}

	const visitado = new Set();
	const emAndamento = new Set();
	const ordenado = [];

	function visitar(id, pilha) {
		if (visitado.has(id)) return;
		if (emAndamento.has(id)) {
			throw new Error(
				`Ciclo de dependência detectado entre módulos: ${pilha.concat(id).join(" -> ")}`,
			);
		}
		emAndamento.add(id);
		const modulo = porId.get(id);
		for (const dep of modulo.dependeDe || []) {
			visitar(dep, pilha.concat(id));
		}
		emAndamento.delete(id);
		visitado.add(id);
		ordenado.push(modulo);
	}

	for (const m of modulos) visitar(m.id, []);
	return ordenado;
}

function carregarModulos(diretorioModulos) {
	const arquivos = listarArquivosDeManifesto(diretorioModulos);
	const modulos = arquivos.map((caminhoArquivo) => {
		let manifesto;
		try {
			manifesto = JSON.parse(fs.readFileSync(caminhoArquivo, "utf8"));
		} catch (e) {
			throw new Error(
				`Manifesto inválido em ${caminhoArquivo}: JSON malformado (${e.message})`,
			);
		}
		validarManifesto(manifesto, caminhoArquivo, diretorioModulos);
		return manifesto;
	});

	const ids = modulos.map((m) => m.id);
	const idsDuplicados = ids.filter((id, i) => ids.indexOf(id) !== i);
	if (idsDuplicados.length > 0) {
		throw new Error(
			`ids de módulo duplicados: ${[...new Set(idsDuplicados)].join(", ")}`,
		);
	}

	return ordenarPorDependencia(modulos);
}

// Sistema de entitlements — DESLIGADO por padrão (ver GOALS.md, "Security:
// dormant entitlements design"). Lê um entitlements.json opcional no formato
// { "modulos": { "<id>": false } } — só precisa listar o que está
// DESATIVADO; qualquer módulo ausente do arquivo (ou o arquivo inteiro
// ausente, o caso normal até ~dezembro/2026) continua habilitado. Desativar
// um módulo cascateia pros que dependem dele (via dependeDe) — não faz
// sentido deixar "cadastro" registrado se "produtos", do qual ele depende,
// está desligado.
function carregarEntitlements(caminhoArquivo) {
	if (!fs.existsSync(caminhoArquivo)) return {};
	let conteudo;
	try {
		conteudo = JSON.parse(fs.readFileSync(caminhoArquivo, "utf8"));
	} catch (e) {
		throw new Error(
			`entitlements.json inválido em ${caminhoArquivo}: JSON malformado (${e.message})`,
		);
	}
	return (conteudo && conteudo.modulos) || {};
}

function aplicarEntitlements(modulos, caminhoEntitlements) {
	const entitlements = carregarEntitlements(caminhoEntitlements);
	const desativados = new Set();

	// modulos já vem ordenado por dependência (pai antes de filho), então uma
	// única passagem cobre o cascateamento sem precisar de segunda rodada.
	for (const m of modulos) {
		const explicitamenteDesativado = entitlements[m.id] === false;
		const paiDesativado = (m.dependeDe || []).some((dep) =>
			desativados.has(dep),
		);
		if (explicitamenteDesativado || paiDesativado) {
			desativados.add(m.id);
		}
	}

	return modulos.filter((m) => !desativados.has(m.id));
}

module.exports = { carregarModulos, aplicarEntitlements };
