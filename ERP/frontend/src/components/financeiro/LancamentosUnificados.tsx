"use client";
import { useState } from "react";
import { useLancamentos } from "@/hooks/useLancamentos";
import {
	CATEGORIAS_FINANCEIRAS,
	erpApi,
	type Lancamento,
} from "@/lib/erpApi";
import { formatarMoeda } from "@/components/dashboard/formatos";
import Button from "@/components/ui/button/Button";
import Input from "@/components/form/input/InputField";

function formatarData(iso: string | null): string {
	if (!iso) return "---";
	try {
		return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
	} catch {
		return iso;
	}
}

function origemTexto(origem: string | null): string {
	return (
		{
			manual: "Manual",
			venda: "Venda",
			compra: "Compra",
			recorrente: "Recorrente",
			importacao_migracao: "Importação",
		}[origem || ""] || origem || "Outra"
	);
}

export default function LancamentosUnificados({
	refreshKey = 0,
	onAtualizado,
}: {
	refreshKey?: number;
	onAtualizado: (texto: string) => void;
}) {
	const [tipo, setTipo] = useState<"" | "receber" | "pagar">("");
	const [status, setStatus] = useState<"" | "aberto" | "pago">("");
	const [categoria, setCategoria] = useState("");
	const [dataInicio, setDataInicio] = useState("");
	const [dataFim, setDataFim] = useState("");
	const [inicioAplicado, setInicioAplicado] = useState("");
	const [fimAplicado, setFimAplicado] = useState("");
	const [processandoId, setProcessandoId] = useState<number | null>(null);
	const { lancamentos, carregando, erro } = useLancamentos(
		tipo || null,
		refreshKey,
		{
			status: status || undefined,
			categoria: categoria || undefined,
			dataInicio: inicioAplicado || undefined,
			dataFim: fimAplicado || undefined,
		},
	);

	const hoje = new Date().toISOString().slice(0, 10);
	const emAbertoReceber = lancamentos
		.filter((l) => l.tipo === "receber" && l.status === "aberto")
		.reduce((total, l) => total + Number(l.valor || 0), 0);
	const emAbertoPagar = lancamentos
		.filter((l) => l.tipo === "pagar" && l.status === "aberto")
		.reduce((total, l) => total + Number(l.valor || 0), 0);
	const vencido = lancamentos
		.filter(
			(l) =>
				l.status === "aberto" &&
				(l.data_vencimento || "").slice(0, 10) < hoje,
		)
		.reduce((total, l) => total + Number(l.valor || 0), 0);

	async function baixar(lancamento: Lancamento) {
		const verbo = lancamento.tipo === "receber" ? "recebimento" : "pagamento";
		if (!confirm(`Confirmar ${verbo} de ${formatarMoeda(lancamento.valor)}?`))
			return;
		setProcessandoId(lancamento.id);
		try {
			await erpApi.financeiro.baixar(lancamento.id);
			onAtualizado("Lançamento baixado e fluxo atualizado.");
		} catch (e) {
			onAtualizado(
				"Erro: " + (e instanceof Error ? e.message : String(e)),
			);
		} finally {
			setProcessandoId(null);
		}
	}

	async function excluir(lancamento: Lancamento) {
		if (!confirm("Excluir este lançamento?")) return;
		setProcessandoId(lancamento.id);
		try {
			await erpApi.financeiro.excluir(lancamento.id);
			onAtualizado("Lançamento excluído.");
		} catch (e) {
			onAtualizado(
				"Erro: " + (e instanceof Error ? e.message : String(e)),
			);
		} finally {
			setProcessandoId(null);
		}
	}

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
						Livro financeiro
					</h2>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						Recebimentos e pagamentos no mesmo lugar. O fluxo realizado abaixo é
						calculado a partir destes eventos, sem duplicar registros.
					</p>
				</div>
				<div className="grid grid-cols-2 gap-2 text-right sm:grid-cols-3">
					<div>
						<div className="text-sm font-semibold text-success-600 dark:text-success-400">
							{formatarMoeda(emAbertoReceber)}
						</div>
						<div className="text-xs text-gray-400">A receber</div>
					</div>
					<div>
						<div className="text-sm font-semibold text-error-600 dark:text-error-400">
							{formatarMoeda(emAbertoPagar)}
						</div>
						<div className="text-xs text-gray-400">A pagar</div>
					</div>
					<div>
						<div className="text-sm font-semibold text-warning-600 dark:text-warning-400">
							{formatarMoeda(vencido)}
						</div>
						<div className="text-xs text-gray-400">Vencido</div>
					</div>
				</div>
			</div>

			<div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
				<select
					value={tipo}
					onChange={(e) =>
						setTipo(e.target.value as "" | "receber" | "pagar")
					}
					aria-label="Tipo de lançamento"
					className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
				>
					<option value="">Todos os tipos</option>
					<option value="receber">A receber</option>
					<option value="pagar">A pagar</option>
				</select>
				<select
					value={status}
					onChange={(e) =>
						setStatus(e.target.value as "" | "aberto" | "pago")
					}
					aria-label="Status do lançamento"
					className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
				>
					<option value="">Todos os status</option>
					<option value="aberto">Em aberto</option>
					<option value="pago">Pago</option>
				</select>
				<select
					value={categoria}
					onChange={(e) => setCategoria(e.target.value)}
					aria-label="Categoria do lançamento"
					className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
				>
					<option value="">Todas as categorias</option>
					{CATEGORIAS_FINANCEIRAS.map((item) => (
						<option key={item} value={item}>
							{item}
						</option>
					))}
				</select>
				<Input
					type="date"
					value={dataInicio}
					onChange={(e) => setDataInicio(e.target.value)}
					aria-label="Data inicial"
				/>
				<Input
					type="date"
					value={dataFim}
					onChange={(e) => setDataFim(e.target.value)}
					aria-label="Data final"
				/>
			</div>
			<div className="mt-3 flex justify-end">
				<Button
					size="sm"
					onClick={() => {
						setInicioAplicado(dataInicio);
						setFimAplicado(dataFim);
					}}
				>
					Filtrar lançamentos
				</Button>
			</div>

			{erro && (
				<div className="mt-3 rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
					{erro}
				</div>
			)}
			<div className="mt-4 overflow-x-auto">
				{carregando ? (
					<div className="py-6 text-center text-sm text-gray-400">
						Carregando lançamentos...
					</div>
				) : lancamentos.length === 0 ? (
					<div className="py-6 text-center text-sm text-gray-400">
						Nenhum lançamento encontrado para os filtros atuais.
					</div>
				) : (
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-gray-100 dark:border-gray-800">
								{[
									"Tipo",
									"Descrição",
									"Vencimento",
									"Categoria",
									"Valor",
									"Status",
									"Origem",
									"Ações",
								].map((coluna) => (
									<th
										key={coluna}
										className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400"
									>
										{coluna}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{lancamentos.map((lancamento) => {
								const atrasado =
									lancamento.status === "aberto" &&
									(lancamento.data_vencimento || "").slice(0, 10) < hoje;
								return (
									<tr
										key={lancamento.id}
										className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
									>
										<td className="px-3 py-2">
											<span
												className={
													lancamento.tipo === "receber"
														? "rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-600 dark:bg-success-500/10 dark:text-success-400"
														: "rounded-full bg-error-50 px-2.5 py-0.5 text-xs font-semibold text-error-600 dark:bg-error-500/10 dark:text-error-400"
												}
											>
												{lancamento.tipo === "receber" ? "A receber" : "A pagar"}
											</span>
										</td>
										<td className="px-3 py-2 font-medium text-gray-800 dark:text-white/90">
											{lancamento.descricao}
											{lancamento.status === "pago" && lancamento.data_pagamento ? (
												<div className="text-xs font-normal text-gray-400">
													Pago em {formatarData(lancamento.data_pagamento)}
												</div>
											) : null}
										</td>
										<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
											{formatarData(lancamento.data_vencimento)}
										</td>
										<td className="px-3 py-2 text-gray-500 dark:text-gray-400">
											{lancamento.categoria || "Sem categoria"}
										</td>
										<td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-gray-800 dark:text-white/90">
											{formatarMoeda(lancamento.valor)}
										</td>
										<td className="whitespace-nowrap px-3 py-2">
											<span
												className={
													lancamento.status === "pago"
														? "rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-600 dark:bg-success-500/10 dark:text-success-400"
														: atrasado
															? "rounded-full bg-error-50 px-2.5 py-0.5 text-xs font-semibold text-error-600 dark:bg-error-500/10 dark:text-error-400"
															: "rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-semibold text-warning-600 dark:bg-warning-500/10 dark:text-warning-400"
												}
											>
												{lancamento.status === "pago"
													? "Pago"
													: atrasado
														? "Vencido"
															: "Em aberto"}
											</span>
										</td>
										<td className="whitespace-nowrap px-3 py-2 text-gray-500 dark:text-gray-400">
											{origemTexto(lancamento.origem)}
										</td>
										<td className="whitespace-nowrap px-3 py-2">
											{lancamento.status === "aberto" && (
												<div className="flex gap-2">
													<button
														type="button"
														onClick={() => baixar(lancamento)}
														disabled={processandoId === lancamento.id}
														className="rounded-lg bg-success-50 px-3 py-1.5 text-xs font-semibold text-success-600 hover:bg-success-100 disabled:opacity-50 dark:bg-success-500/10 dark:text-success-400"
													>
														{lancamento.tipo === "receber" ? "Receber" : "Pagar"}
													</button>
													{lancamento.origem === "manual" && (
														<button
															type="button"
															onClick={() => excluir(lancamento)}
															disabled={processandoId === lancamento.id}
															className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-semibold text-error-600 hover:bg-error-100 disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400"
														>
															Excluir
														</button>
													)}
												</div>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}
