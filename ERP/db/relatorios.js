const { allAsync, getAsync } = require("./conexao");
const {
	getTaxaAdquirente,
	getTaxaAdquirentePorMetodo,
	getCustoFixoConfig,
} = require("./precificacao");

/* ============ Relatórios ============ */

function diasEntre(inicio, fim) {
	const a = new Date(inicio + "T00:00:00Z");
	const b = new Date(fim + "T00:00:00Z");
	return Math.round((b - a) / 86400000) + 1;
}

function somarDias(dataStr, dias) {
	const d = new Date(dataStr + "T00:00:00Z");
	d.setUTCDate(d.getUTCDate() + dias);
	return d.toISOString().slice(0, 10);
}

// Mesma convenção do comparativo "hoje vs. ontem" do dashboard
// (db/dashboard.js) — null quando não há base de comparação, não 0/Infinity.
function variacaoPercentual(atual, anterior) {
	if (!anterior) return null;
	return ((atual - anterior) / anterior) * 100;
}

// DRE simplificado (regime de caixa para despesas, já que é isso que o
// Fluxo de Caixa também usa): Receita líquida - CMV = Lucro Bruto;
// Lucro Bruto - Despesas pagas no período = Lucro Líquido.
// O CMV usa o preco_custo ATUAL da variação (não o custo histórico da época
// da venda) — mesma simplificação que a Curva ABC já assume para receita.
async function getDRE(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const resumoVendas = await getAsync(
		"SELECT COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS receitaBruta, COALESCE(SUM(desconto), 0) AS descontos FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ?",
		[inicio, fim],
	);

	const cmvLinha = await getAsync(
		`SELECT COALESCE(SUM(iv.quantidade * var.preco_custo), 0) AS cmv
     FROM ItensVenda iv
     JOIN Vendas v ON v.id = iv.venda_id
     JOIN Variacoes var ON var.id = iv.variacao_id
     WHERE v.status = 'finalizada' AND DATE(v.data_venda) BETWEEN ? AND ?`,
		[inicio, fim],
	);

	const despesasLinha = await getAsync(
		"SELECT COALESCE(SUM(valor), 0) AS despesas FROM LancamentosFinanceiros WHERE tipo = 'pagar' AND status = 'pago' AND DATE(data_pagamento) BETWEEN ? AND ?",
		[inicio, fim],
	);

	const receitaBruta = Number(resumoVendas.receitaBruta) || 0;
	const descontos = Number(resumoVendas.descontos) || 0;
	const receitaLiquida = receitaBruta - descontos;
	const cmv = Number(cmvLinha.cmv) || 0;
	const lucroBruto = receitaLiquida - cmv;
	const despesas = Number(despesasLinha.despesas) || 0;
	const lucroLiquido = lucroBruto - despesas;

	return {
		periodo: { inicio, fim },
		vendas: Number(resumoVendas.vendas) || 0,
		receitaBruta,
		descontos,
		receitaLiquida,
		cmv,
		lucroBruto,
		margemBrutaPercentual:
			receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0,
		despesas,
		lucroLiquido,
		margemLiquidaPercentual:
			receitaLiquida > 0 ? (lucroLiquido / receitaLiquida) * 100 : 0,
	};
}

async function getRelatorioVendas(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const resumo = await getAsync(
		"SELECT COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS faturamento, COALESCE(SUM(desconto), 0) AS descontos FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ?",
		[inicio, fim],
	);

	const porDia = await allAsync(
		"SELECT DATE(data_venda) AS dia, COUNT(*) AS vendas, SUM(total) AS faturamento, SUM(desconto) AS descontos FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ? GROUP BY DATE(data_venda) ORDER BY dia",
		[inicio, fim],
	);

	const porPagamento = await allAsync(
		"SELECT COALESCE(forma_pagamento, '---') AS forma_pagamento, COUNT(*) AS vendas, SUM(total) AS faturamento FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ? GROUP BY forma_pagamento ORDER BY faturamento DESC",
		[inicio, fim],
	);

	// Período anterior de igual duração, pra comparação — generaliza o mesmo
	// cálculo "hoje vs. ontem" que o dashboard já faz (db/dashboard.js), mas
	// pro range arbitrário que o dono escolher aqui em vez de fixo em 1 dia.
	const fimAnterior = somarDias(inicio, -1);
	const inicioAnterior = somarDias(fimAnterior, -(diasEntre(inicio, fim) - 1));
	const resumoAnterior = await getAsync(
		"SELECT COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS faturamento FROM Vendas WHERE status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ?",
		[inicioAnterior, fimAnterior],
	);

	return {
		resumo: {
			vendas: resumo.vendas,
			faturamento: resumo.faturamento,
			descontos: resumo.descontos,
			ticketMedio: resumo.vendas > 0 ? resumo.faturamento / resumo.vendas : 0,
			vendasVariacao: variacaoPercentual(
				resumo.vendas,
				Number(resumoAnterior.vendas) || 0,
			),
			faturamentoVariacao: variacaoPercentual(
				resumo.faturamento,
				Number(resumoAnterior.faturamento) || 0,
			),
			periodoAnterior: { inicio: inicioAnterior, fim: fimAnterior },
		},
		porDia,
		porPagamento,
	};
}

