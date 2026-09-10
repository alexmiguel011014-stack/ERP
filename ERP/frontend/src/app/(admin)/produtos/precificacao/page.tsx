"use client";
import { useMemo, useState } from "react";
import { usePageHeader } from "@/context/PageHeaderContext";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { usePrecificacao } from "@/hooks/usePrecificacao";
import { useCategorias } from "@/hooks/useCategorias";
import { erpApi } from "@/lib/erpApi";
import PrecificacaoTable, {
	type AlteracaoPrecificacao,
} from "@/components/produtos/PrecificacaoTable";
import CondicoesParcelamentoPanel from "@/components/produtos/CondicoesParcelamentoPanel";

function fmtMoeda(v: number) {
	return Number(v || 0).toLocaleString("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

function fmtPct(v: number) {
	return Number(v || 0).toFixed(1);
}

export default function PrecificacaoPage() {
	usePageHeader("Precificação", "Gerencie margens e preços de venda");
	const {
		dados,
		setDados,
		margemGlobal,
		setMargemGlobal,
		custoFixoConfig,
		taxaAdquirente,
		setTaxaAdquirente,
		taxaAdquirentePix,
		setTaxaAdquirentePix,
		taxaAdquirenteCartao,
		setTaxaAdquirenteCartao,
		condicoesParcelamento,
		carregando,
		erro,
		recarregar,
	} = usePrecificacao();
	const { categorias } = useCategorias();

	const [margemGlobalInput, setMargemGlobalInput] = useState("");
	const [custoFixoInput, setCustoFixoInput] = useState("");
	const [taxaInput, setTaxaInput] = useState("");
	const [taxaPixInput, setTaxaPixInput] = useState("");
	const [taxaCartaoInput, setTaxaCartaoInput] = useState("");
	const [salvandoGlobal, setSalvandoGlobal] = useState(false);
	const [salvandoCustoFixo, setSalvandoCustoFixo] = useState(false);
	const [salvandoTaxa, setSalvandoTaxa] = useState(false);
	const [salvandoTaxaPix, setSalvandoTaxaPix] = useState(false);
	const [salvandoTaxaCartao, setSalvandoTaxaCartao] = useState(false);

	const [busca, setBusca] = useState("");
	const [categoriaFiltro, setCategoriaFiltro] = useState("");
	const [selecionados, setSelecionados] = useState<number[]>([]);
	const [massaMargem, setMassaMargem] = useState("");
	const [aplicandoMassa, setAplicandoMassa] = useState(false);
	const [alteracoes, setAlteracoes] = useState<
		Record<number, AlteracaoPrecificacao>
	>({});
	const [salvandoAlteracoes, setSalvandoAlteracoes] = useState(false);
	const [mensagem, setMensagem] = useState<{
		texto: string;
		sucesso: boolean;
	} | null>(null);

	function mostrarMensagem(texto: string, sucesso: boolean) {
		setMensagem({ texto, sucesso });
		setTimeout(() => setMensagem(null), 3500);
	}

	const categoriasUnicas = useMemo(() => {
		const vistos = new Set<string>();
		const lista: string[] = [];
		categorias.forEach((c) => {
			if (!vistos.has(c.nome)) {
				vistos.add(c.nome);
				lista.push(c.nome);
			}
		});
		return lista;
	}, [categorias]);

	const q = busca.trim().toLowerCase();
	const linhasFiltradas = dados.filter((p) => {
		if (categoriaFiltro) {
			const cats = (p.categorias || "").toLowerCase();
			if (!cats.includes(categoriaFiltro.toLowerCase())) return false;
		}
		if (!q) return true;
		return ((p.sku_primeiro || "") + " " + p.produto_nome)
			.toLowerCase()
			.includes(q);
	});

	function toggleSelecionado(produtoId: number) {
		setSelecionados((atual) =>
			atual.includes(produtoId)
				? atual.filter((id) => id !== produtoId)
				: [...atual, produtoId],
		);
	}

	async function salvarMargemGlobal() {
		const val = parseFloat(margemGlobalInput || String(margemGlobal));
		if (isNaN(val) || val < 0) {
			mostrarMensagem("Informe uma margem válida.", false);
			return;
		}
		setSalvandoGlobal(true);
		try {
			await erpApi.precificacao.salvarMargemGlobal(val);
			setMargemGlobal(val);
			mostrarMensagem(`Margem global atualizada para ${val}%!`, true);
		} catch (e) {
			mostrarMensagem(
				"Erro: " + (e instanceof Error ? e.message : String(e)),
				false,
			);
		} finally {
			setSalvandoGlobal(false);
		}
	}

	async function salvarCustoFixo() {
		const mensal =
			parseFloat(custoFixoInput || String(custoFixoConfig.mensal)) || 0;
		if (mensal < 0) {
			mostrarMensagem("Informe um valor válido.", false);
			return;
		}
		setSalvandoCustoFixo(true);
		try {
			await erpApi.precificacao.salvarCustoFixoConfig(mensal);
			await recarregar();
			mostrarMensagem("Custos fixos atualizados!", true);
		} catch (e) {
			mostrarMensagem(
				"Erro: " + (e instanceof Error ? e.message : String(e)),
				false,
			);
		} finally {
			setSalvandoCustoFixo(false);
		}
	}

	async function salvarTaxa() {
		const taxa = parseFloat(taxaInput || String(taxaAdquirente)) || 0;
		if (taxa < 0) {
			mostrarMensagem("Informe um valor válido.", false);
			return;
		}
		setSalvandoTaxa(true);
		try {
			await erpApi.precificacao.salvarTaxaAdquirente(taxa);
			setTaxaAdquirente(taxa);
			mostrarMensagem("Taxa de adquirente atualizada!", true);
		} catch (e) {
			mostrarMensagem(
				"Erro: " + (e instanceof Error ? e.message : String(e)),
				false,
			);
		} finally {
			setSalvandoTaxa(false);
		}
	}

	async function salvarTaxaPorMetodo(
		metodo: "pix" | "cartao",
		valorInput: string,
		valorAtual: number | null,
		setValorAtual: (v: number | null) => void,
		setSalvando: (v: boolean) => void,
	) {
		const taxa = parseFloat(valorInput || String(valorAtual ?? 0)) || 0;
		if (taxa < 0) {
			mostrarMensagem("Informe um valor válido.", false);
			return;
		}
		setSalvando(true);
		try {
			await erpApi.precificacao.salvarTaxaAdquirentePorMetodo(metodo, taxa);
			setValorAtual(taxa);
			mostrarMensagem("Taxa atualizada!", true);
		} catch (e) {
			mostrarMensagem(
				"Erro: " + (e instanceof Error ? e.message : String(e)),
				false,
			);
		} finally {
			setSalvando(false);
		}
	}

	function registrarAlteracao(
		produtoId: number,
		patch: AlteracaoPrecificacao,
	) {
		setAlteracoes((atual) => ({
			...atual,
			[produtoId]: { ...atual[produtoId], ...patch },
		}));
	}

	async function salvarAlteracoes() {
		const pendentes = Object.entries(alteracoes);
		if (pendentes.length === 0) return;

		setSalvandoAlteracoes(true);
		try {
			for (const [produtoIdTexto, alteracao] of pendentes) {
				const produtoId = Number(produtoIdTexto);
				const operacoes: Promise<unknown>[] = [];
				if (alteracao.preco_custo !== undefined) {
					operacoes.push(
						erpApi.precificacao.salvarCusto(
							produtoId,
							alteracao.preco_custo,
						),
					);
				}
				if (alteracao.impostos_extras !== undefined) {
					operacoes.push(
						erpApi.precificacao.salvarImpostos(
							produtoId,
							alteracao.impostos_extras,
						),
					);
				}
				if (alteracao.aplicar_custo_fixo !== undefined) {
					operacoes.push(
						erpApi.precificacao.salvarAplicarCustoFixo(
							produtoId,
							alteracao.aplicar_custo_fixo,
						),
					);
				}
				if (alteracao.margem_percentual !== undefined) {
					operacoes.push(
						erpApi.precificacao.salvarMargemProduto(
							produtoId,
							alteracao.margem_percentual,
						),
					);
				}
				if (alteracao.preco_venda !== undefined) {
					operacoes.push(
						erpApi.precificacao.salvarPreco(
							produtoId,
							alteracao.preco_venda,
						),
					);
				}
				await Promise.all(operacoes);
			}
			setAlteracoes({});
			await recarregar();
			mostrarMensagem(
				`${pendentes.length} produto(s) salvo(s) e disponível(is) no PDV.`,
				true,
			);
		} catch (e) {
			mostrarMensagem(
				"Erro ao salvar alterações: " +
					(e instanceof Error ? e.message : String(e)),
				false,
			);
		} finally {
			setSalvandoAlteracoes(false);
		}
	}

	async function aplicarMassa() {
		if (Object.keys(alteracoes).length > 0) {
			mostrarMensagem("Salve as alterações pendentes antes de aplicar em lote.", false);
			return;
		}
		if (selecionados.length === 0) {
			mostrarMensagem("Selecione ao menos um produto.", false);
			return;
		}
		const margem = parseFloat(massaMargem);
		if (isNaN(margem) || margem < 0) {
			mostrarMensagem("Informe uma margem válida.", false);
			return;
		}
		setAplicandoMassa(true);
		try {
			const r = await erpApi.precificacao.aplicarMargemEmLote(
				selecionados,
				margem,
			);
			mostrarMensagem(
				`Margem de ${margem}% aplicada a ${r.count} produto(s)!`,
				true,
			);
			setSelecionados([]);
			setMassaMargem("");
			recarregar();
		} catch (e) {
			mostrarMensagem(
				"Erro: " + (e instanceof Error ? e.message : String(e)),
				false,
			);
		} finally {
			setAplicandoMassa(false);
		}
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-3 dark:border-gray-800 dark:bg-white/[0.03]">
				<div>
					<Label>Margem de Lucro Padrão (%)</Label>
					<div className="flex gap-2">
						<Input
							type="number"
							value={margemGlobalInput || String(margemGlobal)}
							onChange={(e) => setMargemGlobalInput(e.target.value)}
							min="0"
							max="999"
							step={0.1}
						/>
						<Button
							size="sm"
							onClick={salvarMargemGlobal}
							disabled={salvandoGlobal}
						>
							Salvar
						</Button>
					</div>
					<p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
						Aplicada automaticamente a novos produtos e aos que usam margem
						global.
					</p>
				</div>
				<div>
					<Label>Custos Fixos do Mês (R$)</Label>
					<div className="flex gap-2">
						<Input
							type="number"
							value={
								custoFixoInput ||
								(custoFixoConfig.mensal ? String(custoFixoConfig.mensal) : "")
							}
							onChange={(e) => setCustoFixoInput(e.target.value)}
							min="0"
							step={0.01}
							placeholder="Ex: 5000"
						/>
						<Button
							size="sm"
							onClick={salvarCustoFixo}
							disabled={salvandoCustoFixo}
						>
							Salvar
						</Button>
					</div>
					<p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
						Aluguel, salários e outras despesas fixas, diluídas como % do
						faturamento. Marque &quot;Custo Fixo&quot; por produto.
					</p>
					<p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300">
						{custoFixoConfig.mesesConsiderados === 0
							? "Ainda não há histórico de vendas suficiente para calcular automaticamente. Cadastre vendas ou importe um histórico."
							: custoFixoConfig.percentual > 0
								? `Faturamento médio dos últimos ${custoFixoConfig.mesesConsiderados} mês(es): R$ ${fmtMoeda(custoFixoConfig.faturamentoMedioHistorico)} — ${fmtPct(custoFixoConfig.percentual)}% do faturamento será diluído nos produtos marcados.`
								: "Informe o custo fixo mensal para calcular a porcentagem."}
					</p>
				</div>
				<div>
					<Label>Taxa Média de Adquirente (%)</Label>
					<div className="flex gap-2">
						<Input
							type="number"
							value={
								taxaInput || (taxaAdquirente ? String(taxaAdquirente) : "")
							}
							onChange={(e) => setTaxaInput(e.target.value)}
							min="0"
							max="100"
							step={0.01}
							placeholder="Ex: 3"
						/>
						<Button size="sm" onClick={salvarTaxa} disabled={salvandoTaxa}>
							Salvar
						</Button>
					</div>
					<p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
						Taxa média de cartão/Pix, usada na Margem de Contribuição
						(Relatórios).
					</p>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2 dark:border-gray-800 dark:bg-white/[0.03]">
				<div>
					<Label>Taxa de Adquirente — Pix (%, opcional)</Label>
					<div className="flex gap-2">
						<Input
							type="number"
							value={
								taxaPixInput ||
								(taxaAdquirentePix !== null ? String(taxaAdquirentePix) : "")
							}
							onChange={(e) => setTaxaPixInput(e.target.value)}
							min="0"
							max="100"
							step={0.01}
							placeholder="Ex: 0.5"
						/>
						<Button
							size="sm"
							onClick={() =>
								salvarTaxaPorMetodo(
									"pix",
									taxaPixInput,
									taxaAdquirentePix,
									setTaxaAdquirentePix,
									setSalvandoTaxaPix,
								)
							}
							disabled={salvandoTaxaPix}
						>
							Salvar
						</Button>
					</div>
					<p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
						Sobrepõe a taxa média acima só pras vendas via Pix. Deixe em branco
						pra continuar usando a média.
					</p>
				</div>
				<div>
					<Label>Taxa de Adquirente — Cartão (%, opcional)</Label>
					<div className="flex gap-2">
						<Input
							type="number"
							value={
								taxaCartaoInput ||
								(taxaAdquirenteCartao !== null
									? String(taxaAdquirenteCartao)
									: "")
							}
							onChange={(e) => setTaxaCartaoInput(e.target.value)}
							min="0"
							max="100"
							step={0.01}
							placeholder="Ex: 4"
						/>
						<Button
							size="sm"
							onClick={() =>
								salvarTaxaPorMetodo(
									"cartao",
									taxaCartaoInput,
									taxaAdquirenteCartao,
									setTaxaAdquirenteCartao,
									setSalvandoTaxaCartao,
								)
							}
							disabled={salvandoTaxaCartao}
						>
							Salvar
						</Button>
					</div>
					<p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
						Sobrepõe a taxa média acima só pras vendas via Cartão. Deixe em
						branco pra continuar usando a média.
					</p>
				</div>
			</div>

			{mensagem && (
				<div
					className={
						mensagem.sucesso
							? "rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-700 dark:border-success-800 dark:bg-success-500/10 dark:text-success-400"
							: "rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400"
					}
				>
					{mensagem.texto}
				</div>
			)}

			<CondicoesParcelamentoPanel
				condicoes={condicoesParcelamento}
				produtos={dados.map((produto) => ({
					id: produto.produto_id,
					nome: produto.produto_nome,
					preco: produto.preco_venda,
				}))}
				onSalvar={recarregar}
			/>

			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap items-center gap-3">
					<input
						type="text"
						value={busca}
						onChange={(e) => setBusca(e.target.value)}
						placeholder="Buscar por SKU ou nome..."
						className="h-10 w-full max-w-xs rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
					/>
					<select
						value={categoriaFiltro}
						onChange={(e) => setCategoriaFiltro(e.target.value)}
						className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
					>
						<option value="">Todas as categorias</option>
						{categoriasUnicas.map((nome) => (
							<option key={nome} value={nome}>
								{nome}
							</option>
						))}
					</select>
				</div>
				<div className="ml-auto flex items-center gap-3">
					{Object.keys(alteracoes).length > 0 && (
						<span className="text-sm text-warning-600 dark:text-warning-400">
							{Object.keys(alteracoes).length} alteração(ões) pendente(s)
						</span>
					)}
					<Button
						onClick={salvarAlteracoes}
						disabled={
							salvandoAlteracoes || Object.keys(alteracoes).length === 0
						}
					>
						{salvandoAlteracoes ? "Salvando..." : "Salvar alterações"}
					</Button>
				</div>
			</div>

			{selecionados.length > 0 && (
				<div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-800 dark:bg-brand-500/10">
					<span className="text-sm font-medium text-brand-700 dark:text-brand-400">
						{selecionados.length} ite{selecionados.length === 1 ? "m" : "ns"}{" "}
						selecionado{selecionados.length === 1 ? "" : "s"}
					</span>
					<Input
						type="number"
						value={massaMargem}
						onChange={(e) => setMassaMargem(e.target.value)}
						placeholder="Margem %"
						min="0"
						max="999"
						step={0.1}
						className="w-28"
					/>
					<Button size="sm" onClick={aplicarMassa} disabled={aplicandoMassa}>
						Aplicar aos selecionados
					</Button>
				</div>
			)}

			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				{erro && (
					<div className="mb-3 rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
						{erro}
					</div>
				)}
				<div className="overflow-x-auto">
					{carregando ? (
						<div className="py-8 text-center text-sm text-gray-400">
							Carregando...
						</div>
					) : (
						<PrecificacaoTable
							linhas={linhasFiltradas}
							setLinhas={setDados}
							margemGlobal={margemGlobal}
							custoFixoPercentual={custoFixoConfig.percentual}
							selecionados={selecionados}
							onToggleSelecionado={toggleSelecionado}
							onAlterar={registrarAlteracao}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
