"use client";
import { useState } from "react";
import { usePageHeader } from "@/context/PageHeaderContext";
import { useVendas } from "@/hooks/useVendas";
import VendasFiltros from "@/components/vendas/VendasFiltros";
import VendasStats from "@/components/vendas/VendasStats";
import VendasTable from "@/components/vendas/VendasTable";
import VendaDetalheModal from "@/components/vendas/VendaDetalheModal";
import VendaFiadoHistoricaModal from "@/components/vendas/VendaFiadoHistoricaModal";
import Button from "@/components/ui/button/Button";
import { exportarVendasCsv } from "@/lib/utils/vendasExport";
import type { Venda } from "@/lib/erpApi";

export default function VendasPage() {
	usePageHeader("Vendas", "Histórico de vendas e orçamentos.");
	const {
		dataInicio,
		setDataInicio,
		dataFim,
		setDataFim,
		vendas,
		carregando,
		erro,
		filtrar,
		itensCache,
		carregandoItens,
		carregarItens,
		converterOrcamento,
		atualizarNotaFiscal,
	} = useVendas();
	const [vendaSelecionada, setVendaSelecionada] = useState<Venda | null>(null);
	const [modalFiadoAberto, setModalFiadoAberto] = useState(false);

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="flex justify-end">
				<Button onClick={() => setModalFiadoAberto(true)}>
					Lançar Venda Histórica
				</Button>
			</div>

			<VendasFiltros
				dataInicio={dataInicio}
				setDataInicio={setDataInicio}
				dataFim={dataFim}
				setDataFim={setDataFim}
				onFiltrar={filtrar}
				onExportarCsv={() => exportarVendasCsv(vendas)}
				carregando={carregando}
			/>

			{erro && (
				<div className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
					{erro}
				</div>
			)}

			<VendasStats vendas={vendas} />

			<VendasTable
				vendas={vendas}
				itensCache={itensCache}
				carregandoItens={carregandoItens}
				carregando={carregando}
				onExpandirLinha={carregarItens}
				onAbrirDetalhe={(venda) => {
					carregarItens(venda.id);
					setVendaSelecionada(venda);
				}}
			/>

			<VendaDetalheModal
				venda={vendaSelecionada}
				itens={vendaSelecionada ? itensCache[vendaSelecionada.id] : undefined}
				carregandoItens={
					vendaSelecionada ? !!carregandoItens[vendaSelecionada.id] : false
				}
				onClose={() => setVendaSelecionada(null)}
				onConverter={converterOrcamento}
				onAtualizarNotaFiscal={atualizarNotaFiscal}
			/>

			<VendaFiadoHistoricaModal
				isOpen={modalFiadoAberto}
				onClose={() => setModalFiadoAberto(false)}
				onSalvo={filtrar}
			/>
		</div>
	);
}
