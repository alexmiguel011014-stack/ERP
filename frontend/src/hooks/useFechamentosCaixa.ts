"use client";
import { useCallback, useEffect, useState } from "react";
import {
	erpApi,
	type CaixaAberto,
	type FechamentoCaixa,
	type ResumoCaixa,
} from "@/lib/erpApi";

export function useFechamentosCaixa(refreshKey = 0) {
	const [fechamentos, setFechamentos] = useState<FechamentoCaixa[]>([]);
	const [caixaAberto, setCaixaAberto] = useState<CaixaAberto | null>(null);
	const [resumo, setResumo] = useState<ResumoCaixa | null>(null);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const recarregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			const [historico, aberto, resumoAtual] = await Promise.all([
				erpApi.caixa.historico(100),
				erpApi.caixa.aberto(),
				erpApi.caixa.resumo(),
			]);
			setFechamentos(historico);
			setCaixaAberto(aberto);
			setResumo(resumoAtual);
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, []);

	useEffect(() => {
		recarregar();
	}, [recarregar, refreshKey]);

	return { fechamentos, caixaAberto, resumo, carregando, erro, recarregar };
}
