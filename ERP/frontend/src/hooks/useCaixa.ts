"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type CaixaAberto, type ResumoCaixa } from "@/lib/erpApi";

export function useCaixa() {
	const [caixa, setCaixa] = useState<CaixaAberto | null>(null);
	const [resumo, setResumo] = useState<ResumoCaixa | null>(null);
	const [carregando, setCarregando] = useState(true);

	const recarregar = useCallback(async () => {
		try {
			const atual = await erpApi.caixa.aberto();
			setCaixa(atual);
		} catch {
			setCaixa(null);
		} finally {
			setCarregando(false);
		}
	}, []);

	const carregarResumo = useCallback(async () => {
		try {
			setResumo(await erpApi.caixa.resumo());
		} catch {
			setResumo(null);
		}
	}, []);

	useEffect(() => {
		recarregar();
	}, [recarregar]);

	async function abrir(valor: number) {
		await erpApi.caixa.abrir(valor);
		await recarregar();
	}

	async function fechar(valor: number, observacao: string | null) {
		const resultado = await erpApi.caixa.fechar(valor, observacao);
		await recarregar();
		return resultado;
	}

	return {
		caixa,
		resumo,
		carregando,
		aberto: !!caixa,
		recarregar,
		carregarResumo,
		abrir,
		fechar,
	};
}
