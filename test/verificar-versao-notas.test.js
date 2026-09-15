const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { validarVersaoNotas } = require("../scripts/verificar-versao-notas");

function criarFixture(notas) {
	const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "erp-notas-"));
	fs.mkdirSync(path.join(raiz, "frontend", "src", "lib"), { recursive: true });
	fs.writeFileSync(
		path.join(raiz, "package.json"),
		JSON.stringify({ version: "1.2.3" }),
	);
	fs.writeFileSync(
		path.join(raiz, "frontend", "src", "lib", "atualizacaoNotas.ts"),
		notas,
	);
	return raiz;
}

test("aceita a versão quando há entrada com item de nota", () => {
	const raiz = criarFixture(
		'export const NOTAS_ATUALIZACAO = {\n  "1.2.3": {\n    versao: "1.2.3",\n    itens: ["Correção testada."],\n  },\n};\n',
	);

	assert.equal(validarVersaoNotas({ raizProjeto: raiz }), "1.2.3");
});

test("bloqueia a versão quando a entrada não existe", () => {
	const raiz = criarFixture(
		'export const NOTAS_ATUALIZACAO = {\n  "1.2.2": {\n    versao: "1.2.2",\n    itens: ["Outra versão."],\n  },\n};\n',
	);

	assert.throws(
		() => validarVersaoNotas({ raizProjeto: raiz }),
		/versão 1\.2\.3 não possui notas válidas/,
	);
});
