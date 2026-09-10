"use client";
import { useEffect, useState } from "react";
import { erpApi } from "@/lib/erpApi";

// Resolve um nome de arquivo de imagem de produto (ex: vindo de
// buscarProdutosPorTermo/Produtos.imagem) pra uma data URL exibível. Nunca
// use `<img src={nomeDoArquivo}>` direto — o arquivo fica fora da raiz
// servível do app (só acessível via IPC getImagemProduto), então o browser
// nunca consegue carregar o caminho cru.
export function useImagemArquivo(nomeArquivo: string | null | undefined) {
	const [dataUrl, setDataUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!nomeArquivo) {
			setDataUrl(null);
			return;
		}
		let cancelado = false;
		erpApi.produtos
			.imagem(nomeArquivo)
			.then((url) => {
				if (!cancelado) setDataUrl(url);
			})
			.catch(() => {
				if (!cancelado) setDataUrl(null);
			});
		return () => {
			cancelado = true;
		};
	}, [nomeArquivo]);

	return dataUrl;
}
