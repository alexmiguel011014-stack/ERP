"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type Lancamento } from "@/lib/erpApi";

export function useLancamentos(tipo: "receber" | "pagar") {
	const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const recarregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			setLancamentos(await erpApi.financeiro.lancamentos({ tipo }));
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, [tipo]);

	useEffect(() => {
		recarregar();
	}, [recarregar]);

	return { lancamentos, carregando, erro, recarregar };
}
