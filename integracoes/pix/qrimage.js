const QRCode = require("qrcode");

// Renderiza um payload Pix (ou qualquer texto) como imagem PNG em data URL,
// pronta pra um <img src="..."> no renderer.
async function payloadParaDataUrl(payload) {
	return QRCode.toDataURL(payload, {
		errorCorrectionLevel: "M",
		margin: 1,
		width: 300,
	});
}

module.exports = { payloadParaDataUrl };
