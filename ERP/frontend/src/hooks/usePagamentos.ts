"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type Pagamento } from "@/lib/erpApi";

export function usePagamentos() {
	const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const recarregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			setPagamentos(await erpApi.pagamentos.listar());
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, []);

	useEffect(() => {
		recarregar();
	}, [recarregar]);

	return { pagamentos, carregando, erro, recarregar };
}