// Curva ABC por lucro (receita menos custo): A até 80% acumulado de lucro, B até 95%, C o resto.
async function getCurvaABC(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const linhas = await allAsync(
		`SELECT p.nome AS produto_nome, SUM(iv.quantidade) AS quantidade,
   SUM(iv.quantidade * var.preco_custo) AS custo_total,
   SUM(iv.quantidade * (iv.preco_unitario - var.preco_custo)) AS lucro_total,
   SUM(iv.quantidade * iv.preco_unitario) AS receita
   FROM ItensVenda iv
   JOIN Vendas v ON v.id = iv.venda_id
   JOIN Variacoes var ON var.id = iv.variacao_id
   JOIN Produtos p ON p.id = var.produto_id
   WHERE v.status = 'finalizada' AND DATE(v.data_venda) BETWEEN ? AND ?
   GROUP BY p.id
   ORDER BY receita DESC`,
		[inicio, fim],
	);

	const total = linhas.reduce((a, l) => a + (Number(l.lucro_total) || 0), 0);
	let acumulado = 0;

	return linhas.map((l) => {
		const receita = Number(l.receita) || 0;
		const custo = Number(l.custo_total) || 0;
		const lucro = Number(l.lucro_total) || 0;
		const percentual = total > 0 ? (lucro / total) * 100 : 0;
		acumulado += percentual;
		return {
			produto_nome: l.produto_nome,
			quantidade: Number(l.quantidade) || 0,
			receita,
			custo,
			lucro,
			margem: receita > 0 ? (lucro / receita) * 100 : 0,
			percentual,
			acumulado,
			classe: acumulado <= 80 ? "A" : acumulado <= 95 ? "B" : "C",
		};
	});
}

