"use client";
import { useCallback, useEffect, useState } from "react";
import {
	erpApi,
	type ComissaoLinha,
	type CurvaAbcLinha,
	type DreResultado,
	type GiroEstoqueLinha,
	type MargemContribuicaoResultado,
	type PontoDeEquilibrioResultado,
	type RelatorioVendasResultado,
} from "@/lib/erpApi";

export function useRelatorios() {
	const [dataInicio, setDataInicio] = useState("");
	const [dataFim, setDataFim] = useState("");

	const [vendasPeriodo, setVendasPeriodo] =
		useState<RelatorioVendasResultado | null>(null);
	const [curvaAbc, setCurvaAbc] = useState<CurvaAbcLinha[]>([]);
	const [comissoes, setComissoes] = useState<ComissaoLinha[]>([]);
	const [dre, setDre] = useState<DreResultado | null>(null);
	const [margemContribuicao, setMargemContribuicao] =
		useState<MargemContribuicaoResultado | null>(null);
	const [pontoDeEquilibrio, setPontoDeEquilibrio] =
		useState<PontoDeEquilibrioResultado | null>(null);
	const [giroEstoque, setGiroEstoque] = useState<GiroEstoqueLinha[]>([]);

	const [carregando, setCarregando] = useState(true);
	const [erros, setErros] = useState<Record<string, string>>({});

	// Cada seção falha independente das outras — a vanilla também não deixa
	// um relatório com erro travar os demais.
	const gerar = useCallback(async () => {
		const inicio = dataInicio || null;
		const fim = dataFim || null;
		setCarregando(true);
		const novosErros: Record<string, string> = {};

		const resultados = await Promise.allSettled([
			erpApi.relatorios.vendasPeriodo(inicio, fim),
			erpApi.relatorios.curvaABC(inicio, fim),
			erpApi.relatorios.comissoes(inicio, fim),
			erpApi.relatorios.dre(inicio, fim),
			erpApi.relatorios.margemContribuicao(inicio, fim),
			erpApi.relatorios.pontoDeEquilibrio(inicio, fim),
			erpApi.relatorios.giroEstoque(inicio, fim),
		]);

		const [rVendas, rAbc, rComissoes, rDre, rMargem, rPonto, rGiro] =
			resultados;

		if (rVendas.status === "fulfilled") setVendasPeriodo(rVendas.value);
		else
			novosErros.vendasPeriodo =
				rVendas.reason?.message || String(rVendas.reason);

		if (rAbc.status === "fulfilled") setCurvaAbc(rAbc.value);
		else novosErros.curvaAbc = rAbc.reason?.message || String(rAbc.reason);

		if (rComissoes.status === "fulfilled") setComissoes(rComissoes.value);
		else
			novosErros.comissoes =
				rComissoes.reason?.message || String(rComissoes.reason);

		if (rDre.status === "fulfilled") setDre(rDre.value);
		else novosErros.dre = rDre.reason?.message || String(rDre.reason);

		if (rMargem.status === "fulfilled") setMargemContribuicao(rMargem.value);
		else novosErros.margem = rMargem.reason?.message || String(rMargem.reason);

		if (rPonto.status === "fulfilled") setPontoDeEquilibrio(rPonto.value);
		else novosErros.ponto = rPonto.reason?.message || String(rPonto.reason);

		if (rGiro.status === "fulfilled") setGiroEstoque(rGiro.value);
		else novosErros.giro = rGiro.reason?.message || String(rGiro.reason);

		setErros(novosErros);
		setCarregando(false);
	}, [dataInicio, dataFim]);

	useEffect(() => {
		gerar();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return {
		dataInicio,
		setDataInicio,
		dataFim,
		setDataFim,
		vendasPeriodo,
		curvaAbc,
		comissoes,
		dre,
		margemContribuicao,
		pontoDeEquilibrio,
		giroEstoque,
		carregando,
		erros,
		gerar,
	};
}
