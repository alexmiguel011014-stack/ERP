const { test } = require("node:test");
const assert = require("node:assert");
const { getProvider } = require("../integracoes/fiscal/provider");

test("getProvider (fiscal): sem FISCAL_PROVIDER configurado, retorna null", () => {
	delete process.env.FISCAL_PROVIDER;
	assert.strictEqual(getProvider(), null);
});

test("getProvider (fiscal): FISCAL_PROVIDER=focusnfe sem credenciais, ainda retorna null", () => {
	process.env.FISCAL_PROVIDER = "focusnfe";
	delete process.env.FOCUSNFE_TOKEN;
	delete process.env.FOCUSNFE_CNPJ_EMITENTE;
	assert.strictEqual(getProvider(), null);
	delete process.env.FISCAL_PROVIDER;
});