// Comissão por vendedor: soma das vendas finalizadas atribuídas a cada
// usuário no período, multiplicada pelo percentual de comissão dele.
async function getComissoes(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const linhas = await allAsync(
		`SELECT u.id AS usuario_id, u.nome, u.login, u.perfil, u.comissao_percentual,
            COUNT(v.id) AS vendas, COALESCE(SUM(v.total), 0) AS total_vendido
     FROM Vendas v
     JOIN Usuarios u ON u.id = v.usuario_id
     WHERE v.status = 'finalizada' AND DATE(v.data_venda) BETWEEN ? AND ?
     GROUP BY u.id
     ORDER BY total_vendido DESC`,
		[inicio, fim],
	);

	return linhas.map((l) => {
		const totalVendido = Number(l.total_vendido) || 0;
		const percentual = Number(l.comissao_percentual) || 0;
		return {
			usuario_id: l.usuario_id,
			nome: l.nome,
			login: l.login,
			perfil: l.perfil,
			vendas: Number(l.vendas) || 0,
			total_vendido: totalVendido,
			comissao_percentual: percentual,
			comissao_valor: (totalVendido * percentual) / 100,
		};
	});
}
// Margem de contribuição: distinta da margem bruta do DRE (que só desconta o
// CMV) e da margem por produto da Precificação (que só desconta custo+impostos).
// Aqui desconta TODOS os custos variáveis por unidade: CMV + comissão do
// vendedor + taxa média de adquirente + impostos sobre a venda — é o número
// que realmente sobra pra pagar custo fixo e gerar lucro (ver REPERTOIRE.md).
async function getMargemContribuicao(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	// taxaPix/taxaCartao ficam null quando o dono nunca configurou a taxa por
	// forma de pagamento — cai pra taxaAdquirente (a média antiga) nesse caso,
	// então quem nunca mexer nessa config nova tem o cálculo idêntico a antes
	// dela existir. Achado real ao implementar (2026-09-02): PDV só aceita
	// "PIX"/"Cartão"/"Dinheiro"/"Fiado" — não existe distinção crédito/débito
	// neste app, diferente do que o plano original supôs.
	const [taxaAdquirente, taxaPix, taxaCartao] = await Promise.all([
		getTaxaAdquirente(),
		getTaxaAdquirentePorMetodo("pix"),
		getTaxaAdquirentePorMetodo("cartao"),
	]);
	function taxaParaForma(forma) {
		const chave = String(forma || "").toLowerCase();
		if (chave === "pix" && taxaPix !== null) return taxaPix;
		if (chave === "cartão" && taxaCartao !== null) return taxaCartao;
		return taxaAdquirente;
	}

	// Agrupado por (produto, forma de pagamento) — não só por produto — porque
	// a taxa agora pode variar por forma de pagamento dentro do mesmo produto
	// no mesmo período. Reagregado por produto logo abaixo pra manter a mesma
	// forma de retorno (porProduto) de antes desta mudança.
	const linhas = await allAsync(
		`SELECT p.id AS produto_id, p.nome AS produto_nome, v2.forma_pagamento,
   SUM(iv.quantidade) AS quantidade,
   SUM(iv.quantidade * iv.preco_unitario) AS receita,
   SUM(iv.quantidade * var.preco_custo) AS cmv,
   COALESCE(pr.impostos_extras, 0) AS impostos_extras,
   COALESCE(v.comissao_percentual, 0) AS comissao_percentual
   FROM ItensVenda iv
   JOIN Vendas v2 ON v2.id = iv.venda_id
   JOIN Variacoes var ON var.id = iv.variacao_id
   JOIN Produtos p ON p.id = var.produto_id
   LEFT JOIN Precificacao pr ON pr.produto_id = p.id
   LEFT JOIN Usuarios v ON v.id = v2.usuario_id
   WHERE v2.status = 'finalizada' AND DATE(v2.data_venda) BETWEEN ? AND ?
   GROUP BY p.id, v2.forma_pagamento`,
		[inicio, fim],
	);

	let margemTotal = 0;
	let receitaTotal = 0;
	let quantidadeTotal = 0;
	const porProdutoMap = new Map();

	for (const l of linhas) {
		const receita = Number(l.receita) || 0;
		const cmv = Number(l.cmv) || 0;
		const quantidade = Number(l.quantidade) || 0;
		const comissaoValor =
			(receita * (Number(l.comissao_percentual) || 0)) / 100;
		const taxaValor = (receita * taxaParaForma(l.forma_pagamento)) / 100;
		const impostos = (Number(l.impostos_extras) || 0) * quantidade;
		const margemContribuicao =
			receita - cmv - comissaoValor - taxaValor - impostos;

		margemTotal += margemContribuicao;
		receitaTotal += receita;
		quantidadeTotal += quantidade;

		const acumulado = porProdutoMap.get(l.produto_id) || {
			produto_id: l.produto_id,
			produto_nome: l.produto_nome,
			quantidade: 0,
			receita: 0,
			margemContribuicao: 0,
		};
		acumulado.quantidade += quantidade;
		acumulado.receita += receita;
		acumulado.margemContribuicao += margemContribuicao;
		porProdutoMap.set(l.produto_id, acumulado);
	}

	const porProduto = Array.from(porProdutoMap.values()).map((p) => ({
		...p,
		margemContribuicaoUnitaria:
			p.quantidade > 0 ? p.margemContribuicao / p.quantidade : 0,
		margemContribuicaoPercentual:
			p.receita > 0 ? (p.margemContribuicao / p.receita) * 100 : 0,
	}));

	return {
		periodo: { inicio, fim },
		taxaAdquirenteUsada: taxaAdquirente,
		porProduto,
		margemContribuicaoTotal: margemTotal,
		margemContribuicaoUnitariaMedia:
			quantidadeTotal > 0 ? margemTotal / quantidadeTotal : 0,
		margemContribuicaoPercentualMedia:
			receitaTotal > 0 ? (margemTotal / receitaTotal) * 100 : 0,
	};
}

// Ponto de equilíbrio: em quantidade = custo fixo mensal ÷ margem de
// contribuição unitária média (unidades de produto); em faturamento = custo
// fixo mensal ÷ margem de contribuição percentual média (não quantidade ×
// ticket médio — ticket médio é R$/venda, quantidadeNecessaria é unidades de
// produto, misturar as duas unidades dava um faturamentoNecessario errado).
// Não é um simulador de "e se eu subir o preço" — só o equilíbrio atual.
async function getPontoDeEquilibrio(dataInicio, dataFim) {
	const custoFixo = await getCustoFixoConfig();
	const margem = await getMargemContribuicao(dataInicio, dataFim);

	const quantidadeNecessaria =
		margem.margemContribuicaoUnitariaMedia > 0
			? custoFixo.mensal / margem.margemContribuicaoUnitariaMedia
			: null;
	const faturamentoNecessario =
		margem.margemContribuicaoPercentualMedia > 0
			? custoFixo.mensal / (margem.margemContribuicaoPercentualMedia / 100)
			: null;

	return {
		periodo: margem.periodo,
		custoFixoMensal: custoFixo.mensal,
		margemContribuicaoUnitariaMedia: margem.margemContribuicaoUnitariaMedia,
		margemContribuicaoPercentualMedia: margem.margemContribuicaoPercentualMedia,
		quantidadeNecessaria,
		faturamentoNecessario,
	};
}

