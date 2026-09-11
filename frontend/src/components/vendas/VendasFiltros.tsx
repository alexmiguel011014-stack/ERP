"use client";
import Button from "@/components/ui/button/Button";
import PeriodoRelatorioControles, {
	type PeriodoRelatorio,
} from "@/components/relatorios/PeriodoRelatorioControles";

export default function VendasFiltros({
	dataInicio,
	setDataInicio,
	dataFim,
	setDataFim,
	onFiltrar,
	onExportarCsv,
	carregando,
}: {
	dataInicio: string;
	setDataInicio: (v: string) => void;
	dataFim: string;
	setDataFim: (v: string) => void;
	onFiltrar: (periodo: PeriodoRelatorio) => void;
	onExportarCsv: () => void;
	carregando: boolean;
}) {
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<PeriodoRelatorioControles
				dataInicio={dataInicio}
				setDataInicio={setDataInicio}
				dataFim={dataFim}
				setDataFim={setDataFim}
				onAplicar={onFiltrar}
				carregando={carregando}
				idBase="vendas"
				acoes={
					<Button type="button" size="sm" variant="outline" onClick={onExportarCsv}>
						Exportar CSV
					</Button>
				}
			/>
		</div>
	);
}
