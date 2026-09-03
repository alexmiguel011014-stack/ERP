"use client";
import type { SegmentacaoClienteLinha } from "@/lib/erpApi";
import { formatarMoeda } from "./formatos";

const COR_SEGMENTO: Record<SegmentacaoClienteLinha["segmento"], string> = {
	Frequente:
		"bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400",
	Ativo: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400",
	"Em risco":
		"bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400",
	Inativo: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400",
	"Nunca comprou":
		"bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-500",
};

export default function PainelSegmentacaoClientes({
	dados,
}: {
	dados: SegmentacaoClienteLinha[];
}) {
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
				Segmentação de Clientes
			</h3>
			<p className="mt-1 text-xs text-gray-400">
				Baseado em recência (dias desde a última compra) e frequência —
				categorização prática, não um score estatístico.
			</p>
			{dados.length === 0 ? (
				<p className="py-8 text-center text-sm text-gray-400">
					Nenhum cliente cadastrado.
				</p>
			) : (
				<div className="mt-3 max-h-96 overflow-x-auto overflow-y-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-gray-100 dark:border-gray-800">
								<th className="px-3 py-2 text-xs font-medium uppercase text-gray-400">
									Cliente
								</th>
								<th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-400">
									Compras
								</th>
								<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
									Total gasto
								</th>
								<th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-400">
									Segmento
								</th>
							</tr>
						</thead>
						<tbody>
							{dados.map((c) => (
								<tr
									key={c.cliente_id}
									className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
								>
									<td className="px-3 py-2 font-medium text-gray-800 dark:text-white/90">
										{c.nome}
									</td>
									<td className="px-3 py-2 text-center">{c.frequencia}</td>
									<td className="px-3 py-2 text-right">
										{formatarMoeda(c.valorTotal)}
									</td>
									<td className="px-3 py-2 text-center">
										<span
											className={`rounded-full px-2 py-0.5 text-xs font-medium ${COR_SEGMENTO[c.segmento]}`}
										>
											{c.segmento}
										</span>
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
