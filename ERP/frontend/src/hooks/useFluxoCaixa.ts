"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type FluxoCaixa, type ProvisaoDAS } from "@/lib/erpApi";

export function useFluxoCaixa() {
	const [inicio, setInicio] = useState("");
	const [fim, setFim] = useState("");
	const [fluxo, setFluxo] = useState<FluxoCaixa | null>(null);
	const [aliquota, setAliquota] = useState<number | null>(null);
	const [provisao, setProvisao] = useState<ProvisaoDAS | null>(null);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);
	const [erroDAS, setErroDAS] = useState<string | null>(null);

	const carregarFluxo = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			setFluxo(await erpApi.financeiro.fluxoCaixa(inicio || null, fim || null));
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, [inicio, fim]);

	const carregarDAS = useCallback(async () => {
		setErroDAS(null);
		try {
			const [aliquotaAtual, provisaoAtual] = await Promise.all([
				erpApi.financeiro.aliquotaDAS(),
				erpApi.financeiro.provisaoDAS(inicio || null, fim || null),
			]);
			setAliquota(aliquotaAtual);
			setProvisao(provisaoAtual);
		} catch (e) {
			setErroDAS(e instanceof Error ? e.message : String(e));
		}
	}, [inicio, fim]);

	useEffect(() => {
		carregarFluxo();
		carregarDAS();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function filtrar() {
		carregarFluxo();
		carregarDAS();
	}

	async function salvarAliquota(valor: number) {
		await erpApi.financeiro.salvarAliquotaDAS(valor);
		await carregarDAS();
	}

	return {
		inicio,
		setInicio,
		fim,
		setFim,
		fluxo,
		aliquota,
		provisao,
		carregando,
		erro,
		erroDAS,
		filtrar,
		salvarAliquota,
	};
}
