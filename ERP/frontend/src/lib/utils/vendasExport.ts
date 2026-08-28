import { jsPDF } from "jspdf";
import { formatarData, formatarMoeda } from "@/components/vendas/formatos";
import type { ItemVenda, Venda } from "@/lib/erpApi";
import { formatarAtributos } from "./formatos";

function csvCampo(v: unknown): string {
	return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
}

export function exportarVendasCsv(vendas: Venda[]) {
	if (vendas.length === 0) {
		alert("Nenhuma venda para exportar.");
		return;
	}
	const cabecalho =
		"Venda,Cliente,Status,Data,Pagamento,Desconto,Total,NotaStatus,NotaNumero";
	const corpo = vendas
		.map((v) =>
			[
				v.id,
				csvCampo(v.cliente_nome),
				v.status,
				v.data_venda,
				csvCampo(v.forma_pagamento),
				v.desconto.toFixed(2),
				v.total.toFixed(2),
				csvCampo(v.nota_status),
				csvCampo(v.nota_numero),
			].join(","),
		)
		.join("\n");
	const csv = cabecalho + "\n" + corpo;
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "vendas_" + new Date().toISOString().slice(0, 10) + ".csv";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

// Réplica do PDF que a versão vanilla já gera pro detalhe de uma venda —
// documento genérico (não um recibo térmico de PDV), client-side via jsPDF.
export function exportarVendaDetalhePdf(venda: Venda, itens: ItemVenda[]) {
	const doc = new jsPDF({ unit: "pt", format: "a4" });
	const margem = 40;
	let y = margem;

	function novaPaginaSeNecessario(espaco: number) {
		if (y + espaco > doc.internal.pageSize.getHeight() - margem) {
			doc.addPage();
			y = margem;
		}
	}

	const titulo = venda.status === "orcamento" ? "Orçamento" : "Venda";
	doc.setFontSize(16);
	doc.setFont("helvetica", "bold");
	doc.text(`${titulo} #${venda.id}`, margem, y);
	y += 22;

	doc.setFont("helvetica", "normal");
	doc.setFontSize(10);
	doc.text(`Data: ${formatarData(venda.data_venda)}`, margem, y);
	y += 14;
	doc.text(`Pagamento: ${venda.forma_pagamento || "---"}`, margem, y);
	y += 14;
	doc.text(`Cliente: ${venda.cliente_nome || "Não informado"}`, margem, y);
	y += 14;
	if (venda.observacao) {
		doc.text(`Observação: ${venda.observacao}`, margem, y);
		y += 14;
	}
	y += 8;

	doc.setFont("helvetica", "bold");
	doc.text("Produto", margem, y);
	doc.text("Qtd", 320, y);
	doc.text("Preço", 380, y);
	doc.text("Subtotal", 460, y);
	y += 12;
	doc.setDrawColor(200);
	doc.line(margem, y - 9, 555 - margem, y - 9);
	doc.setFont("helvetica", "normal");

	itens.forEach((item) => {
		novaPaginaSeNecessario(16);
		const descricao = `${item.produto_nome} (${formatarAtributos(item.atributos, item.tamanho, item.cor)})`;
		doc.text(descricao.slice(0, 45), margem, y);
		doc.text(String(item.quantidade), 320, y);
		doc.text(formatarMoeda(item.preco_unitario), 380, y);
		doc.text(formatarMoeda(item.subtotal), 460, y);
		y += 16;
	});

	y += 8;
	novaPaginaSeNecessario(50);
	const subtotal = itens.reduce((soma, i) => soma + i.subtotal, 0);
	doc.text(`Subtotal: ${formatarMoeda(subtotal)}`, 380, y);
	y += 14;
	doc.text(`Desconto: ${formatarMoeda(venda.desconto)}`, 380, y);
	y += 14;
	doc.setFont("helvetica", "bold");
	doc.text(`Total: ${formatarMoeda(venda.total)}`, 380, y);

	doc.save(
		(venda.status === "orcamento" ? "orcamento_" : "venda_") +
			venda.id +
			".pdf",
	);
}
