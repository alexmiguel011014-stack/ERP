"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { erpApi, type ProdutoBusca, type ProdutoVariacao } from "@/lib/erpApi";
import { formatarAtributos } from "@/lib/utils/formatos";

export default function EstoqueProdutoSelector({
	onSelecionar,
}: {
	onSelecionar: (produto: ProdutoVariacao | null) => void;
}) {
	const [termo, setTermo] = useState("");
	const [resultados, setResultados] = useState<ProdutoBusca[]>([]);
	const [indice, setIndice] = useState(-1);
	const [estado, setEstado] = useState<"inicial" | "buscando" | "resultados" | "selecionando" | "selecionado" | "erro">("inicial");
	const [mensagem, setMensagem] = useState("");
	const sequencia = useRef(0);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const confirmacaoPendente = useRef<number | null>(null);
	const listaId = useId();

	useEffect(() => () => {
		sequencia.current++;
		if (timer.current) clearTimeout(timer.current);
	}, []);

	useEffect(() => {
		if (estado === "resultados" && resultados[indice]) {
			document.getElementById(`${listaId}-${resultados[indice].id}`)?.scrollIntoView({ block: "nearest" });
		}
	}, [estado, indice, listaId, resultados]);

	function alterarBusca(valor: string) {
		const buscaAtual = ++sequencia.current;
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
		confirmacaoPendente.current = null;
		setTermo(valor);
		onSelecionar(null);
		setResultados([]);
		setIndice(-1);
		setMensagem("");
		if (!valor.trim()) {
			setEstado("inicial");
			return;
		}
		setEstado("buscando");
		timer.current = setTimeout(() => {
			timer.current = null;
			void executarBusca(valor, buscaAtual);
		}, 180);
	}

	async function executarBusca(valor: string, buscaAtual: number) {
		try {
			const lista = await erpApi.produtos.buscarPorTermo(valor.trim());
			if (sequencia.current !== buscaAtual) return;
			const confirmarUnico = confirmacaoPendente.current === buscaAtual;
			confirmacaoPendente.current = null;
			if (confirmarUnico && lista.length === 1) {
				void selecionar(lista[0]);
				return;
			}
			setResultados(lista);
			setIndice(-1);
			setEstado("resultados");
		} catch (erro) {
			if (sequencia.current !== buscaAtual) return;
			confirmacaoPendente.current = null;
			setMensagem(erro instanceof Error ? erro.message : String(erro));
			setEstado("erro");
		}
	}

	async function selecionar(item: ProdutoBusca) {
		const buscaAtual = ++sequencia.current;
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
		confirmacaoPendente.current = null;
		setResultados([]);
		setIndice(-1);
		setEstado("selecionando");
		setMensagem("");
		onSelecionar(null);
		try {
			let produto = await erpApi.produtos.buscarSKU(item.sku);
			if (sequencia.current !== buscaAtual) return;
			if (!produto || produto.id !== item.id) {
				const estoque = await erpApi.estoque.visaoGeral();
				if (sequencia.current !== buscaAtual) return;
				const variacao = estoque.find((linha) => linha.variacao_id === item.id && linha.produto_id === item.produto_id);
				produto = variacao ? {
					...item,
					nome: variacao.produto_nome,
					sku: variacao.sku,
					atributos: variacao.atributos,
					tamanho: variacao.tamanho,
					cor: variacao.cor,
					quantidade_estoque: variacao.quantidade_estoque,
					quantidade_disponivel: variacao.quantidade_estoque - item.quantidade_reservada,
					estoque_minimo: variacao.estoque_minimo,
					preco_custo: variacao.preco_custo,
					categoria_nome: null,
					subcategoria_nome: null,
				} : null;
			}
			if (!produto) {
				setMensagem("Esta variação não está mais disponível. Busque novamente.");
				setEstado("erro");
				return;
			}
			setTermo(`${produto.nome} — ${produto.sku}`);
			setEstado("selecionado");
			onSelecionar(produto);
		} catch (erro) {
			if (sequencia.current !== buscaAtual) return;
			setMensagem(erro instanceof Error ? erro.message : String(erro));
			setEstado("erro");
		}
	}

	function aoTeclar(evento: React.KeyboardEvent<HTMLInputElement>) {
		if (evento.key === "ArrowDown" && estado === "resultados" && resultados.length) {
			evento.preventDefault();
			setIndice((atual) => atual < 0 ? 0 : Math.min(atual + 1, resultados.length - 1));
		} else if (evento.key === "ArrowUp" && estado === "resultados" && resultados.length) {
			evento.preventDefault();
			setIndice((atual) => atual < 0 ? resultados.length - 1 : Math.max(atual - 1, 0));
		} else if (evento.key === "Enter") {
			evento.preventDefault();
			if (estado === "buscando") {
				confirmacaoPendente.current = sequencia.current;
				if (timer.current) {
					clearTimeout(timer.current);
					timer.current = null;
					void executarBusca(termo, sequencia.current);
				}
			} else if (estado === "resultados" && resultados.length === 1) {
				void selecionar(resultados[0]);
			} else if (estado === "resultados" && indice >= 0 && resultados[indice]) {
				void selecionar(resultados[indice]);
			}
		} else if (evento.key === "Escape" && estado === "resultados" && resultados.length > 0) {
			evento.preventDefault();
			evento.stopPropagation();
			evento.nativeEvent.stopImmediatePropagation();
			++sequencia.current;
			if (timer.current) clearTimeout(timer.current);
			timer.current = null;
			confirmacaoPendente.current = null;
			setResultados([]);
			setIndice(-1);
			setEstado("inicial");
		}
	}

	return (
		<div className="relative">
			<label htmlFor={`${listaId}-busca`} className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
				Produto ou variação
			</label>
			<input
				id={`${listaId}-busca`}
				type="text"
				role="combobox"
				aria-expanded={estado === "resultados" && resultados.length > 0}
				aria-controls={estado === "resultados" && resultados.length > 0 ? listaId : undefined}
				aria-activedescendant={estado === "resultados" && indice >= 0 && resultados[indice] ? `${listaId}-${resultados[indice].id}` : undefined}
				autoComplete="off"
				value={termo}
				onChange={(evento) => alterarBusca(evento.target.value)}
				onKeyDown={aoTeclar}
				placeholder="Nome, SKU, código de barras ou ID"
				className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
			/>
			{estado === "resultados" && resultados.length > 0 && (
				<div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-theme-lg dark:border-gray-700 dark:bg-gray-900">
					<ScrollArea size="sm" id={listaId} role="listbox" aria-label="Resultados de produtos">
						{resultados.map((produto, i) => (
							<button
								id={`${listaId}-${produto.id}`}
								key={produto.id}
								type="button"
								role="option"
								aria-selected={i === indice}
								onClick={() => void selecionar(produto)}
								className={`block w-full px-4 py-2.5 text-left text-sm ${i === indice ? "bg-brand-50 dark:bg-brand-500/10" : "hover:bg-gray-50 dark:hover:bg-white/5"}`}
							>
								<span className="block font-medium text-gray-800 dark:text-white/90">{produto.nome}</span>
								<span className="block text-xs text-gray-500 dark:text-gray-400">{formatarAtributos(produto.atributos, produto.tamanho, produto.cor)} · SKU: {produto.sku} · Estoque atual: {produto.quantidade_estoque}</span>
							</button>
						))}
					</ScrollArea>
				</div>
			)}
			<p className="mt-1 text-xs text-gray-500 dark:text-gray-400" role="status">
				{estado === "inicial" && "Busque e selecione uma variação."}
				{estado === "buscando" && "Buscando produtos..."}
				{estado === "selecionando" && "Carregando variação..."}
				{estado === "resultados" && resultados.length === 0 && "Nenhum produto encontrado."}
				{estado === "resultados" && resultados.length > 0 && "Selecione uma variação na lista."}
				{estado === "erro" && `Não foi possível selecionar o produto: ${mensagem}`}
			</p>
		</div>
	);
}
