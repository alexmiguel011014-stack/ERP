// Gera o payload "Pix Copia e Cola" (BR Code / EMV) — funciona com a chave Pix
// de qualquer banco, sem depender de nenhum provedor. Espec: Manual do BR Code
// (Banco Central) + EMVCo QRCPS-MPM. Usado como fallback quando nenhum provedor
// de Pix está configurado (ver integracoes/pix/provider.js) — QR "estático",
// sem location dinâmica, então não precisa de conta/API nenhuma pra funcionar.

// Remove acentos e caracteres fora do alfabeto Latin-1 básico exigido pelo padrão.
function normalizarTexto(texto) {
	return String(texto || "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^\x20-\x7E]/g, "")
		.toUpperCase();
}

function campo(id, valor) {
	const texto = String(valor);
	const tamanho = String(texto.length).padStart(2, "0");
	return id + tamanho + texto;
}

// CRC-16/CCITT-FALSE: polinômio 0x1021, valor inicial 0xFFFF.
function crc16(payload) {
	let crc = 0xffff;
	for (let i = 0; i < payload.length; i++) {
		crc ^= payload.charCodeAt(i) << 8;
		for (let bit = 0; bit < 8; bit++) {
			crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
			crc &= 0xffff;
		}
	}
	return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * @param {object} dados
 * @param {string} dados.chave - chave Pix da loja (CPF/CNPJ/e-mail/telefone/aleatória)
 * @param {string} dados.nomeRecebedor - nome do recebedor (máx. 25 caracteres)
 * @param {string} dados.cidade - cidade do recebedor (máx. 15 caracteres)
 * @param {number} [dados.valor] - valor em reais; omitido = QR de valor livre
 * @param {string} [dados.txid] - identificador da transação (máx. 25 alfanuméricos); default "***" (sem referência)
 * @param {string} [dados.descricao] - mensagem curta opcional
 * @returns {string} payload Pix Copia e Cola pronto para virar QR Code
 */
function montarPayloadPix(dados) {
	const chave = String(dados.chave || "").trim();
	if (!chave) throw new Error("Chave Pix obrigatória para gerar o QR Code.");

	const nome =
		normalizarTexto(dados.nomeRecebedor || "LOJA").slice(0, 25) || "LOJA";
	const cidade =
		normalizarTexto(dados.cidade || "BRASIL").slice(0, 15) || "BRASIL";
	const txid =
		String(dados.txid || "***")
			.replace(/[^A-Za-z0-9]/g, "")
			.slice(0, 25) || "***";

	let merchantAccountInfo = campo("00", "br.gov.bcb.pix") + campo("01", chave);
	if (dados.descricao) {
		merchantAccountInfo += campo(
			"02",
			normalizarTexto(dados.descricao).slice(0, 72),
		);
	}

	let payload =
		campo("00", "01") + // Payload Format Indicator
		campo("26", merchantAccountInfo) + // Merchant Account Info (Pix)
		campo("52", "0000") + // Merchant Category Code
		campo("53", "986"); // Transaction Currency (BRL)

	if (
		dados.valor !== undefined &&
		dados.valor !== null &&
		Number(dados.valor) > 0
	) {
		payload += campo("54", Number(dados.valor).toFixed(2));
	}

	payload +=
		campo("58", "BR") + // Country Code
		campo("59", nome) + // Merchant Name
		campo("60", cidade) + // Merchant City
		campo("62", campo("05", txid)); // Additional Data Field (txid)

	payload += "6304"; // abre o campo do CRC (tag 63, tamanho 04) antes de calcular
	return payload + crc16(payload);
}

module.exports = { montarPayloadPix, crc16, normalizarTexto };
