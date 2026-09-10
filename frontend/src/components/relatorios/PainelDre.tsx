"use client";
import { DreChart } from "./RelatoriosCharts";
import { formatarMoeda, formatarPercentual } from "./formatos";
import type { DreResultado } from "@/lib/erpApi";

function LinhaDre({
	label,
	valor,
	destaque,
	sinal,
}: {
	label: string;
	valor: string;
	destaque?: boolean;
	sinal?: "positivo" | "negativo";
}) {
	return (
		<div className="flex items-center justify-between border-b border-gray-50 py-1.5 last:border-0 dark:border-gray-800/60">
			<span
				className={
					destaque
						? "font-semibold text-gray-800 dark:text-white/90"
						: "text-sm text-gray-500 dark:text-gray-400"
				}
			>
				{label}
			</span>
			<span
				className={
					destaque
						? "font-semibold " +
							(sinal === "positivo"
								? "text-success-600 dark:text-success-400"
								: "text-error-600 dark:text-error-400")
						: sinal === "negativo"
							? "text-error-600 dark:text-error-400"
							: "text-gray-800 dark:text-white/90"
				}
			>
				{valor}
			</span>
		</div>
	);
}

export default function PainelDre({ dre }: { dre: DreResultado }) {
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
				DRE (Demonstrativo de Resultado)
			</h3>
			<div className="mt-3">
				<DreChart dre={dre} />
			</div>
			<div className="mt-3">
				<LinhaDre
					label="Receita Bruta"
					valor={formatarMoeda(dre.receitaBruta)}
				/>
				<LinhaDre
					label="Descontos"
					valor={"-" + formatarMoeda(dre.descontos)}
					sinal="negativo"
				/>
				<LinhaDre
					label="Receita Líquida"
					valor={formatarMoeda(dre.receitaLiquida)}
				/>
				<LinhaDre
					label="CMV"
					valor={"-" + formatarMoeda(dre.cmv)}
					sinal="negativo"
				/>
				<LinhaDre
					label={`Lucro Bruto (${formatarPercentual(dre.margemBrutaPercentual)})`}
					valor={formatarMoeda(dre.lucroBruto)}
				/>
				<LinhaDre
					label="Despesas"
					valor={"-" + formatarMoeda(dre.despesas)}
					sinal="negativo"
				/>
				<LinhaDre
					label={`Lucro Líquido (${formatarPercentual(dre.margemLiquidaPercentual)})`}
					valor={formatarMoeda(dre.lucroLiquido)}
					destaque
					sinal={dre.lucroLiquido >= 0 ? "positivo" : "negativo"}
				/>
			</div>
		</div>
	);
}
