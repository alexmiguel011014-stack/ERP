"use client";
import { BoxIcon, DollarLineIcon, AlertIcon } from "@/icons";
import { formatarMoeda } from "./formatos";
import type { RelatorioVendasResultado } from "@/lib/erpApi";

function CardStat({
	icone,
	label,
	valor,
	corIcone = "primary",
	progresso,
}: {
	icone: React.ReactNode;
	label: string;
	valor: string;
	corIcone?: "primary" | "success" | "error" | "warning";
	progresso?: number;
}) {
	const fundoIcone: Record<string, string> = {
		primary: "bg-brand-500 text-white",
		success: "bg-success-500 text-white",
		error: "bg-error-500 text-white",
		warning: "bg-warning-500 text-white",
	};
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<div className="flex items-center gap-2">
				<div
					className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${fundoIcone[corIcone]}`}
				>
					{icone}
				</div>
				<span className="truncate text-xs text-gray-500 dark:text-gray-400">
					{label}
				</span>
			</div>
			<h4 className="mt-2 text-lg font-semibold text-gray-800 dark:text-white/90">
				{valor}
			</h4>
			{progresso !== undefined && (
				<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
					<div
						className="h-full rounded-full bg-error-500"
						style={{ width: `${Math.min(100, Math.max(0, progresso))}%` }}
					/>
				</div>
			)}
		</div>
	);
}

export default function RelatoriosStats({
	resumo,
}: {
	resumo: RelatorioVendasResultado["resumo"];
}) {
	const percentualDesconto =
		resumo.faturamento > 0
			? (resumo.descontos / (resumo.faturamento + resumo.descontos)) * 100
			: 0;

	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<CardStat
				icone={<BoxIcon className="size-4" />}
				label="Vendas"
				valor={String(resumo.vendas)}
			/>
			<CardStat
				icone={<DollarLineIcon className="size-4" />}
				label="Faturamento"
				valor={formatarMoeda(resumo.faturamento)}
				corIcone="success"
			/>
			<CardStat
				icone={<DollarLineIcon className="size-4" />}
				label="Ticket médio"
				valor={formatarMoeda(resumo.ticketMedio)}
			/>
			<CardStat
				icone={<AlertIcon className="size-4" />}
				label="Descontos dados"
				valor={formatarMoeda(resumo.descontos)}
				corIcone="error"
				progresso={percentualDesconto}
			/>
		</div>
	);
}
