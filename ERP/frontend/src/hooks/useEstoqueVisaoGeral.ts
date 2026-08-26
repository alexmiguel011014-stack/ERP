"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type EstoqueVisaoGeralLinha } from "@/lib/erpApi";

export function useEstoqueVisaoGeral() {
	const [linhas, setLinhas] = useState<EstoqueVisaoGeralLinha[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const recarregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			setLinhas(await erpApi.estoque.visaoGeral());
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, []);

	useEffect(() => {
		recarregar();
	}, [recarregar]);

	return { linhas, carregando, erro, recarregar };
}
