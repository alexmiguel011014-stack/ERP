const { runAsync, allAsync, getAsync } = require("./conexao");

/* ============ Financeiro (contas a pagar/receber + fluxo de caixa) ============ */

// Lista fechada (decisão do dono, 2026-09-02) — cobre os gastos típicos de
// uma loja física; "Outros" é o catch-all pra não travar um lançamento por
// falta de categoria certa. Opcional: lançamentos sem categoria continuam
// válidos (compatibilidade com tudo que já existe no banco).
const CATEGORIAS_FINANCEIRAS = [
	"Aluguel",
	"Fornecedores",
	"Folha/Comissão",
	"Marketing",
	"Impostos",
	"Manutenção",
	"Investimento",
	"Outros",
];

function validarCategoria(categoria) {
	const c = String(categoria || "").trim();
	if (!c) return null;
	if (!CATEGORIAS_FINANCEIRAS.includes(c)) {
		throw new Error("Categoria inválida.");
	}
	return c;
}

const DATA_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function validarDataFluxo(data, nome) {
	const valor = String(data || "");
	if (!DATA_ISO_RE.test(valor)) {
		throw new Error(`${nome} inválida. Use o formato AAAA-MM-DD.`);
	}
	const dataUtc = new Date(`${valor}T00:00:00Z`);
	if (
		Number.isNaN(dataUtc.getTime()) ||
		dataUtc.toISOString().slice(0, 10) !== valor
	) {
		throw new Error(`${nome} inválida. Use uma data existente.`);
	}
	return valor;
}

function resolverPeriodoFluxo(dataInicio, dataFim, padraoInicio, padraoFim) {
	const inicio = validarDataFluxo(dataInicio || padraoInicio, "Data inicial");
	const fim = validarDataFluxo(dataFim || padraoFim, "Data final");
	if (inicio > fim) {
		throw new Error("Período inválido: a data inicial deve ser anterior à final.");
	}
	return { inicio, fim };
}

function arredondarMoeda(valor) {
	return Math.round((Number(valor) || 0) * 100) / 100;
}

function consolidarEventosFluxo(eventos, periodo, modo) {
	const ordenados = eventos
		.filter((evento) => evento.data && Number(evento.valor) > 0)
		.map((evento) => ({
			...evento,
			valor: arredondarMoeda(evento.valor),
			categoria: evento.categoria || null,
			referenciaId:
				evento.referenciaId == null ? null : Number(evento.referenciaId),
		}))
		.sort((a, b) =>
			a.data.localeCompare(b.data) ||
				a.tipo.localeCompare(b.tipo) ||
				a.origem.localeCompare(b.origem) ||
				(a.referenciaId || 0) - (b.referenciaId || 0),
		);

	const mapaDias = {};
	const grupos = { origem: {}, tipo: {}, categoria: {} };
	const adicionarGrupo = (dimensao, chave, evento) => {
		const rotulo = chave || "Sem categoria";
		if (!grupos[dimensao][rotulo]) {
			grupos[dimensao][rotulo] = {
				chave: rotulo,
				quantidade: 0,
				entradas: 0,
				saidas: 0,
				saldo: 0,
			};
		}
		const grupo = grupos[dimensao][rotulo];
		grupo.quantidade++;
		if (evento.tipo === "entrada") grupo.entradas += evento.valor;
		else grupo.saidas += evento.valor;
		grupo.saldo = grupo.entradas - grupo.saidas;
	};

	for (const evento of ordenados) {
		if (!mapaDias[evento.data]) {
			mapaDias[evento.data] = {
				dia: evento.data,
				entradas: 0,
				saidas: 0,
			};
		}
		const dia = mapaDias[evento.data];
		if (evento.tipo === "entrada") dia.entradas += evento.valor;
		else dia.saidas += evento.valor;
		adicionarGrupo("origem", evento.origem, evento);
		adicionarGrupo("tipo", evento.tipo, evento);
		adicionarGrupo("categoria", evento.categoria, evento);
	}

	let saldoAcumulado = 0;
	const dias = Object.values(mapaDias)
		.sort((a, b) => a.dia.localeCompare(b.dia))
		.map((dia) => {
			dia.entradas = arredondarMoeda(dia.entradas);
			dia.saidas = arredondarMoeda(dia.saidas);
			dia.saldo = arredondarMoeda(dia.entradas - dia.saidas);
			saldoAcumulado = arredondarMoeda(saldoAcumulado + dia.saldo);
			dia.saldoAcumulado = saldoAcumulado;
			return dia;
		});

	const finalizarGrupos = (dimensao) =>
		Object.values(grupos[dimensao])
			.map((grupo) => ({
				...grupo,
				entradas: arredondarMoeda(grupo.entradas),
				saidas: arredondarMoeda(grupo.saidas),
				saldo: arredondarMoeda(grupo.saldo),
			}))
			.sort((a, b) => a.chave.localeCompare(b.chave));

	const totalEntradas = arredondarMoeda(
		ordenados
			.filter((evento) => evento.tipo === "entrada")
			.reduce((total, evento) => total + evento.valor, 0),
	);
	const totalSaidas = arredondarMoeda(
		ordenados
			.filter((evento) => evento.tipo === "saida")
			.reduce((total, evento) => total + evento.valor, 0),
	);

	return {
		periodo,
		modo,
		eventos: ordenados,
		dias,
		totalEntradas,
		totalSaidas,
		saldo: arredondarMoeda(totalEntradas - totalSaidas),
		porOrigem: finalizarGrupos("origem"),
		porTipo: finalizarGrupos("tipo"),
		porCategoria: finalizarGrupos("categoria"),
	};
}

