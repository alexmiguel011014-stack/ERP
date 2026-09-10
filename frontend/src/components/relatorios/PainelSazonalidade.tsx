"use client";
import type { SazonalidadeResultado } from "@/lib/erpApi";
import { formatarMoeda } from "./formatos";

function Barra({
	rotulo,
	valor,
	maximo,
}: {
	rotulo: string;
	valor: number;
	maximo: number;
}) {
	const largura = maximo > 0 ? (valor / maximo) * 100 : 0;
	return (
		<div className="flex items-center gap-2">
			<span className="w-16 shrink-0 text-xs text-gray-500 dark:text-gray-400">
				{rotulo}
			</span>
			<div className="h-4 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-white/5">
				<div
					className="h-full rounded bg-brand-500"
					style={{ width: `${largura}%` }}
				/>
			</div>
			<span className="w-24 shrink-0 text-right text-xs text-gray-500 dark:text-gray-400">
				{formatarMoeda(valor)}
			</span>
		</div>
	);
}

export default function PainelSazonalidade({
	dados,
}: {
	dados: SazonalidadeResultado | null;
}) {
	if (!dados) return null;
	const maxDiaSemana = Math.max(
		1,
		...dados.porDiaSemana.map((d) => d.faturamento),
	);
	const maxHora = Math.max(1, ...dados.porHora.map((h) => h.faturamento));

	return (
		<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
					Faturamento por Dia da Semana
				</h3>
				<p className="mt-1 text-xs text-gray-400">
					Todo o histórico de vendas, não só o período filtrado acima.
				</p>
				<div className="mt-3 space-y-2">
					{dados.porDiaSemana.map((d) => (
						<Barra
							key={d.diaSemana}
							rotulo={d.nome}
							valor={d.faturamento}
							maximo={maxDiaSemana}
						/>
					))}
				</div>
			</div>
			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
					Faturamento por Hora do Dia
				</h3>
				<p className="mt-1 text-xs text-gray-400">
					Todo o histórico de vendas, não só o período filtrado acima.
				</p>
				<div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
					{dados.porHora.map((h) => (
						<Barra
							key={h.hora}
							rotulo={String(h.hora).padStart(2, "0") + "h"}
							valor={h.faturamento}
							maximo={maxHora}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
