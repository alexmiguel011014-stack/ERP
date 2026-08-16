const { getItensVenda, atualizarNotaFiscal } = require("../database");
const { getProvider } = require("../integracoes/fiscal/provider");

// Emite a NFC-e de uma venda pelo provedor configurado (FISCAL_PROVIDER no
// .env). Sem provedor configurado, o handler avisa isso claramente em vez
// de falhar silencioso — a loja continua podendo marcar "emitida por fora"
// manualmente via atualizar-nota-fiscal (ipc/vendas.js), sem depender desta
// integração existir.
function registrar(ipcMain, deps) {
	const { exigirPermissao, log } = deps;

	ipcMain.handle(
		"emitir-nota-fiscal",
		async (event, vendaId, formaPagamento) => {
			try {
				exigirPermissao("vendas");
				const provider = getProvider();
				if (!provider) {
					return {
						suportado: false,
						mensagem:
							"Nenhum provedor fiscal configurado (FISCAL_PROVIDER no .env). " +
							"Use 'Nota fiscal' na tela de vendas para marcar manualmente.",
					};
				}

				const itens = await getItensVenda(vendaId);
				const semNcm = itens.find((item) => !item.ncm || !item.csosn);
				if (semNcm) {
					throw new Error(
						"Produto '" +
							semNcm.produto_nome +
							"' sem NCM/CSOSN cadastrado — preencha os dados fiscais do produto antes de emitir.",
					);
				}

				const resultado = await provider.emitirNota({
					vendaId,
					itens,
					formaPagamento,
				});
				await atualizarNotaFiscal(vendaId, {
					status: resultado.erro ? "erro" : "emitida_erp",
					numero: resultado.numero,
					chaveAcesso: resultado.chaveAcesso,
					provedor: "focusnfe",
					erro: resultado.erro,
				});
				log("emitir-nota-fiscal", "Vendas", vendaId, resultado.status);
				return { suportado: true, ...resultado };
			} catch (erro) {
				throw erro.message;
			}
		},
	);

	ipcMain.handle("consultar-nota-fiscal", async (event, ref) => {
		try {
			exigirPermissao("vendas");
			const provider = getProvider();
			if (!provider) return { suportado: false };
			return { suportado: true, ...(await provider.consultarNota(ref)) };
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
