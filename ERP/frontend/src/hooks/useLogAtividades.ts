"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type LogAtividade } from "@/lib/erpApi";

export function useLogAtividades(usuarioId: number | null, acao: string) {
	const [linhas, setLinhas] = useState<LogAtividade[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const recarregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			const lista = await erpApi.banco.logAtividades({
				usuarioId: usuarioId ?? undefined,
				acao: acao || undefined,
			});
			setLinhas(lista);
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, [usuarioId, acao]);

	useEffect(() => {
		recarregar();
	}, [recarregar]);

	return { linhas, carregando, erro, recarregar };
}
