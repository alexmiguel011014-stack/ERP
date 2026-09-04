"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import ConfirmarSenhaModal from "@/components/common/ConfirmarSenhaModal";
import { useProdutos } from "@/hooks/useProdutos";
import { useCategorias } from "@/hooks/useCategorias";
import { erpApi, type ProdutoDetalhado } from "@/lib/erpApi";

type ExclusaoPendente = { produto: ProdutoDetalhado; permanente: boolean };

function tagsCategorias(p: ProdutoDetalhado): string[] {
	const tags: string[] = [];
	if (Array.isArray(p.categorias_selecionadas)) {
		p.categorias_selecionadas.forEach((c) => tags.push(c.nome));
	}
	if (tags.length === 0) {
		if (p.categoria_nome) tags.push(p.categoria_nome);
		if (p.subcategoria_nome) tags.push(p.subcategoria_nome);
		if (tags.length === 0 && p.categoria_legada) tags.push(p.categoria_legada);
	}
	return tags;
}

function csvCampo(v: unknown): string {
	return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
}

export default function ProdutosListModal({
	isOpen,
	onClose,
	onEditar,
}: {
	isOpen: boolean;
	onClose: () => void;
	onEditar: (p: ProdutoDetalhado) => void;
}) {
	const [verLixeira, setVerLixeira] = useState(false);
	const { produtos, carregando, recarregar } = useProdutos(verLixeira);
	const { categorias, recarregar: recarregarCategorias } = useCategorias();

	// A modal nunca desmonta (Modal só esconde o JSX, o componente continua
	// vivo) — sem isso, um produto salvo enquanto a modal estava fechada
	// nunca aparecia até um reload completo da página.
	useEffect(() => {
		if (isOpen) {
			recarregar();
			recarregarCategorias();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	const [busca, setBusca] = useState("");
	const [categoriasFiltro, setCategoriasFiltro] = useState<string[]>([]);
	const [filtroEstoqueBaixo, setFiltroEstoqueBaixo] = useState(false);
	const [filtroSemEstoque, setFiltroSemEstoque] = useState(false);
	const [processandoId, setProcessandoId] = useState<number | null>(null);
	const [exclusaoPendente, setExclusaoPendente] =
		useState<ExclusaoPendente | null>(null);

	const gruposPrincipais = categorias.filter((c) => !c.categoria_pai_id);

	function toggleCategoriaFiltro(id: string) {
		setCategoriasFiltro((atual) =>
			atual.includes(id) ? atual.filter((c) => c !== id) : [...atual, id],
		);
	}

	function produtoNasCategoriasFiltro(p: ProdutoDetalhado): boolean {
		if (categoriasFiltro.length === 0) return true;
		const idsProduto: string[] = [];
		p.categorias_selecionadas.forEach((c) => {
			idsProduto.push(String(c.id));
			if (c.categoria_pai_id) idsProduto.push(String(c.categoria_pai_id));
		});
		if (p.categoria_id) idsProduto.push(String(p.categoria_id));
		if (p.subcategoria_id) idsProduto.push(String(p.subcategoria_id));
		return categoriasFiltro.some((id) => idsProduto.includes(id));
	}

	function produtoNoFiltroEstoque(p: ProdutoDetalhado): boolean {
		const variacoes = p.variacoes || [];
		if (filtroSemEstoque) {
			if (!variacoes.some((v) => Number(v.quantidade_estoque) <= 0))
				return false;
		}
		if (filtroEstoqueBaixo) {
			if (
				!variacoes.some((v) => {
					const qtd = Number(v.quantidade_estoque);
					const min = Number(v.estoque_minimo || 0);
					return qtd > 0 && qtd <= min;
				})
			)
				return false;
		}
		return true;
	}

	const filtro = busca.trim().toLowerCase();
	const produtosFiltrados = produtos.filter((p) => {
		if (
			filtro &&
			![p.nome, tagsCategorias(p).join(" ")]
				.join(" ")
				.toLowerCase()
				.includes(filtro)
		)
			return false;
		if (!produtoNasCategoriasFiltro(p)) return false;
		if (!produtoNoFiltroEstoque(p)) return false;
		return true;
	});

	function limparFiltros() {
		setCategoriasFiltro([]);
		setFiltroEstoqueBaixo(false);
		setFiltroSemEstoque(false);
		setBusca("");
	}

	async function restaurar(p: ProdutoDetalhado) {
		setProcessandoId(p.id);
		try {
			await erpApi.produtos.restaurar(p.id);
			recarregar();
		} catch (e) {
			alert(
				"Erro ao restaurar: " + (e instanceof Error ? e.message : String(e)),
			);
		} finally {
			setProcessandoId(null);
		}
	}

	async function excluirConfirmado() {
		if (!exclusaoPendente) return;
		const { produto, permanente } = exclusaoPendente;
		setProcessandoId(produto.id);
		try {
			if (permanente) {
				await erpApi.produtos.excluirPermanente(produto.id);
			} else {
				await erpApi.produtos.remover(produto.id);
			}
			recarregar();
		} catch (e) {
			alert("Erro ao excluir: " + (e instanceof Error ? e.message : String(e)));
		} finally {
			setProcessandoId(null);
		}
	}

	function exportarCsv() {
		if (produtos.length === 0) {
			alert("Nenhum produto para exportar.");
			return;
		}
		const cabecalho =
			"SKU,Produto,Categorias,Tamanho,Cor,Preco,PrecoCusto,Estoque";
		const linhas: string[] = [];
		produtos.forEach((p) => {
			const cats = tagsCategorias(p).join(" / ");
			const variacoes =
				p.variacoes && p.variacoes.length
					? p.variacoes
					: [
							{
								sku: "",
								tamanho: "",
								cor: "",
								preco: "",
								preco_custo: "",
								quantidade_estoque: "",
							},
						];
			variacoes.forEach((v) => {
				linhas.push(
					[
						csvCampo(v.sku),
						csvCampo(p.nome),
						csvCampo(cats),
						csvCampo(v.tamanho),
						csvCampo(v.cor),
						csvCampo(v.preco),
						csvCampo(v.preco_custo),
						csvCampo(v.quantidade_estoque),
					].join(","),
				);
			});
		});
		const csv = cabecalho + "\n" + linhas.join("\n");
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "produtos_" + new Date().toISOString().slice(0, 10) + ".csv";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	return (
		<>
			<Modal isOpen={isOpen} onClose={onClose} className="max-w-[960px] p-0">
				<div className="flex items-center justify-between gap-3 border-b border-gray-100 p-4 dark:border-gray-800">
					<h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
						Lista de Produtos
					</h2>
					<div className="flex flex-wrap items-center gap-2">
						<input
							type="text"
							value={busca}
							onChange={(e) => setBusca(e.target.value)}
							placeholder="Buscar por nome ou categoria..."
							className="h-9 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
						/>
						<Button
							size="sm"
							variant={verLixeira ? "primary" : "outline"}
							onClick={() => setVerLixeira((v) => !v)}
						>
							{verLixeira ? "Ver ativos" : "Lixeira"}
						</Button>
						<Button size="sm" variant="outline" onClick={exportarCsv}>
							Exportar CSV
						</Button>
					</div>
				</div>

				<div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-4 sm:flex-row">
					<aside className="w-full shrink-0 sm:w-52">
						<div className="mb-2 text-xs font-semibold uppercase text-gray-400">
							Filtros
						</div>
						<div className="mb-4">
							<div className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
								Categoria
							</div>
							{gruposPrincipais.length === 0 ? (
								<div className="text-xs text-gray-400">Nenhuma categoria.</div>
							) : (
								gruposPrincipais.map((c) => (
									<label
										key={c.id}
										className="flex items-center gap-2 py-0.5 text-sm text-gray-600 dark:text-gray-300"
									>
										<input
											type="checkbox"
											checked={categoriasFiltro.includes(String(c.id))}
											onChange={() => toggleCategoriaFiltro(String(c.id))}
										/>
										{c.nome}
									</label>
								))
							)}
						</div>
						<div className="mb-4">
							<div className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
								Estoque
							</div>
							<label className="flex items-center gap-2 py-0.5 text-sm text-gray-600 dark:text-gray-300">
								<input
									type="checkbox"
									checked={filtroEstoqueBaixo}
									onChange={(e) => setFiltroEstoqueBaixo(e.target.checked)}
								/>
								Estoque baixo
							</label>
							<label className="flex items-center gap-2 py-0.5 text-sm text-gray-600 dark:text-gray-300">
								<input
									type="checkbox"
									checked={filtroSemEstoque}
									onChange={(e) => setFiltroSemEstoque(e.target.checked)}
								/>
								Sem estoque
							</label>
						</div>
						<button
							type="button"
							onClick={limparFiltros}
							className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
						>
							Limpar filtros
						</button>
					</aside>

					<div className="flex-1 overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead>
								<tr className="border-b border-gray-100 dark:border-gray-800">
									<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
										SKU
									</th>
									<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
										Produto
									</th>
									<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
										Categorias / Atributos
									</th>
									<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
										Ações
									</th>
								</tr>
							</thead>
							<tbody>
								{carregando ? (
									<tr>
										<td
											colSpan={4}
											className="px-3 py-8 text-center text-sm text-gray-400"
										>
											Carregando...
										</td>
									</tr>
								) : produtosFiltrados.length === 0 ? (
									<tr>
										<td
											colSpan={4}
											className="px-3 py-8 text-center text-sm text-gray-400"
										>
											{produtos.length === 0
												? "Nenhum produto cadastrado ainda."
												: "Nenhum produto encontrado para os filtros aplicados."}
										</td>
									</tr>
								) : (
									produtosFiltrados.map((p) => {
										const skus = (p.variacoes || [])
											.map((v) => v.sku)
											.filter(Boolean);
										const tags = tagsCategorias(p);
										const processando = processandoId === p.id;
										return (
											<tr
												key={p.id}
												className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
											>
												<td
													className="max-w-[140px] px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400"
													title={skus.length > 1 ? skus.join(", ") : undefined}
												>
													{skus.length === 0 ? (
														"---"
													) : skus.length === 1 ? (
														<span className="block truncate">{skus[0]}</span>
													) : (
														<span className="block truncate">
															{skus[0]}
															<span className="ml-1 text-gray-400 dark:text-gray-500">
																+{skus.length - 1}
															</span>
														</span>
													)}
												</td>
												<td className="px-3 py-2 font-medium text-gray-800 dark:text-white/90">
													{p.nome}
												</td>
												<td className="px-3 py-2">
													{tags.length ? (
														<div className="flex flex-wrap gap-1">
															{tags.map((t, i) => (
																<span
																	key={i}
																	className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/10 dark:text-gray-300"
																>
																	{t}
																</span>
															))}
														</div>
													) : (
														<span className="text-gray-400">---</span>
													)}
												</td>
												<td className="whitespace-nowrap px-3 py-2">
													<div className="flex gap-2">
														{verLixeira ? (
															<>
																<button
																	onClick={() => restaurar(p)}
																	disabled={processando}
																	className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:bg-white/5 dark:text-gray-300"
																>
																	Restaurar
																</button>
																<button
																	onClick={() =>
																		setExclusaoPendente({
																			produto: p,
																			permanente: true,
																		})
																	}
																	disabled={processando}
																	className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-semibold text-error-600 hover:bg-error-100 disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400"
																>
																	Excluir definitivo
																</button>
															</>
														) : (
															<>
																<button
																	onClick={() => {
																		onClose();
																		onEditar(p);
																	}}
																	className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400"
																>
																	Editar
																</button>
																<button
																	onClick={() =>
																		setExclusaoPendente({
																			produto: p,
																			permanente: false,
																		})
																	}
																	disabled={processando}
																	className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-semibold text-error-600 hover:bg-error-100 disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400"
																>
																	Excluir
																</button>
															</>
														)}
													</div>
												</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
						<p className="mt-3 text-xs text-gray-400">
							Preço de Custo e Outros Dados são espaços reservados para
							implementação futura.
						</p>
					</div>
				</div>
			</Modal>

			<ConfirmarSenhaModal
				isOpen={!!exclusaoPendente}
				titulo={
					exclusaoPendente?.permanente
						? "Excluir definitivamente"
						: "Excluir produto"
				}
				descricao={
					exclusaoPendente
						? exclusaoPendente.permanente
							? `Excluir definitivamente o produto "${exclusaoPendente.produto.nome}"? Esta ação não pode ser desfeita.`
							: `Enviar o produto "${exclusaoPendente.produto.nome}" para a lixeira? Ele para de aparecer nas buscas e no PDV, mas pode ser restaurado depois.`
						: ""
				}
				onClose={() => setExclusaoPendente(null)}
				onConfirmado={excluirConfirmado}
			/>
		</>
	);
}
