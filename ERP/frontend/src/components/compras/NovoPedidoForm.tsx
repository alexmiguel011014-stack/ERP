"use client";
import { useEffect, useState } from "react";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { usePersistedState } from "@/hooks/usePersistedState";
import {
	erpApi,
	type CotacaoFornecedor,
	type Fornecedor,
	type ProdutoVariacao,
} from "@/lib/erpApi";
import { formatarMoeda } from "@/components/dashboard/formatos";
import { formatarAtributos } from "@/lib/utils/formatos";

type ItemCarrinho = {
	variacao_id: number;
	nome: string;
	detalhes: string;
	sku: string;
	quantidade: number;
	custo_unitario: number;
};

export default function NovoPedidoForm({
	onCriado,
	onMensagem,
}: {
	onCriado: () => void;
	onMensagem: (texto: string, sucesso: boolean) => void;
}) {
	const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
	const [fornecedorId, setFornecedorId, limparFornecedorId] = usePersistedState(
		"compras_form_fornecedor_id",
		"",
	);
	const [sku, setSku] = useState("");
	const [qtd, setQtd] = useState("1");
	const [custo, setCusto] = useState("0");
	const [produtoAtual, setProdutoAtual] = useState<ProdutoVariacao | null>(
		null,
	);
	const [previewTexto, setPreviewTexto] = useState("");
	const [cotacao, setCotacao] = useState<CotacaoFornecedor[]>([]);
	// Carrinho do pedido persiste — o mais custoso de perder numa navegação
	// acidental, igual o carrinho do PDV.
	const [itens, setItens, limparItens] = usePersistedState<ItemCarrinho[]>(
		"compras_form_itens",
		[],
	);
	const [observacao, setObservacao, limparObservacao] = usePersistedState(
		"compras_form_observacao",
		"",
	);
	const [criando, setCriando] = useState(false);

	useEffect(() => {
		erpApi.fornecedores
			.listar()
			.then(setFornecedores)
			.catch(() => setFornecedores([]));
	}, []);

	async function buscarProduto() {
		const skuVal = sku.trim().toUpperCase();
		setProdutoAtual(null);
		setPreviewTexto("");
		setCotacao([]);
		if (!skuVal) return;
		try {
			const p = await erpApi.produtos.buscarSKU(skuVal);
			if (!p) {
				onMensagem("SKU não encontrado: " + skuVal, false);
				return;
			}
			setProdutoAtual(p);
			if (p.preco_custo) setCusto(Number(p.preco_custo).toFixed(2));

			const detalhes = formatarAtributos(p.atributos, p.tamanho, p.cor);
			const previewBase = `${p.nome} (${detalhes}) — estoque atual: ${p.quantidade_estoque}`;

			if (fornecedorId) {
				try {
					const precoFornecedor = await erpApi.fornecedores.custoProduto(
						Number(fornecedorId),
						p.id,
					);
					if (precoFornecedor) {
						setCusto(Number(precoFornecedor.preco_custo).toFixed(2));
						setPreviewTexto(
							previewBase +
								" — custo deste fornecedor: R$ " +
								Number(precoFornecedor.preco_custo).toFixed(2) +
								(precoFornecedor.prazo_entrega_dias != null
									? ` (prazo ${precoFornecedor.prazo_entrega_dias}d)`
									: ""),
						);
					} else {
						setPreviewTexto(previewBase);
					}
				} catch {
					setPreviewTexto(previewBase);
				}
			} else {
				setPreviewTexto(previewBase);
			}

			try {
				const linhas = await erpApi.fornecedores.cotacao(p.id);
				if (linhas && linhas.length > 1) setCotacao(linhas);
			} catch {
				/* cotação é só um auxiliar visual, falha não bloqueia o fluxo */
			}
		} catch (e) {
			onMensagem(
				"Erro ao buscar SKU: " + (e instanceof Error ? e.message : String(e)),
				false,
			);
		}
	}

	function adicionarItem() {
		if (!produtoAtual) {
			onMensagem("Busque um SKU válido antes de adicionar.", false);
			return;
		}
		const qtdNum = parseInt(qtd, 10);
		const custoNum = Number(custo);
		if (!Number.isInteger(qtdNum) || qtdNum <= 0) {
			onMensagem("Quantidade inválida.", false);
			return;
		}
		if (!Number.isFinite(custoNum) || custoNum < 0) {
			onMensagem("Custo inválido.", false);
			return;
		}

		setItens((atual) => {
			const existente = atual.find((i) => i.variacao_id === produtoAtual.id);
			if (existente) {
				return atual.map((i) =>
					i.variacao_id === produtoAtual.id
						? {
								...i,
								quantidade: i.quantidade + qtdNum,
								custo_unitario: custoNum,
							}
						: i,
				);
			}
			return [
				...atual,
				{
					variacao_id: produtoAtual.id,
					nome: produtoAtual.nome,
					detalhes: formatarAtributos(
						produtoAtual.atributos,
						produtoAtual.tamanho,
						produtoAtual.cor,
					),
					sku: produtoAtual.sku,
					quantidade: qtdNum,
					custo_unitario: custoNum,
				},
			];
		});

		setProdutoAtual(null);
		setPreviewTexto("");
		setSku("");
		setQtd("1");
		setCusto("0");
	}

	function removerItem(variacaoId: number) {
		setItens((atual) => atual.filter((i) => i.variacao_id !== variacaoId));
	}

	const total = itens.reduce((s, i) => s + i.quantidade * i.custo_unitario, 0);

	function limpar() {
		limparItens();
		limparObservacao();
		limparFornecedorId();
	}

	async function criarPedido() {
		if (itens.length === 0) return;
		if (!confirm(`Criar pedido de compra com ${itens.length} item(ns)?`))
			return;
		setCriando(true);
		try {
			const r = await erpApi.compras.criarPedido({
				fornecedor_id: fornecedorId ? Number(fornecedorId) : null,
				observacao: observacao.trim() || null,
				itens: itens.map((i) => ({
					variacao_id: i.variacao_id,
					quantidade: i.quantidade,
					custo_unitario: i.custo_unitario,
				})),
			});
			onMensagem(`Pedido #${r.pedidoId} criado com sucesso!`, true);
			limparItens();
			limparObservacao();
			onCriado();
		} catch (e) {
			onMensagem(
				"Erro: " + (e instanceof Error ? e.message : String(e)),
				false,
			);
		} finally {
			setCriando(false);
		}
	}

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
				Novo pedido
			</h2>
			<div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
				<div className="col-span-2">
					<Label>Fornecedor</Label>
					<select
						value={fornecedorId}
						onChange={(e) => setFornecedorId(e.target.value)}
						className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
					>
						<option value="">Sem fornecedor</option>
						{fornecedores.map((f) => (
							<option key={f.id} value={f.id}>
								{f.nome}
							</option>
						))}
					</select>
				</div>
				<div className="col-span-2">
					<Label>SKU</Label>
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
				</div>
				<div>
					<Label>Quantidade</Label>
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
					/>
				</div>
			</div>

			{previewTexto && (
				<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
					{previewTexto}
				</p>
			)}
			{cotacao.length > 0 && (
				<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
					<strong>Cotação:</strong>{" "}
					{cotacao
						.map(
							(l, i) =>
								(i === 0 ? "🏆 " : "") +
								l.fornecedor_nome +
								": " +
								formatarMoeda(l.preco_custo) +
								(l.prazo_entrega_dias != null
									? ` (${l.prazo_entrega_dias}d)`
									: ""),
						)
						.join(" | ")}
				</p>
			)}

			<div className="mt-3">
				<Button variant="outline" onClick={adicionarItem} type="button">
					Adicionar item
				</Button>
			</div>

			<div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
				{itens.length === 0 ? (
					<div className="py-4 text-center text-sm text-gray-400">
						Nenhum item no pedido.
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
									SKU: {item.sku} | {item.quantidade} x{" "}
									{formatarMoeda(item.custo_unitario)} ={" "}
									{formatarMoeda(item.quantidade * item.custo_unitario)}
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

			<div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
				<div className="col-span-2">
					<Label>Observação</Label>
					<Input
						value={observacao}
						onChange={(e) => setObservacao(e.target.value)}
						placeholder="opcional"
					/>
				</div>
				<div>
					<Label>Total do pedido</Label>
					<Input value={formatarMoeda(total)} disabled />
				</div>
			</div>

			<div className="mt-4 flex gap-3">
				<Button onClick={criarPedido} disabled={itens.length === 0 || criando}>
					{criando ? "Criando..." : "Criar Pedido"}
				</Button>
				<Button variant="outline" type="button" onClick={limpar}>
					Limpar
				</Button>
			</div>
		</div>
	);
}
