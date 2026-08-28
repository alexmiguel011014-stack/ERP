"use client";
import { formatarMoeda, formatarPercentual } from "./formatos";
import type { ComissaoLinha } from "@/lib/erpApi";

export default function PainelComissoes({ dados }: { dados: ComissaoLinha[] }) {
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
				Comissões por vendedor
			</h3>
			{dados.length === 0 ? (
				<p className="py-8 text-center text-sm text-gray-400">
					Sem vendas no período.
				</p>
			) : (
				<div className="mt-3 overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-gray-100 dark:border-gray-800">
								<th className="px-3 py-2 text-xs font-medium uppercase text-gray-400">
									Vendedor
								</th>
								<th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-400">
									Vendas
								</th>
								<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
									Total vendido
								</th>
								<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
									Comissão %
								</th>
								<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
									Comissão R$
								</th>
							</tr>
						</thead>
						<tbody>
							{dados.map((c) => (
								<tr
									key={c.usuario_id}
									className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
								>
									<td className="px-3 py-2 font-medium text-gray-800 dark:text-white/90">
										{c.nome}
									</td>
									<td className="px-3 py-2 text-center">{c.vendas}</td>
									<td className="px-3 py-2 text-right">
										{formatarMoeda(c.total_vendido)}
									</td>
									<td className="px-3 py-2 text-right">
										{formatarPercentual(c.comissao_percentual)}
									</td>
									<td className="px-3 py-2 text-right font-semibold text-success-600 dark:text-success-400">
										{formatarMoeda(c.comissao_valor)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
