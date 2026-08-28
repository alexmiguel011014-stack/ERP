"use client";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { formatarMoeda } from "./formatos";

const FORMAS_PAGAMENTO = [
	{ value: "", label: "Selecione..." },
	{ value: "PIX", label: "PIX" },
	{ value: "Cartão", label: "Cartão" },
	{ value: "Dinheiro", label: "Dinheiro" },
	{ value: "Fiado", label: "Fiado (a receber)" },
];

export default function PagamentoPainel({
	subtotal,
	desconto,
	setDesconto,
	formaPagamento,
	setFormaPagamento,
	valorRecebido,
	setValorRecebido,
	observacao,
	setObservacao,
	carrinhoVazio,
	processando,
	caixaAberto,
	onFinalizar,
	onOrcamento,
}: {
	subtotal: number;
	desconto: string;
	setDesconto: (v: string) => void;
	formaPagamento: string;
	setFormaPagamento: (v: string) => void;
	valorRecebido: string;
	setValorRecebido: (v: string) => void;
	observacao: string;
	setObservacao: (v: string) => void;
	carrinhoVazio: boolean;
	processando: boolean;
	caixaAberto: boolean;
	onFinalizar: () => void;
	onOrcamento: () => void;
}) {
	const descontoNum = Math.max(0, Number(desconto) || 0);
	const total = Math.max(0, subtotal - descontoNum);
	const recebidoNum = Number(valorRecebido) || 0;
	const troco = formaPagamento === "Dinheiro" ? recebidoNum - total : 0;

	const podeFinalizar =
		!carrinhoVazio &&
		!!formaPagamento &&
		!processando &&
		(formaPagamento !== "Dinheiro" || recebidoNum >= total);

	return (
		<div className="space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
			<div>
				<Label>Desconto (R$)</Label>
				<Input
					type="number"
					value={desconto}
					onChange={(e) => setDesconto(e.target.value)}
					min="0"
					step={0.01}
				/>
			</div>

			<div>
				<Label>Forma de pagamento</Label>
				<select
					value={formaPagamento}
					onChange={(e) => setFormaPagamento(e.target.value)}
					className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
				>
					{FORMAS_PAGAMENTO.map((f) => (
						<option key={f.value} value={f.value}>
							{f.label}
						</option>
					))}
				</select>
			</div>

			{formaPagamento === "Dinheiro" && (
				<div>
					<Label>Valor recebido (R$)</Label>
					<Input
						type="number"
						value={valorRecebido}
						onChange={(e) => setValorRecebido(e.target.value)}
						min="0"
						step={0.01}
					/>
					{recebidoNum > 0 && (
						<p
							className={`mt-1 text-sm font-medium ${troco >= 0 ? "text-success-600 dark:text-success-400" : "text-error-600 dark:text-error-400"}`}
						>
							Troco: {formatarMoeda(troco)}
						</p>
					)}
				</div>
			)}

			<div>
				<Label>Observação (opcional)</Label>
				<Input
					value={observacao}
					onChange={(e) => setObservacao(e.target.value)}
				/>
			</div>

			<div className="space-y-1 border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
				<div className="flex justify-between text-gray-500 dark:text-gray-400">
					<span>Subtotal</span>
					<span>{formatarMoeda(subtotal)}</span>
				</div>
				<div className="flex justify-between text-gray-500 dark:text-gray-400">
					<span>Desconto</span>
					<span>{formatarMoeda(descontoNum)}</span>
				</div>
				<div className="flex justify-between text-base font-semibold text-gray-800 dark:text-white/90">
					<span>Total</span>
					<span>{formatarMoeda(total)}</span>
				</div>
			</div>

			{!caixaAberto && (
				<p className="text-xs text-error-600 dark:text-error-400">
					Caixa fechado — abra o caixa para finalizar vendas em dinheiro,
					cartão, PIX ou fiado.
				</p>
			)}

			<div className="flex gap-2">
				<button
					type="button"
					onClick={onOrcamento}
					disabled={carrinhoVazio || processando}
					className="flex-1 rounded-lg bg-warning-500 px-4 py-3.5 text-sm font-medium text-white transition hover:bg-warning-600 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Criar Orçamento
				</button>
				<button
					type="button"
					onClick={onFinalizar}
					disabled={!podeFinalizar || !caixaAberto}
					className="flex-1 rounded-lg bg-success-500 px-4 py-3.5 text-sm font-medium text-white transition hover:bg-success-600 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{processando ? "Finalizando..." : "Finalizar Venda"}
				</button>
			</div>
		</div>
	);
}
