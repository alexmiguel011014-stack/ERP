"use client";
import { useCallback, useEffect, useState } from "react";
import {
	erpApi,
	type FiltroLancamentos,
	type Lancamento,
} from "@/lib/erpApi";

export function useLancamentos(
	tipo: "receber" | "pagar" | null,
	refreshKey = 0,
	filtros: Omit<FiltroLancamentos, "tipo"> = {},
) {
	const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);
	const { status, categoria, dataInicio, dataFim } = filtros;

	const recarregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			setLancamentos(
				await erpApi.financeiro.lancamentos({
					...(tipo ? { tipo } : {}),
					status,
					categoria,
					dataInicio,
					dataFim,
				}),
			);
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, [tipo, status, categoria, dataInicio, dataFim]);

	useEffect(() => {
		recarregar();
	}, [recarregar, refreshKey]);

	return { lancamentos, carregando, erro, recarregar };
}
