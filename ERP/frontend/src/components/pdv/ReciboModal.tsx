"use client";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { formatarMoeda } from "./formatos";
import type { ItemCarrinho } from "@/hooks/useCarrinho";

export type DadosRecibo = {
	vendaId: number;
	itens: ItemCarrinho[];
	subtotal: number;
	desconto: number;
	total: number;
	formaPagamento: string;
	clienteNome: string | null;
	valorRecebido: number | null;
	data: string;
};

export default function ReciboModal({
	dados,
	onClose,
}: {
	dados: DadosRecibo | null;
	onClose: () => void;
}) {
	if (!dados) return null;
	const troco =
		dados.valorRecebido !== null ? dados.valorRecebido - dados.total : null;

	return (
		<Modal isOpen={!!dados} onClose={onClose} className="max-w-sm p-6">
			<div
				id="print-area"
				className="mx-auto max-w-[280px] font-mono text-xs text-gray-800 dark:text-white/90"
			>
				<p className="text-center text-sm font-bold">ALLU ERP</p>
				<p className="text-center">Cnpj: --</p>
				<p className="mt-2 border-t border-dashed border-gray-400 pt-2">
					Venda #{dados.vendaId}
				</p>
				<p>{new Date(dados.data).toLocaleString("pt-BR")}</p>
				<p>Pagamento: {dados.formaPagamento || "---"}</p>
				{dados.clienteNome && <p>Cliente: {dados.clienteNome}</p>}
				<div className="mt-2 border-t border-dashed border-gray-400 pt-2">
					{dados.itens.map((item) => (
						<div key={item.variacao_id} className="mb-1 flex justify-between">
							<span>
								{item.quantidade}x {item.nome}
							</span>
							<span>
								{formatarMoeda(item.preco_unitario * item.quantidade)}
							</span>
						</div>
					))}
				</div>
				<div className="mt-2 space-y-0.5 border-t border-dashed border-gray-400 pt-2">
					{dados.desconto > 0 && (
						<>
							<div className="flex justify-between">
								<span>Subtotal</span>
								<span>{formatarMoeda(dados.subtotal)}</span>
							</div>
							<div className="flex justify-between">
								<span>Desconto</span>
								<span>{formatarMoeda(dados.desconto)}</span>
							</div>
						</>
					)}
					<div className="flex justify-between text-sm font-bold">
						<span>TOTAL</span>
						<span>{formatarMoeda(dados.total)}</span>
					</div>
					{troco !== null && (
						<>
							<div className="flex justify-between">
								<span>Recebido</span>
								<span>{formatarMoeda(dados.valorRecebido)}</span>
							</div>
							<div className="flex justify-between">
								<span>Troco</span>
								<span>{formatarMoeda(troco)}</span>
							</div>
						</>
					)}
				</div>
				<p className="mt-3 text-center">Obrigado pela preferência!</p>
			</div>

			<div className="mt-4 flex gap-2">
				<Button
					variant="outline"
					onClick={() => window.print()}
					className="flex-1"
				>
					Imprimir
				</Button>
				<Button onClick={onClose} className="flex-1">
					Fechar
				</Button>
			</div>
		</Modal>
	);
}
