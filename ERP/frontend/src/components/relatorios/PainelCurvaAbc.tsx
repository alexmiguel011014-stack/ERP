"use client";
import Badge from "@/components/ui/badge/Badge";
import { CurvaAbcChart } from "./RelatoriosCharts";
import { formatarMoeda, formatarPercentual } from "./formatos";
import type { CurvaAbcLinha } from "@/lib/erpApi";

const BADGE_POR_CLASSE = {
	A: "success",
	B: "warning",
	C: "light",
} as const;

export default function PainelCurvaAbc({ dados }: { dados: CurvaAbcLinha[] }) {
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
				Curva ABC (por receita)
			</h3>
			<p className="text-xs text-gray-400">
				A = até 80% acumulado | B = até 95% | C = restante
			</p>
			{dados.length === 0 ? (
				<p className="py-8 text-center text-sm text-gray-400">
					Sem produtos vendidos no período.
				</p>
			) : (
				<>
					<div className="mt-3">
						<CurvaAbcChart dados={dados} />
					</div>
					<div className="mt-3 overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead>
								<tr className="border-b border-gray-100 dark:border-gray-800">
									<th className="px-3 py-2 text-xs font-medium uppercase text-gray-400">
										#
									</th>
									<th className="px-3 py-2 text-xs font-medium uppercase text-gray-400">
										Produto
									</th>
									<th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-400">
										Qtd
									</th>
									<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
										Receita
									</th>
									<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
										Custo
									</th>
									<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
										Lucro
									</th>
									<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
										Margem %
									</th>
									<th className="px-3 py-2 text-xs font-medium uppercase text-gray-400">
										Acumulado
									</th>
									<th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-400">
										Classe
									</th>
								</tr>
							</thead>
							<tbody>
								{dados.map((l, i) => (
									<tr
										key={l.produto_nome + i}
										className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
									>
										<td className="px-3 py-2">{i + 1}</td>
										<td className="px-3 py-2 font-medium text-gray-800 dark:text-white/90">
											{l.produto_nome}
										</td>
										<td className="px-3 py-2 text-center">{l.quantidade}</td>
										<td className="px-3 py-2 text-right">
											{formatarMoeda(l.receita)}
										</td>
										<td className="px-3 py-2 text-right">
											{formatarMoeda(l.custo)}
										</td>
										<td className="px-3 py-2 text-right">
											{formatarMoeda(l.lucro)}
										</td>
										<td className="px-3 py-2 text-right">
											{formatarPercentual(l.margem)}
										</td>
										<td className="px-3 py-2">
											<div className="flex items-center gap-2">
												<div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
													<div
														className="h-full rounded-full bg-brand-500"
														style={{
															width: `${Math.min(100, Math.max(0, l.acumulado))}%`,
														}}
													/>
												</div>
												<span className="text-xs text-gray-400">
													{formatarPercentual(l.acumulado)}
												</span>
											</div>
										</td>
										<td className="px-3 py-2 text-center">
											<Badge size="sm" color={BADGE_POR_CLASSE[l.classe]}>
												{l.classe}
											</Badge>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</>
			)}
		</div>
	);
}
