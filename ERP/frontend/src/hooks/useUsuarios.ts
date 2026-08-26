"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type Usuario } from "@/lib/erpApi";

export function useUsuarios() {
	const [usuarios, setUsuarios] = useState<Usuario[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const recarregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			const lista = await erpApi.usuarios.listar();
			setUsuarios(lista);
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, []);

	useEffect(() => {
		recarregar();
	}, [recarregar]);

	return { usuarios, carregando, erro, recarregar };
}