async function criarLancamentoInterno(run, dados) {
	await run(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, referencia_id, forma_pagamento, data_criacao, cliente_id, venda_id, grupo_id, parcela_num, parcela_total) VALUES (?, ?, ?, ?, NULL, 'aberto', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		[
			dados.tipo,
			dados.descricao,
			dados.valor,
			dados.data_vencimento || null,
			dados.origem || "manual",
			dados.referencia_id || null,
			dados.forma_pagamento || null,
			new Date().toISOString(),
			dados.cliente_id || null,
			dados.venda_id || null,
			dados.grupo_id || null,
			dados.parcela_num || 1,
			dados.parcela_total || 1,
		],
	);
}

async function getLancamentos(filtro) {
	filtro = filtro || {};
	let sql =
		"SELECT lf.*, c.nome AS cliente_nome FROM LancamentosFinanceiros lf LEFT JOIN Clientes c ON c.id = lf.cliente_id";
	const where = [];
	const params = [];
	if (filtro.tipo) {
		where.push("lf.tipo = ?");
		params.push(filtro.tipo);
	}
	if (filtro.status) {
		where.push("lf.status = ?");
		params.push(filtro.status);
	}
	if (filtro.categoria) {
		where.push("lf.categoria = ?");
		params.push(filtro.categoria);
	}
	if (filtro.dataInicio) {
		where.push("DATE(lf.data_vencimento) >= ?");
		params.push(filtro.dataInicio);
	}
	if (filtro.dataFim) {
		where.push("DATE(lf.data_vencimento) <= ?");
		params.push(filtro.dataFim);
	}
	if (where.length > 0) sql += " WHERE " + where.join(" AND ");
	sql +=
		" ORDER BY (CASE WHEN lf.status = 'aberto' THEN 0 ELSE 1 END), DATE(lf.data_vencimento) ASC, lf.id DESC LIMIT 200";
	return allAsync(sql, params);
}

