"use client";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePageHeader } from "@/context/PageHeaderContext";
import { useRelatorios } from "@/hooks/useRelatorios";
import { useVendas } from "@/hooks/useVendas";
import RelatoriosFiltros from "@/components/relatorios/RelatoriosFiltros";
import RelatoriosStats from "@/components/relatorios/RelatoriosStats";
import PainelPorDia from "@/components/relatorios/PainelPorDia";
import PainelPorPagamento from "@/components/relatorios/PainelPorPagamento";
import PainelCurvaAbc from "@/components/relatorios/PainelCurvaAbc";
import PainelComissoes from "@/components/relatorios/PainelComissoes";
import PainelDre from "@/components/relatorios/PainelDre";
import PainelMargemPontoEquilibrio from "@/components/relatorios/PainelMargemPontoEquilibrio";
import PainelGiroEstoque from "@/components/relatorios/PainelGiroEstoque";
import VendasFiltros from "@/components/vendas/VendasFiltros";
import VendasStats from "@/components/vendas/VendasStats";
import VendasTable from "@/components/vendas/VendasTable";
import VendaDetalheModal from "@/components/vendas/VendaDetalheModal";
import {
	exportarCurvaAbcCsv,
	exportarRelatorioPdf,
} from "@/lib/utils/relatoriosExport";
import { exportarVendasCsv } from "@/lib/utils/vendasExport";
import type { Venda } from "@/lib/erpApi";

type Aba = "analises" | "vendas";

export default function RelatoriosPage() {
	usePageHeader(
		"Relatórios",
		"Vendas por período, Curva ABC de produtos e histórico de vendas.",
	);
	const { isAdmin } = useAuth();
	const [aba, setAba] = useState<Aba>("analises");
	const {
		dataInicio,
		setDataInicio,
		dataFim,
		setDataFim,
		vendasPeriodo,
		curvaAbc,
		comissoes,
		dre,
		margemContribuicao,
		pontoDeEquilibrio,
		giroEstoque,
		carregando,
		erros,
		gerar,
	} = useRelatorios();
	const vendasState = useVendas();
	const [vendaSelecionada, setVendaSelecionada] = useState<Venda | null>(null);

	function exportarCsv() {
		exportarCurvaAbcCsv(curvaAbc);
	}

	function exportarPdf() {
		exportarRelatorioPdf({
			periodo: { inicio: dataInicio, fim: dataFim },
			resumo: vendasPeriodo,
			dre,
			comissoes,
			curvaAbc,
		});
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			{isAdmin && (
				<div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800">
					<button
						type="button"
						onClick={() => setAba("analises")}
						className={
							aba === "analises"
								? "border-b-2 border-brand-500 px-3 py-2 text-sm font-semibold text-brand-600 dark:text-brand-400"
								: "px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
						}
					>
						Análises
					</button>
					<button
						type="button"
						onClick={() => setAba("vendas")}
						className={
							aba === "vendas"
								? "border-b-2 border-brand-500 px-3 py-2 text-sm font-semibold text-brand-600 dark:text-brand-400"
								: "px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
						}
					>
						Vendas
					</button>
				</div>
			)}

			{aba === "vendas" && isAdmin ? (
				<>
					<VendasFiltros
						dataInicio={vendasState.dataInicio}
						setDataInicio={vendasState.setDataInicio}
						dataFim={vendasState.dataFim}
						setDataFim={vendasState.setDataFim}
						onFiltrar={vendasState.filtrar}
						onExportarCsv={() => exportarVendasCsv(vendasState.vendas)}
						carregando={vendasState.carregando}
					/>

					{vendasState.erro && (
						<div className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
							{vendasState.erro}
						</div>
					)}

					<VendasStats vendas={vendasState.vendas} />

					<VendasTable
						vendas={vendasState.vendas}
						itensCache={vendasState.itensCache}
						carregandoItens={vendasState.carregandoItens}
						carregando={vendasState.carregando}
						onExpandirLinha={vendasState.carregarItens}
						onAbrirDetalhe={(venda) => {
							vendasState.carregarItens(venda.id);
							setVendaSelecionada(venda);
						}}
					/>

					<VendaDetalheModal
						venda={vendaSelecionada}
						itens={
							vendaSelecionada
								? vendasState.itensCache[vendaSelecionada.id]
								: undefined
						}
						carregandoItens={
							vendaSelecionada
								? !!vendasState.carregandoItens[vendaSelecionada.id]
								: false
						}
						onClose={() => setVendaSelecionada(null)}
						onConverter={vendasState.converterOrcamento}
						onAtualizarNotaFiscal={vendasState.atualizarNotaFiscal}
					/>
				</>
			) : (
				<>
					<RelatoriosFiltros
						dataInicio={dataInicio}
						setDataInicio={setDataInicio}
						dataFim={dataFim}
						setDataFim={setDataFim}
						onGerar={gerar}
						onExportarCsv={exportarCsv}
						onExportarPdf={exportarPdf}
						carregando={carregando}
					/>

					{Object.keys(erros).length > 0 && (
						<div className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
							{Object.values(erros).join(" · ")}
						</div>
					)}

					{vendasPeriodo && <RelatoriosStats resumo={vendasPeriodo.resumo} />}

					<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
						{vendasPeriodo && <PainelPorDia dados={vendasPeriodo.porDia} />}
						{vendasPeriodo && (
							<PainelPorPagamento dados={vendasPeriodo.porPagamento} />
						)}
					</div>

					<PainelCurvaAbc dados={curvaAbc} />
					<PainelComissoes dados={comissoes} />
					{dre && <PainelDre dre={dre} />}
					{margemContribuicao && pontoDeEquilibrio && (
						<PainelMargemPontoEquilibrio
							margem={margemContribuicao}
							ponto={pontoDeEquilibrio}
						/>
					)}
					<PainelGiroEstoque dados={giroEstoque} />
				</>
			)}
		</div>
	);
}
