"use client";
import type { ProdutoParadoLinha } from "@/lib/erpApi";

export default function PainelProdutosParados({
	dados,
}: {
	dados: ProdutoParadoLinha[];
}) {
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
				Produtos Parados
			</h3>
			<p className="mt-1 text-xs text-gray-400">
				Com estoque disponível e nenhuma venda no período — diferente da Curva
				ABC (que ranqueia por lucro), isto aponta o que não saiu.
			</p>
			{dados.length === 0 ? (
				<p className="py-8 text-center text-sm text-gray-400">
					Nenhum produto parado no período.
				</p>
			) : (
				<div className="mt-3 max-h-96 overflow-x-auto overflow-y-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-gray-100 dark:border-gray-800">
								<th className="px-3 py-2 text-xs font-medium uppercase text-gray-400">
									Produto
								</th>
								<th className="px-3 py-2 text-xs font-medium uppercase text-gray-400">
									SKU
								</th>
								<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
									Estoque parado
								</th>
							</tr>
						</thead>
						<tbody>
							{dados.map((p) => (
								<tr
									key={p.produto_id + "-" + p.sku}
									className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
								>
									<td className="px-3 py-2 font-medium text-gray-800 dark:text-white/90">
										{p.produto_nome}
									</td>
									<td className="px-3 py-2 text-gray-500 dark:text-gray-400">
										{p.sku}
									</td>
									<td className="px-3 py-2 text-right">
										{p.quantidadeEstoque}
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
