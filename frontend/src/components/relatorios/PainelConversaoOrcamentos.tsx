"use client";
import type { ConversaoOrcamentosResultado } from "@/lib/erpApi";
import { formatarPercentual } from "./formatos";

export default function PainelConversaoOrcamentos({
	dados,
}: {
	dados: ConversaoOrcamentosResultado | null;
}) {
	if (!dados) return null;
	const semDados =
		dados.convertidas === 0 && dados.canceladas === 0 && dados.abertas === 0;

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
				Conversão de Orçamentos
			</h3>
			<p className="mt-1 text-xs text-gray-400">
				Taxa calculada só entre orçamentos já convertidos ou cancelados — os
				ainda em aberto não entram na taxa (ainda não têm desfecho).
			</p>
			{semDados ? (
				<p className="py-8 text-center text-sm text-gray-400">
					Nenhum orçamento no período.
				</p>
			) : (
				<>
					<div className="mt-3 grid grid-cols-3 gap-3 text-center">
						<div>
							<div className="text-xl font-semibold text-success-600 dark:text-success-400">
								{dados.convertidas}
							</div>
							<div className="text-xs text-gray-500 dark:text-gray-400">
								Convertidos
							</div>
						</div>
						<div>
							<div className="text-xl font-semibold text-error-600 dark:text-error-400">
								{dados.canceladas}
							</div>
							<div className="text-xs text-gray-500 dark:text-gray-400">
								Cancelados
							</div>
						</div>
						<div>
							<div className="text-xl font-semibold text-gray-800 dark:text-white/90">
								{dados.abertas}
							</div>
							<div className="text-xs text-gray-500 dark:text-gray-400">
								Ainda abertos
							</div>
						</div>
					</div>
					<p className="mt-4 text-sm font-medium text-gray-800 dark:text-white/90">
						Taxa de conversão:{" "}
						{formatarPercentual(dados.taxaConversaoPercentual)}
					</p>
				</>
			)}
		</div>
	);
}
