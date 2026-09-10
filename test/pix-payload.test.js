const { test } = require("node:test");
const assert = require("node:assert");
const { crc16, montarPayloadPix } = require("../integracoes/pix/payload");

test("crc16: bate com o vetor de teste padrão do CRC-16/CCITT-FALSE", () => {
	assert.strictEqual(crc16("123456789"), "29B1");
});

test("montarPayloadPix: exige chave Pix", () => {
	assert.throws(() =>
		montarPayloadPix({ nomeRecebedor: "LOJA", cidade: "SP" }),
	);
});

test("montarPayloadPix: payload termina com CRC16 válido do próprio conteúdo", () => {
	const payload = montarPayloadPix({
		chave: "loja@example.com",
		nomeRecebedor: "ALLU ERP",
		cidade: "SAO PAULO",
		valor: 150.5,
		txid: "VDA123",
	});
	const semCrc = payload.slice(0, -4);
	const crcDeclarado = payload.slice(-4);
	assert.strictEqual(crcDeclarado, crc16(semCrc));
});

test("montarPayloadPix: inclui os campos obrigatórios do BR Code", () => {
	const payload = montarPayloadPix({
		chave: "11999999999",
		nomeRecebedor: "Loja Teste",
		cidade: "Sao Paulo",
	});
	assert.match(payload, /^000201/); // Payload Format Indicator
	assert.match(payload, /br\.gov\.bcb\.pix/);
	assert.match(payload, /52040000/);
	assert.match(payload, /5303986/); // moeda BRL
	assert.match(payload, /5802BR/); // país
	assert.match(payload, /6304[0-9A-F]{4}$/); // CRC final
});

test("montarPayloadPix: sem valor gera QR de valor livre (sem campo 54)", () => {
	const payload = montarPayloadPix({
		chave: "chave-aleatoria-123",
		nomeRecebedor: "Loja",
		cidade: "Cidade",
	});
	assert.doesNotMatch(payload, /5406/);
});

test("montarPayloadPix: com valor inclui o campo 54 formatado com 2 casas decimais", () => {
	const payload = montarPayloadPix({
		chave: "chave-aleatoria-123",
		nomeRecebedor: "Loja",
		cidade: "Cidade",
		valor: 9.9,
	});
	assert.match(payload, /54049\.90/);
});

test("montarPayloadPix: sem txid usa '***' (convenção de sem referência)", () => {
	const payload = montarPayloadPix({
		chave: "chave-aleatoria-123",
		nomeRecebedor: "Loja",
		cidade: "Cidade",
	});
	assert.match(payload, /62070503\*\*\*/);
});

test("montarPayloadPix: normaliza acentos e maiúsculas em nome/cidade", () => {
	const payload = montarPayloadPix({
		chave: "chave-aleatoria-123",
		nomeRecebedor: "João Ção",
		cidade: "São Paulo",
	});
	assert.match(payload, /JOAO CAO/);
	assert.match(payload, /SAO PAULO/);
});
