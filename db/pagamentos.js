const { allAsync, getAsync, runAsync } = require("./conexao");

// Pagamentos (Pix / Boleto / Dinheiro / Cartão) — recebimentos vinculados a uma venda.
// Tabela criada em db/schema.js:iniciarBanco().

const SELECT_BASE = `SELECT p.id, p.data_recebimento, p.data_liquidacao, p.valor_recebido, p.metodo, p.numero_identificador,
                    p.parcela_num, p.parcela_total, p.status, p.observacao,
                    v.id AS numero_venda, v.data_venda, v.cliente_id,
                    c.nome AS cliente_nome
             FROM Pagamentos p
             LEFT JOIN Vendas v ON p.venda_id = v.id
             LEFT JOIN Clientes c ON v.cliente_id = c.id`;

// Retorna todos os pagamentos (opcionalmente filtrado por método)
async function listarPagamentos(metodo) {
	let sql = SELECT_BASE;
	const params = [];
	if (metodo) {
		sql += " WHERE LOWER(TRIM(p.metodo)) = LOWER(TRIM(?))";
		params.push(metodo);
	}
	sql += " ORDER BY p.data_recebimento DESC";
	return await allAsync(sql, params);
}

const METODOS = new Set(["pix", "cartao", "cartão", "dinheiro", "fiado", "boleto"]);
const STATUS = new Set(["pendente", "recebido", "cancelado"]);

function normalizarMetodo(metodo) {
	const valor = String(metodo || "").trim().toLowerCase();
	if (!METODOS.has(valor)) throw new Error("Método de pagamento inválido.");
	if (valor === "pix") return "PIX";
	if (valor === "cartao" || valor === "cartão") return "Cartão";
	if (valor === "dinheiro") return "Dinheiro";
	if (valor === "fiado") return "Fiado";
	return "Boleto";
}

function validarData(valor, nome) {
	if (valor == null || String(valor).trim() === "") return null;
	const texto = String(valor).trim();
	const data = new Date(/^\d{4}-\d{2}-\d{2}$/.test(texto) ? `${texto}T00:00:00Z` : texto);
	if (Number.isNaN(data.getTime())) throw new Error(`${nome} inválida.`);
	return texto;
}

function validarParcelas(numero, total) {
	if (numero == null && total == null) return { numero: null, total: null };
	const parcelaNum = Number(numero);
	const parcelaTotal = Number(total == null ? numero : total);
	if (!Number.isInteger(parcelaNum) || parcelaNum < 1 || !Number.isInteger(parcelaTotal) || parcelaTotal < parcelaNum) {
		throw new Error("Parcela inválida.");
	}
	return { numero: parcelaNum, total: parcelaTotal };
}

