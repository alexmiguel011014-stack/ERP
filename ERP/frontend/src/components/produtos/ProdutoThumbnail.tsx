"use client";
import { useImagemProduto } from "@/hooks/useImagemProduto";

export default function ProdutoThumbnail({
	produtoId,
	imagem,
}: {
	produtoId: number;
	imagem: string | null;
}) {
	const [dataUrl] = useImagemProduto(produtoId, imagem);

	return (
		<div
			className="h-8 w-8 shrink-0 rounded-md border border-gray-200 bg-gray-50 bg-cover bg-center dark:border-gray-800 dark:bg-white/5"
			style={dataUrl ? { backgroundImage: `url('${dataUrl}')` } : undefined}
		/>
	);
}
