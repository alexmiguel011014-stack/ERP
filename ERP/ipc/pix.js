const { montarPayloadPix } = require("../integracoes/pix/payload");
const { payloadParaDataUrl } = require("../integracoes/pix/qrimage");
const { getProvider } = require("../integracoes/pix/provider");

// Gera o QR Code Pix pra cobrar um pagamento. Usa o provedor configurado
// (ex.: Efí, via PIX_PROVIDER no .env) quando disponível — o que permite
// confirmar o recebimento automaticamente depois. Sem provedor configurado,
// cai no gerador genérico (funciona com qualquer chave Pix, sem conta nova);
// nesse caso a confirmação continua manual, como antes desta integração.
function registrar(ipcMain, deps) {
	const { exigirSessao } = deps;

	ipcMain.handle("gerar-qrcode-pix", async (event, dados) => {
		try {
			exigirSessao();
			const provider = getProvider();
			let copiaECola;
			let txid = dados && dados.txid;

			if (provider) {
				const cobranca = await provider.criarCobranca({
					valor: dados.valor,
					txid,
					descricao: dados.descricao,
				});
				copiaECola = cobranca.copiaECola;
				txid = cobranca.txid;
			} else {
				copiaECola = montarPayloadPix({
					chave: process.env.PIX_CHAVE,
					nomeRecebedor: process.env.PIX_NOME_RECEBEDOR,
					cidade: process.env.PIX_CIDADE,
					valor: dados.valor,
					txid,
					descricao: dados.descricao,
				});
			}

			const qrCodeDataUrl = await payloadParaDataUrl(copiaECola);
			return { copiaECola, qrCodeDataUrl, txid, automatico: Boolean(provider) };
		} catch (erro) {
			throw erro.message;
		}
	});

	// Consulta o status de uma cobrança — só funciona com provedor configurado
	// (o QR genérico não tem como saber sozinho se foi pago).
	ipcMain.handle("consultar-pagamento-pix", async (event, txid) => {
		try {
			exigirSessao();
			const provider = getProvider();
			if (!provider) return { suportado: false };
			const status = await provider.consultarCobranca(txid);
			return { suportado: true, ...status };
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
