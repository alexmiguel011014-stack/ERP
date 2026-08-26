"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type FechamentoCaixa } from "@/lib/erpApi";

export function useFechamentosCaixa() {
	const [fechamentos, setFechamentos] = useState<FechamentoCaixa[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const recarregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			setFechamentos(await erpApi.caixa.historico(100));
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, []);

	useEffect(() => {
		recarregar();
	}, [recarregar]);

	return { fechamentos, carregando, erro, recarregar };
}
