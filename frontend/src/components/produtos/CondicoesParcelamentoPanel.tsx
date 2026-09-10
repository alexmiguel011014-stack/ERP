"use client";
import { useMemo, useState } from "react";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import {
	erpApi,
	type CondicaoParcelamento,
} from "@/lib/erpApi";

type ProdutoPreview = { id: number; nome: string; preco: number };

function moeda(valor: number) {
	return Number(valor || 0).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

function preview(valorBase: number, condicao: CondicaoParcelamento) {
	const totalCentavos = Math.round(
		valorBase * (1 + Number(condicao.acrescimo_percentual || 0) / 100) * 100,
	);
	const parcelaCentavos = Math.floor(totalCentavos / condicao.numero_parcelas);
	const ultimaParcela =
		totalCentavos - parcelaCentavos * (condicao.numero_parcelas - 1);
	return {
		total: totalCentavos / 100,
		parcela: parcelaCentavos / 100,
		ultimaParcela: ultimaParcela / 100,
	};
}

function formularioDa(condicao?: CondicaoParcelamento) {
	return {
		id: condicao?.id,
		nome: condicao?.nome || "",
		forma_pagamento: condicao?.forma_pagamento || ("Fiado" as const),
		numero_parcelas: String(condicao?.numero_parcelas || 1),
		acrescimo_percentual: String(condicao?.acrescimo_percentual || 0),
		ativo: condicao?.ativo !== 0,
	};
}

export default function CondicoesParcelamentoPanel({
	condicoes,
	produtos,
	onSalvar,
}: {
	condicoes: CondicaoParcelamento[];
	produtos: ProdutoPreview[];
	onSalvar: () => Promise<void>;
}) {
	const [produtoId, setProdutoId] = useState("");
	const [formulario, setFormulario] = useState(formularioDa());
	const [salvando, setSalvando] = useState(false);
	const [mensagem, setMensagem] = useState<string | null>(null);
	const produto = useMemo(
		() => produtos.find((item) => item.id === Number(produtoId)) || produtos[0],
		[produtoId, produtos],
	);
	const condicoesAtivas = condicoes.filter((condicao) => condicao.ativo !== 0);

	function editar(condicao?: CondicaoParcelamento) {
		setMensagem(null);
		setFormulario(formularioDa(condicao));
	}

	async function salvar() {
		const numeroParcelas = Number(formulario.numero_parcelas);
		const acrescimo = Number(formulario.acrescimo_percentual);
		if (!Number.isInteger(numeroParcelas) || numeroParcelas < 1 || acrescimo < 0) {
			setMensagem("Informe parcelas inteiras (mínimo 1) e um acréscimo não negativo.");
			return;
		}
		setSalvando(true);
		setMensagem(null);
		try {
			await erpApi.precificacao.salvarCondicaoParcelamento({
				...formulario,
				nome: formulario.nome.trim() || `${numeroParcelas}x ${formulario.forma_pagamento}`,
				numero_parcelas: numeroParcelas,
				acrescimo_percentual: acrescimo,
			});
			await onSalvar();
			editar();
			setMensagem("Condição salva. O preço-base dos produtos não foi alterado.");
		} catch (erro) {
			setMensagem(erro instanceof Error ? erro.message : String(erro));
		} finally {
			setSalvando(false);
		}
	}

	async function alternarAtivo(condicao: CondicaoParcelamento) {
		setSalvando(true);
		setMensagem(null);
		try {
			await erpApi.precificacao.salvarCondicaoParcelamento({
				...condicao,
				ativo: condicao.ativo === 0,
			});
			await onSalvar();
		} catch (erro) {
			setMensagem(erro instanceof Error ? erro.message : String(erro));
		} finally {
			setSalvando(false);
		}
	}

	return (
		<section className="border-y border-gray-200 py-5 dark:border-gray-800">
			<div className="mb-4 flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
						Condições de parcelamento
					</h2>
					<p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
						Defina as opções de Fiado e Cartão. Elas simulam o valor comercial e
						não substituem o preço-base cadastrado do produto.
					</p>
				</div>
				<Button size="sm" variant="outline" onClick={() => editar()}>
					Nova condição
				</Button>
			</div>

			<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
				<div className="overflow-x-auto">
					<table className="min-w-full text-left text-sm">
						<thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
							<tr>
								<th className="px-2 py-2 font-medium">Condição</th>
								<th className="px-2 py-2 font-medium">Forma</th>
								<th className="px-2 py-2 font-medium">Acréscimo</th>
								<th className="px-2 py-2 font-medium">Status</th>
								<th className="px-2 py-2 text-right font-medium">Ações</th>
							</tr>
						</thead>
						<tbody>
							{condicoes.map((condicao) => (
								<tr
									key={condicao.id}
									className="border-b border-gray-100 text-gray-700 last:border-0 dark:border-gray-800/80 dark:text-gray-300"
								>
									<td className="px-2 py-3 font-medium">{condicao.nome}</td>
									<td className="px-2 py-3">{condicao.forma_pagamento}</td>
									<td className="px-2 py-3 tabular-nums">
										{Number(condicao.acrescimo_percentual).toFixed(2)}%
									</td>
									<td className="px-2 py-3">
										<span
											className={
												condicao.ativo !== 0
													? "text-success-700 dark:text-success-400"
													: "text-gray-500 dark:text-gray-400"
											}
										>
											{condicao.ativo !== 0 ? "Ativa" : "Inativa"}
										</span>
									</td>
									<td className="px-2 py-3 text-right">
										<button
											type="button"
											onClick={() => editar(condicao)}
											className="mr-3 text-brand-600 underline-offset-4 hover:underline dark:text-brand-400"
										>
											Editar
										</button>
										<button
											type="button"
											disabled={salvando}
											onClick={() => alternarAtivo(condicao)}
											className="text-gray-500 underline-offset-4 hover:underline disabled:opacity-50 dark:text-gray-400"
										>
											{condicao.ativo !== 0 ? "Desativar" : "Ativar"}
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<div className="border border-gray-200 p-4 dark:border-gray-800">
					<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
						{formulario.id ? "Editar condição" : "Cadastrar condição"}
					</h3>
					<div className="mt-3 space-y-3">
						<div>
							<Label>Nome</Label>
							<Input
								value={formulario.nome}
								onChange={(event) =>
									setFormulario((atual) => ({ ...atual, nome: event.target.value }))
								}
								placeholder="Ex.: Cartão 3x"
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<Label>Forma</Label>
								<select
									value={formulario.forma_pagamento}
									onChange={(event) =>
										setFormulario((atual) => ({
											...atual,
											forma_pagamento: event.target.value as "Fiado" | "Cartão",
										}))
									}
									className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
								>
									<option value="Fiado">Fiado</option>
									<option value="Cartão">Cartão</option>
								</select>
							</div>
							<div>
								<Label>Parcelas</Label>
								<Input
									type="number"
									min="1"
									step={1}
									value={formulario.numero_parcelas}
									onChange={(event) =>
										setFormulario((atual) => ({
											...atual,
											numero_parcelas: event.target.value,
										}))
									}
								/>
							</div>
						</div>
						<div>
							<Label>Acréscimo total (%)</Label>
							<Input
								type="number"
								min="0"
								step={0.01}
								value={formulario.acrescimo_percentual}
								onChange={(event) =>
									setFormulario((atual) => ({
										...atual,
										acrescimo_percentual: event.target.value,
									}))
								}
							/>
						</div>
						<label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
							<input
								type="checkbox"
								checked={formulario.ativo}
								onChange={(event) =>
									setFormulario((atual) => ({ ...atual, ativo: event.target.checked }))
								}
							/>
							Disponível no PDV
						</label>
						<Button className="w-full" onClick={salvar} disabled={salvando}>
							{salvando ? "Salvando..." : "Salvar condição"}
						</Button>
						{mensagem && (
							<p className="text-sm text-gray-600 dark:text-gray-300">{mensagem}</p>
						)}
					</div>
				</div>
			</div>

			<div className="mt-5 border-t border-gray-200 pt-4 dark:border-gray-800">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
							Prévia por produto
						</h3>
						<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
							Comparação comercial; salvar ou editar uma condição não altera o preço do produto.
						</p>
					</div>
					<select
						value={produto ? String(produto.id) : ""}
						onChange={(event) => setProdutoId(event.target.value)}
						className="h-11 min-w-56 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
					>
						{produtos.map((item) => (
							<option key={item.id} value={item.id}>
								{item.nome}
							</option>
						))}
					</select>
				</div>
				{produto ? (
					<div className="mt-3 grid gap-px overflow-hidden border border-gray-200 bg-gray-200 sm:grid-cols-2 xl:grid-cols-4 dark:border-gray-800 dark:bg-gray-800">
						<div className="bg-white p-3 dark:bg-gray-900">
							<p className="text-xs text-gray-500 dark:text-gray-400">À vista</p>
							<p className="mt-1 font-semibold tabular-nums text-gray-800 dark:text-white/90">
								{moeda(produto.preco)}
							</p>
						</div>
						{condicoesAtivas.map((condicao) => {
							const calculo = preview(produto.preco, condicao);
							return (
								<div key={condicao.id} className="bg-white p-3 dark:bg-gray-900">
									<p className="text-xs text-gray-500 dark:text-gray-400">{condicao.nome}</p>
									<p className="mt-1 font-semibold tabular-nums text-gray-800 dark:text-white/90">
										{moeda(calculo.total)}
									</p>
									<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
										{condicao.numero_parcelas}x de {moeda(calculo.parcela)}
										{calculo.ultimaParcela !== calculo.parcela
											? ` + última de ${moeda(calculo.ultimaParcela)}`
											: ""}
									</p>
								</div>
							);
						})}
					</div>
				) : (
					<p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
						Cadastre um produto com preço para visualizar as condições.
					</p>
				)}
			</div>
		</section>
	);
}
