"use client";
import { useFechamentosCaixa } from "@/hooks/useFechamentosCaixa";
import { formatarMoeda } from "@/components/dashboard/formatos";

function formatarData(iso: string | null): string {
	if (!iso) return "---";
	try {
		return new Date(iso).toLocaleString("pt-BR");
	} catch {
		return iso;
	}
}

export default function FechamentosTab({ refreshKey = 0 }: { refreshKey?: number }) {
	const { fechamentos, caixaAberto, resumo, carregando, erro } =
		useFechamentosCaixa(refreshKey);

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
					Status do caixa físico
				</h2>
				<div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
					<div>
						<div
							className={
								caixaAberto
									? "text-sm font-semibold text-success-600 dark:text-success-400"
									: "text-sm font-semibold text-gray-600 dark:text-gray-300"
							}
						>
							{caixaAberto ? "Aberto" : "Fechado"}
						</div>
						<div className="text-xs text-gray-400">Status</div>
					</div>
					<div>
						<div className="text-sm font-semibold text-gray-800 dark:text-white/90">
							{resumo ? formatarMoeda(resumo.valor_abertura) : "---"}
						</div>
						<div className="text-xs text-gray-400">Abertura</div>
					</div>
					<div>
						<div className="text-sm font-semibold text-gray-800 dark:text-white/90">
							{resumo ? formatarMoeda(resumo.vendido_em_dinheiro) : "---"}
						</div>
						<div className="text-xs text-gray-400">Vendido em dinheiro</div>
					</div>
					<div>
						<div className="text-sm font-semibold text-gray-800 dark:text-white/90">
							{resumo ? formatarMoeda(resumo.valor_esperado_agora) : "---"}
						</div>
						<div className="text-xs text-gray-400">Esperado agora</div>
					</div>
				</div>
				<p className="mt-3 text-xs text-gray-400">
					Abertura e fechamento continuam sendo feitos pelo PDV; esta seção mostra
					a reconciliação sem transformá-la em outro lançamento financeiro.
				</p>
			</div>

			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
				Histórico de fechamentos de caixa
			</h2>
			{erro && (
				<div className="mt-3 rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
					{erro}
				</div>
			)}
			<div className="mt-3 overflow-x-auto">
				{carregando ? (
					<div className="py-6 text-center text-sm text-gray-400">
						Carregando...
					</div>
				) : fechamentos.length === 0 ? (
					<div className="py-6 text-center text-sm text-gray-400">
						Nenhum fechamento registrado ainda.
					</div>
				) : (
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-gray-100 dark:border-gray-800">
								{[
									"Abertura",
									"Fechamento",
									"Valor abertura",
									"Esperado",
									"Informado",
									"Diferença",
									"Obs.",
								].map((c) => (
									<th
										key={c}
										className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400"
									>
										{c}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{fechamentos.map((f) => (
								<tr
									key={f.id}
									className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
								>
									<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
										{formatarData(f.data_abertura)}
									</td>
									<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
										{formatarData(f.data_fechamento)}
									</td>
									<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
										{formatarMoeda(f.valor_abertura)}
									</td>
									<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
										{formatarMoeda(f.valor_esperado)}
									</td>
									<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
										{formatarMoeda(f.valor_informado)}
									</td>
									<td
										className={
											Number(f.diferenca) === 0
												? "whitespace-nowrap px-3 py-2 font-semibold text-success-600 dark:text-success-400"
												: "whitespace-nowrap px-3 py-2 font-semibold text-error-600 dark:text-error-400"
										}
									>
										{formatarMoeda(f.diferenca)}
									</td>
									<td className="px-3 py-2 text-gray-600 dark:text-gray-300">
										{f.observacao || "---"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
			</div>
		</div>
	);
}
