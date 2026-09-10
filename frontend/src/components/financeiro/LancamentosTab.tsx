"use client";
import { useState } from "react";
import { useLancamentos } from "@/hooks/useLancamentos";
import { erpApi, type Lancamento } from "@/lib/erpApi";
import { formatarMoeda } from "@/components/dashboard/formatos";

function formatarData(iso: string | null): string {
	if (!iso) return "---";
	try {
		return new Date(iso).toLocaleDateString("pt-BR");
	} catch {
		return iso;
	}
}

export default function LancamentosTab({
	tipo,
	onMensagem,
}: {
	tipo: "receber" | "pagar";
	onMensagem: (texto: string, sucesso: boolean) => void;
}) {
	const { lancamentos, carregando, erro, recarregar } = useLancamentos(tipo);
	const [processandoId, setProcessandoId] = useState<number | null>(null);

	const hoje = new Date().toISOString().slice(0, 10);
	let aberto = 0;
	let vencido = 0;
	lancamentos.forEach((l) => {
		if (l.status === "aberto") {
			aberto += Number(l.valor) || 0;
			if ((l.data_vencimento || "").slice(0, 10) < hoje)
				vencido += Number(l.valor) || 0;
		}
	});

	async function baixar(l: Lancamento) {
		const verbo = tipo === "receber" ? "recebimento" : "pagamento";
		if (!confirm(`Confirmar ${verbo} de ${formatarMoeda(l.valor)}?`)) return;
		setProcessandoId(l.id);
		try {
			await erpApi.financeiro.baixar(l.id);
			onMensagem("Lançamento baixado.", true);
			recarregar();
		} catch (e) {
			onMensagem(
				"Erro: " + (e instanceof Error ? e.message : String(e)),
				false,
			);
		} finally {
			setProcessandoId(null);
		}
	}

	async function excluir(l: Lancamento) {
		if (!confirm("Excluir este lançamento?")) return;
		setProcessandoId(l.id);
		try {
			await erpApi.financeiro.excluir(l.id);
			onMensagem("Lançamento excluído.", true);
			recarregar();
		} catch (e) {
			onMensagem(
				"Erro: " + (e instanceof Error ? e.message : String(e)),
				false,
			);
		} finally {
			setProcessandoId(null);
		}
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
				<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
					<div
						className={
							tipo === "receber"
								? "text-xl font-semibold text-success-600 dark:text-success-400"
								: "text-xl font-semibold text-error-600 dark:text-error-400"
						}
					>
						{formatarMoeda(aberto)}
					</div>
					<div className="text-xs text-gray-500 dark:text-gray-400">
						Em aberto
					</div>
				</div>
				<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
					<div className="text-xl font-semibold text-warning-600 dark:text-warning-400">
						{formatarMoeda(vencido)}
					</div>
					<div className="text-xs text-gray-500 dark:text-gray-400">
						Vencido
					</div>
				</div>
			</div>

			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
					{tipo === "receber" ? "Contas a receber" : "Contas a pagar"}
				</h2>
				{erro && (
					<div className="mt-3 rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
						{erro}
					</div>
				)}
				<div className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
					{carregando ? (
						<div className="py-6 text-center text-sm text-gray-400">
							Carregando...
						</div>
					) : lancamentos.length === 0 ? (
						<div className="py-6 text-center text-sm text-gray-400">
							Nenhum lançamento encontrado.
						</div>
					) : (
						lancamentos.map((l) => {
							const atrasado =
								l.status === "aberto" &&
								(l.data_vencimento || "").slice(0, 10) < hoje;
							const origemTxt =
								l.origem === "venda"
									? "venda"
									: l.origem === "compra"
										? "compra"
										: "manual";
							return (
								<div
									key={l.id}
									className="flex items-center justify-between gap-3 py-2.5"
								>
									<div>
										<div className="text-sm font-medium text-gray-800 dark:text-white/90">
											{l.descricao} — {formatarMoeda(l.valor)}
										</div>
										<div className="text-xs text-gray-500 dark:text-gray-400">
											Vencimento: {formatarData(l.data_vencimento)}
											{l.status === "pago"
												? " | Pago em: " + formatarData(l.data_pagamento)
												: ""}{" "}
											| Origem: {origemTxt}
											{l.parcela_total && l.parcela_total > 1
												? ` | Parcela ${l.parcela_num}/${l.parcela_total}`
												: ""}
										</div>
									</div>
									<div className="flex shrink-0 items-center gap-2">
										{l.status === "pago" ? (
											<span className="rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-600 dark:bg-success-500/10 dark:text-success-400">
												Pago
											</span>
										) : atrasado ? (
											<span className="rounded-full bg-error-50 px-2.5 py-0.5 text-xs font-semibold text-error-600 dark:bg-error-500/10 dark:text-error-400">
												Vencido
											</span>
										) : (
											<span className="rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-semibold text-warning-600 dark:bg-warning-500/10 dark:text-warning-400">
												Em aberto
											</span>
										)}
										{l.status === "aberto" && (
											<>
												<button
													onClick={() => baixar(l)}
													disabled={processandoId === l.id}
													className="rounded-lg bg-success-50 px-3 py-1.5 text-xs font-semibold text-success-600 hover:bg-success-100 disabled:opacity-50 dark:bg-success-500/10 dark:text-success-400"
												>
													{tipo === "receber" ? "Receber" : "Pagar"}
												</button>
												{l.origem === "manual" && (
													<button
														onClick={() => excluir(l)}
														disabled={processandoId === l.id}
														className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-semibold text-error-600 hover:bg-error-100 disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400"
													>
														Excluir
													</button>
												)}
											</>
										)}
									</div>
								</div>
							);
						})
					)}
				</div>
			</div>
		</div>
	);
}
