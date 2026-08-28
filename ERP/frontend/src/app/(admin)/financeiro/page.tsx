"use client";
import { useState } from "react";
import { usePageHeader } from "@/context/PageHeaderContext";
import NovoLancamentoForm from "@/components/financeiro/NovoLancamentoForm";
import LancamentosTab from "@/components/financeiro/LancamentosTab";
import FluxoCaixaTab from "@/components/financeiro/FluxoCaixaTab";
import FechamentosTab from "@/components/financeiro/FechamentosTab";
import PagamentosTab from "@/components/financeiro/PagamentosTab";

type Aba = "receber" | "pagar" | "fluxo" | "fechamentos" | "pagamentos";

const ABAS: { id: Aba; label: string }[] = [
	{ id: "receber", label: "A Receber" },
	{ id: "pagar", label: "A Pagar" },
	{ id: "fluxo", label: "Fluxo de Caixa" },
	{ id: "fechamentos", label: "Fechamentos de Caixa" },
	{ id: "pagamentos", label: "Pagamentos" },
];

export default function FinanceiroPage() {
	usePageHeader(
		"Financeiro",
		"Contas a pagar, contas a receber e fluxo de caixa realizado.",
	);
	const [aba, setAba] = useState<Aba>("receber");
	const [refreshTick, setRefreshTick] = useState(0);
	const [mensagem, setMensagem] = useState<{
		texto: string;
		sucesso: boolean;
	} | null>(null);

	function mostrarMensagem(texto: string, sucesso: boolean) {
		setMensagem({ texto, sucesso });
		setTimeout(() => setMensagem(null), 4500);
	}

	function handleLancamentoSalvo(tipo: "receber" | "pagar", texto: string) {
		mostrarMensagem(texto, true);
		if (aba === tipo) setRefreshTick((t) => t + 1);
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800">
				{ABAS.map((a) => (
					<button
						key={a.id}
						type="button"
						onClick={() => setAba(a.id)}
						className={
							aba === a.id
								? "border-b-2 border-brand-500 px-3 py-2 text-sm font-semibold text-brand-600 dark:text-brand-400"
								: "px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
						}
					>
						{a.label}
					</button>
				))}
			</div>

			<NovoLancamentoForm
				onSalvo={handleLancamentoSalvo}
				onErro={(texto) => mostrarMensagem(texto, false)}
			/>

			{mensagem && (
				<div
					className={
						mensagem.sucesso
							? "rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-700 dark:border-success-800 dark:bg-success-500/10 dark:text-success-400"
							: "rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400"
					}
				>
					{mensagem.texto}
				</div>
			)}

			{(aba === "receber" || aba === "pagar") && (
				<LancamentosTab
					key={aba + refreshTick}
					tipo={aba}
					onMensagem={mostrarMensagem}
				/>
			)}
			{aba === "fluxo" && <FluxoCaixaTab />}
			{aba === "fechamentos" && <FechamentosTab />}
			{aba === "pagamentos" && <PagamentosTab />}
		</div>
	);
}
