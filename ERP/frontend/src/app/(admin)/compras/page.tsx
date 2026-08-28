"use client";
import { useState } from "react";
import { usePageHeader } from "@/context/PageHeaderContext";
import NovoPedidoForm from "@/components/compras/NovoPedidoForm";
import PedidosList from "@/components/compras/PedidosList";

export default function ComprasPage() {
	usePageHeader(
		"Pedidos de Compra",
		"Solicite produtos ao fornecedor. No recebimento, o estoque e a conta a pagar são gerados automaticamente.",
	);
	const [mensagem, setMensagem] = useState<{
		texto: string;
		sucesso: boolean;
	} | null>(null);
	const [refreshTick, setRefreshTick] = useState(0);

	function mostrarMensagem(texto: string, sucesso: boolean) {
		setMensagem({ texto, sucesso });
		setTimeout(() => setMensagem(null), 4500);
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<NovoPedidoForm
				onCriado={() => setRefreshTick((t) => t + 1)}
				onMensagem={mostrarMensagem}
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

			<PedidosList key={refreshTick} onMensagem={mostrarMensagem} />
		</div>
	);
}
