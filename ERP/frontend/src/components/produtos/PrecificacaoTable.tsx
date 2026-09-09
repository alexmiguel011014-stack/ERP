"use client";
import { useEffect, useState } from "react";
import type { PrecificacaoLinha } from "@/lib/erpApi";

export type AlteracaoPrecificacao = {
	preco_custo?: number;
	impostos_extras?: number;
	margem_percentual?: number;
	preco_venda?: number;
	aplicar_custo_fixo?: boolean;
};

function calcPrecoVenda(
	custo: number,
	impostos: number,
	margem: number,
	custoFixoPct: number,
) {
	const base = Number(custo || 0) + Number(impostos || 0);
	if (base <= 0) return 0;
	return (
		base *
		(1 + Number(margem || 0) / 100) *
		(1 + Number(custoFixoPct || 0) / 100)
	);
}

function calcMargem(
	custo: number,
	impostos: number,
	precoVenda: number,
	custoFixoPct: number,
) {
	const base = Number(custo || 0) + Number(impostos || 0);
	if (base <= 0) return 0;
	const baseComCustoFixo = base * (1 + Number(custoFixoPct || 0) / 100);
	if (baseComCustoFixo <= 0) return 0;
	return (Number(precoVenda || 0) / baseComCustoFixo - 1) * 100;
}

function calcLucro(
	custo: number,
	impostos: number,
	precoVenda: number,
	custoFixoPct: number,
) {
	const base = Number(custo || 0) + Number(impostos || 0);
	const baseComCustoFixo = base * (1 + Number(custoFixoPct || 0) / 100);
	return Number(precoVenda || 0) - baseComCustoFixo;
}

