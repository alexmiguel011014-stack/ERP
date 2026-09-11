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
	type SegmentacaoClienteLinha,
	type ProdutoParadoLinha,
	type SazonalidadeResultado,
	type ConversaoOrcamentosResultado,
	type AgingRecebiveisResultado,
	type RelatorioFluxoCaixaResultado,
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
	const [segmentacaoClientes, setSegmentacaoClientes] = useState<
		SegmentacaoClienteLinha[]
	>([]);
	const [produtosParados, setProdutosParados] = useState<ProdutoParadoLinha[]>(
		[],
	);
	const [sazonalidade, setSazonalidade] =
		useState<SazonalidadeResultado | null>(null);
	const [conversaoOrcamentos, setConversaoOrcamentos] =
		useState<ConversaoOrcamentosResultado | null>(null);
	const [agingRecebiveis, setAgingRecebiveis] =
		useState<AgingRecebiveisResultado | null>(null);
	const [fluxoCaixa, setFluxoCaixa] =
		useState<RelatorioFluxoCaixaResultado | null>(null);

	const [carregando, setCarregando] = useState(true);
	const [erros, setErros] = useState<Record<string, string>>({});

	// Cada seção falha independente das outras — a vanilla também não deixa
	// um relatório com erro travar os demais.
	const gerar = useCallback(async (periodo?: { inicio: string; fim: string }) => {
		const inicioSelecionado = periodo ? periodo.inicio : dataInicio;
		const fimSelecionado = periodo ? periodo.fim : dataFim;
		const inicio = inicioSelecionado || "1900-01-01";
		const fim = fimSelecionado || new Date().toISOString().slice(0, 10);
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
			erpApi.relatorios.segmentacaoClientes(),
			erpApi.relatorios.produtosParados(inicio, fim),
			erpApi.relatorios.sazonalidade(),
			erpApi.relatorios.conversaoOrcamentos(inicio, fim),
			erpApi.relatorios.agingRecebiveis(),
			erpApi.relatorios.fluxoCaixa(inicio, fim),
		]);

		const [
			rVendas,
			rAbc,
			rComissoes,
			rDre,
			rMargem,
			rPonto,
			rGiro,
			rSegmentacao,
			rParados,
			rSazonalidade,
			rConversao,
			rAging,
			rFluxo,
		] = resultados;

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

		if (rSegmentacao.status === "fulfilled")
			setSegmentacaoClientes(rSegmentacao.value);
		else
			novosErros.segmentacao =
				rSegmentacao.reason?.message || String(rSegmentacao.reason);

		if (rParados.status === "fulfilled") setProdutosParados(rParados.value);
		else
			novosErros.parados = rParados.reason?.message || String(rParados.reason);

		if (rSazonalidade.status === "fulfilled")
			setSazonalidade(rSazonalidade.value);
		else
			novosErros.sazonalidade =
				rSazonalidade.reason?.message || String(rSazonalidade.reason);

		if (rConversao.status === "fulfilled")
			setConversaoOrcamentos(rConversao.value);
		else
			novosErros.conversao =
				rConversao.reason?.message || String(rConversao.reason);

		if (rAging.status === "fulfilled") setAgingRecebiveis(rAging.value);
		else novosErros.aging = rAging.reason?.message || String(rAging.reason);

		if (rFluxo.status === "fulfilled") setFluxoCaixa(rFluxo.value);
		else novosErros.fluxoCaixa = rFluxo.reason?.message || String(rFluxo.reason);

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
		segmentacaoClientes,
		produtosParados,
		sazonalidade,
		conversaoOrcamentos,
		agingRecebiveis,
		fluxoCaixa,
		carregando,
		erros,
		gerar,
	};
}
