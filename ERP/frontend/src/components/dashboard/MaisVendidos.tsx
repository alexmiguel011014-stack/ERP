"use client";
import { formatarMoeda } from "./formatos";

type Produto = {
	nome: string;
	imagem: string | null;
	sku: string;
	quantidade: number;
	receita: number;
};

export default function MaisVendidos({ produtos }: { produtos: Produto[] }) {
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<div className="mb-3 flex items-center justify-between">
				<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
					Mais vendidos
				</h3>
				<span className="text-xs text-gray-400">Últimos 30 dias</span>
			</div>
			{produtos.length === 0 ? (
				<p className="py-6 text-center text-sm text-gray-400">
					Nenhuma venda nos últimos 30 dias.
				</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-left">
						<thead>
							<tr className="border-b border-gray-100 dark:border-gray-800">
								<th className="pb-2 text-xs font-medium uppercase text-gray-400">
									Produto
								</th>
								<th className="pb-2 text-xs font-medium uppercase text-gray-400">
									Qtd.
								</th>
								<th className="pb-2 text-xs font-medium uppercase text-gray-400">
									Receita
								</th>
							</tr>
						</thead>
						<tbody>
							{produtos.map((p) => (
								<tr
									key={p.sku}
									className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
								>
									<td className="py-2 text-sm font-medium text-gray-800 dark:text-white/90">
										{p.nome}
									</td>
									<td className="py-2 text-sm text-gray-600 dark:text-gray-300">
										{p.quantidade}
									</td>
									<td className="py-2 text-sm text-gray-600 dark:text-gray-300">
										{formatarMoeda(p.receita)}
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
