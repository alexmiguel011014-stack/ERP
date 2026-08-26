"use client";
import { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import { erpApi } from "@/lib/erpApi";

export default function ProdutoImagemPicker({
	produtoId,
	imagem,
	onErro,
	onSucesso,
}: {
	produtoId: number | null;
	imagem: string | null;
	onErro: (texto: string) => void;
	onSucesso: (texto: string) => void;
}) {
	const [dataUrl, setDataUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!imagem) {
			setDataUrl(null);
			return;
		}
		erpApi.produtos
			.imagem(imagem)
			.then(setDataUrl)
			.catch(() => setDataUrl(null));
	}, [imagem]);

	async function escolherImagem() {
		if (!produtoId) {
			onErro("Salve o produto antes de adicionar uma imagem.");
			return;
		}
		try {
			const r = await erpApi.produtos.escolherImagem(produtoId);
			if (r && r.cancelado) return;
			if (r && r.success) {
				onSucesso("Imagem atualizada!");
				if (r.imagem) {
					const url = await erpApi.produtos.imagem(r.imagem);
					setDataUrl(url);
				}
			}
		} catch (e) {
			onErro(
				"Erro ao definir imagem: " +
					(e instanceof Error ? e.message : String(e)),
			);
		}
	}

	async function removerImagem() {
		if (!produtoId) return;
		if (!confirm("Remover a imagem deste produto?")) return;
		try {
			await erpApi.produtos.removerImagem(produtoId);
			onSucesso("Imagem removida.");
			setDataUrl(null);
		} catch (e) {
			onErro("Erro: " + (e instanceof Error ? e.message : String(e)));
		}
	}

	if (!produtoId) return null;

	return (
		<div>
			<label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
				Imagem do produto
			</label>
			<div className="flex items-center gap-3">
				<div
					className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 bg-cover bg-center text-xs text-gray-400 dark:border-gray-800 dark:bg-white/5"
					style={dataUrl ? { backgroundImage: `url('${dataUrl}')` } : undefined}
				>
					{!dataUrl && "Sem imagem"}
				</div>
				<div className="flex flex-col gap-2">
					<Button
						size="sm"
						variant="outline"
						type="button"
						onClick={escolherImagem}
					>
						Escolher imagem...
					</Button>
					{dataUrl && (
						<button
							type="button"
							onClick={removerImagem}
							className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-semibold text-error-600 hover:bg-error-100 dark:bg-error-500/10 dark:text-error-400"
						>
							Remover imagem
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
