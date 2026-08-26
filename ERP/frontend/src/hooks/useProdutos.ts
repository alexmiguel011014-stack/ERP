"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type ProdutoDetalhado } from "@/lib/erpApi";

export function useProdutos(incluirInativos: boolean) {
	const [produtos, setProdutos] = useState<ProdutoDetalhado[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const recarregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			const dados = await erpApi.produtos.detalhados(incluirInativos);
			setProdutos(
				incluirInativos ? dados.filter((p) => Number(p.ativo) === 0) : dados,
			);
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, [incluirInativos]);

	useEffect(() => {
		recarregar();
	}, [recarregar]);

	return { produtos, carregando, erro, recarregar };
}