async function criarLancamento(dados) {
	const tipo = dados && dados.tipo;
	const descricao = String((dados && dados.descricao) || "").trim();
	const valor = Number(dados && dados.valor);
	const categoria = validarCategoria(dados && dados.categoria);
	if (tipo !== "pagar" && tipo !== "receber")
		throw new Error("Tipo de lançamento inválido.");
	if (!descricao) throw new Error("Informe a descrição do lançamento.");
	if (!Number.isFinite(valor) || valor <= 0) throw new Error("Valor inválido.");

	const parcelas = Math.max(1, parseInt(dados.parcelas, 10) || 1);
	if (parcelas > 1) {
		return criarLancamentoParcelado(
			dados,
			tipo,
			descricao,
			valor,
			parcelas,
			categoria,
		);
	}

	const vencimento = dados.data_vencimento
		? new Date(dados.data_vencimento).toISOString()
		: new Date().toISOString();

	const result = await runAsync(
		"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, referencia_id, forma_pagamento, data_criacao, categoria) VALUES (?, ?, ?, ?, NULL, 'aberto', 'manual', NULL, NULL, ?, ?)",
		[
			tipo,
			descricao,
			Math.round(valor * 100) / 100,
			vencimento,
			new Date().toISOString(),
			categoria,
		],
	);
	return { success: true, lancamentoId: result.lastID };
}

// Divide um lançamento em N parcelas mensais iguais (a última absorve o
// arredondamento), ligadas por um grupo_id para exibição/baixa individual.
async function criarLancamentoParcelado(
	dados,
	tipo,
	descricao,
	valor,
	parcelas,
	categoria,
) {
	const grupoId =
		Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
	const dataBase = dados.data_vencimento
		? new Date(dados.data_vencimento)
		: new Date();
	const valorParcela = Math.round((valor / parcelas) * 100) / 100;
	const agora = new Date().toISOString();
	const ids = [];

	let somaParcelas = 0;
	for (let i = 0; i < parcelas; i++) {
		const vencParcela = new Date(dataBase);
		vencParcela.setMonth(vencParcela.getMonth() + i);
		const ultima = i === parcelas - 1;
		const valorEsta = ultima
			? Math.round((valor - somaParcelas) * 100) / 100
			: valorParcela;
		somaParcelas += valorEsta;

		const result = await runAsync(
			"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, referencia_id, forma_pagamento, data_criacao, grupo_id, parcela_num, parcela_total, categoria) VALUES (?, ?, ?, ?, NULL, 'aberto', 'manual', NULL, NULL, ?, ?, ?, ?, ?)",
			[
				tipo,
				descricao + " (" + (i + 1) + "/" + parcelas + ")",
				valorEsta,
				vencParcela.toISOString(),
				agora,
				grupoId,
				i + 1,
				parcelas,
				categoria,
			],
		);
		ids.push(result.lastID);
	}
	return { success: true, lancamentoId: ids[0], grupoId, parcelaIds: ids };
}

async function baixarLancamento(id) {
	const result = await runAsync(
		"UPDATE LancamentosFinanceiros SET status = 'pago', data_pagamento = ? WHERE id = ? AND status = 'aberto'",
		[new Date().toISOString(), id],
	);
	if (result.changes === 0)
		throw new Error("Lançamento não encontrado ou já baixado.");
	return { success: true };
}

async function excluirLancamento(id) {
	const result = await runAsync(
		"DELETE FROM LancamentosFinanceiros WHERE id = ? AND status = 'aberto' AND origem = 'manual'",
		[id],
	);
	if (result.changes === 0)
		throw new Error("Só é possível excluir lançamentos manuais em aberto.");
	return { success: true };
}

