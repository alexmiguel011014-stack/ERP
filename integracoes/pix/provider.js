// Seleciona o adapter de provedor Pix configurado via .env (PIX_PROVIDER).
// Sem provedor configurado, retorna null — o app segue funcionando com o QR
// genérico (integracoes/pix/payload.js) + confirmação manual, como já era
// antes de qualquer integração existir. Nenhuma tela deve travar por falta
// de provedor configurado.
//
// Contrato que todo adapter concreto (integracoes/pix/providers/*.js) implementa:
//   configurado() -> boolean
//   criarCobranca({ valor, txid, descricao }) -> { txid, copiaECola, status }
//   consultarCobranca(txid) -> { txid, status, valor, horario }
//   listarRecebidos({ inicio, fim }) -> [{ txid, valor, horario, pagador }]

function getProvider() {
	const nome = String(process.env.PIX_PROVIDER || "").toLowerCase();
	if (nome === "efi") {
		const efi = require("./providers/efi");
		return efi.configurado() ? efi : null;
	}
	return null;
}

module.exports = { getProvider };
