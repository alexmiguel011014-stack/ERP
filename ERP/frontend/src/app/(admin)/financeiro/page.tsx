"use client";
import { useState } from "react";
import { usePageHeader } from "@/context/PageHeaderContext";
import NovoLancamentoForm from "@/components/financeiro/NovoLancamentoForm";
import AlertaVencimentoHoje from "@/components/financeiro/AlertaVencimentoHoje";
import LancamentosUnificados from "@/components/financeiro/LancamentosUnificados";
import FluxoCaixaTab from "@/components/financeiro/FluxoCaixaTab";
import FechamentosTab from "@/components/financeiro/FechamentosTab";
import PagamentosTab from "@/components/financeiro/PagamentosTab";
import LancamentosRecorrentesTab from "@/components/financeiro/LancamentosRecorrentesTab";

export default function FinanceiroPage() {
	usePageHeader(
		"Financeiro",
		"Recebimentos, pagamentos e visão do caixa em um único espaço operacional.",
	);
	const [refreshKey, setRefreshKey] = useState(0);
	const [mensagem, setMensagem] = useState<{
		texto: string;
		sucesso: boolean;
	} | null>(null);

	function mostrarMensagem(texto: string, sucesso: boolean) {
		setMensagem({ texto, sucesso });
		setTimeout(() => setMensagem(null), 4500);
	}

	function marcarAtualizado(texto: string) {
		const sucesso = !texto.startsWith("Erro:");
		mostrarMensagem(texto, sucesso);
		if (sucesso) setRefreshKey((tick) => tick + 1);
	}

	return (
		<div className="grid grid-cols-1 gap-6">
			<section aria-labelledby="financeiro-operacao">
				<div className="mb-3">
					<h2
						id="financeiro-operacao"
						className="text-lg font-semibold text-gray-800 dark:text-white/90"
					>
						Operação financeira
					</h2>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						Cadastre cada obrigação uma vez e acompanhe receber e pagar no mesmo
						livro.
					</p>
				</div>
				<NovoLancamentoForm
					onSalvo={(_tipo, texto) => marcarAtualizado(texto)}
					onErro={(texto) => mostrarMensagem(texto, false)}
				/>
				{mensagem && (
					<div
						className={
							mensagem.sucesso
								? "mt-3 rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-700 dark:border-success-800 dark:bg-success-500/10 dark:text-success-400"
								: "mt-3 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400"
						}
					>
						{mensagem.texto}
					</div>
				)}
				<div className="mt-4">
					<AlertaVencimentoHoje />
				</div>
				<div className="mt-4">
					<LancamentosUnificados
						refreshKey={refreshKey}
						onAtualizado={marcarAtualizado}
					/>
				</div>
			</section>

			<section aria-labelledby="financeiro-fluxo">
				<div className="mb-3">
					<h2
						id="financeiro-fluxo"
						className="text-lg font-semibold text-gray-800 dark:text-white/90"
					>
						Visão do fluxo de caixa
					</h2>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						Aqui aparece o resultado dos lançamentos e das vendas recebidas. A
						análise histórica detalhada fica em Relatórios.
					</p>
				</div>
				<FluxoCaixaTab refreshKey={refreshKey} />
			</section>

			<section aria-labelledby="financeiro-pagamentos">
				<div className="mb-3">
					<h2
						id="financeiro-pagamentos"
						className="text-lg font-semibold text-gray-800 dark:text-white/90"
					>
						Recebimentos vinculados a vendas
					</h2>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						Use para guardar o detalhe Pix, boleto ou outro meio. Este detalhe não
						é somado novamente ao fluxo.
					</p>
				</div>
				<PagamentosTab
					refreshKey={refreshKey}
					onAtualizado={marcarAtualizado}
				/>
			</section>

			<section aria-labelledby="financeiro-caixa">
				<div className="mb-3">
					<h2
						id="financeiro-caixa"
						className="text-lg font-semibold text-gray-800 dark:text-white/90"
					>
						Caixa físico
					</h2>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						Abertura, conferência e fechamento continuam ligados ao caixa do PDV.
					</p>
				</div>
				<FechamentosTab refreshKey={refreshKey} />
			</section>

			<section aria-labelledby="financeiro-recorrentes">
				<details className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
					<summary
						id="financeiro-recorrentes"
						className="cursor-pointer px-4 py-4 text-lg font-semibold text-gray-800 dark:text-white/90"
					>
						Lançamentos recorrentes
					</summary>
					<div className="border-t border-gray-100 p-4 dark:border-gray-800">
						<LancamentosRecorrentesTab />
					</div>
				</details>
			</section>
		</div>
	);
}
