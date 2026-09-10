"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type MovimentacaoEstoque } from "@/lib/erpApi";

export function useMovimentacoesEstoque() {
	const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEstoque[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const recarregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			setMovimentacoes(await erpApi.estoque.movimentacoes(30));
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, []);

	useEffect(() => {
		recarregar();
	}, [recarregar]);

	return { movimentacoes, carregando, erro, recarregar };
}
