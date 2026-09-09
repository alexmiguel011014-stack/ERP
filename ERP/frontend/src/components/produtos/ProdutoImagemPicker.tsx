"use client";
import Button from "@/components/ui/button/Button";
import { erpApi } from "@/lib/erpApi";
import { useImagemProduto } from "@/hooks/useImagemProduto";

export type ImagemPendente = { caminho: string; dataUrl: string };

export default function ProdutoImagemPicker({
	produtoId,
	imagem,
	pendente,
	onErro,
	onSucesso,
	onPendenteEscolhida,
	onPendenteRemovida,
}: {
	produtoId: number | null;
	imagem: string | null;
	pendente?: ImagemPendente | null;
	onErro: (texto: string) => void;
	onSucesso: (texto: string) => void;
	onPendenteEscolhida?: (info: ImagemPendente) => void;
	onPendenteRemovida?: () => void;
}) {
	const [dataUrl, setDataUrl] = useImagemProduto(produtoId, imagem);

	async function escolherImagem() {
		// Produto ainda não salvo: só abre o diálogo e guarda o caminho/preview
		// no formulário — a gravação real acontece em ProdutoFormPanel depois
		// que o produto ganhar um id (ver salvarImagemCaminho).
		if (!produtoId) {
			try {
				const r = await erpApi.produtos.escolherImagemPendente();
				if (r.cancelado) return;
				onPendenteEscolhida?.({ caminho: r.caminho, dataUrl: r.dataUrl });
			} catch (e) {
				onErro(
					"Erro ao escolher imagem: " +
						(e instanceof Error ? e.message : String(e)),
				);
			}
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
		if (!produtoId) {
			onPendenteRemovida?.();
			return;
		}
		if (!confirm("Remover a imagem deste produto?")) return;
		try {
			await erpApi.produtos.removerImagem(produtoId);
			onSucesso("Imagem removida.");
			setDataUrl(null);
		} catch (e) {
			onErro("Erro: " + (e instanceof Error ? e.message : String(e)));
		}
	}

	const preview = produtoId ? dataUrl : (pendente?.dataUrl ?? null);

	return (
		<div>
			<label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
				Imagem do produto
			</label>
			<div className="flex items-center gap-3">
				<div
					className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 bg-cover bg-center text-xs text-gray-400 dark:border-gray-800 dark:bg-white/5"
					style={preview ? { backgroundImage: `url('${preview}')` } : undefined}
				>
					{!preview && "Sem imagem"}
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
					{preview && (
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
			{!produtoId && (
				<p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
					A imagem é salva junto quando você clicar em &quot;Salvar
					Produto&quot;.
				</p>
			)}
		</div>
	);
}
