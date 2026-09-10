// Adapter concreto do provedor Focus NFe para emissão de NFC-e.
// Documentação: https://doc.focusnfe.com.br/
//
// Config via .env (nunca commitar valores reais — ver .env.example):
//   FOCUSNFE_TOKEN      - token da empresa na Focus NFe (enviado como usuário
//                          do Basic Auth, senha em branco)
//   FOCUSNFE_AMBIENTE    - "producao" usa api.focusnfe.com.br; qualquer outro
//                          valor (ou ausente) usa homologacao.focusnfe.com.br
//   FOCUSNFE_CNPJ_EMITENTE - CNPJ da loja cadastrado na Focus NFe
//
// ATENÇÃO: os nomes de campo do payload da NFC-e abaixo seguem o padrão
// público documentado pela Focus NFe, mas não foram testados contra a API
// real (exige token de homologação, que ainda não existe neste projeto).
// Confirmar contra a documentação/token real antes do primeiro uso — ver
// GOALS.md, item de NF-e.

const https = require("https");

const HOST_PRODUCAO = "api.focusnfe.com.br";
const HOST_HOMOLOGACAO = "homologacao.focusnfe.com.br";

function configurado() {
	return Boolean(
		process.env.FOCUSNFE_TOKEN && process.env.FOCUSNFE_CNPJ_EMITENTE,
	);
}

function host() {
	return process.env.FOCUSNFE_AMBIENTE === "producao"
		? HOST_PRODUCAO
		: HOST_HOMOLOGACAO;
}

function requisicaoJson({ method, path, corpo }) {
	return new Promise((resolver, rejeitar) => {
		const dados = corpo ? JSON.stringify(corpo) : undefined;
		const credenciais = Buffer.from(process.env.FOCUSNFE_TOKEN + ":").toString(
			"base64",
		);
		const req = https.request(
			{
				host: host(),
				path,
				method,
				headers: {
					"Content-Type": "application/json",
					Authorization: "Basic " + credenciais,
					...(dados ? { "Content-Length": Buffer.byteLength(dados) } : {}),
				},
			},
			(res) => {
				let respostaBruta = "";
				res.on("data", (pedaco) => (respostaBruta += pedaco));
				res.on("end", () => {
					let json;
					try {
						json = respostaBruta ? JSON.parse(respostaBruta) : {};
					} catch {
						return rejeitar(
							new Error(
								"Resposta inválida da Focus NFe: " +
									respostaBruta.slice(0, 200),
							),
						);
					}
					if (res.statusCode >= 200 && res.statusCode < 300)
						return resolver(json);
					rejeitar(
						new Error(
							"Focus NFe " +
								res.statusCode +
								": " +
								(json.mensagem ||
									(json.erros ? JSON.stringify(json.erros) : respostaBruta)),
						),
					);
				});
			},
		);
		req.on("error", rejeitar);
		if (dados) req.write(dados);
		req.end();
	});
}

// Monta o payload da NFC-e a partir dos itens da venda já carregados no ERP
// (db/vendas.js:getItensVenda, que já traz produto_nome/sku; os campos
// fiscais — ncm/cfop_padrao/csosn/unidade_fiscal/origem_mercadoria — vêm de
// Produtos, adicionados nesta mesma leva de mudanças).
function montarPayloadNfce({ itens, formaPagamento }) {
	return {
		natureza_operacao: "Venda",
		presenca_comprador: "1", // operação presencial (venda de balcão)
		forma_pagamento: "0", // à vista — ajustar se a loja usar prazo/parcelado
		items: itens.map((item, indice) => ({
			numero_item: indice + 1,
			codigo_produto: item.sku,
			descricao: item.produto_nome,
			ncm: item.ncm,
			cfop: item.cfop_padrao,
			unidade_comercial: item.unidade_fiscal || "UN",
			quantidade_comercial: item.quantidade,
			valor_unitario_comercial: item.preco_unitario,
			valor_bruto: Number((item.quantidade * item.preco_unitario).toFixed(2)),
			unidade_tributavel: item.unidade_fiscal || "UN",
			quantidade_tributavel: item.quantidade,
			valor_unitario_tributavel: item.preco_unitario,
			icms_origem: item.origem_mercadoria || "0",
			icms_situacao_tributaria: item.csosn,
		})),
		formaPagamento,
	};
}

async function emitirNota({ vendaId, itens, formaPagamento }) {
	const ref = "venda-" + vendaId + "-" + Date.now();
	const payload = montarPayloadNfce({ itens, formaPagamento });
	delete payload.formaPagamento; // só usado internamente pra decidir o campo acima
	const resposta = await requisicaoJson({
		method: "POST",
		path: "/v2/nfce?ref=" + ref,
		corpo: payload,
	});
	return {
		ref,
		status: resposta.status,
		numero: resposta.numero || null,
		chaveAcesso: resposta.chave_nfe || null,
		erro: resposta.erros ? JSON.stringify(resposta.erros) : null,
	};
}

async function consultarNota(ref) {
	const resposta = await requisicaoJson({
		method: "GET",
		path: "/v2/nfce/" + ref,
	});
	return {
		ref,
		status: resposta.status,
		numero: resposta.numero || null,
		chaveAcesso: resposta.chave_nfe || null,
	};
}

async function cancelarNota(ref, justificativa) {
	return requisicaoJson({
		method: "DELETE",
		path: "/v2/nfce/" + ref,
		corpo: {
			justificativa: justificativa || "Cancelamento solicitado pela loja.",
		},
	});
}

module.exports = { configurado, emitirNota, consultarNota, cancelarNota };
