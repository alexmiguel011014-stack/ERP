"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type CategoriaComUso } from "@/lib/erpApi";

// incluirInativas=false (default) é o que toda tela de SELEÇÃO quer (não
// faz sentido deixar escolher uma categoria já inativada num produto novo)
// — só a própria tela de gestão de categorias passa true, pra poder mostrar/
// reativar o que foi inativado.
export function useCategorias(incluirInativas = false) {
	const [categorias, setCategorias] = useState<CategoriaComUso[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const recarregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			setCategorias(await erpApi.categorias.comUso(incluirInativas));
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, [incluirInativas]);

	useEffect(() => {
		recarregar();
	}, [recarregar]);

	return { categorias, carregando, erro, recarregar };
}
