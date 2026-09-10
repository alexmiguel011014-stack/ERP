"use client";
import { PorPagamentoChart } from "./RelatoriosCharts";
import { formatarMoeda } from "./formatos";
import type { RelatorioVendasResultado } from "@/lib/erpApi";

export default function PainelPorPagamento({
	dados,
}: {
	dados: RelatorioVendasResultado["porPagamento"];
}) {
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
				Por forma de pagamento
			</h3>
			{dados.length === 0 ? (
				<p className="py-8 text-center text-sm text-gray-400">
					Sem dados no período.
				</p>
			) : (
				<>
					<div className="mt-3">
						<PorPagamentoChart dados={dados} />
					</div>
					<div className="mt-3 overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead>
								<tr className="border-b border-gray-100 dark:border-gray-800">
									<th className="px-3 py-2 text-xs font-medium uppercase text-gray-400">
										Forma de pagamento
									</th>
									<th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-400">
										Vendas
									</th>
									<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
										Faturamento
									</th>
								</tr>
							</thead>
							<tbody>
								{dados.map((p) => (
									<tr
										key={p.forma_pagamento}
										className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
									>
										<td className="px-3 py-2">{p.forma_pagamento}</td>
										<td className="px-3 py-2 text-center">{p.vendas}</td>
										<td className="px-3 py-2 text-right font-semibold text-success-600 dark:text-success-400">
											{formatarMoeda(p.faturamento)}
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
