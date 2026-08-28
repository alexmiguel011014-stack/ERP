"use client";
import { useState } from "react";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { usePersistedState } from "@/hooks/usePersistedState";
import { erpApi, type ProdutoVariacao } from "@/lib/erpApi";
import { formatarMoeda } from "@/components/dashboard/formatos";
import { formatarAtributos } from "@/lib/utils/formatos";

type ItemReposicao = {
	variacao_id: number;
	nome: string;
	detalhes: string;
	sku: string;
	quantidade: number;
	custo_unitario: number | null;
};

export default function EstoqueReposicaoForm({
	onConfirmado,
	onMensagem,
	onAbrirLista,
}: {
	onConfirmado: () => void;
	onMensagem: (texto: string, sucesso: boolean) => void;
	onAbrirLista: (buscaInicial: string) => void;
}) {
	const [sku, setSku] = useState("");
	const [qtd, setQtd] = useState("1");
	const [custo, setCusto] = useState("");
	const [produtoAtual, setProdutoAtual] = useState<ProdutoVariacao | null>(
		null,
	);
	const [previewTexto, setPreviewTexto] = useState("");
	const [itens, setItens, limparItens] = usePersistedState<ItemReposicao[]>(
		"estoque_reposicao_itens",
		[],
	);
	const [observacao, setObservacao, limparObservacao] = usePersistedState(
		"estoque_reposicao_observacao",
		"",
	);
	const [confirmando, setConfirmando] = useState(false);

	async function buscarProduto() {
		const skuVal = sku.trim().toUpperCase();
		setProdutoAtual(null);
		setPreviewTexto("");
		if (!skuVal) return null;
		try {
			const p = await erpApi.produtos.buscarSKU(skuVal);
			if (!p) {
				onMensagem("SKU não encontrado: " + skuVal, false);
				return null;
			}
			setProdutoAtual(p);
			if (!custo && p.preco_custo) setCusto(Number(p.preco_custo).toFixed(2));
			setPreviewTexto(
				`${p.nome} (${formatarAtributos(p.atributos, p.tamanho, p.cor)}) — estoque atual: ${p.quantidade_estoque} | custo médio: ${formatarMoeda(p.preco_custo)}`,
			);
			return p;
		} catch (e) {
			onMensagem(
				"Erro ao buscar SKU: " + (e instanceof Error ? e.message : String(e)),
				false,
			);
			return null;
		}
	}

	async function adicionarItem() {
		let p = produtoAtual;
		if (!p) {
			p = await buscarProduto();
			if (!p) {
				onMensagem("Busque um SKU válido antes de adicionar.", false);
				return;
			}
		}
		const qtdNum = parseInt(qtd, 10);
		if (!Number.isInteger(qtdNum) || qtdNum <= 0) {
			onMensagem("Quantidade inválida.", false);
			return;
		}
		const custoNum = custo !== "" ? Number(custo) : null;
		if (custoNum !== null && (!Number.isFinite(custoNum) || custoNum < 0)) {
			onMensagem("Custo inválido.", false);
			return;
		}

		setItens((atual) => {
			const existente = atual.find((i) => i.variacao_id === p!.id);
			if (existente) {
				return atual.map((i) =>
					i.variacao_id === p!.id
						? {
								...i,
								quantidade: i.quantidade + qtdNum,
								custo_unitario: custoNum !== null ? custoNum : i.custo_unitario,
							}
						: i,
				);
			}
			return [
				...atual,
				{
					variacao_id: p!.id,
					nome: p!.nome,
					detalhes: formatarAtributos(p!.atributos, p!.tamanho, p!.cor),
					sku: p!.sku,
					quantidade: qtdNum,
					custo_unitario: custoNum,
				},
			];
		});

		setProdutoAtual(null);
		setPreviewTexto("");
		setSku("");
		setQtd("1");
		setCusto("");
	}

	function removerItem(variacaoId: number) {
		setItens((atual) => atual.filter((i) => i.variacao_id !== variacaoId));
	}

	function limpar() {
		limparItens();
		limparObservacao();
	}

	async function confirmarReposicao() {
		if (itens.length === 0) return;
		if (!confirm(`Confirmar entrada de ${itens.length} item(ns) no estoque?`))
			return;
		setConfirmando(true);
		try {
			await erpApi.estoque.registrarEntrada({
				itens: itens.map((i) => ({
					variacao_id: i.variacao_id,
					quantidade: i.quantidade,
					custo_unitario: i.custo_unitario,
				})),
				observacao: observacao.trim() || null,
				origem: "manual",
			});
			onMensagem("Entrada registrada com sucesso!", true);
			limparItens();
			limparObservacao();
			onConfirmado();
		} catch (e) {
			onMensagem(
				"Erro ao registrar entrada: " +
					(e instanceof Error ? e.message : String(e)),
				false,
			);
		} finally {
			setConfirmando(false);
		}
	}

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
				Repor Estoque
			</h2>
			<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
				Registre mercadoria recebida ou produzida — soma ao saldo atual do SKU.
			</p>
			<div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
				<div className="col-span-2">
					<Label>Código de Barras / SKU</Label>
					<div className="flex gap-2">
						<Input
							value={sku}
							onChange={(e) => setSku(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									buscarProduto();
								}
							}}
							placeholder="Escaneie ou digite o SKU e pressione Enter"
						/>
						<button
							type="button"
							title="Ver lista de estoque"
							onClick={() => onAbrirLista(sku)}
							className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
						>
							<svg
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<circle cx="11" cy="11" r="8" />
								<line x1="21" y1="21" x2="16.65" y2="16.65" />
							</svg>
						</button>
					</div>
				</div>
				<div>
					<Label>Quantidade recebida</Label>
					<Input
						type="number"
						value={qtd}
						onChange={(e) => setQtd(e.target.value)}
						min="1"
						step={1}
					/>
				</div>
				<div>
					<Label>Custo unitário (R$)</Label>
					<Input
						type="number"
						value={custo}
						onChange={(e) => setCusto(e.target.value)}
						min="0"
						step={0.01}
						placeholder="opcional"
					/>
				</div>
			</div>
			{previewTexto && (
				<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
					{previewTexto}
				</p>
			)}
			<div className="mt-3">
				<Button type="button" variant="outline" onClick={adicionarItem}>
					Adicionar à reposição
				</Button>
			</div>

			<div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
				{itens.length === 0 ? (
					<div className="py-4 text-center text-sm text-gray-400">
						Nenhum item adicionado.
					</div>
				) : (
					itens.map((item) => (
						<div
							key={item.variacao_id}
							className="flex items-center justify-between gap-3 py-2.5"
						>
							<div>
								<div className="text-sm font-medium text-gray-800 dark:text-white/90">
									{item.nome} ({item.detalhes})
								</div>
								<div className="text-xs text-gray-500 dark:text-gray-400">
									SKU: {item.sku} | Qtd: {item.quantidade} |{" "}
									{item.custo_unitario !== null
										? "Custo: " + formatarMoeda(item.custo_unitario)
										: "Custo: não informado"}
								</div>
							</div>
							<button
								onClick={() => removerItem(item.variacao_id)}
								className="shrink-0 rounded-lg bg-error-50 px-3 py-1.5 text-xs font-semibold text-error-600 hover:bg-error-100 dark:bg-error-500/10 dark:text-error-400"
							>
								Remover
							</button>
						</div>
					))
				)}
			</div>

			<div className="mt-3 max-w-md">
				<Label>Observação</Label>
				<Input
					value={observacao}
					onChange={(e) => setObservacao(e.target.value)}
					placeholder="Ex: NF 1234, reposição semanal..."
				/>
			</div>
			<div className="mt-4 flex gap-3">
				<Button
					variant="primary"
					onClick={confirmarReposicao}
					disabled={itens.length === 0 || confirmando}
				>
					{confirmando ? "Registrando..." : "Confirmar Reposição"}
				</Button>
				<Button variant="outline" type="button" onClick={limpar}>
					Limpar
				</Button>
			</div>
		</div>
	);
}
