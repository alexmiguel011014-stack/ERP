"use client";
import { useCallback, useEffect, useState } from "react";
import {
	erpApi,
	type CondicaoParcelamento,
	type CustoFixoConfig,
	type PrecificacaoLinha,
} from "@/lib/erpApi";

const CUSTO_FIXO_VAZIO: CustoFixoConfig = {
	mensal: 0,
	faturamentoMedioHistorico: 0,
	mesesConsiderados: 0,
	percentual: 0,
};

export function usePrecificacao() {
	const [dados, setDados] = useState<PrecificacaoLinha[]>([]);
	const [margemGlobal, setMargemGlobal] = useState(40);
	const [custoFixoConfig, setCustoFixoConfig] =
		useState<CustoFixoConfig>(CUSTO_FIXO_VAZIO);
	const [taxaAdquirente, setTaxaAdquirente] = useState(0);
	const [taxaAdquirentePix, setTaxaAdquirentePix] = useState<number | null>(
		null,
	);
	const [taxaAdquirenteCartao, setTaxaAdquirenteCartao] = useState<
		number | null
	>(null);
	const [condicoesParcelamento, setCondicoesParcelamento] = useState<
		CondicaoParcelamento[]
	>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const recarregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			const [margem, linhas, custoFixo, taxa, taxaPix, taxaCartao, condicoes] =
				await Promise.all([
					erpApi.precificacao.margemGlobal(),
					erpApi.precificacao.dados(),
					erpApi.precificacao.custoFixoConfig(),
					erpApi.precificacao.taxaAdquirente(),
					erpApi.precificacao.taxaAdquirentePorMetodo("pix"),
					erpApi.precificacao.taxaAdquirentePorMetodo("cartao"),
					erpApi.precificacao.condicoesParcelamento(undefined, true),
				]);
			setMargemGlobal(Number(margem) || 40);
			setDados(linhas);
			setCustoFixoConfig(custoFixo || CUSTO_FIXO_VAZIO);
			setTaxaAdquirente(Number(taxa) || 0);
			setTaxaAdquirentePix(taxaPix);
			setTaxaAdquirenteCartao(taxaCartao);
			setCondicoesParcelamento(condicoes);
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, []);

	useEffect(() => {
		recarregar();
	}, [recarregar]);

	return {
		dados,
		setDados,
		margemGlobal,
		setMargemGlobal,
		custoFixoConfig,
		setCustoFixoConfig,
		taxaAdquirente,
		setTaxaAdquirente,
		taxaAdquirentePix,
		setTaxaAdquirentePix,
		taxaAdquirenteCartao,
		setTaxaAdquirenteCartao,
		condicoesParcelamento,
		setCondicoesParcelamento,
		carregando,
		erro,
		recarregar,
	};
}
