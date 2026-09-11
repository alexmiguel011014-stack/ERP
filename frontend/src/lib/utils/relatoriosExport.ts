import { jsPDF } from "jspdf";
import type { ApexOptions } from "apexcharts";
import { formatarData, formatarMoeda } from "@/components/relatorios/formatos";
import type {
	AgingRecebiveisResultado,
	ComissaoLinha,
	ConversaoOrcamentosResultado,
	CurvaAbcLinha,
	DreResultado,
	GiroEstoqueLinha,
	MargemContribuicaoResultado,
	PontoDeEquilibrioResultado,
	ProdutoParadoLinha,
	RelatorioFluxoCaixaResultado,
	RelatorioVendasResultado,
	SazonalidadeResultado,
	SegmentacaoClienteLinha,
} from "@/lib/erpApi";

// Mesma paleta de RelatoriosCharts.tsx (não exportada de lá) — duplicada aqui
// de propósito, mesmo padrão de "pequeno o bastante pra não valer a pena
// compartilhar arquivo" já usado em formatos.ts.
const CORES = {
	azul: "#6D28D9",
	verde: "#369929",
	vermelho: "#B91C1C",
	amarelo: "#B45309",
	cinza: "#64748B",
	paleta: [
		"#6D28D9",
		"#369929",
		"#F5B301",
		"#B91C1C",
		"#8B5CF6",
		"#0891B2",
		"#DB2777",
	],
};

function formatarDiaCurto(iso: string): string {
	const [, mes, dia] = iso.split("-");
	return `${dia}/${mes}`;
}

// Renderiza um gráfico ApexCharts fora da tela e devolve um PNG em base64.
// Import dinâmico de propósito: `apexcharts` toca `window`/`document` ao ser
// importado, o que quebra o passo de prerender do `next build` (o mesmo
// motivo de RelatoriosCharts.tsx envolver `react-apexcharts` em
// `dynamic(..., { ssr: false })`) — um `import` estático aqui reintroduziria
// esse problema.
async function graficoParaImagem(
	options: ApexOptions,
	series: ApexOptions["series"],
	larguraPx = 900,
	alturaPx = 360,
): Promise<string | null> {
	const { default: ApexCharts } = await import("apexcharts");
	const container = document.createElement("div");
	container.style.position = "fixed";
	container.style.left = "-10000px";
	container.style.top = "0px";
	container.style.width = `${larguraPx}px`;
	container.style.height = `${alturaPx}px`;
	document.body.appendChild(container);
	const chart = new ApexCharts(container, {
		...options,
		chart: {
			...options.chart,
			width: larguraPx,
			height: alturaPx,
			animations: { enabled: false },
		},
		series,
	});
	try {
		await chart.render();
		const resultado = await chart.dataURI();
		return "imgURI" in resultado ? resultado.imgURI : null;
	} catch {
		return null;
	} finally {
		chart.destroy();
		container.remove();
	}
}

function talvezGrafico(
	condicao: boolean,
	gerador: () => Promise<string | null>,
): Promise<string | null> {
	return condicao ? gerador() : Promise.resolve(null);
}

function csvCampo(v: unknown): string {
	return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
}

