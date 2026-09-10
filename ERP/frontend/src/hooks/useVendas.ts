"use client";
import { useCallback, useEffect, useState } from "react";
import {
	erpApi,
	type ItemVenda,
	type ParcelaVenda,
	type Venda,
} from "@/lib/erpApi";

export function useVendas() {
	const [dataInicio, setDataInicio] = useState("");
	const [dataFim, setDataFim] = useState("");
	const [vendas, setVendas] = useState<Venda[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const [itensCache, setItensCache] = useState<Record<number, ItemVenda[]>>({});
	const [carregandoItens, setCarregandoItens] = useState<
		Record<number, boolean>
	>({});
	const [parcelasCache, setParcelasCache] = useState<
		Record<number, ParcelaVenda[]>
	>({});
	const [carregandoParcelas, setCarregandoParcelas] = useState<
		Record<number, boolean>
	>({});

	const carregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			setVendas(
				await erpApi.vendas.listar({
					dataInicio: dataInicio || null,
					dataFim: dataFim || null,
				}),
			);
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, [dataInicio, dataFim]);

	useEffect(() => {
		carregar();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const carregarItens = useCallback(
		async (vendaId: number) => {
			if (itensCache[vendaId] || carregandoItens[vendaId]) return;
			setCarregandoItens((atual) => ({ ...atual, [vendaId]: true }));
			try {
				const itens = await erpApi.vendas.itens(vendaId);
				setItensCache((atual) => ({ ...atual, [vendaId]: itens }));
			} catch {
				// Silencioso — o consumidor mostra "sem itens" se o cache continuar vazio.
			} finally {
				setCarregandoItens((atual) => ({ ...atual, [vendaId]: false }));
			}
		},
		[itensCache, carregandoItens],
	);

	const carregarParcelas = useCallback(
		async (vendaId: number) => {
			if (parcelasCache[vendaId] || carregandoParcelas[vendaId]) return;
			setCarregandoParcelas((atual) => ({ ...atual, [vendaId]: true }));
			try {
				const parcelas = await erpApi.vendas.parcelas(vendaId);
				setParcelasCache((atual) => ({ ...atual, [vendaId]: parcelas }));
			} catch {
				// O detalhe continua disponível para vendas antigas sem recebíveis.
			} finally {
				setCarregandoParcelas((atual) => ({ ...atual, [vendaId]: false }));
			}
		},
		[parcelasCache, carregandoParcelas],
	);

	async function converterOrcamento(vendaId: number) {
		await erpApi.vendas.converterOrcamento(vendaId);
		await carregar();
	}

	async function atualizarNotaFiscal(
		vendaId: number,
		dados: { status: string; numero: string | null },
	) {
		await erpApi.vendas.atualizarNotaFiscal(vendaId, dados);
		setVendas((atual) =>
			atual.map((v) =>
				v.id === vendaId
					? { ...v, nota_status: dados.status, nota_numero: dados.numero }
					: v,
			),
		);
	}

	return {
		dataInicio,
		setDataInicio,
		dataFim,
		setDataFim,
		vendas,
		carregando,
		erro,
		filtrar: carregar,
		itensCache,
		carregandoItens,
		carregarItens,
		parcelasCache,
		carregandoParcelas,
		carregarParcelas,
		converterOrcamento,
		atualizarNotaFiscal,
	};
}
