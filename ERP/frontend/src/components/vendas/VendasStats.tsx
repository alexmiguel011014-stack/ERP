"use client";
import { DollarLineIcon, BoxIcon } from "@/icons";
import { formatarMoeda } from "./formatos";
import type { Venda } from "@/lib/erpApi";

export default function VendasStats({ vendas }: { vendas: Venda[] }) {
	const totalFaturado = vendas
		.filter((v) => v.status === "finalizada")
		.reduce((soma, v) => soma + v.total, 0);

	return (
		<div className="grid grid-cols-2 gap-3 sm:w-96">
			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<div className="flex items-center gap-2">
					<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white">
						<BoxIcon className="size-4" />
					</div>
					<span className="text-xs text-gray-500 dark:text-gray-400">
						Registros
					</span>
				</div>
				<h4 className="mt-2 text-lg font-semibold text-gray-800 dark:text-white/90">
					{vendas.length}
				</h4>
			</div>
			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<div className="flex items-center gap-2">
					<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-success-500 text-white">
						<DollarLineIcon className="size-4" />
					</div>
					<span className="text-xs text-gray-500 dark:text-gray-400">
						Total faturado
					</span>
				</div>
				<h4 className="mt-2 text-lg font-semibold text-gray-800 dark:text-white/90">
					{formatarMoeda(totalFaturado)}
				</h4>
			</div>
		</div>
	);
}