// Política canônica do fluxo realizado:
// - venda finalizada não-Fiado entra na data da venda;
// - venda Fiado não entra na data da venda; o lançamento a receber entra só
//   quando pago, na data de pagamento;
// - lançamento a pagar pago sai na data de pagamento;
// - Pagamentos é detalhe vinculado à venda e FechamentosCaixa é reconciliação
//   física: nenhum dos dois é somado aqui para evitar dupla contagem.
// - devoluções são uma saída na data do estorno; vendas canceladas ficam fora.
async function getFluxoCaixa(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const periodo = resolverPeriodoFluxo(
		dataInicio,
		dataFim,
		hoje.slice(0, 8) + "01",
		hoje,
	);

	const entradasVendas = await allAsync(
		`SELECT id, DATE(data_venda) AS dia, total, forma_pagamento, origem, observacao
     FROM Vendas
     WHERE status = 'finalizada'
       AND (forma_pagamento IS NULL OR forma_pagamento != 'Fiado')
       AND DATE(data_venda) BETWEEN ? AND ?
     ORDER BY dia, id`,
		[periodo.inicio, periodo.fim],
	);
	const entradasRecebimentos = await allAsync(
		`SELECT id, tipo, descricao, valor, DATE(data_pagamento) AS dia,
            categoria, origem, referencia_id, forma_pagamento
     FROM LancamentosFinanceiros
     WHERE tipo = 'receber' AND status = 'pago'
       AND data_pagamento IS NOT NULL
       AND DATE(data_pagamento) BETWEEN ? AND ?
     ORDER BY dia, id`,
		[periodo.inicio, periodo.fim],
	);
	const saidasPagamentos = await allAsync(
		`SELECT id, tipo, descricao, valor, DATE(data_pagamento) AS dia,
            categoria, origem, referencia_id, forma_pagamento
     FROM LancamentosFinanceiros
     WHERE tipo = 'pagar' AND status = 'pago'
       AND data_pagamento IS NOT NULL
       AND DATE(data_pagamento) BETWEEN ? AND ?
     ORDER BY dia, id`,
		[periodo.inicio, periodo.fim],
	);
	const devolucoes = await allAsync(
		`SELECT d.id, d.venda_id, d.valor_total, DATE(d.data) AS dia
     FROM Devolucoes d
     JOIN Vendas v ON v.id = d.venda_id
     WHERE d.data IS NOT NULL
       AND (v.forma_pagamento IS NULL OR v.forma_pagamento != 'Fiado')
       AND DATE(d.data) BETWEEN ? AND ?
     ORDER BY dia, d.id`,
		[periodo.inicio, periodo.fim],
	);

	const eventos = [
		...entradasVendas.map((venda) => ({
			data: venda.dia,
			tipo: "entrada",
			origem:
				venda.origem === "importacao_financeiro_historico"
					? "importacao_financeiro_historico"
					: "venda",
			descricao:
				venda.origem === "importacao_financeiro_historico"
					? venda.observacao || "Venda histórica importada"
					: `Venda #${venda.id}`,
			categoria:
				venda.origem === "importacao_financeiro_historico"
					? "Vendas históricas"
					: null,
			valor: venda.total,
			referenciaId: venda.id,
			formaPagamento: venda.forma_pagamento || null,
		})),
		...entradasRecebimentos.map((lancamento) => ({
			data: lancamento.dia,
			tipo: "entrada",
			origem: lancamento.origem || "manual",
			descricao: lancamento.descricao,
			categoria: lancamento.categoria,
			valor: lancamento.valor,
			referenciaId: lancamento.referencia_id || lancamento.id,
			formaPagamento: lancamento.forma_pagamento || null,
		})),
		...saidasPagamentos.map((lancamento) => ({
			data: lancamento.dia,
			tipo: "saida",
			origem: lancamento.origem || "manual",
			descricao: lancamento.descricao,
			categoria: lancamento.categoria,
			valor: lancamento.valor,
			referenciaId: lancamento.referencia_id || lancamento.id,
			formaPagamento: lancamento.forma_pagamento || null,
		})),
		...devolucoes.map((devolucao) => ({
			data: devolucao.dia,
			tipo: "saida",
			origem: "devolucao",
			descricao: `Devolução da venda #${devolucao.venda_id}`,
			categoria: null,
			valor: devolucao.valor_total,
			referenciaId: devolucao.id,
			formaPagamento: null,
		})),
	];

	return consolidarEventosFluxo(eventos, periodo, "realizado");
}

