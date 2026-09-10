"use client";
import { useEffect, useState } from "react";
import { erpApi } from "@/lib/erpApi";

// Mesma razão de useImagemArquivo.ts: o arquivo fica fora da raiz servível do
// app (só acessível via IPC getFotoUsuario), então o browser nunca consegue
// carregar o caminho cru — sempre resolver pra uma data URL antes de exibir.
export function useFotoUsuario(nomeArquivo: string | null | undefined) {
	const [dataUrl, setDataUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!nomeArquivo) {
			setDataUrl(null);
			return;
		}
		let cancelado = false;
		erpApi.usuarios
			.foto(nomeArquivo)
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
