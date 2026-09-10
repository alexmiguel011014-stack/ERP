"use client";
import { useState } from "react";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { erpApi, type ProdutoVariacao } from "@/lib/erpApi";
import { formatarAtributos } from "@/lib/utils/formatos";

const MOTIVOS = [
	"Avaria",
	"Perda",
	"Troca/Devolução ao fornecedor",
	"Contagem física",
	"Outro",
];

export default function EstoqueBaixaForm({
	onConfirmado,
	onMensagem,
	onAbrirLista,
}: {
	onConfirmado: () => void;
	onMensagem: (texto: string, sucesso: boolean) => void;
	onAbrirLista: (buscaInicial: string) => void;
}) {
	const [sku, setSku] = useState("");
	const [qtd, setQtd] = useState("");
	const [motivo, setMotivo] = useState(MOTIVOS[0]);
	const [produtoAtual, setProdutoAtual] = useState<ProdutoVariacao | null>(
		null,
	);
	const [previewTexto, setPreviewTexto] = useState("");
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
			setPreviewTexto(
				`${p.nome} (${formatarAtributos(p.atributos, p.tamanho, p.cor)}) — estoque atual: ${p.quantidade_estoque}`,
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

	async function darBaixa() {
		let p = produtoAtual;
		if (!p) {
			p = await buscarProduto();
			if (!p) {
				onMensagem("Busque um SKU válido antes de dar baixa.", false);
				return;
			}
		}
		const qtdBaixa = parseInt(qtd, 10);
		if (!Number.isInteger(qtdBaixa) || qtdBaixa <= 0) {
			onMensagem("Informe uma quantidade válida para dar baixa.", false);
			return;
		}
		const novoSaldo = p.quantidade_estoque - qtdBaixa;
		if (novoSaldo < 0) {
			onMensagem(
				`Essa baixa deixaria o estoque negativo (saldo atual: ${p.quantidade_estoque}). Confira a quantidade.`,
				false,
			);
			return;
		}
		setConfirmando(true);
		try {
			const resultado = await erpApi.estoque.ajustarManual({
				variacao_id: p.id,
				quantidade: novoSaldo,
				observacao: `${motivo} (baixa de ${qtdBaixa} un.)`,
			});
			if (resultado.abaixoDoReservado) {
				onMensagem(
					`Baixa registrada, mas o novo saldo (${novoSaldo}) ficou abaixo do que está reservado em orçamentos abertos (${resultado.quantidade_reservada}). Verifique os orçamentos pendentes desse produto.`,
					false,
				);
			} else {
				onMensagem("Baixa de estoque registrada!", true);
			}
			setProdutoAtual({ ...p, quantidade_estoque: novoSaldo });
			setPreviewTexto(`${p.nome} — estoque atual: ${novoSaldo}`);
			setQtd("");
			onConfirmado();
		} catch (e) {
			onMensagem(
				"Erro ao registrar baixa: " +
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
				Dar Baixa
			</h2>
			<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
				Registre perda, avaria ou troca — subtrai do saldo atual do SKU.
			</p>
			<div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
				<div className="col-span-2">
					<Label>SKU</Label>
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
							placeholder="Digite o SKU e pressione Enter"
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
					<Label>Quantidade a dar baixa</Label>
					<Input
						type="number"
						value={qtd}
						onChange={(e) => setQtd(e.target.value)}
						min="1"
						step={1}
						placeholder="1"
					/>
				</div>
				<div>
					<Label>Motivo</Label>
					<select
						value={motivo}
						onChange={(e) => setMotivo(e.target.value)}
						className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
					>
						{MOTIVOS.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</select>
				</div>
			</div>
			{previewTexto && (
				<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
					{previewTexto}
				</p>
			)}
			<div className="mt-3">
				<Button
					type="button"
					className="bg-error-500 hover:bg-error-600"
					onClick={darBaixa}
					disabled={confirmando}
				>
					{confirmando ? "Registrando..." : "Confirmar Baixa"}
				</Button>
			</div>
		</div>
	);
}