// Fluxo de caixa PROJETADO: mesma forma de retorno de getFluxoCaixa (dias +
// saldoAcumulado), mas a partir de LancamentosFinanceiros ainda EM ABERTO
// agrupados por data_vencimento — não data_pagamento, que é o que o fluxo
// realizado acima usa. Sibling function, não substitui a de cima: a loja
// continua precisando ver o que já aconteceu separado do que é esperado.
async function getFluxoCaixaProjetado(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const periodo = resolverPeriodoFluxo(
		dataInicio,
		dataFim,
		hoje,
		new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
	);

	const entradasAbertas = await allAsync(
		`SELECT id, descricao, valor, DATE(data_vencimento) AS dia, categoria,
            origem, referencia_id, forma_pagamento
     FROM LancamentosFinanceiros
     WHERE tipo = 'receber' AND status = 'aberto'
       AND data_vencimento IS NOT NULL
       AND DATE(data_vencimento) BETWEEN ? AND ?
     ORDER BY dia, id`,
		[periodo.inicio, periodo.fim],
	);
	const saidasAbertas = await allAsync(
		`SELECT id, descricao, valor, DATE(data_vencimento) AS dia, categoria,
            origem, referencia_id, forma_pagamento
     FROM LancamentosFinanceiros
     WHERE tipo = 'pagar' AND status = 'aberto'
       AND data_vencimento IS NOT NULL
       AND DATE(data_vencimento) BETWEEN ? AND ?
     ORDER BY dia, id`,
		[periodo.inicio, periodo.fim],
	);
	const eventos = [
		...entradasAbertas.map((lancamento) => ({
			data: lancamento.dia,
			tipo: "entrada",
			origem: lancamento.origem || "manual",
			descricao: lancamento.descricao,
			categoria: lancamento.categoria,
			valor: lancamento.valor,
			referenciaId: lancamento.referencia_id || lancamento.id,
			formaPagamento: lancamento.forma_pagamento || null,
		})),
		...saidasAbertas.map((lancamento) => ({
			data: lancamento.dia,
			tipo: "saida",
			origem: lancamento.origem || "manual",
			descricao: lancamento.descricao,
			categoria: lancamento.categoria,
			valor: lancamento.valor,
			referenciaId: lancamento.referencia_id || lancamento.id,
			formaPagamento: lancamento.forma_pagamento || null,
		})),
	];

	return consolidarEventosFluxo(eventos, periodo, "projetado");
}

// Alíquota de provisão de DAS, % owner-informado — a faixa/anexo/Fator R real
// do Simples Nacional é decisão do contador do dono, não algo que este app
// deveria adivinhar. Mesmo padrão manual de custo_fixo_mensal/taxa_adquirente_media.
async function getAliquotaDAS() {
	const row = await getAsync(
		"SELECT valor FROM Configuracao WHERE chave = 'aliquota_das_provisao'",
	);
	return row ? parseFloat(row.valor) || 0 : 0;
}

async function saveAliquotaDAS(valor) {
	const v = Number(valor);
	if (!Number.isFinite(v) || v < 0) throw new Error("Alíquota inválida.");
	await runAsync(
		"INSERT OR REPLACE INTO Configuracao (chave, valor) VALUES ('aliquota_das_provisao', ?)",
		[String(v)],
	);
	return { success: true };
}

// Provisão de DAS no regime de caixa: aplica a alíquota sobre o que
// getFluxoCaixa() já mostra como RECEBIDO no período (não faturado) — é essa
// distinção que evita o erro real documentado (provisionar contra Vendas.total
// faturado, pagando DAS antes do dinheiro efetivamente ter caído na conta).
async function getProvisaoDAS(dataInicio, dataFim) {
	const aliquota = await getAliquotaDAS();
	const fluxo = await getFluxoCaixa(dataInicio, dataFim);
	const valorProvisionado = (fluxo.totalEntradas * aliquota) / 100;
	return {
		periodo: {
			inicio: dataInicio || fluxo.dias[0]?.dia || null,
			fim: dataFim || null,
		},
		totalRecebido: fluxo.totalEntradas,
		aliquota,
		valorProvisionado,
	};
}

