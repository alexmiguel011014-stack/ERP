"use client";
import { useState } from "react";
import { TrashBinIcon } from "@/icons";
import { formatarMoeda } from "./formatos";
import { useImagemArquivo } from "@/hooks/useImagemArquivo";
import type { ItemCarrinho } from "@/hooks/useCarrinho";

function ImagemItemCarrinho({ nomeArquivo }: { nomeArquivo: string | null }) {
	const dataUrl = useImagemArquivo(nomeArquivo);
	if (!dataUrl) {
		return (
			<div className="size-14 shrink-0 rounded-md bg-gray-100 dark:bg-white/5" />
		);
	}
	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img
			src={dataUrl}
			alt=""
			className="size-14 shrink-0 rounded-md object-cover"
		/>
	);
}

export default function Carrinho({
	itens,
	onAumentar,
	onDiminuir,
	onRemover,
}: {
	itens: ItemCarrinho[];
	onAumentar: (variacaoId: number) => void;
	onDiminuir: (variacaoId: number) => void;
	onRemover: (variacaoId: number) => void;
}) {
	const [aberto, setAberto] = useState<number | null>(null);

	if (itens.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400 dark:border-gray-800">
				Carrinho vazio. Escaneie ou busque um produto para começar.
			</div>
		);
	}

	return (
		<div className="flex-1 space-y-2 overflow-y-auto">
			{itens.map((item) => {
				const expandido = aberto === item.variacao_id;
				return (
					<div
						key={item.variacao_id}
						className="rounded-lg border border-gray-200 dark:border-gray-800"
					>
						<button
							type="button"
							onClick={() => setAberto(expandido ? null : item.variacao_id)}
							className="flex w-full items-center gap-3 p-2.5 text-left"
						>
							<ImagemItemCarrinho nomeArquivo={item.imagem} />
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
									{item.nome}
								</div>
								<div className="truncate text-xs text-gray-400">
									{item.quantidade}x {formatarMoeda(item.preco_unitario)}
								</div>
							</div>
							<div className="shrink-0 font-semibold text-gray-800 dark:text-white/90">
								{formatarMoeda(item.preco_unitario * item.quantidade)}
							</div>
						</button>
						{expandido && (
							<div className="flex items-center justify-between gap-3 border-t border-gray-100 px-2.5 py-2 dark:border-gray-800">
								<span className="text-xs text-gray-400">{item.detalhes}</span>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => onDiminuir(item.variacao_id)}
										className="flex size-7 items-center justify-center rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-300"
									>
										−
									</button>
									<span className="w-6 text-center text-sm">
										{item.quantidade}
									</span>
									<button
										type="button"
										onClick={() => onAumentar(item.variacao_id)}
										disabled={item.quantidade >= item.estoque}
										className="flex size-7 items-center justify-center rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 dark:bg-white/5 dark:text-gray-300"
									>
										+
									</button>
									<button
										type="button"
										onClick={() => onRemover(item.variacao_id)}
										className="ml-2 flex size-7 items-center justify-center rounded-md bg-error-50 text-error-600 hover:bg-error-100 dark:bg-error-500/10 dark:text-error-400"
									>
										<TrashBinIcon className="size-4" />
									</button>
								</div>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
