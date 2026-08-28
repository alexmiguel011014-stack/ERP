"use client";
import { useRef, useState } from "react";
import { erpApi, type ProdutoBusca } from "@/lib/erpApi";
import { formatarAtributos } from "@/lib/utils/formatos";
import { formatarMoeda } from "./formatos";

export default function BuscaProduto({
	onSelecionar,
	buscaInicial,
}: {
	onSelecionar: (produto: ProdutoBusca) => void;
	buscaInicial?: string;
}) {
	const [termo, setTermo] = useState(buscaInicial || "");
	const [resultados, setResultados] = useState<ProdutoBusca[]>([]);
	const [indiceSelecionado, setIndiceSelecionado] = useState(0);
	const [buscando, setBuscando] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	async function buscar(valor: string) {
		if (!valor.trim()) {
			setResultados([]);
			return;
		}
		setBuscando(true);
		try {
			const lista = await erpApi.produtos.buscarPorTermo(valor.trim());
			setResultados(lista);
			setIndiceSelecionado(0);
		} catch {
			setResultados([]);
		} finally {
			setBuscando(false);
		}
	}

	function selecionar(produto: ProdutoBusca) {
		onSelecionar(produto);
		setTermo("");
		setResultados([]);
		inputRef.current?.focus();
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter") {
			e.preventDefault();
			if (resultados.length > 0) {
				selecionar(resultados[indiceSelecionado]);
			} else {
				buscar(termo);
			}
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			setIndiceSelecionado((i) => Math.min(i + 1, resultados.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setIndiceSelecionado((i) => Math.max(i - 1, 0));
		} else if (e.key === "Escape") {
			setResultados([]);
		}
	}

	return (
		<div className="relative">
			<input
				ref={inputRef}
				autoFocus
				type="text"
				value={termo}
				onChange={(e) => setTermo(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Escaneie ou digite o SKU/nome e pressione Enter"
				className="h-12 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
			/>
			{resultados.length > 0 && (
				<div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-theme-lg dark:border-gray-800 dark:bg-gray-900">
					{resultados.map((p, i) => (
						<button
							key={p.id}
							type="button"
							onClick={() => selecionar(p)}
							onMouseEnter={() => setIndiceSelecionado(i)}
							className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm ${
								i === indiceSelecionado
									? "bg-brand-50 dark:bg-brand-500/10"
									: "hover:bg-gray-50 dark:hover:bg-white/5"
							}`}
						>
							<div className="min-w-0">
								<div className="truncate font-medium text-gray-800 dark:text-white/90">
									{p.nome}
								</div>
								<div className="truncate text-xs text-gray-400">
									{p.sku} · {formatarAtributos(p.atributos, p.tamanho, p.cor)} ·{" "}
									{p.quantidade_disponivel} disponível
								</div>
							</div>
							<div className="shrink-0 font-semibold text-gray-800 dark:text-white/90">
								{formatarMoeda(p.preco)}
							</div>
						</button>
					))}
				</div>
			)}
			{buscando && (
				<div className="absolute right-3 top-3.5 text-xs text-gray-400">
					Buscando...
				</div>
			)}
		</div>
	);
}
