"use client";
import { useEffect, useState } from "react";
import { erpApi } from "@/lib/erpApi";

// Busca a imagem de um produto (arquivo → data URL) sob demanda. Extraído de
// ProdutoImagemPicker pra ser reaproveitado também na miniatura da Lista de
// Produtos, sem duplicar o fetch-e-cache em dois lugares.
export function useImagemProduto(
	produtoId: number | null,
	imagem: string | null,
) {
	const [dataUrl, setDataUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!produtoId || !imagem) {
			setDataUrl(null);
			return;
		}
		let cancelado = false;
		erpApi.produtos
			.imagem(imagem)
			.then((url) => {
				if (!cancelado) setDataUrl(url);
			})
			.catch(() => {
				if (!cancelado) setDataUrl(null);
			});
		return () => {
			cancelado = true;
		};
	}, [produtoId, imagem]);

	return [dataUrl, setDataUrl] as const;
}
