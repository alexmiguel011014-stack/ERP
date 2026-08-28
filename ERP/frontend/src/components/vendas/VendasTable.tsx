"use client";
import { Fragment, useMemo, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import { formatarAtributos } from "@/lib/utils/formatos";
import { formatarData, formatarMoeda } from "./formatos";
import type { ItemVenda, Venda } from "@/lib/erpApi";

const FORMAS_PAGAMENTO = ["PIX", "Cartão", "Dinheiro", "Fiado"];
const LINHAS_POR_PAGINA_OPCOES = [10, 20, 50, 100];

const BADGE_POR_STATUS = {
	finalizada: "success",
	orcamento: "warning",
	cancelado: "light",
} as const;

type SortKey =
	| "id"
	| "cliente_nome"
	| "status"
	| "data_venda"
	| "forma_pagamento"
	| "total";

export default function VendasTable({
	vendas,
	itensCache,
	carregandoItens,
	carregando,
	onExpandirLinha,
	onAbrirDetalhe,
}: {
	vendas: Venda[];
	itensCache: Record<number, ItemVenda[]>;
	carregandoItens: Record<number, boolean>;
	carregando: boolean;
	onExpandirLinha: (vendaId: number) => void;
	onAbrirDetalhe: (venda: Venda) => void;
}) {
	const [busca, setBusca] = useState("");
	const [statusFiltro, setStatusFiltro] = useState("");
	const [pagamentoFiltro, setPagamentoFiltro] = useState("");
	const [sort, setSort] = useState<{ chave: SortKey; dir: "asc" | "desc" }>({
		chave: "data_venda",
		dir: "desc",
	});
	const [pagina, setPagina] = useState(1);
	const [linhasPorPagina, setLinhasPorPagina] = useState(10);
	const [linhasExpandidas, setLinhasExpandidas] = useState<Set<number>>(
		new Set(),
	);

	const contagemStatus = useMemo(() => {
		const c = { finalizada: 0, orcamento: 0 };
		vendas.forEach((v) => {
			if (v.status === "finalizada") c.finalizada++;
			else if (v.status === "orcamento") c.orcamento++;
		});
		return c;
	}, [vendas]);

	const contagemPagamento = useMemo(() => {
		const c: Record<string, number> = {};
		FORMAS_PAGAMENTO.forEach((f) => (c[f] = 0));
		vendas.forEach((v) => {
			if (v.forma_pagamento && c[v.forma_pagamento] !== undefined) {
				c[v.forma_pagamento]++;
			}
		});
		return c;
	}, [vendas]);

	const filtro = busca.trim().toLowerCase();
	const vendasFiltradas = vendas
		.filter((v) => !statusFiltro || v.status === statusFiltro)
		.filter((v) => !pagamentoFiltro || v.forma_pagamento === pagamentoFiltro)
		.filter(
			(v) =>
				!filtro ||
				String(v.id).includes(filtro) ||
				(v.cliente_nome || "").toLowerCase().includes(filtro),
		)
		.sort((a, b) => {
			const va = a[sort.chave];
			const vb = b[sort.chave];
			const cmp = va === vb ? 0 : (va ?? "") < (vb ?? "") ? -1 : 1;
			return sort.dir === "asc" ? cmp : -cmp;
		});

	const totalPaginas = Math.max(
		1,
		Math.ceil(vendasFiltradas.length / linhasPorPagina),
	);
	const paginaAtual = Math.min(pagina, totalPaginas);
	const vendasPagina = vendasFiltradas.slice(
		(paginaAtual - 1) * linhasPorPagina,
		paginaAtual * linhasPorPagina,
	);

	function alternarOrdenacao(chave: SortKey) {
		setSort((atual) =>
			atual.chave === chave
				? { chave, dir: atual.dir === "asc" ? "desc" : "asc" }
				: { chave, dir: "asc" },
		);
	}

	function alternarExpansao(vendaId: number) {
		setLinhasExpandidas((atual) => {
			const novo = new Set(atual);
			if (novo.has(vendaId)) {
				novo.delete(vendaId);
			} else {
				novo.add(vendaId);
				onExpandirLinha(vendaId);
			}
			return novo;
		});
	}

	function limparFiltros() {
		setBusca("");
		setStatusFiltro("");
		setPagamentoFiltro("");
		setPagina(1);
	}

	function colunaHeader(label: string, chave: SortKey, alinhamento?: string) {
		return (
			<th
				className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400 ${alinhamento || ""}`}
				onClick={() => alternarOrdenacao(chave)}
			>
				{label} {sort.chave === chave ? (sort.dir === "asc" ? "▲" : "▼") : ""}
			</th>
		);
	}

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<div className="flex flex-wrap items-center gap-2">
				<input
					type="text"
					value={busca}
					onChange={(e) => {
						setBusca(e.target.value);
						setPagina(1);
					}}
					placeholder="Buscar por cliente ou # da venda..."
					className="h-9 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
				/>
				<button
					type="button"
					onClick={() => {
						setStatusFiltro("");
						setPagina(1);
					}}
					className={`rounded-full px-3 py-1 text-xs font-medium ${statusFiltro === "" ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}
				>
					Todas ({vendas.length})
				</button>
				<button
					type="button"
					onClick={() => {
						setStatusFiltro("finalizada");
						setPagina(1);
					}}
					className={`rounded-full px-3 py-1 text-xs font-medium ${statusFiltro === "finalizada" ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}
				>
					Finalizada ({contagemStatus.finalizada})
				</button>
				<button
					type="button"
					onClick={() => {
						setStatusFiltro("orcamento");
						setPagina(1);
					}}
					className={`rounded-full px-3 py-1 text-xs font-medium ${statusFiltro === "orcamento" ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}
				>
					Orçamento ({contagemStatus.orcamento})
				</button>
			</div>

			<div className="mt-2 flex flex-wrap items-center gap-2">
				<button
					type="button"
					onClick={() => {
						setPagamentoFiltro("");
						setPagina(1);
					}}
					className={`rounded-full px-3 py-1 text-xs font-medium ${pagamentoFiltro === "" ? "bg-gray-800 text-white dark:bg-white/20" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}
				>
					Todos pagamentos
				</button>
				{FORMAS_PAGAMENTO.map((f) => (
					<button
						key={f}
						type="button"
						onClick={() => {
							setPagamentoFiltro(f);
							setPagina(1);
						}}
						className={`rounded-full px-3 py-1 text-xs font-medium ${pagamentoFiltro === f ? "bg-gray-800 text-white dark:bg-white/20" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}
					>
						{f} ({contagemPagamento[f]})
					</button>
				))}
				{(busca || statusFiltro || pagamentoFiltro) && (
					<button
						type="button"
						onClick={limparFiltros}
						className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
					>
						Limpar filtros
					</button>
				)}
			</div>

			<div className="mt-4 overflow-x-auto">
				<table className="w-full text-left text-sm">
					<thead>
						<tr className="border-b border-gray-100 dark:border-gray-800">
							<th className="w-6 px-3 py-2" />
							{colunaHeader("Venda #", "id")}
							{colunaHeader("Cliente", "cliente_nome")}
							{colunaHeader("Status", "status")}
							{colunaHeader("Data", "data_venda")}
							{colunaHeader("Pagamento", "forma_pagamento")}
							{colunaHeader("Total", "total", "text-right")}
						</tr>
					</thead>
					<tbody>
						{carregando ? (
							<tr>
								<td
									colSpan={7}
									className="px-3 py-8 text-center text-sm text-gray-400"
								>
									Carregando...
								</td>
							</tr>
						) : vendasPagina.length === 0 ? (
							<tr>
								<td
									colSpan={7}
									className="px-3 py-8 text-center text-sm text-gray-400"
								>
									{vendas.length === 0
										? "Nenhuma venda no período."
										: "Nenhuma venda encontrada para os filtros aplicados."}
								</td>
							</tr>
						) : (
							vendasPagina.map((v) => {
								const expandida = linhasExpandidas.has(v.id);
								const itens = itensCache[v.id];
								return (
									<Fragment key={v.id}>
										<tr
											onClick={() => alternarExpansao(v.id)}
											className="cursor-pointer border-b border-gray-50 hover:bg-gray-50 last:border-0 dark:border-gray-800/60 dark:hover:bg-white/5"
										>
											<td className="px-3 py-2 text-gray-400">
												{expandida ? "▾" : "▸"}
											</td>
											<td className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">
												#{v.id}
											</td>
											<td className="px-3 py-2 font-medium text-gray-800 dark:text-white/90">
												{v.cliente_nome || "---"}
											</td>
											<td className="px-3 py-2">
												<Badge size="sm" color={BADGE_POR_STATUS[v.status]}>
													{v.status}
												</Badge>
											</td>
											<td className="px-3 py-2 whitespace-nowrap">
												{formatarData(v.data_venda)}
											</td>
											<td className="px-3 py-2">
												{v.forma_pagamento || "---"}
											</td>
											<td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-white/90">
												{formatarMoeda(v.total)}
											</td>
										</tr>
										{expandida && (
											<tr
												key={`${v.id}-detalhe`}
												className="border-b border-gray-50 dark:border-gray-800/60"
											>
												<td
													colSpan={7}
													className="bg-gray-50 px-3 py-3 dark:bg-white/[0.02]"
												>
													{carregandoItens[v.id] ? (
														<p className="text-sm text-gray-400">
															Carregando itens...
														</p>
													) : !itens || itens.length === 0 ? (
														<p className="text-sm text-gray-400">
															Nenhum item encontrado.
														</p>
													) : (
														<table className="w-full text-left text-xs">
															<tbody>
																{itens.map((item) => (
																	<tr key={item.id}>
																		<td className="py-1 pr-3">
																			{item.produto_nome} ·{" "}
																			{formatarAtributos(
																				item.atributos,
																				item.tamanho,
																				item.cor,
																			)}
																		</td>
																		<td className="py-1 pr-3">
																			{item.quantidade}x
																		</td>
																		<td className="py-1 pr-3 text-right">
																			{formatarMoeda(item.subtotal)}
																		</td>
																	</tr>
																))}
															</tbody>
														</table>
													)}
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															onAbrirDetalhe(v);
														}}
														className="mt-2 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
													>
														Ver detalhes completos
													</button>
												</td>
											</tr>
										)}
									</Fragment>
								);
							})
						)}
					</tbody>
				</table>
			</div>

			<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
					<span>Linhas por página:</span>
					<select
						value={linhasPorPagina}
						onChange={(e) => {
							setLinhasPorPagina(Number(e.target.value));
							setPagina(1);
						}}
						className="h-8 rounded-lg border border-gray-300 bg-transparent px-2 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
					>
						{LINHAS_POR_PAGINA_OPCOES.map((n) => (
							<option key={n} value={n}>
								{n}
							</option>
						))}
					</select>
					<span>
						{vendasFiltradas.length === 0
							? "0 de 0"
							: `${(paginaAtual - 1) * linhasPorPagina + 1}–${Math.min(paginaAtual * linhasPorPagina, vendasFiltradas.length)} de ${vendasFiltradas.length}`}
					</span>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						disabled={paginaAtual <= 1}
						onClick={() => setPagina((p) => p - 1)}
						className="rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-white/5"
					>
						Anterior
					</button>
					<span className="px-2 text-xs text-gray-500 dark:text-gray-400">
						Página {paginaAtual} de {totalPaginas}
					</span>
					<button
						type="button"
						disabled={paginaAtual >= totalPaginas}
						onClick={() => setPagina((p) => p + 1)}
						className="rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-white/5"
					>
						Próxima
					</button>
				</div>
			</div>
		</div>
	);
}
