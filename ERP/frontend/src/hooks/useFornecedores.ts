"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type Fornecedor } from "@/lib/erpApi";

export function useFornecedores() {
	const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const recarregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			const lista = await erpApi.fornecedores.listar();
			setFornecedores(lista);
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, []);

	useEffect(() => {
		recarregar();
	}, [recarregar]);

	return { fornecedores, carregando, erro, recarregar };
}
