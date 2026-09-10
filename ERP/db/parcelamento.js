const { allAsync, getAsync, runAsync } = require("./conexao");

const FORMAS_PARCELAVEIS = new Set(["Fiado", "Cartão"]);

function valorParaCentavos(valor) {
	const numero = Number(valor);
	if (!Number.isFinite(numero) || numero < 0) {
		throw new Error("Valor base inválido para parcelamento.");
	}
	return Math.round(numero * 100);
}

function percentualValido(valor) {
	const percentual = Number(valor);
	if (!Number.isFinite(percentual) || percentual < 0) {
		throw new Error("Acréscimo percentual inválido.");
	}
	return percentual;
}

function numeroParcelasValido(valor) {
	const parcelas = Number(valor);
	if (!Number.isInteger(parcelas) || parcelas < 1) {
		throw new Error("Número de parcelas inválido.");
	}
	return parcelas;
}

function dataIsoDia(valor) {
	const texto = String(valor || "").slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
		throw new Error("Data do primeiro vencimento inválida.");
	}
	const [ano, mes, dia] = texto.split("-").map(Number);
	const data = new Date(Date.UTC(ano, mes - 1, dia));
	if (
		data.getUTCFullYear() !== ano ||
		data.getUTCMonth() !== mes - 1 ||
		data.getUTCDate() !== dia
	) {
		throw new Error("Data do primeiro vencimento inválida.");
	}
	return { ano, mes, dia };
}

function adicionarMeses({ ano, mes, dia }, meses) {
	const indiceMes = mes - 1 + meses;
	const anoDestino = ano + Math.floor(indiceMes / 12);
	const mesDestino = ((indiceMes % 12) + 12) % 12;
	const ultimoDia = new Date(Date.UTC(anoDestino, mesDestino + 1, 0)).getUTCDate();
	const diaDestino = Math.min(dia, ultimoDia);
	return `${anoDestino}-${String(mesDestino + 1).padStart(2, "0")}-${String(diaDestino).padStart(2, "0")}`;
}

function dividirEmParcelas(totalCentavos, numeroParcelas, primeiroVencimento) {
	const valorParcelaCentavos = Math.floor(totalCentavos / numeroParcelas);
	const dataBase = primeiroVencimento ? dataIsoDia(primeiroVencimento) : null;
	return Array.from({ length: numeroParcelas }, (_, indice) => {
		const ultima = indice === numeroParcelas - 1;
		const valorCentavos = ultima
			? totalCentavos - valorParcelaCentavos * (numeroParcelas - 1)
			: valorParcelaCentavos;
		return {
			numero: indice + 1,
			valor: valorCentavos / 100,
			valorCentavos,
			vencimento: dataBase ? adicionarMeses(dataBase, indice) : null,
		};
	});
}

function calcularParcelamento({
	valorBase,
	acrescimoPercentual = 0,
	numeroParcelas = 1,
	desconto = 0,
	primeiroVencimento,
}) {
	const valorBaseCentavos = valorParaCentavos(valorBase);
	const percentual = percentualValido(acrescimoPercentual);
	const parcelas = numeroParcelasValido(numeroParcelas);
	const acrescimoCentavos = Math.round((valorBaseCentavos * percentual) / 100);
	const descontoCentavos = valorParaCentavos(desconto);
	const totalBrutoCentavos = valorBaseCentavos + acrescimoCentavos;
	if (descontoCentavos > totalBrutoCentavos) {
		throw new Error("Desconto não pode ser maior que o total da venda.");
	}
	const totalCentavos = totalBrutoCentavos - descontoCentavos;

	return {
		valorBase: valorBaseCentavos / 100,
		valorBaseCentavos,
		acrescimoPercentual: percentual,
		acrescimo: acrescimoCentavos / 100,
		acrescimoCentavos,
		desconto: descontoCentavos / 100,
		descontoCentavos,
		total: totalCentavos / 100,
		totalCentavos,
		parcelas: dividirEmParcelas(totalCentavos, parcelas, primeiroVencimento),
	};
}

async function calcularVendaParcelada(dados) {
	const formaPagamento = String(dados?.forma_pagamento || "").trim();
	const parcelavel = FORMAS_PARCELAVEIS.has(formaPagamento);
	const clienteId = dados?.cliente_id ? Number(dados.cliente_id) : null;
	if (formaPagamento === "Fiado" && (!Number.isInteger(clienteId) || clienteId < 1)) {
		throw new Error("Selecione um cliente para a venda fiado.");
	}
	const condicao = parcelavel
		? dados?.condicao_parcelamento_id
			? await obterCondicaoParcelamento(dados.condicao_parcelamento_id)
			: await obterCondicaoPadrao(formaPagamento)
		: null;
	if (condicao && condicao.forma_pagamento !== formaPagamento) {
		throw new Error("A condição selecionada não pertence a esta forma de pagamento.");
	}
	if (formaPagamento === "Fiado" && !dados?.data_primeiro_vencimento) {
		throw new Error("Informe o primeiro vencimento da venda fiado.");
	}
	const itensRecebidos = Array.isArray(dados?.itens) ? dados.itens : [];
	if (itensRecebidos.length === 0) {
		throw new Error("A venda precisa de pelo menos um item.");
	}

	const itens = [];
	let valorBaseCentavos = 0;
	for (const item of itensRecebidos) {
		const variacaoId = Number(item?.variacao_id);
		const quantidade = Number(item?.quantidade);
		if (!Number.isInteger(variacaoId) || variacaoId < 1 || !Number.isInteger(quantidade) || quantidade < 1) {
			throw new Error("Item de venda inválido.");
		}
		const variacao = await getAsync(
			`SELECT v.id, v.preco, pc.preco AS preco_cliente
       FROM Variacoes v
       LEFT JOIN PrecoCliente pc ON pc.variacao_id = v.id AND pc.cliente_id = ?
       WHERE v.id = ?`,
			[clienteId, variacaoId],
		);
		if (!variacao) throw new Error("Produto da venda não encontrado.");
		const precoUnitarioCentavos = valorParaCentavos(
			variacao.preco_cliente == null ? variacao.preco : variacao.preco_cliente,
		);
		const subtotalCentavos = precoUnitarioCentavos * quantidade;
		valorBaseCentavos += subtotalCentavos;
		itens.push({
			variacao_id: variacaoId,
			quantidade,
			preco_unitario: precoUnitarioCentavos / 100,
			preco_unitario_centavos: precoUnitarioCentavos,
			subtotal: subtotalCentavos / 100,
			subtotal_centavos: subtotalCentavos,
		});
	}

	const calculo = calcularParcelamento({
		valorBase: valorBaseCentavos / 100,
		acrescimoPercentual: condicao ? condicao.acrescimo_percentual : 0,
		numeroParcelas: condicao ? condicao.numero_parcelas : 1,
		desconto: dados?.desconto || 0,
		primeiroVencimento:
			formaPagamento === "Fiado" ? dados?.data_primeiro_vencimento : null,
	});
	return { condicao, formaPagamento, clienteId, itens, ...calculo };
}