// Meta de faturamento mensal, owner-informada — mesmo padrão manual de
// aliquota_das_provisao/custo_fixo_mensal (a meta é decisão do dono, não algo
// que este app deveria calcular sozinho).
async function getMetaFaturamentoMensal() {
	const row = await getAsync(
		"SELECT valor FROM Configuracao WHERE chave = 'meta_faturamento_mensal'",
	);
	return row ? parseFloat(row.valor) || 0 : 0;
}

async function saveMetaFaturamentoMensal(valor) {
	const v = Number(valor);
	if (!Number.isFinite(v) || v < 0) throw new Error("Meta inválida.");
	await runAsync(
		"INSERT OR REPLACE INTO Configuracao (chave, valor) VALUES ('meta_faturamento_mensal', ?)",
		[String(v)],
	);
	return { success: true };
}

// Aging de recebíveis: contas a receber em aberto, agrupadas por quanto
// tempo já passou do vencimento. O crediário (venda Fiado) já cria esses
// lançamentos automaticamente (db/vendas.js:148/291/388) — isso aqui só
// bucketiza o que já existe, não cria dado novo.
async function getAgingRecebiveis() {
	const agoraMs = Date.now();
	const linhas = await allAsync(
		"SELECT id, descricao, valor, data_vencimento FROM LancamentosFinanceiros WHERE tipo = 'receber' AND status = 'aberto' ORDER BY data_vencimento ASC",
	);

	const grupos = {
		aVencer: [],
		atraso0a30: [],
		atraso31a60: [],
		atraso61a90: [],
		atraso90mais: [],
	};
	for (const l of linhas) {
		const diasAtraso = Math.floor(
			(agoraMs - new Date(l.data_vencimento).getTime()) / 86400000,
		);
		const linha = {
			id: l.id,
			descricao: l.descricao,
			valor: Number(l.valor) || 0,
			data_vencimento: l.data_vencimento,
			diasAtraso,
		};
		if (diasAtraso <= 0) grupos.aVencer.push(linha);
		else if (diasAtraso <= 30) grupos.atraso0a30.push(linha);
		else if (diasAtraso <= 60) grupos.atraso31a60.push(linha);
		else if (diasAtraso <= 90) grupos.atraso61a90.push(linha);
		else grupos.atraso90mais.push(linha);
	}

	const resumo = (lista) => ({
		itens: lista,
		total: lista.reduce((a, l) => a + l.valor, 0),
		quantidade: lista.length,
	});

	return {
		aVencer: resumo(grupos.aVencer),
		atraso0a30: resumo(grupos.atraso0a30),
		atraso31a60: resumo(grupos.atraso31a60),
		atraso61a90: resumo(grupos.atraso61a90),
		atraso90mais: resumo(grupos.atraso90mais),
		totalGeral: linhas.reduce((a, l) => a + (Number(l.valor) || 0), 0),
	};
}

// Lançamentos em aberto vencendo hoje — usado pro alerta dentro do próprio
// módulo Financeiro (o Dashboard já mostra os totais aReceberHoje/aPagarHoje,
// isto aqui é a lista, pra quem abre direto a tela em vez de passar pelo Dashboard).
async function getLancamentosVencendoHoje() {
	const hoje = new Date().toISOString().slice(0, 10);
	return allAsync(
		"SELECT id, tipo, descricao, valor, data_vencimento FROM LancamentosFinanceiros WHERE status = 'aberto' AND DATE(data_vencimento) = ? ORDER BY tipo, id",
		[hoje],
	);
}

