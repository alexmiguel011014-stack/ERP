"use client";
import Button from "@/components/ui/button/Button";
import PeriodoRelatorioControles, {
	type PeriodoRelatorio,
} from "@/components/relatorios/PeriodoRelatorioControles";

export default function RelatoriosFiltros({
	dataInicio,
	setDataInicio,
	dataFim,
	setDataFim,
	onGerar,
	onExportarCsv,
	onExportarPdf,
	carregando,
}: {
	dataInicio: string;
	setDataInicio: (v: string) => void;
	dataFim: string;
	setDataFim: (v: string) => void;
	onGerar: (periodo: PeriodoRelatorio) => void;
	onExportarCsv: () => void;
	onExportarPdf: () => void;
	carregando: boolean;
}) {
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<PeriodoRelatorioControles
				dataInicio={dataInicio}
				setDataInicio={setDataInicio}
				dataFim={dataFim}
				setDataFim={setDataFim}
				onAplicar={onGerar}
				carregando={carregando}
				idBase="relatorios"
				acoes={
					<>
						<Button type="button" size="sm" variant="outline" onClick={onExportarCsv}>
							Exportar ABC (CSV)
						</Button>
						<Button type="button" size="sm" variant="outline" onClick={onExportarPdf}>
							Exportar PDF
						</Button>
					</>
				}
			/>
		</div>
	);
}
