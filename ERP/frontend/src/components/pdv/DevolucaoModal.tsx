"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Input from "@/components/form/input/InputField";
import { erpApi, type ItemVenda } from "@/lib/erpApi";
import { formatarAtributos } from "@/lib/utils/formatos";
import { formatarMoeda } from "./formatos";

export default function DevolucaoModal({
	isOpen,
	onClose,
	onDevolucaoRegistrada,
}: {
	isOpen: boolean;
	onClose: () => void;
	onDevolucaoRegistrada: (valorTotal: number) => void;
}) {
	const [vendaIdBusca, setVendaIdBusca] = useState("");
	const [itens, setItens] = useState<ItemVenda[]>([]);
	const [vendaEncontrada, setVendaEncontrada] = useState<number | null>(null);
	const [quantidades, setQuantidades] = useState<Record<number, number>>({});
	const [buscando, setBuscando] = useState(false);
	const [processando, setProcessando] = useState(false);
	const [erro, setErro] = useState<string | null>(null);

	function fechar() {
		setVendaIdBusca("");
		setItens([]);
		setVendaEncontrada(null);
		setQuantidades({});
		setErro(null);
		onClose();
	}

	async function buscar() {
		const vendaId = Number(vendaIdBusca);
		if (!Number.isInteger(vendaId) || vendaId <= 0) {
			setErro("Informe um número de venda válido.");
			return;
		}
		setBuscando(true);
		setErro(null);
		try {
			const resultado = await erpApi.vendas.itens(vendaId);
			if (resultado.length === 0) {
				setErro("Venda não encontrada ou sem itens.");
				setItens([]);
				setVendaEncontrada(null);
				return;
			}
			setItens(resultado);
			setVendaEncontrada(vendaId);
			setQuantidades({});
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setBuscando(false);
		}
	}

	function setQuantidade(itemId: number, valor: number, max: number) {
		setQuantidades((atual) => ({
			...atual,
			[itemId]: Math.max(0, Math.min(max, valor)),
		}));
	}

	async function confirmar() {
		if (!vendaEncontrada) return;
		const itensParaDevolver = Object.entries(quantidades)
			.filter(([, qtd]) => qtd > 0)
			.map(([itemId, qtd]) => ({
				item_venda_id: Number(itemId),
				quantidade: qtd,
			}));
		if (itensParaDevolver.length === 0) {
			setErro("Informe a quantidade de ao menos um item para devolver.");
			return;
		}
		if (
			!confirm(
				"Confirmar devolução? O estoque dos itens selecionados será estornado.",
			)
		)
			return;
		setProcessando(true);
		setErro(null);
		try {
			const resultado = await erpApi.vendas.registrarDevolucao({
				venda_id: vendaEncontrada,
				itens: itensParaDevolver,
			});
			onDevolucaoRegistrada(resultado.valorTotal);
			fechar();
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setProcessando(false);
		}
	}

	return (
		<Modal isOpen={isOpen} onClose={fechar} className="max-w-lg p-6">
			<h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
				Devolução / Troca
			</h2>

			<div className="mt-3 flex gap-2">
				<Input
					type="number"
					value={vendaIdBusca}
					onChange={(e) => setVendaIdBusca(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && buscar()}
					placeholder="Nº da venda"
				/>
				<Button onClick={buscar} disabled={buscando}>
					{buscando ? "Buscando..." : "Buscar"}
				</Button>
			</div>

			{erro && (
				<div className="mt-3 rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
					{erro}
				</div>
			)}

			{itens.length > 0 && (
				<div className="mt-4 space-y-2">
					{itens.map((item) => {
						const disponivel = item.quantidade - item.quantidade_devolvida;
						return (
							<div
								key={item.id}
								className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-2.5 text-sm dark:border-gray-800"
							>
								<div className="min-w-0">
									<div className="truncate font-medium text-gray-800 dark:text-white/90">
										{item.produto_nome}
									</div>
									<div className="truncate text-xs text-gray-400">
										{formatarAtributos(item.atributos, item.tamanho, item.cor)}{" "}
										· {formatarMoeda(item.preco_unitario)} · disponível para
										devolver: {disponivel}
									</div>
								</div>
								<input
									type="number"
									min={0}
									max={disponivel}
									disabled={disponivel <= 0}
									value={quantidades[item.id] || 0}
									onChange={(e) =>
										setQuantidade(item.id, Number(e.target.value), disponivel)
									}
									className="h-9 w-20 shrink-0 rounded-lg border border-gray-300 bg-transparent px-2 text-center text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
								/>
							</div>
						);
					})}
					<Button onClick={confirmar} disabled={processando} className="w-full">
						{processando ? "Confirmando..." : "Confirmar Devolução"}
					</Button>
				</div>
			)}
		</Modal>
	);
}
