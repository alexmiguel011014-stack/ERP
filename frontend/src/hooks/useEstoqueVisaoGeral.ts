"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { erpApi, type EstoqueVisaoGeralLinha } from "@/lib/erpApi";

export function useEstoqueVisaoGeral() {
	const [linhas, setLinhas] = useState<EstoqueVisaoGeralLinha[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);
	const requestId = useRef(0);

	const recarregar = useCallback(async () => {
		const atual = ++requestId.current;
		setCarregando(true);
		setErro(null);
		try {
			const resultado = await erpApi.estoque.visaoGeral();
			if (atual !== requestId.current) return "superseded" as const;
			setLinhas(resultado);
			return "success" as const;
		} catch (e) {
			if (atual !== requestId.current) return "superseded" as const;
			setErro(e instanceof Error ? e.message : String(e));
			return "error" as const;
		} finally {
			if (atual === requestId.current) setCarregando(false);
		}
	}, []);

	useEffect(() => {
		recarregar();
	}, [recarregar]);

	return { linhas, carregando, erro, recarregar };
}
