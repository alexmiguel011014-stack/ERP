"use client";
import { useState } from "react";
import { usePedidosCompra } from "@/hooks/usePedidosCompra";
import { erpApi, type ItemPedidoCompra, type PedidoCompra } from "@/lib/erpApi";
import { formatarMoeda } from "@/components/dashboard/formatos";
import { formatarAtributos } from "@/lib/utils/formatos";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";

const LABEL_STATUS: Record<string, string> = {
	aberto: "Aberto",
	parcial: "Recebido parcial",
	recebido: "Recebido",
	cancelado: "Cancelado",
};

const COR_STATUS: Record<string, string> = {
	aberto:
		"rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-semibold text-warning-600 dark:bg-warning-500/10 dark:text-warning-400",
	parcial:
		"rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-semibold text-warning-600 dark:bg-warning-500/10 dark:text-warning-400",
	recebido:
		"rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-600 dark:bg-success-500/10 dark:text-success-400",
	cancelado:
		"rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500 dark:bg-white/5 dark:text-gray-400",
};

function formatarData(iso: string | null): string {
	if (!iso) return "---";
	try {
		return new Date(iso).toLocaleDateString("pt-BR");
	} catch {
		return iso;
	}
}

export default function PedidosList({
	onMensagem,
}: {
	onMensagem: (texto: string, sucesso: boolean) => void;
}) {
	const { pedidos, carregando, erro, recarregar } = usePedidosCompra();
	const [expandidoId, setExpandidoId] = useState<number | null>(null);
	const [modoReceber, setModoReceber] = useState(false);
	const [itensExpandidos, setItensExpandidos] = useState<ItemPedidoCompra[]>(
		[],
	);
	const [quantidades, setQuantidades] = useState<Record<number, string>>({});
	const [processandoId, setProcessandoId] = useState<number | null>(null);
	const [pedidoImprimindo, setPedidoImprimindo] = useState<PedidoCompra | null>(
		null,
	);
	const [itensImpressao, setItensImpressao] = useState<ItemPedidoCompra[]>([]);

	async function toggleItens(pedido: PedidoCompra, receber: boolean) {
		if (expandidoId === pedido.id && modoReceber === receber) {
			setExpandidoId(null);
			return;
		}
		try {
			const itens = await erpApi.compras.itensPedido(pedido.id);
			setItensExpandidos(itens);
			setExpandidoId(pedido.id);
			setModoReceber(receber);
			if (receber) {
				const iniciais: Record<number, string> = {};
				itens.forEach((i) => {
					iniciais[i.id] = String(i.quantidade - i.quantidade_recebida);
				});
				setQuantidades(iniciais);
			}
		} catch (e) {
			onMensagem(
				"Erro: " + (e instanceof Error ? e.message : String(e)),
				false,
			);
		}
	}

	async function confirmarRecebimento(pedidoId: number) {
		const itensRecebidos = itensExpandidos
			.map((i) => ({
				item_id: i.id,
				quantidade: parseInt(quantidades[i.id] || "0", 10),
			}))
			.filter((i) => Number.isInteger(i.quantidade) && i.quantidade > 0);
		if (itensRecebidos.length === 0) {
			onMensagem("Informe ao menos uma quantidade a receber.", false);
			return;
		}
		setProcessandoId(pedidoId);
		try {
			const r = await erpApi.compras.receberPedido(pedidoId, itensRecebidos);
			onMensagem(
				r.status === "parcial"
					? "Recebimento parcial registrado."
					: `Pedido #${pedidoId} recebido totalmente!`,
				true,
			);
			setExpandidoId(null);
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

	async function cancelarPedido(pedido: PedidoCompra) {
		if (!confirm(`Cancelar o pedido #${pedido.id}?`)) return;
		setProcessandoId(pedido.id);
		try {
			await erpApi.compras.cancelarPedido(pedido.id);
			onMensagem("Pedido cancelado.", true);
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

	async function imprimirPedido(pedido: PedidoCompra) {
		try {
			const itens = await erpApi.compras.itensPedido(pedido.id);
			setItensImpressao(itens);
			setPedidoImprimindo(pedido);
		} catch (e) {
			onMensagem(
				"Erro ao preparar impressão: " +
					(e instanceof Error ? e.message : String(e)),
				false,
			);
		}
	}

	const totalImpressao = itensImpressao.reduce(
		(s, i) => s + i.quantidade * i.custo_unitario,
		0,
	);

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
				Pedidos
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
				) : pedidos.length === 0 ? (
					<div className="py-6 text-center text-sm text-gray-400">
						Nenhum pedido de compra.
					</div>
				) : (
					pedidos.map((p) => (
						<div key={p.id} className="py-2.5">
							<div className="flex items-center justify-between gap-3">
								<div>
									<div className="text-sm font-medium text-gray-800 dark:text-white/90">
										Pedido #{p.id} — {formatarMoeda(p.total)}
									</div>
									<div className="text-xs text-gray-500 dark:text-gray-400">
										{formatarData(p.data_pedido)} | Fornecedor:{" "}
										{p.fornecedor_nome || "não informado"}
										{p.observacao ? " | " + p.observacao : ""}
									</div>
								</div>
								<div className="flex shrink-0 flex-wrap items-center gap-2">
									<span className={COR_STATUS[p.status]}>
										{LABEL_STATUS[p.status]}
									</span>
									<button
										onClick={() => toggleItens(p, false)}
										className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-300"
									>
										Itens
									</button>
									<button
										onClick={() => imprimirPedido(p)}
										className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-300"
									>
										Imprimir
									</button>
									{(p.status === "aberto" || p.status === "parcial") && (
										<>
											<button
												onClick={() => toggleItens(p, true)}
												className="rounded-lg bg-success-50 px-3 py-1.5 text-xs font-semibold text-success-600 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-400"
											>
												Receber
											</button>
											<button
												onClick={() => cancelarPedido(p)}
												disabled={processandoId === p.id}
												className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-semibold text-error-600 hover:bg-error-100 disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400"
											>
												{p.status === "parcial"
													? "Cancelar restante"
													: "Cancelar"}
											</button>
										</>
									)}
								</div>
							</div>

							{expandidoId === p.id && !modoReceber && (
								<div className="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-white/5 dark:text-gray-300">
									{itensExpandidos.length === 0
										? "Sem itens."
										: itensExpandidos.map((i) => (
												<div key={i.id}>
													{i.quantidade}x {i.produto_nome} (
													{formatarAtributos(i.atributos, i.tamanho, i.cor)}) —{" "}
													{formatarMoeda(i.custo_unitario)} un.
													{i.quantidade_recebida > 0
														? ` — recebido: ${i.quantidade_recebida}/${i.quantidade}`
														: ""}
												</div>
											))}
								</div>
							)}

							{expandidoId === p.id && modoReceber && (
								<div className="mt-2 rounded-lg bg-gray-50 p-3 dark:bg-white/5">
									{itensExpandidos.map((i) => {
										const falta = i.quantidade - i.quantidade_recebida;
										return (
											<div
												key={i.id}
												className="mb-1.5 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
											>
												<span className="flex-1">
													{i.produto_nome} (
													{formatarAtributos(i.atributos, i.tamanho, i.cor)}) —
													falta {falta} de {i.quantidade}
												</span>
												<input
													type="number"
													min={0}
													max={falta}
													step={1}
													disabled={falta <= 0}
													value={quantidades[i.id] ?? ""}
													onChange={(e) =>
														setQuantidades((q) => ({
															...q,
															[i.id]: e.target.value,
														}))
													}
													className="h-9 w-[70px] rounded-lg border border-gray-300 bg-transparent px-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
												/>
											</div>
										);
									})}
									<Button
										size="sm"
										onClick={() => confirmarRecebimento(p.id)}
										disabled={processandoId === p.id}
										className="mt-2"
									>
										Confirmar recebimento
									</Button>
								</div>
							)}
						</div>
					))
				)}
			</div>

			<Modal
				isOpen={!!pedidoImprimindo}
				onClose={() => setPedidoImprimindo(null)}
				className="max-w-[640px] p-6"
			>
				{pedidoImprimindo && (
					<>
						<div id="print-area">
							<h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
								Pedido de Compra #{pedidoImprimindo.id}
							</h2>
							<p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
								Data: {formatarData(pedidoImprimindo.data_pedido)} | Status:{" "}
								{pedidoImprimindo.status}
							</p>
							<p className="mb-4 text-sm text-gray-700 dark:text-gray-300">
								<strong>Fornecedor:</strong>{" "}
								{pedidoImprimindo.fornecedor_nome || "não informado"}
							</p>
							{pedidoImprimindo.observacao && (
								<p className="mb-4 text-sm text-gray-700 dark:text-gray-300">
									<strong>Observação:</strong> {pedidoImprimindo.observacao}
								</p>
							)}
							<table className="w-full text-left text-sm">
								<thead>
									<tr className="bg-gray-50 dark:bg-white/5">
										<th className="px-2 py-1.5">Produto</th>
										<th className="px-2 py-1.5">SKU</th>
										<th className="px-2 py-1.5 text-right">Qtd</th>
										<th className="px-2 py-1.5 text-right">Custo Unit.</th>
										<th className="px-2 py-1.5 text-right">Subtotal</th>
									</tr>
								</thead>
								<tbody>
									{itensImpressao.map((i) => (
										<tr
											key={i.id}
											className="border-b border-gray-200 dark:border-gray-700"
										>
											<td className="px-2 py-1.5">
												{i.produto_nome} (
												{formatarAtributos(i.atributos, i.tamanho, i.cor)})
											</td>
											<td className="px-2 py-1.5">{i.sku}</td>
											<td className="px-2 py-1.5 text-right">{i.quantidade}</td>
											<td className="px-2 py-1.5 text-right">
												{formatarMoeda(i.custo_unitario)}
											</td>
											<td className="px-2 py-1.5 text-right">
												{formatarMoeda(i.quantidade * i.custo_unitario)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
							<p className="mt-3 text-right text-lg font-bold text-gray-800 dark:text-white/90">
								Total: {formatarMoeda(totalImpressao)}
							</p>
						</div>
						<div className="mt-4 flex gap-3">
							<Button onClick={() => window.print()} className="flex-1">
								Imprimir / Salvar PDF
							</Button>
							<Button
								variant="outline"
								className="flex-1"
								onClick={() => setPedidoImprimindo(null)}
							>
								Fechar
							</Button>
						</div>
					</>
				)}
			</Modal>
		</div>
	);
}
