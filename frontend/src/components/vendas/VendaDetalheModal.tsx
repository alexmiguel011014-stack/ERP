"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Badge from "@/components/ui/badge/Badge";
import { formatarAtributos } from "@/lib/utils/formatos";
import { exportarVendaDetalhePdf } from "@/lib/utils/vendasExport";
import { formatarData, formatarMoeda } from "./formatos";
import type { ItemVenda, ParcelaVenda, Venda } from "@/lib/erpApi";

const OPCOES_NOTA = [
	{ value: "nao_emitida", label: "Não emitida" },
	{ value: "emitida_externa", label: "Emitida (externa)" },
	{ value: "emitida_erp", label: "Emitida (ERP)" },
	{ value: "erro", label: "Erro" },
	{ value: "cancelada", label: "Cancelada" },
];

const BADGE_POR_STATUS = {
	finalizada: "success",
	orcamento: "warning",
	cancelado: "light",
} as const;

export default function VendaDetalheModal({
	venda,
	itens,
	parcelas,
	carregandoItens,
	carregandoParcelas = false,
	onClose,
	onConverter,
	onAtualizarNotaFiscal,
}: {
	venda: Venda | null;
	itens: ItemVenda[] | undefined;
	parcelas?: ParcelaVenda[];
	carregandoItens: boolean;
	carregandoParcelas?: boolean;
	onClose: () => void;
	onConverter: (vendaId: number) => Promise<void>;
	onAtualizarNotaFiscal: (
		vendaId: number,
		dados: { status: string; numero: string | null },
	) => Promise<void>;
}) {
	const [notaStatus, setNotaStatus] = useState("nao_emitida");
	const [notaNumero, setNotaNumero] = useState("");
	const [salvandoNota, setSalvandoNota] = useState(false);
	const [convertendo, setConvertendo] = useState(false);

	useEffect(() => {
		setNotaStatus(venda?.nota_status || "nao_emitida");
		setNotaNumero(venda?.nota_numero || "");
	}, [venda]);

	if (!venda) return null;

	const subtotal = (itens || []).reduce((soma, i) => soma + i.subtotal, 0);

	async function salvarNota() {
		if (!venda) return;
		setSalvandoNota(true);
		try {
			await onAtualizarNotaFiscal(venda.id, {
				status: notaStatus,
				numero: notaNumero.trim() || null,
			});
		} finally {
			setSalvandoNota(false);
		}
	}

	async function converter() {
		if (!venda) return;
		if (!confirm(`Converter o orçamento #${venda.id} em venda finalizada?`))
			return;
		setConvertendo(true);
		try {
			await onConverter(venda.id);
			onClose();
		} finally {
			setConvertendo(false);
		}
	}

	return (
		<Modal isOpen={!!venda} onClose={onClose} className="max-w-[700px] p-6">
			<div id="print-area">
				<div className="flex items-center gap-2">
					<h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
						{venda.status === "orcamento" ? "Orçamento" : "Venda"} #{venda.id}
					</h2>
					<Badge color={BADGE_POR_STATUS[venda.status]}>{venda.status}</Badge>
				</div>
				<div className="mt-3 grid grid-cols-2 gap-2 text-sm">
					<p className="text-gray-500 dark:text-gray-400">
						Data:{" "}
						<span className="text-gray-800 dark:text-white/90">
							{formatarData(venda.data_venda)}
						</span>
					</p>
					<p className="text-gray-500 dark:text-gray-400">
						Pagamento:{" "}
						<span className="text-gray-800 dark:text-white/90">
							{venda.forma_pagamento || "---"}
						</span>
					</p>
					<p className="col-span-2 text-gray-500 dark:text-gray-400">
						Cliente:{" "}
						<span className="text-gray-800 dark:text-white/90">
							{venda.cliente_nome || "Não informado"}
						</span>
					</p>
					{venda.condicao_parcelamento_nome && (
						<p className="col-span-2 text-gray-500 dark:text-gray-400">
							Parcelamento: {" "}
							<span className="text-gray-800 dark:text-white/90">
								{venda.condicao_parcelamento_nome}
								{venda.acrescimo_parcelamento
									? ` (+${Number(venda.acrescimo_parcelamento).toFixed(2)}%)`
									: ""}
							</span>
						</p>
					)}
					{venda.forma_pagamento === "Fiado" &&
						venda.data_primeiro_vencimento && (
							<p className="col-span-2 text-gray-500 dark:text-gray-400">
								Primeiro vencimento: {" "}
								<span className="text-gray-800 dark:text-white/90">
									{formatarData(venda.data_primeiro_vencimento)}
								</span>
							</p>
						)}
					{venda.observacao && (
						<p className="col-span-2 text-gray-500 dark:text-gray-400">
							Observação:{" "}
							<span className="text-gray-800 dark:text-white/90">
								{venda.observacao}
							</span>
						</p>
					)}
				</div>

				{venda.forma_pagamento === "Fiado" && (
					<div className="mt-4 rounded-lg border border-gray-100 p-3 text-sm dark:border-gray-800">
						<p className="font-semibold text-gray-800 dark:text-white/90">
							Parcelas a receber
						</p>
						{carregandoParcelas ? (
							<p className="mt-2 text-gray-500">Carregando parcelas...</p>
						) : parcelas && parcelas.length > 0 ? (
							<div className="mt-2 space-y-1 text-gray-600 dark:text-gray-300">
								{parcelas.map((parcela) => (
									<p key={parcela.id || parcela.numero}>
										{parcela.numero}/{parcela.total || venda.parcelas}: {" "}
										{formatarMoeda(parcela.valor)} — {formatarData(parcela.vencimento)}
										{parcela.status ? ` (${parcela.status})` : ""}
									</p>
								))}
							</div>
						) : (
							<p className="mt-2 text-gray-500">Sem parcelas em aberto.</p>
						)}
					</div>
				)}

				<div className="mt-4 overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-gray-100 dark:border-gray-800">
								<th className="px-2 py-2 text-xs font-medium uppercase text-gray-400">
									Produto
								</th>
								<th className="px-2 py-2 text-center text-xs font-medium uppercase text-gray-400">
									Qtd
								</th>
								<th className="px-2 py-2 text-right text-xs font-medium uppercase text-gray-400">
									Preço
								</th>
								<th className="px-2 py-2 text-right text-xs font-medium uppercase text-gray-400">
									Subtotal
								</th>
							</tr>
						</thead>
						<tbody>
							{carregandoItens ? (
								<tr>
									<td
										colSpan={4}
										className="px-2 py-6 text-center text-sm text-gray-400"
									>
										Carregando itens...
									</td>
								</tr>
							) : !itens || itens.length === 0 ? (
								<tr>
									<td
										colSpan={4}
										className="px-2 py-6 text-center text-sm text-gray-400"
									>
										Nenhum item encontrado.
									</td>
								</tr>
							) : (
								itens.map((item) => (
									<tr
										key={item.id}
										className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
									>
										<td className="px-2 py-2">
											<div className="font-medium text-gray-800 dark:text-white/90">
												{item.produto_nome}
											</div>
											<div className="text-xs text-gray-400">
												{formatarAtributos(
													item.atributos,
													item.tamanho,
													item.cor,
												)}
												{item.quantidade_devolvida > 0 &&
													` · ${item.quantidade_devolvida} devolvida(s)`}
											</div>
										</td>
										<td className="px-2 py-2 text-center">{item.quantidade}</td>
										<td className="px-2 py-2 text-right">
											{formatarMoeda(item.preco_unitario)}
										</td>
										<td className="px-2 py-2 text-right">
											{formatarMoeda(item.subtotal)}
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>

				<div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-right text-sm dark:border-gray-800">
					<p className="text-gray-500 dark:text-gray-400">
						Subtotal: {formatarMoeda(subtotal)}
					</p>
					<p className="text-gray-500 dark:text-gray-400">
						Desconto: {formatarMoeda(venda.desconto)}
					</p>
					<p className="text-base font-semibold text-gray-800 dark:text-white/90">
						Total: {formatarMoeda(venda.total)}
					</p>
				</div>
			</div>

			<div className="mt-4 space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">
				<div>
					<Label>Nota Fiscal</Label>
					<div className="flex flex-wrap gap-2">
						<select
							value={notaStatus}
							onChange={(e) => setNotaStatus(e.target.value)}
							className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
						>
							{OPCOES_NOTA.map((o) => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</select>
						<Input
							value={notaNumero}
							onChange={(e) => setNotaNumero(e.target.value)}
							placeholder="Número da nota (opcional)"
							className="max-w-[220px]"
						/>
						<Button
							size="sm"
							variant="outline"
							onClick={salvarNota}
							disabled={salvandoNota}
						>
							{salvandoNota ? "Salvando..." : "Salvar"}
						</Button>
					</div>
				</div>

				<div className="flex flex-wrap gap-2">
					<Button variant="outline" onClick={() => window.print()}>
						Imprimir
					</Button>
					<Button
						variant="outline"
						onClick={() => exportarVendaDetalhePdf(venda, itens || [])}
					>
						PDF
					</Button>
					{venda.status === "orcamento" && (
						<Button onClick={converter} disabled={convertendo}>
							{convertendo ? "Convertendo..." : "Converter em Venda"}
						</Button>
					)}
					<Button variant="outline" onClick={onClose}>
						Fechar
					</Button>
				</div>
			</div>
		</Modal>
	);
}
