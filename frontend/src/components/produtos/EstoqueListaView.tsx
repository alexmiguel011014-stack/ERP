"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useEstoqueVisaoGeral } from "@/hooks/useEstoqueVisaoGeral";
import { erpApi, type EstoqueVisaoGeralLinha } from "@/lib/erpApi";
import { formatarMoeda } from "@/components/dashboard/formatos";
import { formatarAtributos } from "@/lib/utils/formatos";

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

export default function EstoqueListaView({
	isOpen,
	onClose,
	buscaInicial,
}: {
	isOpen: boolean;
	onClose: () => void;
	buscaInicial?: string;
}) {
	const { linhas, carregando, erro, recarregar } = useEstoqueVisaoGeral();
	const [busca, setBusca] = useState("");
	const [statusAtivo, setStatusAtivo] = useState<Status>("todos");
	const [minimos, setMinimos] = useState<Record<number, string>>({});

	// Reabrir com dado fresco (mínimo editado em outra hora não pode ficar
	// velho) e já filtrado pelo SKU que o usuário tinha digitado no formulário
	// que abriu esta modal.
	useEffect(() => {
		if (isOpen) {
			recarregar();
			setBusca(buscaInicial || "");
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen, buscaInicial]);

	const termo = busca.trim().toLowerCase();
	const filtradas = linhas.filter((r) => {
		if (statusAtivo !== "todos" && statusDe(r) !== statusAtivo) return false;
		if (!termo) return true;
		return (r.produto_nome + " " + r.sku).toLowerCase().includes(termo);
	});

	const valorTotal = linhas.reduce((soma, r) => {
		const qtd = Math.max(0, Number(r.quantidade_estoque) || 0);
		return soma + qtd * (Number(r.preco_custo) || 0);
	}, 0);
	const baixos = linhas.filter((r) => statusDe(r) === "baixo").length;
	const negativos = linhas.filter((r) => statusDe(r) === "negativo").length;

	async function salvarMinimo(variacaoId: number, valor: string) {
		const novoMin = parseInt(valor, 10);
		if (!Number.isInteger(novoMin) || novoMin < 0) {
			alert("Estoque mínimo inválido.");
			return;
		}
		try {
			await erpApi.estoque.salvarMinimo(variacaoId, novoMin);
			recarregar();
		} catch (e) {
			alert(
				"Erro ao salvar mínimo: " +
					(e instanceof Error ? e.message : String(e)),
			);
		}
	}

	return (
		<Modal isOpen={isOpen} onClose={onClose} className="max-w-[960px] p-0">
			<div className="border-b border-gray-100 p-4 dark:border-gray-800">
				<h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
					Lista completa do estoque
				</h2>
			</div>

			<div className="max-h-[75vh] overflow-y-auto p-4">
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
						placeholder="Buscar por produto ou SKU..."
						className="h-9 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
					/>
				</div>

				{erro && (
					<div className="mt-3 rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
						{erro}
					</div>
				)}

				<div className="mt-3 overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-gray-100 dark:border-gray-800">
								{[
									"SKU",
									"Produto",
									"Atributos",
									"Qtd.",
									"Mínimo",
									"Custo",
									"Valor",
									"Status",
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
							{carregando ? (
								<tr>
									<td
										colSpan={8}
										className="px-3 py-8 text-center text-sm text-gray-400"
									>
										Carregando...
									</td>
								</tr>
							) : filtradas.length === 0 ? (
								<tr>
									<td
										colSpan={8}
										className="px-3 py-8 text-center text-sm text-gray-400"
									>
										Nenhum item encontrado.
									</td>
								</tr>
							) : (
								filtradas.map((r) => {
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
													min={0}
													step={1}
													defaultValue={r.estoque_minimo}
													value={minimos[r.variacao_id] ?? r.estoque_minimo}
													onChange={(e) =>
														setMinimos((m) => ({
															...m,
															[r.variacao_id]: e.target.value,
														}))
													}
													onBlur={(e) =>
														salvarMinimo(r.variacao_id, e.target.value)
													}
													className="h-8 w-16 rounded-lg border border-gray-300 bg-transparent px-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
												/>
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
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>
			</div>
		</Modal>
	);
}