// Giro de estoque: aproximação por estoque ATUAL (não médio do período) —
// mesma simplificação que getDRE já documenta usar pro CMV (custo atual, não
// histórico). Uma média de período real exigiria snapshots de estoque que não
// existem hoje; documentado aqui como limitação conhecida, não passado como exato.
async function getGiroEstoque(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const linhas = await allAsync(
		`SELECT p.id AS produto_id, p.nome AS produto_nome,
   SUM(iv.quantidade) AS quantidade_vendida,
   var.quantidade_estoque AS estoque_atual
   FROM ItensVenda iv
   JOIN Vendas v ON v.id = iv.venda_id
   JOIN Variacoes var ON var.id = iv.variacao_id
   JOIN Produtos p ON p.id = var.produto_id
   WHERE v.status = 'finalizada' AND DATE(v.data_venda) BETWEEN ? AND ?
   GROUP BY p.id`,
		[inicio, fim],
	);

	return linhas.map((l) => {
		const vendida = Number(l.quantidade_vendida) || 0;
		const estoque = Number(l.estoque_atual) || 0;
		const giro = estoque > 0 ? vendida / estoque : null;
		return {
			produto_id: l.produto_id,
			produto_nome: l.produto_nome,
			quantidadeVendida: vendida,
			estoqueAtual: estoque,
			giro,
			diasParaReposicao: giro && giro > 0 ? 365 / giro : null,
		};
	});
}

// Segmentação simples de clientes (recência/frequência/valor) — tiers
// práticos pra loja pequena, não um score RFM estatístico de verdade (mesmo
// nível de profundidade já usado pra Curva ABC/DRE neste projeto).
async function getSegmentacaoClientes() {
	const agora = Date.now();
	const linhas = await allAsync(
		`SELECT c.id AS cliente_id, c.nome, c.telefone,
     COUNT(v.id) AS frequencia,
     COALESCE(SUM(v.total), 0) AS valor_total,
     MAX(v.data_venda) AS ultima_compra
     FROM Clientes c
     LEFT JOIN Vendas v ON v.cliente_id = c.id AND v.status = 'finalizada'
     GROUP BY c.id
     ORDER BY valor_total DESC`,
	);

	return linhas.map((l) => {
		const frequencia = Number(l.frequencia) || 0;
		const valorTotal = Number(l.valor_total) || 0;
		const diasDesdeUltimaCompra = l.ultima_compra
			? Math.floor((agora - new Date(l.ultima_compra).getTime()) / 86400000)
			: null;

		let segmento;
		if (diasDesdeUltimaCompra === null) segmento = "Nunca comprou";
		else if (diasDesdeUltimaCompra <= 60 && frequencia >= 3)
			segmento = "Frequente";
		else if (diasDesdeUltimaCompra <= 60) segmento = "Ativo";
		else if (diasDesdeUltimaCompra <= 180) segmento = "Em risco";
		else segmento = "Inativo";

		return {
			cliente_id: l.cliente_id,
			nome: l.nome,
			telefone: l.telefone,
			frequencia,
			valorTotal,
			ultimaCompra: l.ultima_compra,
			diasDesdeUltimaCompra,
			segmento,
		};
	});
}

// Produtos com estoque real e ZERO venda no período — pergunta diferente da
// Curva ABC (que ranqueia por lucro/receita, não aponta o que não vendeu
// nada). Agrupa por VARIAÇÃO (não por produto, ao contrário de
// getGiroEstoque acima) porque cor/tamanho de um mesmo produto podem vender
// de forma bem diferente.
async function getProdutosParados(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const linhas = await allAsync(
		`SELECT p.id AS produto_id, p.nome AS produto_nome, v.sku, v.quantidade_estoque,
   COALESCE(SUM(CASE WHEN vd.status = 'finalizada' AND DATE(vd.data_venda) BETWEEN ? AND ? THEN iv.quantidade ELSE 0 END), 0) AS vendido_no_periodo
   FROM Variacoes v
   JOIN Produtos p ON p.id = v.produto_id
   LEFT JOIN ItensVenda iv ON iv.variacao_id = v.id
   LEFT JOIN Vendas vd ON vd.id = iv.venda_id
   WHERE p.ativo = 1
   GROUP BY v.id
   HAVING v.quantidade_estoque > 0 AND vendido_no_periodo = 0
   ORDER BY v.quantidade_estoque DESC`,
		[inicio, fim],
	);

	return linhas.map((l) => ({
		produto_id: l.produto_id,
		produto_nome: l.produto_nome,
		sku: l.sku,
		quantidadeEstoque: Number(l.quantidade_estoque) || 0,
	}));
}