async function listarCondicoesParcelamento(formaPagamento, incluirInativas = false) {
	const params = [];
	const filtros = [];
	if (formaPagamento) {
		if (!FORMAS_PARCELAVEIS.has(formaPagamento)) {
			throw new Error("Forma de pagamento não permite parcelamento.");
		}
		filtros.push("forma_pagamento = ?");
		params.push(formaPagamento);
	}
	if (!incluirInativas) filtros.push("ativo = 1");
	const where = filtros.length ? " WHERE " + filtros.join(" AND ") : "";
	return allAsync(
		"SELECT id, codigo, nome, forma_pagamento, numero_parcelas, acrescimo_percentual, ativo, ordem FROM CondicoesParcelamento" +
			where +
			" ORDER BY forma_pagamento, ordem, numero_parcelas, id",
		params,
	);
}

async function obterCondicaoParcelamento(id) {
	const condicaoId = Number(id);
	if (!Number.isInteger(condicaoId) || condicaoId < 1) {
		throw new Error("Condição de parcelamento inválida.");
	}
	const condicao = await getAsync(
		"SELECT id, codigo, nome, forma_pagamento, numero_parcelas, acrescimo_percentual, ativo, ordem FROM CondicoesParcelamento WHERE id = ?",
		[condicaoId],
	);
	if (!condicao || !condicao.ativo) {
		throw new Error("Condição de parcelamento não encontrada ou inativa.");
	}
	return condicao;
}

async function obterCondicaoPadrao(formaPagamento) {
	const condicao = await getAsync(
		"SELECT id, codigo, nome, forma_pagamento, numero_parcelas, acrescimo_percentual, ativo, ordem FROM CondicoesParcelamento WHERE forma_pagamento = ? AND numero_parcelas = 1 AND ativo = 1 ORDER BY ordem, id LIMIT 1",
		[formaPagamento],
	);
	if (!condicao) {
		throw new Error("Cadastre uma condição ativa de 1x para esta forma de pagamento.");
	}
	return condicao;
}

async function salvarCondicaoParcelamento(dados) {
	const formaPagamento = String(dados?.forma_pagamento || "").trim();
	if (!FORMAS_PARCELAVEIS.has(formaPagamento)) {
		throw new Error("Só Fiado e Cartão podem ter parcelamento.");
	}
	const numeroParcelas = numeroParcelasValido(dados?.numero_parcelas);
	const acrescimoPercentual = percentualValido(dados?.acrescimo_percentual);
	const nome = String(dados?.nome || `${numeroParcelas}x ${formaPagamento}`).trim();
	if (!nome) throw new Error("Informe o nome da condição de parcelamento.");
	const ordem = Number.isInteger(Number(dados?.ordem)) ? Number(dados.ordem) : numeroParcelas;
	const ativo = dados?.ativo === false || dados?.ativo === 0 ? 0 : 1;

	if (dados?.id) {
		const resultado = await runAsync(
			"UPDATE CondicoesParcelamento SET nome = ?, forma_pagamento = ?, numero_parcelas = ?, acrescimo_percentual = ?, ativo = ?, ordem = ?, atualizado_em = ? WHERE id = ?",
			[nome, formaPagamento, numeroParcelas, acrescimoPercentual, ativo, ordem, new Date().toISOString(), Number(dados.id)],
		);
		if (resultado.changes === 0) throw new Error("Condição de parcelamento não encontrada.");
		return { success: true, condicaoId: Number(dados.id) };
	}

	const codigo = String(dados?.codigo || `${formaPagamento}-${numeroParcelas}x-${Date.now()}`).trim();
	const resultado = await runAsync(
		"INSERT INTO CondicoesParcelamento (codigo, nome, forma_pagamento, numero_parcelas, acrescimo_percentual, ativo, ordem, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		[codigo, nome, formaPagamento, numeroParcelas, acrescimoPercentual, ativo, ordem, new Date().toISOString(), new Date().toISOString()],
	);
	return { success: true, condicaoId: resultado.lastID };
}

module.exports = {
	FORMAS_PARCELAVEIS,
	calcularParcelamento,
	calcularVendaParcelada,
	listarCondicoesParcelamento,
	obterCondicaoParcelamento,
	obterCondicaoPadrao,
	salvarCondicaoParcelamento,
};