export function exportarCurvaAbcCsv(linhas: CurvaAbcLinha[]) {
	if (linhas.length === 0) {
		alert("Gere a Curva ABC antes de exportar.");
		return;
	}
	const cabecalho =
		"Posicao,Produto,Quantidade,Receita,Percentual,Acumulado,Classe";
	const corpo = linhas
		.map((l, i) =>
			[
				i + 1,
				csvCampo(l.produto_nome),
				l.quantidade,
				l.receita.toFixed(2),
				l.percentual.toFixed(2),
				l.acumulado.toFixed(2),
				l.classe,
			].join(","),
		)
		.join("\n");
	const csv = cabecalho + "\n" + corpo;
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "curva_abc_" + new Date().toISOString().slice(0, 10) + ".csv";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

// Réplica do relatório gerencial em PDF que a versão vanilla já gera
// (jsPDF, client-side, sem plugin de tabela). Diferente da vanilla: a
// tabela de Comissões era impressa duas vezes por um bug de copy-paste no
// código original — corrigido aqui, não replicado.
//
// Achado real (2026-09-02): quando esta função foi portada, ficou faltando
// Margem de Contribuição / Ponto de Equilíbrio / Giro de Estoque mesmo essas
// três já aparecendo na tela (PainelMargemPontoEquilibrio/PainelGiroEstoque)
// — o que o dono vê e o que sai no PDF exportado estavam mostrando coisas
// diferentes. Corrigido: os três parâmetros abaixo são opcionais (`| null`)
// só porque a tela pode não ter carregado ainda, não porque a seção seja
// dispensável.
//
// GOALS 19 (2026-09-10): o PDF só tinha 7 das 13 seções que a tela já busca
// (useRelatorios) e nenhum gráfico — corrigido abaixo: as 6 seções que
// faltavam (segmentação, produtos parados, sazonalidade, conversão de
// orçamentos, aging, fluxo de caixa) mais 8 imagens de gráfico (geradas
// fora da tela via ApexCharts + dataURI(), ver `graficoParaImagem`) e um
// bloco de indicadores-chave no topo.
export async function exportarRelatorioPdf(dados: {
	periodo: { inicio: string; fim: string };
	resumo: RelatorioVendasResultado | null;
	dre: DreResultado | null;
	comissoes: ComissaoLinha[];
	curvaAbc: CurvaAbcLinha[];
	margemContribuicao: MargemContribuicaoResultado | null;
	pontoDeEquilibrio: PontoDeEquilibrioResultado | null;
	giroEstoque: GiroEstoqueLinha[];
	segmentacaoClientes: SegmentacaoClienteLinha[];
	produtosParados: ProdutoParadoLinha[];
	sazonalidade: SazonalidadeResultado | null;
	conversaoOrcamentos: ConversaoOrcamentosResultado | null;
	agingRecebiveis: AgingRecebiveisResultado | null;
	fluxoCaixa: RelatorioFluxoCaixaResultado | null;
}): Promise<void> {
	const receitaPorClasse = { A: 0, B: 0, C: 0 };
	dados.curvaAbc.forEach((l) => {
		receitaPorClasse[l.classe] += l.receita;
	});
	const topGiro = dados.giroEstoque
		.filter((g): g is GiroEstoqueLinha & { giro: number } => g.giro != null)
		.sort((a, b) => b.giro - a.giro)
		.slice(0, 10);
	const bucketsAging = dados.agingRecebiveis
		? [
				{
					rotulo: "A vencer",
					total: dados.agingRecebiveis.aVencer.total,
					cor: CORES.cinza,
				},
				{
					rotulo: "1-30 dias",
					total: dados.agingRecebiveis.atraso0a30.total,
					cor: CORES.amarelo,
				},
				{
					rotulo: "31-60 dias",
					total: dados.agingRecebiveis.atraso31a60.total,
					cor: CORES.amarelo,
				},
				{
					rotulo: "61-90 dias",
					total: dados.agingRecebiveis.atraso61a90.total,
					cor: CORES.vermelho,
				},
				{
					rotulo: "90+ dias",
					total: dados.agingRecebiveis.atraso90mais.total,
					cor: CORES.vermelho,
				},
			]
		: [];
	const segmentosOrdem: SegmentacaoClienteLinha["segmento"][] = [
		"Frequente",
		"Ativo",
		"Em risco",
		"Inativo",
		"Nunca comprou",
	];
	const contagemSegmentos = segmentosOrdem.map(
		(seg) => dados.segmentacaoClientes.filter((c) => c.segmento === seg).length,
	);

	// Todas as imagens são geradas em paralelo antes de montar o documento —
	// o layout em si (abaixo) é síncrono e depende da posição/altura de cada
	// imagem já resolvida, então precisa vir depois, não intercalado.
	const [
		imgPorDia,
		imgPorPagamento,
		imgDre,
		imgGiro,
		imgCurvaAbc,
		imgAging,
		imgSegmentos,
		imgSazonalidade,
	] = await Promise.all([
		talvezGrafico(!!dados.resumo && dados.resumo.porDia.length > 0, () =>
			graficoParaImagem(
				{
					chart: { type: "bar", toolbar: { show: false } },
					colors: [CORES.azul],
					plotOptions: { bar: { borderRadius: 4, columnWidth: "45%" } },
					dataLabels: { enabled: false },
					xaxis: {
						categories: dados.resumo!.porDia.map((d) =>
							formatarDiaCurto(d.dia),
						),
					},
					legend: { show: false },
				},
				[
					{
						name: "Faturamento",
						data: dados.resumo!.porDia.map((d) => d.faturamento),
					},
				],
				900,
				360,
			),
		),
		talvezGrafico(!!dados.resumo && dados.resumo.porPagamento.length > 0, () =>
			graficoParaImagem(
				{
					chart: { type: "donut" },
					colors: CORES.paleta,
					labels: dados.resumo!.porPagamento.map((p) => p.forma_pagamento),
					legend: { position: "bottom" },
					dataLabels: { enabled: false },
				},
				dados.resumo!.porPagamento.map((p) => p.faturamento),
				900,
				420,
			),
		),
		talvezGrafico(
			!!dados.dre &&
				(dados.dre.receitaLiquida !== 0 ||
					dados.dre.cmv !== 0 ||
					dados.dre.despesas !== 0 ||
					dados.dre.lucroLiquido !== 0),
			() =>
				graficoParaImagem(
					{
						chart: { type: "bar", toolbar: { show: false } },
						plotOptions: {
							bar: { horizontal: true, borderRadius: 4, distributed: true },
						},
						dataLabels: { enabled: false },
						xaxis: {
							categories: [
								"Receita Líquida",
								"CMV",
								"Despesas",
								"Lucro Líquido",
							],
						},
						legend: { show: false },
						colors: [
							CORES.azul,
							CORES.vermelho,
							CORES.vermelho,
							dados.dre!.lucroLiquido >= 0 ? CORES.verde : CORES.vermelho,
						],
					},
					[
						{
							name: "Valor",
							data: [
								dados.dre!.receitaLiquida,
								-dados.dre!.cmv,
								-dados.dre!.despesas,
								dados.dre!.lucroLiquido,
							],
						},
					],
					900,
					320,
				),
		),
		talvezGrafico(topGiro.length > 0, () =>
			graficoParaImagem(
				{
					chart: { type: "bar", toolbar: { show: false } },
					colors: [CORES.azul],
					plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
					dataLabels: { enabled: false },
					xaxis: { categories: topGiro.map((g) => g.produto_nome) },
					legend: { show: false },
				},
				[{ name: "Giro", data: topGiro.map((g) => g.giro) }],
				900,
				420,
			),
		),
		talvezGrafico(dados.curvaAbc.length > 0, () =>
			graficoParaImagem(
				{
					chart: { type: "pie" },
					colors: [CORES.verde, CORES.amarelo, CORES.cinza],
					labels: ["Classe A", "Classe B", "Classe C"],
					legend: { position: "bottom" },
					dataLabels: { enabled: false },
				},
				[receitaPorClasse.A, receitaPorClasse.B, receitaPorClasse.C],
				900,
				420,
			),
		),
		talvezGrafico(
			!!dados.agingRecebiveis && dados.agingRecebiveis.totalGeral > 0,
			() =>
				graficoParaImagem(
					{
						chart: { type: "bar", toolbar: { show: false } },
						plotOptions: {
							bar: { borderRadius: 4, columnWidth: "55%", distributed: true },
						},
						dataLabels: { enabled: false },
						xaxis: { categories: bucketsAging.map((b) => b.rotulo) },
						legend: { show: false },
						colors: bucketsAging.map((b) => b.cor),
					},
					[{ name: "Em aberto", data: bucketsAging.map((b) => b.total) }],
					900,
					320,
				),
		),
		talvezGrafico(dados.segmentacaoClientes.length > 0, () =>
			graficoParaImagem(
				{
					chart: { type: "donut" },
					colors: CORES.paleta,
					labels: segmentosOrdem,
					legend: { position: "bottom" },
					dataLabels: { enabled: false },
				},
				contagemSegmentos,
				900,
				420,
			),
		),
		talvezGrafico(
			!!dados.sazonalidade &&
				dados.sazonalidade.porDiaSemana.some((d) => d.faturamento > 0),
			() =>
				graficoParaImagem(
					{
						chart: { type: "bar", toolbar: { show: false } },
						colors: [CORES.azul],
						plotOptions: { bar: { borderRadius: 4, columnWidth: "50%" } },
						dataLabels: { enabled: false },
						xaxis: {
							categories: dados.sazonalidade!.porDiaSemana.map((d) => d.nome),
						},
						legend: { show: false },
					},
					[
						{
							name: "Faturamento",
							data: dados.sazonalidade!.porDiaSemana.map((d) => d.faturamento),
						},
					],
					900,
					320,
				),
		),
	]);

	const doc = new jsPDF({ unit: "pt", format: "a4" });
	const margem = 40;
	const largura = doc.internal.pageSize.getWidth() - margem * 2;
	let y = margem;

	function novaPaginaSeNecessario(espaco: number) {
		if (y + espaco > doc.internal.pageSize.getHeight() - margem) {
			doc.addPage();
			y = margem;
		}
	}

	function titulo(texto: string) {
		novaPaginaSeNecessario(30);
		doc.setFontSize(13);
		doc.setFont("helvetica", "bold");
		doc.text(texto, margem, y);
		y += 20;
		doc.setFont("helvetica", "normal");
	}

	function linhaTexto(texto: string) {
		novaPaginaSeNecessario(16);
		doc.setFontSize(10);
		doc.text(texto, margem, y);
		y += 15;
	}

	function tabela(
		colunas: string[],
		linhas: (string | number)[][],
		larguras: number[],
	) {
		novaPaginaSeNecessario(20);
		doc.setFontSize(9);
		doc.setFont("helvetica", "bold");
		let x = margem;
		colunas.forEach((c, i) => {
			doc.text(c, x, y);
			x += larguras[i];
		});
		y += 12;
		doc.setFont("helvetica", "normal");
		doc.setDrawColor(200);
		doc.line(margem, y - 9, margem + largura, y - 9);
		linhas.forEach((linha) => {
			novaPaginaSeNecessario(14);
			let colX = margem;
			linha.forEach((valor, i) => {
				doc.text(String(valor), colX, y);
				colX += larguras[i];
			});
			y += 14;
		});
		y += 6;
	}

	// Largura fixa (a da página); altura calculada da proporção do PNG
	// gerado (larguraPx/alturaPx) pra nunca distorcer a imagem.
	function imagemGrafico(
		imgURI: string | null,
		larguraPx: number,
		alturaPx: number,
		legenda?: string,
	) {
		if (!imgURI) return;
		const alturaPt = (largura * alturaPx) / larguraPx;
		novaPaginaSeNecessario(alturaPt + (legenda ? 26 : 14));
		doc.addImage(imgURI, "PNG", margem, y, largura, alturaPt);
		y += alturaPt + 6;
		if (legenda) {
			doc.setFontSize(8);
			doc.setTextColor(130);
			doc.text(legenda, margem, y);
			y += 14;
			doc.setTextColor(0);
			doc.setFontSize(10);
		} else {
			y += 8;
		}
	}

	function indicadoresChave() {
		const itens: [string, string][] = [];
		if (dados.resumo) {
			itens.push(["Vendas no período", String(dados.resumo.resumo.vendas)]);
			itens.push([
				"Faturamento",
				formatarMoeda(dados.resumo.resumo.faturamento),
			]);
			itens.push([
				"Ticket médio",
				formatarMoeda(dados.resumo.resumo.ticketMedio),
			]);
		}
		if (dados.dre) {
			itens.push([
				`Lucro líquido (${dados.dre.margemLiquidaPercentual.toFixed(1)}%)`,
				formatarMoeda(dados.dre.lucroLiquido),
			]);
		}
		if (dados.agingRecebiveis) {
			itens.push([
				"Total em aberto",
				formatarMoeda(dados.agingRecebiveis.totalGeral),
			]);
		}
		if (dados.produtosParados.length > 0) {
			itens.push(["Produtos parados", `${dados.produtosParados.length} itens`]);
		}
		if (itens.length === 0) return;

		titulo("Indicadores-Chave");
		const colunas = 3;
		const colLargura = largura / colunas;
		const linhaAltura = 34;
		const linhas = Math.ceil(itens.length / colunas);
		novaPaginaSeNecessario(linhas * linhaAltura + 24);
		doc.setDrawColor(210);
		doc.line(margem, y, margem + largura, y);
		y += 14;
		itens.forEach((item, i) => {
			const col = i % colunas;
			const linha = Math.floor(i / colunas);
			const x = margem + col * colLargura;
			const yy = y + linha * linhaAltura;
			doc.setFontSize(7.5);
			doc.setTextColor(130);
			doc.setFont("helvetica", "normal");
			doc.text(item[0].toUpperCase(), x, yy);
			doc.setFontSize(13);
			doc.setFont("helvetica", "bold");
			doc.setTextColor(20);
			doc.text(item[1], x, yy + 15);
		});
		doc.setFont("helvetica", "normal");
		doc.setTextColor(0);
		doc.setFontSize(10);
		y += linhas * linhaAltura - 6;
		doc.line(margem, y, margem + largura, y);
		y += 20;
	}

	doc.setFontSize(16);
	doc.setFont("helvetica", "bold");
	doc.text("Relatório Gerencial — ALLU ERP", margem, y);
	y += 20;
	doc.setFont("helvetica", "normal");
	doc.setFontSize(10);
	doc.text(
		`Período: ${formatarData(dados.periodo.inicio) || "início"} a ${formatarData(dados.periodo.fim) || "hoje"}`,
		margem,
		y,
	);
	y += 14;
	doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margem, y);
	y += 24;

	indicadoresChave();

	if (dados.resumo) {
		titulo("Resumo de Vendas");
		linhaTexto(`Vendas: ${dados.resumo.resumo.vendas}`);
		linhaTexto(
			`Faturamento: ${formatarMoeda(dados.resumo.resumo.faturamento)}`,
		);
		linhaTexto(
			`Ticket médio: ${formatarMoeda(dados.resumo.resumo.ticketMedio)}`,
		);
		linhaTexto(
			`Descontos dados: ${formatarMoeda(dados.resumo.resumo.descontos)}`,
		);
		y += 8;

		if (dados.resumo.porDia.length > 0) {
			imagemGrafico(imgPorDia, 900, 360, "Faturamento por dia");
			tabela(
				["Data", "Vendas", "Faturamento", "Descontos"],
				dados.resumo.porDia.map((d) => [
					formatarData(d.dia),
					d.vendas,
					formatarMoeda(d.faturamento),
					formatarMoeda(d.descontos),
				]),
				[100, 80, 120, 120],
			);
		}

		if (dados.resumo.porPagamento.length > 0) {
			imagemGrafico(
				imgPorPagamento,
				900,
				420,
				"Faturamento por forma de pagamento",
			);
			tabela(
				["Forma de pagamento", "Vendas", "Faturamento"],
				dados.resumo.porPagamento.map((p) => [
					p.forma_pagamento,
					p.vendas,
					formatarMoeda(p.faturamento),
				]),
				[200, 80, 120],
			);
		}
	}

	if (dados.dre) {
		titulo("DRE (Demonstrativo de Resultado)");
		imagemGrafico(imgDre, 900, 320);
		linhaTexto(`Receita Bruta: ${formatarMoeda(dados.dre.receitaBruta)}`);
		linhaTexto(`Descontos: -${formatarMoeda(dados.dre.descontos)}`);
		linhaTexto(`Receita Líquida: ${formatarMoeda(dados.dre.receitaLiquida)}`);
		linhaTexto(`CMV: -${formatarMoeda(dados.dre.cmv)}`);
		linhaTexto(
			`Lucro Bruto (${dados.dre.margemBrutaPercentual.toFixed(1)}%): ${formatarMoeda(dados.dre.lucroBruto)}`,
		);
		linhaTexto(`Despesas: -${formatarMoeda(dados.dre.despesas)}`);
		linhaTexto(
			`Lucro Líquido (${dados.dre.margemLiquidaPercentual.toFixed(1)}%): ${formatarMoeda(dados.dre.lucroLiquido)}`,
		);
		y += 8;
	}

	if (dados.margemContribuicao) {
		titulo("Margem de Contribuição");
		linhaTexto(
			`Total no período: ${formatarMoeda(dados.margemContribuicao.margemContribuicaoTotal)}`,
		);
		linhaTexto(
			`Média por unidade: ${formatarMoeda(dados.margemContribuicao.margemContribuicaoUnitariaMedia)} (${dados.margemContribuicao.margemContribuicaoPercentualMedia.toFixed(1)}%)`,
		);
		y += 8;
	}

	if (dados.pontoDeEquilibrio) {
		titulo("Ponto de Equilíbrio");
		linhaTexto(
			`Custo fixo mensal: ${formatarMoeda(dados.pontoDeEquilibrio.custoFixoMensal)}`,
		);
		linhaTexto(
			dados.pontoDeEquilibrio.faturamentoNecessario != null
				? `Faturamento necessário: ${formatarMoeda(dados.pontoDeEquilibrio.faturamentoNecessario)} (${dados.pontoDeEquilibrio.quantidadeNecessaria} unidades)`
				: "Sem margem de contribuição suficiente para calcular.",
		);
		y += 8;
	}

	if (dados.giroEstoque.length > 0) {
		titulo("Giro de Estoque");
		imagemGrafico(imgGiro, 900, 420, "Top 10 produtos por giro");
		tabela(
			["Produto", "Vendido", "Estoque", "Giro", "Dias p/ reposição"],
			dados.giroEstoque.map((g) => [
				g.produto_nome,
				g.quantidadeVendida,
				g.estoqueAtual,
				g.giro != null ? g.giro.toFixed(2) : "-",
				g.diasParaReposicao != null ? g.diasParaReposicao : "-",
			]),
			[180, 60, 60, 60, 110],
		);
	}

	if (dados.comissoes.length > 0) {
		titulo("Comissões por Vendedor");
		tabela(
			["Vendedor", "Vendas", "Total vendido", "Comissão %", "Comissão R$"],
			dados.comissoes.map((c) => [
				c.nome,
				c.vendas,
				formatarMoeda(c.total_vendido),
				c.comissao_percentual.toFixed(1) + "%",
				formatarMoeda(c.comissao_valor),
			]),
			[150, 60, 100, 80, 90],
		);
	}

	if (dados.curvaAbc.length > 0) {
		titulo("Curva ABC (por lucro)");
		imagemGrafico(
			imgCurvaAbc,
			900,
			420,
			"Participação de cada classe na receita",
		);
		tabela(
			["#", "Produto", "Qtd", "Receita", "Lucro", "Classe"],
			dados.curvaAbc.map((l, i) => [
				i + 1,
				l.produto_nome,
				l.quantidade,
				formatarMoeda(l.receita),
				formatarMoeda(l.lucro),
				l.classe,
			]),
			[25, 180, 40, 90, 90, 50],
		);
	}

	if (dados.agingRecebiveis && dados.agingRecebiveis.totalGeral > 0) {
		titulo("Aging de Recebíveis");
		imagemGrafico(imgAging, 900, 320, "Em aberto por faixa de atraso");
		linhaTexto(
			`Total em aberto: ${formatarMoeda(dados.agingRecebiveis.totalGeral)}`,
		);
		y += 4;
		const atrasados = [
			...dados.agingRecebiveis.atraso0a30.itens,
			...dados.agingRecebiveis.atraso31a60.itens,
			...dados.agingRecebiveis.atraso61a90.itens,
			...dados.agingRecebiveis.atraso90mais.itens,
		].sort((a, b) => b.diasAtraso - a.diasAtraso);
		if (atrasados.length > 0) {
			tabela(
				["Descrição", "Valor", "Dias em atraso"],
				atrasados
					.slice(0, 10)
					.map((item) => [
						item.descricao,
						formatarMoeda(item.valor),
						item.diasAtraso,
					]),
				[300, 100, 100],
			);
			if (atrasados.length > 10) {
				linhaTexto(`+ ${atrasados.length - 10} outros em atraso`);
				y += 4;
			}
		}
	}

	if (dados.segmentacaoClientes.length > 0) {
		titulo("Segmentação de Clientes");
		imagemGrafico(
			imgSegmentos,
			900,
			420,
			`${dados.segmentacaoClientes.length} clientes, por segmento`,
		);
		const topClientes = [...dados.segmentacaoClientes]
			.sort((a, b) => b.valorTotal - a.valorTotal)
			.slice(0, 10);
		tabela(
			["Cliente", "Compras", "Total gasto", "Segmento"],
			topClientes.map((c) => [
				c.nome,
				c.frequencia,
				formatarMoeda(c.valorTotal),
				c.segmento,
			]),
			[200, 60, 100, 90],
		);
	}

	if (
		dados.sazonalidade &&
		dados.sazonalidade.porDiaSemana.some((d) => d.faturamento > 0)
	) {
		titulo("Sazonalidade");
		linhaTexto("Todo o histórico de vendas, não só o período filtrado acima.");
		y += 4;
		imagemGrafico(imgSazonalidade, 900, 320, "Faturamento por dia da semana");
		if (dados.sazonalidade.porHora.length > 0) {
			const pico = dados.sazonalidade.porHora.reduce((max, h) =>
				h.faturamento > max.faturamento ? h : max,
			);
			linhaTexto(
				`Horário de pico: ${pico.hora}h (${formatarMoeda(pico.faturamento)} acumulados nesse horário, todo o histórico)`,
			);
			y += 4;
		}
	}

	if (dados.conversaoOrcamentos) {
		titulo("Conversão de Orçamentos");
		linhaTexto(`Convertidos: ${dados.conversaoOrcamentos.convertidas}`);
		linhaTexto(`Cancelados: ${dados.conversaoOrcamentos.canceladas}`);
		linhaTexto(`Ainda abertos: ${dados.conversaoOrcamentos.abertas}`);
		linhaTexto(
			dados.conversaoOrcamentos.taxaConversaoPercentual != null
				? `Taxa de conversão: ${dados.conversaoOrcamentos.taxaConversaoPercentual.toFixed(1)}%`
				: "Taxa de conversão: sem orçamentos com desfecho no período.",
		);
		y += 8;
	}

	if (dados.produtosParados.length > 0) {
		titulo("Produtos Parados");
		const ordenados = [...dados.produtosParados].sort(
			(a, b) => b.quantidadeEstoque - a.quantidadeEstoque,
		);
		tabela(
			["Produto", "SKU", "Estoque parado"],
			ordenados
				.slice(0, 20)
				.map((p) => [p.produto_nome, p.sku, p.quantidadeEstoque]),
			[280, 100, 100],
		);
		if (ordenados.length > 20) {
			linhaTexto(`+ ${ordenados.length - 20} outros parados`);
			y += 4;
		}
	}

	if (dados.fluxoCaixa?.realizado) {
		titulo("Fluxo de Caixa (realizado)");
		const realizado = dados.fluxoCaixa.realizado;
		linhaTexto(`Entradas: ${formatarMoeda(realizado.totalEntradas)}`);
		linhaTexto(`Saídas: ${formatarMoeda(realizado.totalSaidas)}`);
		linhaTexto(`Saldo: ${formatarMoeda(realizado.saldo)}`);
		y += 4;
		if (realizado.porCategoria.length > 0) {
			tabela(
				["Categoria", "Entradas", "Saídas", "Saldo"],
				realizado.porCategoria.map((cat) => [
					cat.chave || "Sem categoria",
					formatarMoeda(cat.entradas),
					formatarMoeda(cat.saidas),
					formatarMoeda(cat.saldo),
				]),
				[180, 100, 100, 100],
			);
		}
	}

	const totalPaginas = doc.getNumberOfPages();
	for (let pagina = 1; pagina <= totalPaginas; pagina++) {
		doc.setPage(pagina);
		doc.setFontSize(8);
		doc.setTextColor(150);
		doc.text(
			`Página ${pagina} de ${totalPaginas}`,
			doc.internal.pageSize.getWidth() - margem,
			doc.internal.pageSize.getHeight() - 20,
			{ align: "right" },
		);
		doc.setTextColor(0);
	}

	doc.save("relatorio_" + new Date().toISOString().slice(0, 10) + ".pdf");
}
