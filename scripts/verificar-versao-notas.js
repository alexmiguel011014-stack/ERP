const fs = require("fs");
const path = require("path");

function normalizarVersao(valor) {
	return String(valor || "")
		.trim()
		.replace(/^v/i, "");
}

function escaparRegExp(valor) {
	return valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validarVersaoNotas({ raizProjeto = path.join(__dirname, "..") } = {}) {
	const packagePath = path.join(raizProjeto, "package.json");
	const notasPath = path.join(
		raizProjeto,
		"frontend",
		"src",
		"lib",
		"atualizacaoNotas.ts",
	);
	const pacote = JSON.parse(fs.readFileSync(packagePath, "utf8"));
	const versao = normalizarVersao(pacote.version);
	const fonte = fs.readFileSync(notasPath, "utf8");
	const mapa = fonte.match(
		/export const NOTAS_ATUALIZACAO[^=]*=\s*\{([\s\S]*?)\n\};/,
	);
	const chave = new RegExp(
		`["']${escaparRegExp(versao)}["']\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\},?`,
	);
	const entrada = mapa && mapa[1].match(chave);
	const itens = entrada && entrada[1].match(/\bitens\s*:\s*\[([\s\S]*?)\]/);
	const possuiItem = itens && /["'`](?:\\.|[^"'`])+["'`]/.test(itens[1]);

	if (!versao || !entrada || !possuiItem) {
		throw new Error(
			`A versão ${versao || "do package.json"} não possui notas válidas em ` +
			"frontend/src/lib/atualizacaoNotas.ts. Cadastre a entrada da versão " +
			"antes de criar o build/release.",
		);
	}

	return versao;
}

if (require.main === module) {
	try {
		const versao = validarVersaoNotas();
		console.log(`[notas] versão ${versao} possui notas válidas.`);
	} catch (erro) {
		console.error(`[notas] ${erro.message}`);
		process.exitCode = 1;
	}
}

module.exports = { normalizarVersao, validarVersaoNotas };
