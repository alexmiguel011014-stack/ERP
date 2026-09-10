"use client";
import { formatarMoeda, formatarPercentual } from "./formatos";
import type {
	MargemContribuicaoResultado,
	PontoDeEquilibrioResultado,
} from "@/lib/erpApi";

export default function PainelMargemPontoEquilibrio({
	margem,
	ponto,
}: {
	margem: MargemContribuicaoResultado;
	ponto: PontoDeEquilibrioResultado;
}) {
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
				Margem de Contribuição e Ponto de Equilíbrio
			</h3>
			<p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
				Margem de contribuição média:{" "}
				<strong className="text-gray-800 dark:text-white/90">
					{formatarPercentual(margem.margemContribuicaoPercentualMedia)}
				</strong>
				. Para cobrir o custo fixo mensal de{" "}
				<strong className="text-gray-800 dark:text-white/90">
					{formatarMoeda(ponto.custoFixoMensal)}
				</strong>
				, é preciso vender{" "}
				{ponto.quantidadeNecessaria === null ? (
					<strong>--- unidades (sem dados suficientes)</strong>
				) : (
					<>
						<strong className="text-gray-800 dark:text-white/90">
							{ponto.quantidadeNecessaria.toLocaleString("pt-BR", {
								maximumFractionDigits: 0,
							})}{" "}
							unidades
						</strong>{" "}
						(
						<strong className="text-gray-800 dark:text-white/90">
							{formatarMoeda(ponto.faturamentoNecessario)}
						</strong>
						) por mês.
					</>
				)}
			</p>
			{margem.porProduto.length === 0 ? (
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
									Qtd
								</th>
								<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
									Margem contrib.
								</th>
								<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
									Por unidade
								</th>
								<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
									%
								</th>
							</tr>
						</thead>
						<tbody>
							{margem.porProduto.map((p) => (
								<tr
									key={p.produto_id}
									className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
								>
									<td className="px-3 py-2 font-medium text-gray-800 dark:text-white/90">
										{p.produto_nome}
									</td>
									<td className="px-3 py-2 text-center">{p.quantidade}</td>
									<td className="px-3 py-2 text-right font-semibold text-success-600 dark:text-success-400">
										{formatarMoeda(p.margemContribuicao)}
									</td>
									<td className="px-3 py-2 text-right">
										{formatarMoeda(p.margemContribuicaoUnitaria)}
									</td>
									<td className="px-3 py-2 text-right">
										{formatarPercentual(p.margemContribuicaoPercentual)}
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
