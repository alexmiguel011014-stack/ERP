"use client";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { formatarMoeda } from "./formatos";
import type { ItemCarrinho } from "@/hooks/useCarrinho";
import type { ParcelaVenda } from "@/lib/erpApi";

export type DadosRecibo = {
	vendaId: number;
	itens: ItemCarrinho[];
	subtotal: number;
	desconto: number;
	total: number;
	formaPagamento: string;
	condicaoNome: string | null;
	parcelas: ParcelaVenda[];
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
				{dados.condicaoNome && <p>Condição: {dados.condicaoNome}</p>}
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
				{dados.parcelas.length > 1 && (
					<div className="mt-2 border-t border-dashed border-gray-400 pt-2">
						<p className="font-bold">Parcelamento</p>
						{dados.parcelas.map((parcela) => (
							<p key={parcela.numero}>
								{parcela.numero}/{dados.parcelas.length}: {formatarMoeda(parcela.valor)}
								{dados.formaPagamento === "Fiado" && parcela.vencimento
									? ` — vence ${new Date(`${parcela.vencimento}T12:00:00`).toLocaleDateString("pt-BR")}`
									: ""}
							</p>
						))}
						{dados.formaPagamento === "Cartão" && (
							<p className="mt-1">
								Parcelas registradas no cartão; não há agenda de recebimento do cliente.
							</p>
						)}
					</div>
				)}
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