const NOMES_DIA_SEMANA = [
	"Domingo",
	"Segunda",
	"Terça",
	"Quarta",
	"Quinta",
	"Sexta",
	"Sábado",
];

// Sazonalidade por dia da semana e por hora — todo o histórico de vendas
// finalizadas, sem filtro de período (é um padrão de longo prazo, não algo
// que faça sentido restringir a um mês).
async function getSazonalidade() {
	const porDiaSemanaLinhas = await allAsync(
		"SELECT CAST(strftime('%w', data_venda) AS INTEGER) AS dia_semana, COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS faturamento FROM Vendas WHERE status = 'finalizada' GROUP BY dia_semana ORDER BY dia_semana",
	);
	const porHoraLinhas = await allAsync(
		"SELECT CAST(strftime('%H', data_venda) AS INTEGER) AS hora, COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS faturamento FROM Vendas WHERE status = 'finalizada' GROUP BY hora ORDER BY hora",
	);

	return {
		porDiaSemana: porDiaSemanaLinhas.map((l) => ({
			diaSemana: Number(l.dia_semana),
			nome: NOMES_DIA_SEMANA[Number(l.dia_semana)] || "?",
			vendas: Number(l.vendas) || 0,
			faturamento: Number(l.faturamento) || 0,
		})),
		porHora: porHoraLinhas.map((l) => ({
			hora: Number(l.hora),
			vendas: Number(l.vendas) || 0,
			faturamento: Number(l.faturamento) || 0,
		})),
	};
}

// Taxa de conversão orçamento -> venda. Limitação real do schema, documentada
// em vez de escondida: Vendas.origem='orcamento' é gravado na criação e
// SOBREVIVE à conversão (converterOrcamento nunca toca em origem), mas
// data_venda É sobrescrito na conversão (vira a data da conversão, não mais a
// da criação do orçamento) — então "convertidas" abaixo é ancorado na DATA DE
// CONVERSÃO, enquanto "canceladas"/"abertas" são ancoradas na DATA DE CRIAÇÃO
// do orçamento (nunca reescrita nesses dois casos). É a melhor pergunta
// respondível com o dado que existe hoje, não uma taxa de conversão "por
// coorte de criação" perfeita.
async function getConversaoOrcamentos(dataInicio, dataFim) {
	const hoje = new Date().toISOString().slice(0, 10);
	const inicio = dataInicio || hoje.slice(0, 8) + "01";
	const fim = dataFim || hoje;

	const [convertidas, canceladas, abertas] = await Promise.all([
		getAsync(
			"SELECT COUNT(*) AS n FROM Vendas WHERE origem = 'orcamento' AND status = 'finalizada' AND DATE(data_venda) BETWEEN ? AND ?",
			[inicio, fim],
		),
		getAsync(
			"SELECT COUNT(*) AS n FROM Vendas WHERE origem = 'orcamento' AND status = 'cancelado' AND DATE(data_venda) BETWEEN ? AND ?",
			[inicio, fim],
		),
		getAsync(
			"SELECT COUNT(*) AS n FROM Vendas WHERE origem = 'orcamento' AND status = 'orcamento' AND DATE(data_venda) BETWEEN ? AND ?",
			[inicio, fim],
		),
	]);

	const nConvertidas = Number(convertidas.n) || 0;
	const nCanceladas = Number(canceladas.n) || 0;
	const nAbertas = Number(abertas.n) || 0;
	const denominador = nConvertidas + nCanceladas;

	return {
		periodo: { inicio, fim },
		convertidas: nConvertidas,
		canceladas: nCanceladas,
		abertas: nAbertas,
		taxaConversaoPercentual:
			denominador > 0 ? (nConvertidas / denominador) * 100 : null,
	};
}

module.exports = {
	getDRE,
	getRelatorioVendas,
	getCurvaABC,
	getComissoes,
	getMargemContribuicao,
	getPontoDeEquilibrio,
	getGiroEstoque,
	getSegmentacaoClientes,
	getProdutosParados,
	getSazonalidade,
	getConversaoOrcamentos,
};