// Último dia real do mês (ano/mes 1-12) — evita gerar um lançamento em
// "31/fevereiro" quando o template tem dia_mes=31.
function ultimoDiaDoMes(ano, mes) {
	return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

async function criarLancamentoRecorrente(dados) {
	const tipo = dados && dados.tipo;
	const descricao = String((dados && dados.descricao) || "").trim();
	const valor = Number(dados && dados.valor);
	const diaMes = parseInt(dados && dados.dia_mes, 10);
	const categoria = validarCategoria(dados && dados.categoria);
	if (tipo !== "pagar" && tipo !== "receber")
		throw new Error("Tipo de lançamento inválido.");
	if (!descricao) throw new Error("Informe a descrição do lançamento.");
	if (!Number.isFinite(valor) || valor <= 0) throw new Error("Valor inválido.");
	if (!Number.isInteger(diaMes) || diaMes < 1 || diaMes > 31)
		throw new Error("Dia do mês inválido (use 1 a 31).");

	const result = await runAsync(
		"INSERT INTO LancamentosRecorrentes (tipo, descricao, valor, dia_mes, categoria, ativo, criado_em) VALUES (?, ?, ?, ?, ?, 1, ?)",
		[tipo, descricao, valor, diaMes, categoria, new Date().toISOString()],
	);
	return { success: true, id: result.lastID };
}

async function listarLancamentosRecorrentes() {
	return allAsync("SELECT * FROM LancamentosRecorrentes ORDER BY dia_mes ASC");
}

async function alternarLancamentoRecorrente(id, ativo) {
	const result = await runAsync(
		"UPDATE LancamentosRecorrentes SET ativo = ? WHERE id = ?",
		[ativo ? 1 : 0, id],
	);
	if (result.changes === 0)
		throw new Error("Lançamento recorrente não encontrado.");
	return { success: true };
}

async function removerLancamentoRecorrente(id) {
	const result = await runAsync(
		"DELETE FROM LancamentosRecorrentes WHERE id = ?",
		[id],
	);
	if (result.changes === 0)
		throw new Error("Lançamento recorrente não encontrado.");
	return { success: true };
}

// Roda em todo login (ver ipc/auth.js), igual ao backup automático
// (main.js:iniciarBackupAutomatico) — idempotente: só gera o lançamento do
// mês corrente se ainda não existir um com essa origem+referencia_id+mês
// (não confia em rodar só uma vez por mês, confia em checar antes de criar).
async function gerarLancamentosRecorrentesDoMes() {
	const agora = new Date();
	const ano = agora.getUTCFullYear();
	const mes = agora.getUTCMonth() + 1;
	const anoMes = ano + "-" + String(mes).padStart(2, "0");

	const templates = await allAsync(
		"SELECT * FROM LancamentosRecorrentes WHERE ativo = 1",
	);

	let gerados = 0;
	for (const t of templates) {
		const jaExiste = await getAsync(
			"SELECT id FROM LancamentosFinanceiros WHERE origem = 'recorrente' AND referencia_id = ? AND strftime('%Y-%m', data_vencimento) = ?",
			[t.id, anoMes],
		);
		if (jaExiste) continue;

		const diaMaximo = ultimoDiaDoMes(ano, mes);
		const diaEfetivo = Math.min(Math.max(1, Number(t.dia_mes) || 1), diaMaximo);
		const dataVencimento = anoMes + "-" + String(diaEfetivo).padStart(2, "0");

		await runAsync(
			"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, referencia_id, forma_pagamento, data_criacao, categoria) VALUES (?, ?, ?, ?, NULL, 'aberto', 'recorrente', ?, NULL, ?, ?)",
			[
				t.tipo,
				t.descricao,
				t.valor,
				dataVencimento,
				t.id,
				new Date().toISOString(),
				t.categoria,
			],
		);
		gerados++;
	}
	return { gerados };
}

module.exports = {
	CATEGORIAS_FINANCEIRAS,
	criarLancamentoInterno,
	getLancamentos,
	criarLancamento,
	criarLancamentoParcelado,
	baixarLancamento,
	excluirLancamento,
	getFluxoCaixa,
	getFluxoCaixaProjetado,
	getAliquotaDAS,
	saveAliquotaDAS,
	getProvisaoDAS,
	getMetaFaturamentoMensal,
	saveMetaFaturamentoMensal,
	getLancamentosVencendoHoje,
	getAgingRecebiveis,
	criarLancamentoRecorrente,
	listarLancamentosRecorrentes,
	alternarLancamentoRecorrente,
	removerLancamentoRecorrente,
	gerarLancamentosRecorrentesDoMes,
};
