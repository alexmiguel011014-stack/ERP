// Seleciona o adapter de provedor fiscal configurado via .env (FISCAL_PROVIDER).
// Sem provedor configurado, retorna null — a emissão pelo ERP fica indisponível
// e a loja segue usando o rastreamento manual (db/vendas.js:atualizarNotaFiscal,
// status "emitida_externa") até ter certificado/conta prontos.
//
// Contrato que todo adapter concreto (integracoes/fiscal/providers/*.js) implementa:
//   configurado() -> boolean
//   emitirNota({ vendaId, itens, formaPagamento }) -> { ref, status, numero, chaveAcesso, erro }
//   consultarNota(ref) -> { ref, status, numero, chaveAcesso }
//   cancelarNota(ref, justificativa) -> { success }

function getProvider() {
	const nome = String(process.env.FISCAL_PROVIDER || "").toLowerCase();
	if (nome === "focusnfe") {
		const focusnfe = require("./providers/focusnfe");
		return focusnfe.configurado() ? focusnfe : null;
	}
	return null;
}

module.exports = { getProvider };
