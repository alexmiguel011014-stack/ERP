// Adapter concreto do provedor Efí (ex-Gerencianet) para a API Pix.
// Documentação: https://dev.efipay.com.br/docs/api-pix/
//
// Config via .env (nunca commitar valores reais — ver .env.example):
//   EFI_CLIENT_ID, EFI_CLIENT_SECRET   - credenciais OAuth2 (client_credentials)
//   EFI_CERTIFICADO_PATH               - caminho do certificado .p12 (mTLS obrigatório em toda chamada)
//   EFI_CERTIFICADO_SENHA              - senha do .p12 (se houver)
//   EFI_CHAVE_PIX                      - chave Pix cadastrada na conta Efí
//   EFI_SANDBOX                        - "true" usa homologação, qualquer outro valor usa produção
//
// Sem as credenciais configuradas, configurado() retorna false e o resto do
// app usa o fallback genérico (integracoes/pix/payload.js) normalmente.

const https = require("https");
const fs = require("fs");
const crypto = require("crypto");

const BASE_URL_PRODUCAO = "pix.api.efipay.com.br";
const BASE_URL_SANDBOX = "pix-h.api.efipay.com.br";

let tokenCache = null; // { valor, expiraEm }

function configurado() {
	return Boolean(
		process.env.EFI_CLIENT_ID &&
			process.env.EFI_CLIENT_SECRET &&
			process.env.EFI_CERTIFICADO_PATH &&
			process.env.EFI_CHAVE_PIX &&
			fs.existsSync(process.env.EFI_CERTIFICADO_PATH),
	);
}

function agenteMtls() {
	return new https.Agent({
		pfx: fs.readFileSync(process.env.EFI_CERTIFICADO_PATH),
		passphrase: process.env.EFI_CERTIFICADO_SENHA || undefined,
	});
}

function host() {
	return process.env.EFI_SANDBOX === "true"
		? BASE_URL_SANDBOX
		: BASE_URL_PRODUCAO;
}

function requisicaoJson({ method, path, headers, corpo }) {
	return new Promise((resolver, rejeitar) => {
		const dados = corpo ? JSON.stringify(corpo) : undefined;
		const req = https.request(
			{
				host: host(),
				path,
				method,
				agent: agenteMtls(),
				headers: {
					"Content-Type": "application/json",
					...(dados ? { "Content-Length": Buffer.byteLength(dados) } : {}),
					...headers,
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
								"Resposta inválida da Efí: " + respostaBruta.slice(0, 200),
							),
						);
					}
					if (res.statusCode >= 200 && res.statusCode < 300)
						return resolver(json);
					rejeitar(
						new Error(
							"Efí " +
								res.statusCode +
								": " +
								(json.mensagem || json.nome || respostaBruta),
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

async function obterToken() {
	if (tokenCache && tokenCache.expiraEm > Date.now()) return tokenCache.valor;

	const credenciais = Buffer.from(
		process.env.EFI_CLIENT_ID + ":" + process.env.EFI_CLIENT_SECRET,
	).toString("base64");

	const resposta = await requisicaoJson({
		method: "POST",
		path: "/oauth/token",
		headers: { Authorization: "Basic " + credenciais },
		corpo: { grant_type: "client_credentials" },
	});

	tokenCache = {
		valor: resposta.access_token,
		// Renova 60s antes do vencimento real para nunca usar token expirado por pouco.
		expiraEm: Date.now() + (Number(resposta.expires_in) || 3600) * 1000 - 60000,
	};
	return tokenCache.valor;
}

async function chamada({ method, path, corpo }) {
	const token = await obterToken();
	return requisicaoJson({
		method,
		path,
		corpo,
		headers: { Authorization: "Bearer " + token },
	});
}

async function criarCobranca({ valor, txid, descricao }) {
	const txidFinal = txid || crypto.randomBytes(16).toString("hex");
	const resposta = await chamada({
		method: "PUT",
		path: "/v2/cob/" + txidFinal,
		corpo: {
			calendario: { expiracao: 3600 },
			valor: { original: Number(valor).toFixed(2) },
			chave: process.env.EFI_CHAVE_PIX,
			solicitacaoPagador: descricao || undefined,
		},
	});
	return {
		txid: resposta.txid,
		copiaECola: resposta.pixCopiaECola,
		status: resposta.status,
	};
}

async function consultarCobranca(txid) {
	const resposta = await chamada({ method: "GET", path: "/v2/cob/" + txid });
	return {
		txid: resposta.txid,
		status: resposta.status,
		valor: resposta.valor ? Number(resposta.valor.original) : null,
		horario: resposta.calendario ? resposta.calendario.criacao : null,
	};
}

async function listarRecebidos({ inicio, fim }) {
	const resposta = await chamada({
		method: "GET",
		path:
			"/v2/pix?inicio=" +
			encodeURIComponent(inicio) +
			"&fim=" +
			encodeURIComponent(fim),
	});
	return (resposta.pix || []).map((p) => ({
		txid: p.txid,
		valor: Number(p.valor),
		horario: p.horario,
		pagador: p.pagador ? p.pagador.nome : null,
	}));
}

module.exports = {
	configurado,
	criarCobranca,
	consultarCobranca,
	listarRecebidos,
};
