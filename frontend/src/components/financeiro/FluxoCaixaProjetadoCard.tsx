"use client";
import { useEffect, useState } from "react";
import { erpApi, type FluxoCaixaProjetado } from "@/lib/erpApi";
import { formatarMoeda } from "@/components/dashboard/formatos";

export default function FluxoCaixaProjetadoCard() {
	const [fluxo, setFluxo] = useState<FluxoCaixaProjetado | null>(null);
	const [erro, setErro] = useState<string | null>(null);

	useEffect(() => {
		erpApi.financeiro
			.fluxoCaixaProjetado(null, null)
			.then(setFluxo)
			.catch((e) => setErro(e instanceof Error ? e.message : String(e)));
	}, []);

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
				Fluxo de Caixa Projetado (próximos 30 dias)
			</h2>
			<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
				A partir de lançamentos ainda em aberto (por vencimento), não do que já
				foi pago — diferente do fluxo realizado acima.
			</p>
			{erro && (
				<div className="mt-3 rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
					{erro}
				</div>
			)}
			{fluxo && (
				<>
					<div className="mt-3 grid grid-cols-3 gap-4">
						<div>
							<div className="text-lg font-semibold text-success-600 dark:text-success-400">
								{formatarMoeda(fluxo.totalEntradas)}
							</div>
							<div className="text-xs text-gray-500 dark:text-gray-400">
								A receber
							</div>
						</div>
						<div>
							<div className="text-lg font-semibold text-error-600 dark:text-error-400">
								{formatarMoeda(fluxo.totalSaidas)}
							</div>
							<div className="text-xs text-gray-500 dark:text-gray-400">
								A pagar
							</div>
						</div>
						<div>
							<div
								className={
									fluxo.saldo >= 0
										? "text-lg font-semibold text-gray-800 dark:text-white/90"
										: "text-lg font-semibold text-error-600 dark:text-error-400"
								}
							>
								{formatarMoeda(fluxo.saldo)}
							</div>
							<div className="text-xs text-gray-500 dark:text-gray-400">
								Saldo projetado
							</div>
						</div>
					</div>
					{fluxo.dias.length === 0 ? (
						<p className="mt-4 text-center text-sm text-gray-400">
							Nenhum lançamento em aberto vencendo nos próximos 30 dias.
						</p>
					) : (
						<div className="mt-3 max-h-64 overflow-y-auto">
							<table className="w-full text-left text-sm">
								<thead>
									<tr className="border-b border-gray-100 dark:border-gray-800">
										<th className="px-3 py-2 text-xs font-medium uppercase text-gray-400">
											Data
										</th>
										<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
											A receber
										</th>
										<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
											A pagar
										</th>
										<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
											Acumulado
										</th>
									</tr>
								</thead>
								<tbody>
									{fluxo.dias.map((d) => (
										<tr
											key={d.dia}
											className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
										>
											<td className="px-3 py-2 text-gray-600 dark:text-gray-300">
												{d.dia}
											</td>
											<td className="px-3 py-2 text-right text-success-600 dark:text-success-400">
												{formatarMoeda(d.entradas)}
											</td>
											<td className="px-3 py-2 text-right text-error-600 dark:text-error-400">
												{formatarMoeda(d.saidas)}
											</td>
											<td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-white/90">
												{formatarMoeda(d.saldoAcumulado)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}
		</div>
	);
}
