const { test } = require("node:test");
const assert = require("node:assert");
const { montarPayloadPix } = require("../integracoes/pix/payload");
const { payloadParaDataUrl } = require("../integracoes/pix/qrimage");
const { getProvider } = require("../integracoes/pix/provider");

test("getProvider: sem PIX_PROVIDER configurado, retorna null (fallback genérico)", () => {
	delete process.env.PIX_PROVIDER;
	assert.strictEqual(getProvider(), null);
});

test("getProvider: PIX_PROVIDER=efi sem credenciais, ainda retorna null (não quebra)", () => {
	process.env.PIX_PROVIDER = "efi";
	delete process.env.EFI_CLIENT_ID;
	delete process.env.EFI_CLIENT_SECRET;
	delete process.env.EFI_CERTIFICADO_PATH;
	delete process.env.EFI_CHAVE_PIX;
	assert.strictEqual(getProvider(), null);
	delete process.env.PIX_PROVIDER;
});

test("payloadParaDataUrl: renderiza o payload Pix como PNG em data URL", async () => {
	const payload = montarPayloadPix({
		chave: "teste@example.com",
		nomeRecebedor: "Loja",
		cidade: "SP",
		valor: 10,
	});
	const url = await payloadParaDataUrl(payload);
	assert.match(url, /^data:image\/png;base64,/);
	assert.ok(url.length > 100);
});