function fmtMoeda(v: number) {
	return Number(v || 0).toLocaleString("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

function fmtPct(v: number) {
	return Number(v || 0).toFixed(1);
}

function EditableNumber({
	valor,
	onCommit,
	min = 0,
	max,
	step = 0.01,
	casasDecimais = 2,
	placeholder,
}: {
	valor: number;
	onCommit: (v: number) => void;
	min?: number;
	max?: number;
	step?: number;
	casasDecimais?: number;
	placeholder?: string;
}) {
	const [texto, setTexto] = useState(() => valor.toFixed(casasDecimais));

	// Resincroniza quando o valor muda por fora (recarga da página, aplicar
	// margem em lote) — sem isso a célula ficaria mostrando um número velho
	// depois de uma ação em outra linha/painel que também mexe nesse produto.
	useEffect(() => {
		setTexto(valor.toFixed(casasDecimais));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [valor]);

	return (
		<input
			type="number"
			min={min}
			max={max}
			step={step}
			value={texto}
			placeholder={placeholder}
			onChange={(e) => setTexto(e.target.value)}
			onBlur={() => {
				let v = parseFloat(texto);
				if (isNaN(v)) v = 0;
				if (min !== undefined && v < min) v = min;
				if (max !== undefined && v > max) v = max;
				setTexto(v.toFixed(casasDecimais));
				onCommit(v);
			}}
			className="h-9 w-24 rounded-lg border border-gray-300 bg-transparent px-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
		/>
	);
}

export default function PrecificacaoTable({
	linhas,
	setLinhas,
	margemGlobal,
	custoFixoPercentual,
	selecionados,
	onToggleSelecionado,
	onAlterar,
}: {
	linhas: PrecificacaoLinha[];
	setLinhas: React.Dispatch<React.SetStateAction<PrecificacaoLinha[]>>;
	margemGlobal: number;
	custoFixoPercentual: number;
	selecionados: number[];
	onToggleSelecionado: (produtoId: number) => void;
	onAlterar: (produtoId: number, patch: AlteracaoPrecificacao) => void;
}) {
	function atualizarLinha(
		produtoId: number,
		patch: AlteracaoPrecificacao,
	) {
		setLinhas((atual) =>
			atual.map((l) => (l.produto_id === produtoId ? { ...l, ...patch } : l)),
		);
		onAlterar(produtoId, patch);
	}

	function margemEfetiva(p: PrecificacaoLinha) {
		return p.margem_percentual !== null
			? Number(p.margem_percentual)
			: margemGlobal;
	}

	function custoFixoDe(p: PrecificacaoLinha) {
		return p.aplicar_custo_fixo ? custoFixoPercentual : 0;
	}

	function salvarCusto(produtoId: number, valor: number) {
		atualizarLinha(produtoId, { preco_custo: valor });
	}

	function salvarImpostos(produtoId: number, valor: number) {
		atualizarLinha(produtoId, { impostos_extras: valor });
	}

	function salvarMargemEPreco(
		produtoId: number,
		margem: number,
		preco: number,
	) {
		atualizarLinha(produtoId, {
			margem_percentual: margem,
			preco_venda: preco,
		});
	}

	function toggleCustoFixo(p: PrecificacaoLinha, marcado: boolean) {
		atualizarLinha(p.produto_id, { aplicar_custo_fixo: marcado });
	}

	if (linhas.length === 0) {
		return (
			<div className="py-8 text-center text-sm text-gray-400">
				Nenhum produto encontrado.
			</div>
		);
	}

	return (
		<table className="w-full text-left text-sm">
			<thead>
				<tr className="border-b border-gray-100 dark:border-gray-800">
					<th className="w-9 px-3 py-2"></th>
					{[
						"SKU",
						"Produto",
						"Categoria",
						"Preço Custo",
						"Impostos/Extras",
						"Custo Fixo",
						"Margem (%)",
						"Preço Venda",
						"Lucro",
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
				{linhas.map((p) => {
					const margemReal = margemEfetiva(p);
					const custoFixoAplicado = custoFixoDe(p);
					const precoCalculado =
						Number(p.preco_venda || 0) > 0
							? Number(p.preco_venda)
							: calcPrecoVenda(
									p.preco_custo,
									p.impostos_extras,
									margemReal,
									custoFixoAplicado,
								);
					const lucro = calcLucro(
						p.preco_custo,
						p.impostos_extras,
						precoCalculado,
						custoFixoAplicado,
					);
					const usaCustom = p.margem_percentual !== null;
					const cats = (p.categorias || "")
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean);

					return (
						<tr
							key={p.produto_id}
							className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
						>
							<td className="px-3 py-2">
								<input
									type="checkbox"
									checked={selecionados.includes(p.produto_id)}
									onChange={() => onToggleSelecionado(p.produto_id)}
								/>
							</td>
							<td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">
								{p.sku_primeiro || "---"}
							</td>
							<td className="px-3 py-2 text-gray-800 dark:text-white/90">
								{p.produto_nome}
							</td>
							<td className="px-3 py-2">
								{cats.length ? (
									<div className="flex flex-wrap gap-1">
										{cats.map((c, i) => (
											<span
												key={i}
												className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/10 dark:text-gray-300"
											>
												{c}
											</span>
										))}
									</div>
								) : (
									<span className="text-gray-400">—</span>
								)}
							</td>
							<td className="px-3 py-2">
								<EditableNumber
									valor={p.preco_custo}
									onCommit={(v) => salvarCusto(p.produto_id, v)}
								/>
							</td>
							<td className="px-3 py-2">
								<EditableNumber
									valor={p.impostos_extras}
									onCommit={(v) => salvarImpostos(p.produto_id, v)}
								/>
							</td>
							<td className="px-3 py-2">
								<label className="flex items-center gap-2">
									<input
										type="checkbox"
										checked={!!p.aplicar_custo_fixo}
										title="Diluir o custo fixo mensal neste produto"
										onChange={(e) => toggleCustoFixo(p, e.target.checked)}
									/>
									<span className="text-xs text-gray-500 dark:text-gray-400">
										{p.aplicar_custo_fixo
											? fmtPct(custoFixoPercentual) + "%"
											: "—"}
									</span>
								</label>
							</td>
							<td className="px-3 py-2">
								<EditableNumber
									valor={margemReal}
									casasDecimais={1}
									max={999}
									step={0.1}
									placeholder={`Global ${fmtPct(margemGlobal)}%`}
									onCommit={(v) => {
										const novoPreco = calcPrecoVenda(
											p.preco_custo,
											p.impostos_extras,
											v,
											custoFixoAplicado,
										);
										salvarMargemEPreco(p.produto_id, v, novoPreco);
									}}
								/>
							</td>
							<td className="px-3 py-2">
								<EditableNumber
									valor={precoCalculado}
									onCommit={(v) => {
										const novaMargem = calcMargem(
											p.preco_custo,
											p.impostos_extras,
											v,
											custoFixoAplicado,
										);
										salvarMargemEPreco(p.produto_id, novaMargem, v);
									}}
								/>
							</td>
							<td className="whitespace-nowrap px-3 py-2">
								<span
									className={
										lucro > 0
											? "font-semibold text-success-600 dark:text-success-400"
											: lucro < 0
												? "font-semibold text-error-600 dark:text-error-400"
												: "text-gray-500 dark:text-gray-400"
									}
								>
									R$ {fmtMoeda(lucro)}
								</span>
							</td>
							<td className="whitespace-nowrap px-3 py-2">
								{usaCustom ? (
									<span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
										Custom ({fmtPct(p.margem_percentual || 0)}%)
									</span>
								) : (
									<span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500 dark:bg-white/5 dark:text-gray-400">
										Global ({fmtPct(margemGlobal)}%)
									</span>
								)}
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}