// Registra um novo recebimento
async function registrarPagamento(dados) {
	const {
		venda_id,
		cliente_id,
		metodo,
		numero_identificador,
		data_recebimento,
		valor_recebido,
		status,
		observacao,
		data_liquidacao,
		parcela_num,
		parcela_total,
	} = dados;
	const metodoNormalizado = normalizarMetodo(metodo);
	const valor = Number(valor_recebido);
	if (!Number.isFinite(valor) || valor <= 0) throw new Error("Valor recebido inválido.");
	const statusNormalizado = String(status || "pendente").trim().toLowerCase();
	if (!STATUS.has(statusNormalizado)) throw new Error("Status de pagamento inválido.");
	const dataPrevista = validarData(data_recebimento, "Data de recebimento");
	const dataLiquidacao = validarData(data_liquidacao, "Data de liquidação");
	const parcelas = validarParcelas(parcela_num, parcela_total);
	const vendaId = venda_id == null || venda_id === "" ? null : Number(venda_id);
	if (vendaId != null && (!Number.isInteger(vendaId) || vendaId <= 0)) throw new Error("Venda inválida.");
	if (metodoNormalizado === "Cartão" && statusNormalizado === "recebido" && !dataLiquidacao) {
		throw new Error("Cartão recebido exige data de liquidação.");
	}
	const identificador = numero_identificador == null ? "" : String(numero_identificador).trim();
	if (metodoNormalizado === "Cartão" && !identificador) {
		throw new Error("Cartão exige identificador da transação.");
	}

	// O identificador da transação + parcela é a chave de negócio do cartão.
	// Retornar a linha existente torna retries do adquirente idempotentes.
	if (metodoNormalizado === "Cartão" && vendaId) {
		const existente = await getAsync(
			"SELECT id FROM Pagamentos WHERE venda_id = ? AND numero_identificador = ? AND COALESCE(parcela_num, 1) = COALESCE(?, 1) AND LOWER(TRIM(metodo)) IN ('cartao', 'cartão') ORDER BY id LIMIT 1",
			[vendaId, identificador, parcelas.numero],
		);
		if (existente) return existente.id;

		const venda = await getAsync(
			"SELECT total, forma_pagamento FROM Vendas WHERE id = ?",
			[vendaId],
		);
		if (!venda) throw new Error("Venda não encontrada.");
		const alocacao = await getAsync(
			`SELECT COUNT(vp.id) AS quantidade,
              COALESCE(SUM(vp.valor), 0) AS total
       FROM VendaPagamentos vp
       WHERE vp.venda_id = ? AND LOWER(TRIM(vp.forma_pagamento)) IN ('cartao', 'cartão')`,
			[vendaId],
		);
		const limite = Number(alocacao.quantidade) > 0
			? Number(alocacao.total)
			: String(venda.forma_pagamento || "").toLowerCase() === "cartão"
				? Number(venda.total)
				: 0;
		const usados = await getAsync(
			`SELECT COALESCE(SUM(valor_recebido), 0) AS total
       FROM Pagamentos
       WHERE venda_id = ? AND LOWER(TRIM(metodo)) IN ('cartao', 'cartão')
         AND status IN ('pendente', 'recebido')`,
			[vendaId],
		);
		if (Math.round((Number(usados.total) + valor) * 100) > Math.round(limite * 100)) {
			throw new Error("Valor dos pagamentos de cartão supera a alocação da venda.");
		}
	}
	const result = await runAsync(
		`INSERT INTO Pagamentos (venda_id, cliente_id, metodo, numero_identificador, data_recebimento, valor_recebido, status, observacao, data_liquidacao, parcela_num, parcela_total, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
		[
			vendaId,
			cliente_id || null,
			metodoNormalizado,
			identificador || null,
			dataPrevista,
			valor,
			statusNormalizado,
			observacao || "",
			dataLiquidacao,
			parcelas.numero,
			parcelas.total,
		],
	);
	return result.lastID;
}

// Altera o status de um pagamento para 'recebido'
async function pagarPagamento(id, dataLiquidacaoInformada) {
	const pagamentoId = Number(id);
	if (!Number.isInteger(pagamentoId) || pagamentoId <= 0) throw new Error("Pagamento inválido.");
	const dataLiquidacao = dataLiquidacaoInformada != null
		? validarData(dataLiquidacaoInformada, "Data de liquidação")
		: new Date().toISOString();
	const resultado = await runAsync(
		"UPDATE Pagamentos SET status = 'recebido', data_liquidacao = ? WHERE id = ? AND status = 'pendente'",
		[dataLiquidacao, pagamentoId],
	);
	if (resultado.changes === 0) throw new Error("Pagamento não encontrado, cancelado ou já recebido.");
	return resultado;
}

// Permite registrar a previsão do adquirente quando ela se torna conhecida,
// sem alterar um pagamento já liquidado/cancelado.
async function atualizarDataPrevistaPagamento(id, dataRecebimento) {
	const pagamentoId = Number(id);
	if (!Number.isInteger(pagamentoId) || pagamentoId <= 0) throw new Error("Pagamento inválido.");
	const data = validarData(dataRecebimento, "Data de recebimento");
	if (!data) throw new Error("Informe a data prevista de recebimento.");
	const resultado = await runAsync(
		"UPDATE Pagamentos SET data_recebimento = ? WHERE id = ? AND status = 'pendente'",
		[data, pagamentoId],
	);
	if (resultado.changes === 0) throw new Error("Pagamento não encontrado ou não está pendente.");
	return resultado;
}

// Lista apenas os pagamentos com status 'pendente'
async function listarPagamentosPendentes() {
	const sql = `SELECT p.id, p.data_recebimento, p.data_liquidacao, p.valor_recebido, p.metodo, p.numero_identificador,
                     p.parcela_num, p.parcela_total,
                     v.id AS numero_venda, c.nome AS cliente_nome
              FROM Pagamentos p
              LEFT JOIN Vendas v ON p.venda_id = v.id
              LEFT JOIN Clientes c ON v.cliente_id = c.id
              WHERE p.status = 'pendente'
              ORDER BY p.data_recebimento ASC`;
	return await allAsync(sql);
}

module.exports = {
	listarPagamentos,
	registrarPagamento,
	pagarPagamento,
	atualizarDataPrevistaPagamento,
	listarPagamentosPendentes,
};
