"use client";
import type { ReactNode } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";

export type PeriodoRelatorio = { inicio: string; fim: string };

export default function PeriodoRelatorioControles({
	dataInicio,
	setDataInicio,
	dataFim,
	setDataFim,
	onAplicar,
	carregando,
	idBase,
	acoes,
}: {
	dataInicio: string;
	setDataInicio: (valor: string) => void;
	dataFim: string;
	setDataFim: (valor: string) => void;
	onAplicar: (periodo: PeriodoRelatorio) => void;
	carregando: boolean;
	idBase: string;
	acoes?: ReactNode;
}) {
	const periodoPersonalizadoValido =
		Boolean(dataInicio) && Boolean(dataFim) && dataInicio <= dataFim;

	function aplicarPeriodo(inicio: string, fim: string) {
		setDataInicio(inicio);
		setDataFim(fim);
		onAplicar({ inicio, fim });
	}

	function aplicarEsteMes() {
		const hoje = new Date().toISOString().slice(0, 10);
		aplicarPeriodo(`${hoje.slice(0, 8)}01`, hoje);
	}

	return (
		<>
			<div>
				<h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">
					Período do relatório
				</h2>
				<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
					Escolha um atalho ou informe as datas desejadas.
				</p>
			</div>

			<div className="mt-4 flex flex-wrap items-end gap-3">
				<div>
					<Label htmlFor={`${idBase}-inicio`}>De:</Label>
					<Input
						id={`${idBase}-inicio`}
						type="date"
						value={dataInicio}
						onChange={(e) => setDataInicio(e.target.value)}
					/>
				</div>
				<div>
					<Label htmlFor={`${idBase}-fim`}>Até:</Label>
					<Input
						id={`${idBase}-fim`}
						type="date"
						value={dataFim}
						onChange={(e) => setDataFim(e.target.value)}
					/>
				</div>
				<Button
					type="button"
					size="sm"
					onClick={() => aplicarPeriodo(dataInicio, dataFim)}
					disabled={!periodoPersonalizadoValido || carregando}
				>
					{carregando ? "Aplicando..." : "Aplicar período"}
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={aplicarEsteMes}
					disabled={carregando}
				>
					Este mês
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => aplicarPeriodo("", "")}
					disabled={carregando}
				>
					Período todo
				</Button>
				{acoes}
			</div>

			{dataInicio && dataFim && !periodoPersonalizadoValido && (
				<p className="mt-2 text-xs text-error-600 dark:text-error-400">
					A data inicial precisa ser anterior ou igual à data final.
				</p>
			)}
		</>
	);
}
