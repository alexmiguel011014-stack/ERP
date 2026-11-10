"use client";
import { useRef, useState } from "react";
import { ScrollArea, type SuperficieScrollArea } from "@/components/ui/scroll-area";
import { erpApi, type EstoqueVisaoGeralLinha } from "@/lib/erpApi";
import { formatarMoeda } from "@/components/dashboard/formatos";
import { formatarAtributos } from "@/lib/utils/formatos";
import OrdenarMenu from "@/components/common/OrdenarMenu";
import { usePersistedState } from "@/hooks/usePersistedState";
import {
	OPCOES_ORDENACAO_PRODUTOS,
	ORDENACAO_PADRAO_PRODUTOS,
	buscarOpcao,
	lerOrdenacaoPersistida,
	ordenar,
} from "@/lib/utils/ordenacao";

type Status = "todos" | "normal" | "baixo" | "negativo";

function statusDe(r: EstoqueVisaoGeralLinha): Exclude<Status, "todos"> {
	if (r.quantidade_estoque < 0) return "negativo";
	if (r.quantidade_estoque <= r.estoque_minimo) return "baixo";
	return "normal";
}

const CHIPS: { id: Status; label: string }[] = [
	{ id: "todos", label: "Todos" },
	{ id: "normal", label: "Normal" },
	{ id: "baixo", label: "Baixo" },
	{ id: "negativo", label: "Negativo" },
];

