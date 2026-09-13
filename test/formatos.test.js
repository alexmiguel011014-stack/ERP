const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
	path.join(__dirname, "..", "modules", "core", "formatos.js"),
	"utf8",
);
const contexto = { window: {} };
vm.runInNewContext(source, contexto);

test("lerValorMonetario interpreta valores pt-BR", () => {
	assert.equal(contexto.window.lerValorMonetario("R$ 1.234,56"), 1234.56);
	assert.equal(contexto.window.lerValorMonetario("1000,50"), 1000.5);
	assert.equal(contexto.window.lerValorMonetario("-1.234,00"), -1234);
	assert.equal(contexto.window.lerValorMonetario(""), 0);
	assert.equal(contexto.window.lerValorMonetario("invalido"), 0);
});

test("lerDecimalInformado separa zero válido de texto inválido", () => {
	assert.equal(contexto.window.lerDecimalInformado("20,5"), 20.5);
	assert.equal(contexto.window.lerDecimalInformado("0"), 0);
	assert.equal(contexto.window.lerDecimalInformado("invalido"), null);
	assert.equal(contexto.window.lerDecimalInformado(""), null);
});

test("formatarMoeda usa moeda brasileira", () => {
	assert.equal(
		contexto.window.formatarMoeda(1234.56),
		new Intl.NumberFormat("pt-BR", {
			style: "currency",
			currency: "BRL",
		}).format(1234.56),
	);
});
