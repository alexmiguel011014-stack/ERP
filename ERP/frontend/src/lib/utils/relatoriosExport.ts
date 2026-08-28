import { jsPDF } from "jspdf";
import { formatarData, formatarMoeda } from "@/components/relatorios/formatos";
import type {
	ComissaoLinha,
	CurvaAbcLinha,
	DreResultado,
	RelatorioVendasResultado,
} from "@/lib/erpApi";

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
// (jsPDF, client-side, sem plugin de tabela). Igual à vanilla, não inclui
// Margem de Contribuição / Ponto de Equilíbrio / Giro de Estoque — só as
// seções que já existiam no export original. Diferente da vanilla: a
// tabela de Comissões era impressa duas vezes por um bug de copy-paste no
// código original — corrigido aqui, não replicado.
export function exportarRelatorioPdf(dados: {
	periodo: { inicio: string; fim: string };
	resumo: RelatorioVendasResultado | null;
	dre: DreResultado | null;
	comissoes: ComissaoLinha[];
	curvaAbc: CurvaAbcLinha[];
}) {
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
	}

	if (dados.dre) {
		titulo("DRE (Demonstrativo de Resultado)");
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

	if (dados.resumo && dados.resumo.porDia.length > 0) {
		titulo("Vendas por Dia");
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

	if (dados.resumo && dados.resumo.porPagamento.length > 0) {
		titulo("Faturamento por Forma de Pagamento");
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

	doc.save("relatorio_" + new Date().toISOString().slice(0, 10) + ".pdf");
}
