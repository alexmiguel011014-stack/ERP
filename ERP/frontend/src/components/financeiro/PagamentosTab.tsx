"use client";
import { useState } from "react";
import { usePagamentos } from "@/hooks/usePagamentos";
import { erpApi } from "@/lib/erpApi";
import { formatarMoeda } from "@/components/dashboard/formatos";
import Button from "@/components/ui/button/Button";
import PagamentoFormModal from "./PagamentoFormModal";

export default function PagamentosTab({
	refreshKey = 0,
	onAtualizado,
}: {
	refreshKey?: number;
	onAtualizado?: (texto: string) => void;
}) {
	const { pagamentos, carregando, erro, recarregar } = usePagamentos(refreshKey);
	const [filtro, setFiltro] = useState("");
	const [modalAberto, setModalAberto] = useState(false);
	const [processandoId, setProcessandoId] = useState<number | null>(null);

	const q = filtro.trim().toLowerCase();
	const filtrados = q
		? pagamentos.filter((p) => (p.metodo || "").toLowerCase().includes(q))
		: pagamentos;

	function notificarAtualizacao(texto: string) {
		if (onAtualizado) onAtualizado(texto);
		else recarregar();
	}

	async function marcarComoRecebido(id: number) {
		if (!confirm("Marcar este pagamento como recebido?")) return;
		setProcessandoId(id);
		try {
			await erpApi.pagamentos.pagar(id);
			notificarAtualizacao("Pagamento marcado como recebido.");
		} catch (e) {
			notificarAtualizacao(
				"Erro: " + (e instanceof Error ? e.message : String(e)),
			);
		} finally {
			setProcessandoId(null);
		}
	}

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
					Recebimentos
				</h2>
				<div className="flex items-center gap-2">
					<input
						type="text"
						value={filtro}
						onChange={(e) => setFiltro(e.target.value)}
						placeholder="Filtrar por método (pix/boleto/dinheiro/...)"
						className="h-9 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
					/>
					<Button size="sm" onClick={() => setModalAberto(true)}>
						+ Novo Pagamento
					</Button>
				</div>
			</div>

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
				) : filtrados.length === 0 ? (
					<div className="py-6 text-center text-sm text-gray-400">
						Nenhum recebimento encontrado.
					</div>
				) : (
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-gray-100 dark:border-gray-800">
								{[
									"Venda",
									"Cliente",
									"Método",
									"Identificador",
									"Data",
									"Valor",
									"Status",
									"Ações",
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
							{filtrados.map((p) => (
								<tr
									key={p.id}
									className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
								>
									<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
										{p.numero_venda || "—"}
									</td>
									<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
										{p.cliente_nome || "—"}
									</td>
									<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
										{p.metodo || "—"}
									</td>
									<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
										{p.numero_identificador || "—"}
									</td>
									<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
										{p.data_recebimento || "—"}
									</td>
									<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
										{formatarMoeda(p.valor_recebido)}
									</td>
									<td className="whitespace-nowrap px-3 py-2">
										<span
											className={
												p.status === "recebido"
													? "rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-600 dark:bg-success-500/10 dark:text-success-400"
													: "rounded-full bg-error-50 px-2.5 py-0.5 text-xs font-semibold text-error-600 dark:bg-error-500/10 dark:text-error-400"
											}
										>
											{p.status || "pendente"}
										</span>
									</td>
									<td className="whitespace-nowrap px-3 py-2">
										{p.status !== "recebido" && (
											<button
												onClick={() => marcarComoRecebido(p.id)}
												disabled={processandoId === p.id}
												className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:bg-white/5 dark:text-gray-300"
											>
												Receber
											</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>

			<PagamentoFormModal
				isOpen={modalAberto}
				onClose={() => setModalAberto(false)}
				onSalvo={() => {
					setModalAberto(false);
					notificarAtualizacao("Pagamento registrado.");
				}}
			/>
		</div>
	);
}
