"use client";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";

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
	onFiltrar: () => void;
	onExportarCsv: () => void;
	carregando: boolean;
}) {
	return (
		<div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<div>
				<Label>De:</Label>
				<Input
					type="date"
					value={dataInicio}
					onChange={(e) => setDataInicio(e.target.value)}
				/>
			</div>
			<div>
				<Label>Até:</Label>
				<Input
					type="date"
					value={dataFim}
					onChange={(e) => setDataFim(e.target.value)}
				/>
			</div>
			<Button onClick={onFiltrar} disabled={carregando}>
				{carregando ? "Filtrando..." : "Filtrar por data"}
			</Button>
			<Button variant="outline" onClick={onExportarCsv}>
				Exportar CSV
			</Button>
		</div>
	);
}
