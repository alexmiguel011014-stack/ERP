"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { erpApi, type ImagemMeta } from "@/lib/erpApi";

// Sem accent-insensitive matching, "Trançado" nunca bate com "trancado" —
// mesmo problema que db/conexao.js:normalizarBusca já resolve no backend
// (ver buscarProdutosPorTermo); espelhado aqui pra a busca dinâmica do grid
// de imagens filtrar em cima da lista já carregada, sem round-trip por tecla.
function normalizarBusca(texto: string): string {
	return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export type AbaImagens = "produtos" | "outros" | "orfas";

// Vive dentro de /banco (ver GOALS.md "Image Database & Management" — seção
// "Redesign: Gerenciar Imagens dentro de Banco de Dados"): reusa a mesma
// reautenticação por senha que useBancoAdmin.ts já expõe pra página, então
// este hook não guarda seu próprio "autorizado" — `ativo` controla quando ele
// começa a carregar dado (só quando a página já autorizou E o modo "Imagens"
// está selecionado).
export function useGerenciarImagens(ativo: boolean) {
	const [todas, setTodas] = useState<ImagemMeta[]>([]);
	const [carregando, setCarregando] = useState(false);
	const [erro, setErro] = useState<string | null>(null);

	const [aba, setAba] = useState<AbaImagens>("produtos");
	const [busca, setBusca] = useState("");

	const [orfas, setOrfas] = useState<ImagemMeta[]>([]);
	const [carregandoOrfas, setCarregandoOrfas] = useState(false);

	const [visualizando, setVisualizando] = useState<{
		id: number;
		dataUrl: string;
	} | null>(null);

	const [paraExcluir, setParaExcluir] = useState<ImagemMeta | null>(null);
	const [excluindo, setExcluindo] = useState(false);
	const [resultadoExclusao, setResultadoExclusao] = useState<string | null>(
		null,
	);
	const [orfasParaExcluir, setOrfasParaExcluir] = useState(false);

	const carregarImagens = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			// limite generoso: o catálogo de uma loja cabe inteiro numa página só,
			// e a busca abaixo filtra em cima do que já foi carregado (dinâmica,
			// sem round-trip a cada tecla) — não uma paginação de verdade.
			const res = await erpApi.imagens.listar({ limite: 1000 });
			setTodas(res.linhas);
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, []);

	const carregarOrfas = useCallback(async () => {
		setCarregandoOrfas(true);
		try {
			setOrfas(await erpApi.imagens.listarOrfas());
		} catch {
			setOrfas([]);
		} finally {
			setCarregandoOrfas(false);
		}
	}, []);

	useEffect(() => {
		if (ativo) carregarImagens();
	}, [ativo, carregarImagens]);

	useEffect(() => {
		if (ativo && aba === "orfas") carregarOrfas();
	}, [ativo, aba, carregarOrfas]);

	const produtos = useMemo(
		() => todas.filter((i) => i.entidade_tipo === "produto"),
		[todas],
	);
	// "Outros": qualquer entidade_tipo que não seja 'produto' — hoje sempre
	// vazio (só 'produto' existe), pronto pra quando um segundo tipo existir
	// (foto de cliente, logo de fornecedor etc., ver GOALS.md "Suggestions").
	const outros = useMemo(
		() => todas.filter((i) => i.entidade_tipo !== "produto"),
		[todas],
	);

	function filtrarPorBusca(lista: ImagemMeta[]): ImagemMeta[] {
		const alvo = normalizarBusca(busca);
		if (!alvo) return lista;
		return lista.filter((i) =>
			normalizarBusca(i.entidade_nome || "").includes(alvo),
		);
	}

	const listaAtual = useMemo(() => {
		if (aba === "orfas") return orfas;
		if (aba === "outros") return filtrarPorBusca(outros);
		return filtrarPorBusca(produtos);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [aba, produtos, outros, orfas, busca]);

	const carregandoAtual = aba === "orfas" ? carregandoOrfas : carregando;

	async function visualizar(id: number) {
		try {
			const dataUrl = await erpApi.imagens.obterPorId(id);
			if (dataUrl) setVisualizando({ id, dataUrl });
		} catch {
			// Falha ao abrir a prévia não deve travar o resto da tela.
		}
	}

	function fecharVisualizacao() {
		setVisualizando(null);
	}

	function pedirExclusao(imagem: ImagemMeta) {
		setResultadoExclusao(null);
		setParaExcluir(imagem);
	}

	function cancelarExclusao() {
		setParaExcluir(null);
	}

	async function confirmarExclusao() {
		if (!paraExcluir) return;
		setExcluindo(true);
		setErro(null);
		try {
			await erpApi.imagens.excluirPorId(paraExcluir.id);
			setResultadoExclusao("Imagem removida.");
			await carregarImagens();
			if (aba === "orfas") await carregarOrfas();
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setExcluindo(false);
			setParaExcluir(null);
		}
	}

	function pedirExclusaoOrfasEmLote() {
		setResultadoExclusao(null);
		setOrfasParaExcluir(true);
	}

	function cancelarExclusaoOrfasEmLote() {
		setOrfasParaExcluir(false);
	}

	async function confirmarExclusaoOrfasEmLote() {
		if (orfas.length === 0) {
			setOrfasParaExcluir(false);
			return;
		}
		setExcluindo(true);
		setErro(null);
		try {
			const res = await erpApi.imagens.excluirEmLote(orfas.map((o) => o.id));
			setResultadoExclusao(`${res.removidas} imagem(ns) órfã(s) removida(s).`);
			await carregarOrfas();
			await carregarImagens();
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setExcluindo(false);
			setOrfasParaExcluir(false);
		}
	}

	return {
		aba,
		setAba,
		busca,
		setBusca,
		listaAtual,
		carregandoAtual,
		totalProdutos: produtos.length,
		totalOutros: outros.length,
		totalOrfas: orfas.length,
		erro,
		visualizando,
		visualizar,
		fecharVisualizacao,
		paraExcluir,
		pedirExclusao,
		cancelarExclusao,
		confirmarExclusao,
		excluindo,
		resultadoExclusao,
		orfasParaExcluir,
		pedirExclusaoOrfasEmLote,
		cancelarExclusaoOrfasEmLote,
		confirmarExclusaoOrfasEmLote,
	};
}
