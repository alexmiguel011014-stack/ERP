"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type Cliente } from "@/lib/erpApi";

export function useClientes() {
	const [clientes, setClientes] = useState<Cliente[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const recarregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			const lista = await erpApi.clientes.listar();
			setClientes(lista);
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, []);

	useEffect(() => {
		recarregar();
	}, [recarregar]);

	return { clientes, carregando, erro, recarregar };
}
