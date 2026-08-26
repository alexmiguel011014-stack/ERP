"use client";
import { useState } from "react";
import Button from "@/components/ui/button/Button";
import Input from "@/components/form/input/InputField";
import { useFluxoCaixa } from "@/hooks/useFluxoCaixa";
import { formatarMoeda } from "@/components/dashboard/formatos";

function formatarData(iso: string | null): string {
	if (!iso) return "---";
	try {
		return new Date(iso).toLocaleDateString("pt-BR");
	} catch {
		return iso;
	}
}

export default function FluxoCaixaTab() {
	const {
		inicio,
		setInicio,
		fim,
		setFim,
		fluxo,
		aliquota,
		provisao,
		carregando,
		erro,
		erroDAS,
		filtrar,
		salvarAliquota,
	} = useFluxoCaixa();
	const [aliquotaInput, setAliquotaInput] = useState("");
	const [salvandoAliquota, setSalvandoAliquota] = useState(false);

	const aliquotaExibida = aliquotaInput || (aliquota ? String(aliquota) : "");

	async function handleSalvarAliquota() {
		const valor = parseFloat(aliquotaInput || String(aliquota || 0)) || 0;
		if (valor < 0) return;
		setSalvandoAliquota(true);
		try {
			await salvarAliquota(valor);
		} finally {
			setSalvandoAliquota(false);
		}
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<div>
					<label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
						De
					</label>
					<Input
						type="date"
						value={inicio}
						onChange={(e) => setInicio(e.target.value)}
					/>
				</div>
				<div>
					<label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
						Até
					</label>
					<Input
						type="date"
						value={fim}
						onChange={(e) => setFim(e.target.value)}
					/>
				</div>
				<Button size="sm" onClick={filtrar}>
					Filtrar
				</Button>
			</div>

			{erro && (
				<div className="rounded-xl border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
					{erro}
				</div>
			)}

			{fluxo && (
				<div className="grid grid-cols-3 gap-4">
					<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
						<div className="text-xl font-semibold text-success-600 dark:text-success-400">
							{formatarMoeda(fluxo.totalEntradas)}
						</div>
						<div className="text-xs text-gray-500 dark:text-gray-400">
							Entradas
						</div>
					</div>
					<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
						<div className="text-xl font-semibold text-error-600 dark:text-error-400">
							{formatarMoeda(fluxo.totalSaidas)}
						</div>
						<div className="text-xs text-gray-500 dark:text-gray-400">
							Saídas
						</div>
					</div>
					<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
						<div
							className={
								fluxo.saldo >= 0
									? "text-xl font-semibold text-gray-800 dark:text-white/90"
									: "text-xl font-semibold text-error-600 dark:text-error-400"
							}
						>
							{formatarMoeda(fluxo.saldo)}
						</div>
						<div className="text-xs text-gray-500 dark:text-gray-400">
							Saldo do período
						</div>
					</div>
				</div>
			)}

			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
					Movimento por dia
				</h2>
				<div className="mt-3 overflow-x-auto">
					{carregando ? (
						<div className="py-6 text-center text-sm text-gray-400">
							Carregando...
						</div>
					) : !fluxo || fluxo.dias.length === 0 ? (
						<div className="py-6 text-center text-sm text-gray-400">
							Nenhuma movimentação no período.
						</div>
					) : (
						<table className="w-full text-left text-sm">
							<thead>
								<tr className="border-b border-gray-100 dark:border-gray-800">
									<th className="px-3 py-2 text-xs font-medium uppercase text-gray-400">
										Data
									</th>
									<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
										Entradas
									</th>
									<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
										Saídas
									</th>
									<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
										Saldo do dia
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
											{formatarData(d.dia)}
										</td>
										<td className="px-3 py-2 text-right text-success-600 dark:text-success-400">
											{formatarMoeda(d.entradas)}
										</td>
										<td className="px-3 py-2 text-right text-error-600 dark:text-error-400">
											{formatarMoeda(d.saidas)}
										</td>
										<td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
											{formatarMoeda(d.saldo)}
										</td>
										<td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-white/90">
											{formatarMoeda(d.saldoAcumulado)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			</div>

			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
					Provisão de DAS (regime de caixa)
				</h2>
				<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Estimativa baseada no que foi efetivamente recebido no período acima —
					não no valor faturado. Não substitui o cálculo real do contador
					(alíquota/anexo/Fator R do Simples Nacional).
				</p>
				{erroDAS && (
					<div className="mt-3 rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
						{erroDAS}
					</div>
				)}
				<div className="mt-3 flex items-end gap-3">
					<div>
						<label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
							Alíquota de provisão (%)
						</label>
						<Input
							type="number"
							value={aliquotaExibida}
							onChange={(e) => setAliquotaInput(e.target.value)}
							placeholder="Ex: 6"
							min="0"
							max="100"
							step={0.01}
						/>
					</div>
					<Button
						size="sm"
						onClick={handleSalvarAliquota}
						disabled={salvandoAliquota}
					>
						{salvandoAliquota ? "Salvando..." : "Salvar"}
					</Button>
				</div>
				<p className="mt-3 text-sm font-medium text-gray-800 dark:text-white/90">
					{!aliquota
						? "Informe a alíquota de provisão para calcular."
						: provisao
							? `Recebido no período: ${formatarMoeda(provisao.totalRecebido)} — DAS provisionado (${aliquota}%): ${formatarMoeda(provisao.valorProvisionado)}`
							: ""}
				</p>
			</div>
		</div>
	);
}
