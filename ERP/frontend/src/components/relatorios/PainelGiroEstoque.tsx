"use client";
import type { GiroEstoqueLinha } from "@/lib/erpApi";

export default function PainelGiroEstoque({
	dados,
}: {
	dados: GiroEstoqueLinha[];
}) {
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
				Giro de Estoque
			</h3>
			{dados.length === 0 ? (
				<p className="py-8 text-center text-sm text-gray-400">
					Sem produtos vendidos no período.
				</p>
			) : (
				<div className="mt-3 overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-gray-100 dark:border-gray-800">
								<th className="px-3 py-2 text-xs font-medium uppercase text-gray-400">
									Produto
								</th>
								<th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-400">
									Vendido
								</th>
								<th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-400">
									Estoque atual
								</th>
								<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
									Giro
								</th>
								<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
									Dias p/ reposição
								</th>
							</tr>
						</thead>
						<tbody>
							{dados.map((g) => (
								<tr
									key={g.produto_id}
									className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
								>
									<td className="px-3 py-2 font-medium text-gray-800 dark:text-white/90">
										{g.produto_nome}
									</td>
									<td className="px-3 py-2 text-center">
										{g.quantidadeVendida}
									</td>
									<td className="px-3 py-2 text-center">{g.estoqueAtual}</td>
									<td className="px-3 py-2 text-right">
										{g.giro === null ? "---" : g.giro.toFixed(2)}
									</td>
									<td className="px-3 py-2 text-right">
										{g.diasParaReposicao === null
											? "---"
											: g.diasParaReposicao.toFixed(0)}
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