function normalizarBuscaEstoque(valor: string) {
	return valor
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

type EstoqueListaPanelProps = {
	linhas: EstoqueVisaoGeralLinha[];
	carregando: boolean;
	erro: string | null;
	recarregar: () => Promise<"success" | "error" | "superseded">;
	surface: SuperficieScrollArea;
	onBusyChange?: (busy: boolean) => void;
	onAdicionar?: (linha: EstoqueVisaoGeralLinha) => void;
	onRetirar?: (linha: EstoqueVisaoGeralLinha) => void;
};

export function EstoqueListaPanel({
	linhas,
	carregando,
	erro,
	recarregar,
	surface,
	onBusyChange,
	onAdicionar,
	onRetirar,
}: EstoqueListaPanelProps) {
	const [busca, setBusca] = useState("");
	const [ordenacaoSalva, setOrdenacaoSalva] = usePersistedState<string>(
		"erp.ordenacao.estoque",
		ORDENACAO_PADRAO_PRODUTOS,
	);
	const ordenacaoId = lerOrdenacaoPersistida(
		ordenacaoSalva,
		OPCOES_ORDENACAO_PRODUTOS,
		ORDENACAO_PADRAO_PRODUTOS,
	);
	const opcaoOrdenacao = buscarOpcao(OPCOES_ORDENACAO_PRODUTOS, ordenacaoId)!;
	const [statusAtivo, setStatusAtivo] = useState<Status>("todos");
	const [minimos, setMinimos] = useState<Record<number, string>>({});
	const [errosMinimos, setErrosMinimos] = useState<Record<number, string>>({});
	const [salvandoMinimos, setSalvandoMinimos] = useState<Set<number>>(() => new Set());
	const salvandoMinimosRef = useRef(new Set<number>());
	const [feedbackRecarga, setFeedbackRecarga] = useState<string | null>(null);

	async function recarregarLista() {
		const resultado = await recarregar();
		switch (resultado) {
			case "success":
				setFeedbackRecarga("Lista atualizada");
				break;
			case "error":
				setFeedbackRecarga(null);
				break;
			case "superseded":
				break;
		}
		return resultado;
	}

	const termo = normalizarBuscaEstoque(busca);
	const idExato = /^\d+$/.test(termo) ? Number(termo) : null;
	const filtradas = linhas.filter(
		(r) =>
			(statusAtivo === "todos" || statusDe(r) === statusAtivo) &&
			(!termo ||
				normalizarBuscaEstoque(r.produto_nome).includes(termo) ||
				normalizarBuscaEstoque(r.sku).includes(termo) ||
				normalizarBuscaEstoque(r.codigo_barras || "").includes(termo) ||
				(idExato !== null && r.produto_id === idExato)),
	);
	const exibidas = ordenar(
		filtradas.map((r) => ({
			...r,
			id: r.variacao_id,
			nome: r.produto_nome,
			atualizado_em: r.produto_atualizado_em,
		})),
		opcaoOrdenacao,
	);

	const valorTotal = linhas.reduce((soma, r) => {
		const qtd = Math.max(0, Number(r.quantidade_estoque) || 0);
		return soma + qtd * (Number(r.preco_custo) || 0);
	}, 0);
	const baixos = linhas.filter((r) => statusDe(r) === "baixo").length;
	const negativos = linhas.filter((r) => statusDe(r) === "negativo").length;
	const temAcoes = Boolean(onAdicionar || onRetirar);

	async function salvarMinimo(variacaoId: number, valor: string) {
		const novoMin = Number(valor);
		if (valor.trim() === "" || !Number.isInteger(novoMin) || novoMin < 0) {
			setMinimos((atuais) => {
				const restantes = { ...atuais };
				delete restantes[variacaoId];
				return restantes;
			});
			setErrosMinimos((erros) => ({
				...erros,
				[variacaoId]: "Informe um número inteiro igual ou maior que zero.",
			}));
			return;
		}
		if (salvandoMinimosRef.current.has(variacaoId)) return;
		salvandoMinimosRef.current.add(variacaoId);
		onBusyChange?.(true);
		setErrosMinimos((erros) => {
			const restantes = { ...erros };
			delete restantes[variacaoId];
			return restantes;
		});
		setSalvandoMinimos((atuais) => new Set(atuais).add(variacaoId));
		try {
			await erpApi.estoque.salvarMinimo(variacaoId, novoMin);
			setMinimos((atuais) => {
				const restantes = { ...atuais };
				delete restantes[variacaoId];
				return restantes;
			});
			void recarregarLista();
		} catch (e) {
			setMinimos((atuais) => {
				const restantes = { ...atuais };
				delete restantes[variacaoId];
				return restantes;
			});
			setErrosMinimos((erros) => ({
				...erros,
				[variacaoId]: "Erro ao salvar mínimo: " +
					(e instanceof Error ? e.message : String(e)),
			}));
		} finally {
			salvandoMinimosRef.current.delete(variacaoId);
			onBusyChange?.(salvandoMinimosRef.current.size > 0);
			setSalvandoMinimos((atuais) => {
				const restantes = new Set(atuais);
				restantes.delete(variacaoId);
				return restantes;
			});
		}
	}

	return (
			<div className="p-4">
				<p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
					Estoque atual é o saldo registrado da variação. Estoque mínimo é o
					limite de alerta e não altera esse saldo.
				</p>
				<h3 className="mb-2 mt-4 text-sm font-semibold text-gray-800 dark:text-white/90">
					Resumo e valores
				</h3>
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
					<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
						<div className="text-xl font-semibold text-gray-800 dark:text-white/90">
							{linhas.length}
						</div>
						<div className="text-xs text-gray-500 dark:text-gray-400">
							SKUs cadastrados
						</div>
					</div>
					<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
						<div className="text-xl font-semibold text-success-600 dark:text-success-400">
							{formatarMoeda(valorTotal)}
						</div>
						<div className="text-xs text-gray-500 dark:text-gray-400">
							Valor em estoque
						</div>
					</div>
					<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
						<div className="text-xl font-semibold text-warning-600 dark:text-warning-400">
							{baixos}
						</div>
						<div className="text-xs text-gray-500 dark:text-gray-400">
							Itens com estoque baixo
						</div>
					</div>
					<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
						<div className="text-xl font-semibold text-error-600 dark:text-error-400">
							{negativos}
						</div>
						<div className="text-xs text-gray-500 dark:text-gray-400">
							Itens com estoque negativo
						</div>
					</div>
				</div>

				<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
					<div className="flex flex-wrap gap-2">
						{CHIPS.map((c) => (
							<button
								key={c.id}
								type="button"
								onClick={() => setStatusAtivo(c.id)}
								className={
									statusAtivo === c.id
										? "rounded-full bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white"
										: "rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-300"
								}
							>
								{c.label}
							</button>
						))}
					</div>
					<input
						type="text"
						value={busca}
						onChange={(e) => setBusca(e.target.value)}
						placeholder="Buscar por nome, SKU, código de barras ou ID..."
						className="h-9 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
					/>
					<OrdenarMenu opcoes={OPCOES_ORDENACAO_PRODUTOS} valor={ordenacaoId} onChange={setOrdenacaoSalva} />
					<button
						type="button"
						onClick={() => void recarregarLista()}
						disabled={carregando}
						className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
					>
						{carregando ? "Atualizando..." : "Atualizar lista"}
					</button>
				</div>

				{erro && (
					<div className="mt-3 rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
						{erro}
					</div>
				)}
				{feedbackRecarga && !erro && (
					<div role="status" aria-live="polite" className="mt-3 text-sm text-success-700 dark:text-success-400">
						{feedbackRecarga}
					</div>
				)}

				<ScrollArea className="mt-3" size="lg" axis="both" stickyHeader surface={surface} aria-label="Variações em estoque">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-gray-100 dark:border-gray-800">
								{[
									"SKU",
									"Produto",
									"Atributos",
									"Estoque atual",
									"Estoque mínimo",
									"Custo",
									"Valor",
									"Status",
									...(temAcoes ? ["Ações"] : []),
								].map((c) => (
									<th
										key={c}
										className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400"
									>
										{c}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{carregando && linhas.length === 0 ? (
								<tr>
									<td
										colSpan={temAcoes ? 9 : 8}
										className="px-3 py-8 text-center text-sm text-gray-400"
									>
										Carregando...
									</td>
								</tr>
							) : exibidas.length === 0 ? (
								<tr>
									<td
										colSpan={temAcoes ? 9 : 8}
										className="px-3 py-8 text-center text-sm text-gray-400"
									>
										Nenhum item encontrado.
									</td>
								</tr>
							) : (
								exibidas.map((r) => {
									const status = statusDe(r);
									const valor =
										(Number(r.quantidade_estoque) || 0) *
										(Number(r.preco_custo) || 0);
									return (
										<tr
											key={r.variacao_id}
											className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
										>
											<td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">
												{r.sku}
											</td>
											<td className="px-3 py-2 text-gray-800 dark:text-white/90">
												{r.produto_nome}
											</td>
											<td className="px-3 py-2 text-gray-600 dark:text-gray-300">
												{formatarAtributos(r.atributos, r.tamanho, r.cor)}
											</td>
											<td
												className={
													status === "negativo"
														? "whitespace-nowrap px-3 py-2 font-semibold text-error-600 dark:text-error-400"
														: status === "baixo"
															? "whitespace-nowrap px-3 py-2 font-semibold text-warning-600 dark:text-warning-400"
															: "whitespace-nowrap px-3 py-2 text-gray-800 dark:text-white/90"
												}
											>
												{r.quantidade_estoque}
											</td>
											<td className="whitespace-nowrap px-3 py-2">
												<input
													type="number"
													aria-label={`Estoque mínimo de ${r.produto_nome}, SKU ${r.sku}`}
													min={0}
													step={1}
													value={minimos[r.variacao_id] ?? r.estoque_minimo}
													aria-invalid={Boolean(errosMinimos[r.variacao_id])}
													aria-describedby={errosMinimos[r.variacao_id] ? `erro-minimo-${r.variacao_id}` : undefined}
													aria-busy={salvandoMinimos.has(r.variacao_id)}
													onChange={(e) => {
														setMinimos((m) => ({
															...m,
															[r.variacao_id]: e.target.value,
														}));
														setErrosMinimos((erros) => {
															const restantes = { ...erros };
															delete restantes[r.variacao_id];
															return restantes;
														});
													}}
													onBlur={(e) =>
														salvarMinimo(r.variacao_id, e.target.value)
													}
													disabled={salvandoMinimos.has(r.variacao_id)}
													className="h-8 w-16 rounded-lg border border-gray-300 bg-transparent px-2 text-sm text-gray-800 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
												/>
												{errosMinimos[r.variacao_id] && (
													<p
														id={`erro-minimo-${r.variacao_id}`}
														role="alert"
														className="mt-1 max-w-40 text-xs text-error-600 dark:text-error-400"
													>
														{errosMinimos[r.variacao_id]}
													</p>
												)}
											</td>
											<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
												{formatarMoeda(r.preco_custo)}
											</td>
											<td
												className={
													valor < 0
														? "whitespace-nowrap px-3 py-2 text-error-600 dark:text-error-400"
														: "whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300"
												}
											>
												{formatarMoeda(valor)}
											</td>
											<td className="whitespace-nowrap px-3 py-2">
												{status === "negativo" ? (
													<span className="rounded-full bg-error-50 px-2.5 py-0.5 text-xs font-semibold text-error-600 dark:bg-error-500/10 dark:text-error-400">
														Negativo
													</span>
												) : status === "baixo" ? (
													<span className="rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-semibold text-warning-600 dark:bg-warning-500/10 dark:text-warning-400">
														Baixo
													</span>
												) : (
													<span className="rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-600 dark:bg-success-500/10 dark:text-success-400">
														Normal
													</span>
												)}
											</td>
											{temAcoes && (
												<td className="whitespace-nowrap px-3 py-2">
													<div className="flex gap-2">
														{onAdicionar && (
															<button
																type="button"
																onClick={() => onAdicionar(r)}
																disabled={salvandoMinimos.size > 0}
																aria-label={`Adicionar estoque para ${r.produto_nome}, SKU ${r.sku}`}
																className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
															>
																Adicionar
															</button>
														)}
														{onRetirar && (
															<button
																type="button"
																onClick={() => onRetirar(r)}
																disabled={salvandoMinimos.size > 0}
																aria-label={`Retirar estoque para ${r.produto_nome}, SKU ${r.sku}`}
																className="rounded-lg border border-error-300 px-3 py-1.5 text-xs font-semibold text-error-600 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-800 dark:text-error-400 dark:hover:bg-error-500/10"
															>
																Retirar
															</button>
														)}
													</div>
												</td>
											)}
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</ScrollArea>
			</div>
	);
}
