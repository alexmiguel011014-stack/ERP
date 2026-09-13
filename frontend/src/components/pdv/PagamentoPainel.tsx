"use client";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { formatarMoeda, lerDecimalInformado, lerValorMonetario } from "./formatos";
import type {
	CondicaoParcelamento,
	PagamentoVendaInput,
	PreviaVendaParcelada,
} from "@/lib/erpApi";

const FORMAS_PAGAMENTO = [
	{ value: "", label: "Selecione..." },
	{ value: "PIX", label: "PIX" },
	{ value: "Cartão", label: "Cartão" },
	{ value: "Dinheiro", label: "Dinheiro" },
	{ value: "Fiado", label: "Fiado (a receber)" },
];

export type PagamentoCheckout = {
	forma_pagamento: PagamentoVendaInput["forma_pagamento"] | "";
	valor: string;
};

export default function PagamentoPainel({
	subtotal,
	desconto,
	setDesconto,
	formaPagamento,
	setFormaPagamento,
	pagamentos,
	setPagamentos,
	condicoes,
	condicaoId,
	setCondicaoId,
	previaParcelamento,
	erroPreviaParcelamento,
	clienteFiadoSelecionado,
	dataPrimeiroVencimento,
	setDataPrimeiroVencimento,
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
	pagamentos: PagamentoCheckout[];
	setPagamentos: (v: PagamentoCheckout[] | ((atual: PagamentoCheckout[]) => PagamentoCheckout[])) => void;
	condicoes: CondicaoParcelamento[];
	condicaoId: number | null;
	setCondicaoId: (v: number | null) => void;
	previaParcelamento: PreviaVendaParcelada | null;
	erroPreviaParcelamento: string | null;
	clienteFiadoSelecionado: boolean;
	dataPrimeiroVencimento: string;
	setDataPrimeiroVencimento: (v: string) => void;
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
	const descontoInformado = lerDecimalInformado(desconto);
	const descontoInvalido = desconto.trim() !== "" && descontoInformado === null;
	const descontoNum = Math.max(0, descontoInformado ?? 0);
	const variasFormas = pagamentos.length > 1;
	const condicao = !variasFormas
		? condicoes.find((item) => item.id === condicaoId) || null
		: null;
	const valorBase = Math.max(0, subtotal);
	const acrescimoLocal = condicao
		? Math.round(valorBase * Number(condicao.acrescimo_percentual || 0) * 100) /
			10000
		: 0;
	const totalLocal = Math.max(0, valorBase + acrescimoLocal - descontoNum);
	const total = previaParcelamento?.total ?? totalLocal;
	const acrescimo = previaParcelamento?.acrescimo ?? acrescimoLocal;
	const formaPagamentoEfetiva = variasFormas ? "Misto" : formaPagamento;
	const condicaoCartaoMisto = variasFormas
		? condicoes.find(
				(item) => item.id === condicaoId && item.forma_pagamento === "Cartão",
			) || null
		: null;
	const valorCartaoAlocado = variasFormas
		? pagamentos
				.filter((pagamento) => pagamento.forma_pagamento === "Cartão")
				.reduce((soma, pagamento) => soma + lerValorMonetario(pagamento.valor), 0)
		: 0;
	const parcelamentoAtivo = !variasFormas && (formaPagamento === "Fiado" || formaPagamento === "Cartão");
	const valorDinheiroAlocado = variasFormas
		? pagamentos
				.filter((pagamento) => pagamento.forma_pagamento === "Dinheiro")
				.reduce((soma, pagamento) => soma + lerValorMonetario(pagamento.valor), 0)
		: formaPagamento === "Dinheiro"
			? total
			: 0;
	const recebidoCentavos = Math.round(lerValorMonetario(valorRecebido) * 100);
	const totalCentavos = Math.round(total * 100);
	const recebidoNum = recebidoCentavos / 100;
	const dinheiroCentavos = Math.round(valorDinheiroAlocado * 100);
	const troco = valorDinheiroAlocado > 0 ? (recebidoCentavos - dinheiroCentavos) / 100 : 0;
	const pagamentosValidos =
		pagamentos.every(
			(pagamento) =>
				!!pagamento.forma_pagamento && lerValorMonetario(pagamento.valor) > 0,
		) &&
		Math.round(
			pagamentos.reduce(
				(soma, pagamento) => soma + lerValorMonetario(pagamento.valor),
				0,
			) * 100,
		) === totalCentavos;

	const podeFinalizar =
		!carrinhoVazio &&
		!descontoInvalido &&
		!!formaPagamentoEfetiva &&
		!processando &&
		(!variasFormas || pagamentosValidos) &&
		(valorDinheiroAlocado === 0 || recebidoCentavos >= dinheiroCentavos) &&
		(!parcelamentoAtivo ||
			(!!condicao &&
				!!previaParcelamento &&
				(formaPagamento !== "Fiado" ||
					(clienteFiadoSelecionado && !!dataPrimeiroVencimento))));

	return (
		<div className="space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
			<div>
				<Label>Desconto (R$)</Label>
				<Input
					type="text"
					inputMode="decimal"
					value={desconto}
					onChange={(e) => setDesconto(e.target.value)}
					min="0"
					step={0.01}
				/>
				{descontoInvalido && (
					<p className="mt-1 text-xs text-error-600 dark:text-error-400">
						Informe um desconto válido.
					</p>
				)}
			</div>

			<div>
				<Label>Forma de pagamento</Label>
				{pagamentos.map((pagamento, indice) => (
					<div key={indice} className="mb-2">
					<div className="flex gap-2">
						<select
							value={pagamento.forma_pagamento}
							onChange={(e) => {
								const forma = e.target.value as PagamentoCheckout["forma_pagamento"];
								setPagamentos((atual) =>
									atual.map((item, i) =>
										i === indice ? { ...item, forma_pagamento: forma } : item,
									),
								);
								if (indice === 0) setFormaPagamento(variasFormas ? "Misto" : forma);
							}}
							className="h-11 min-w-0 flex-1 appearance-none rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
						>
							{FORMAS_PAGAMENTO.filter(
								(f) => !variasFormas || f.value !== "Fiado",
							).map((f) => (
								<option key={f.value} value={f.value}>
									{f.label}
								</option>
							))}
						</select>
						{variasFormas && (
							<>
								<Input
									type="text"
									inputMode="decimal"
									value={pagamento.valor}
									onChange={(e) =>
										setPagamentos((atual) =>
											atual.map((item, i) =>
												i === indice ? { ...item, valor: e.target.value } : item,
											),
										)
									}
									placeholder="Valor"
									className="w-28"
								/>
								{indice > 0 && (
									<button
										type="button"
										onClick={() => {
											const restantes = pagamentos.filter((_, i) => i !== indice);
											setPagamentos(restantes);
											if (restantes.length === 1) {
												setFormaPagamento(restantes[0].forma_pagamento);
											}
										}}
									className="px-2 text-error-600"
									aria-label="Remover pagamento"
									>
										×
									</button>
								)}
							</>
						)}
					</div>
					{variasFormas && pagamento.forma_pagamento === "Cartão" && (
						<div className="mt-1 pl-1">
							<select
								value={condicaoId ?? ""}
								onChange={(event) =>
									setCondicaoId(
										event.target.value ? Number(event.target.value) : null,
									)
								}
								className="h-9 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
								aria-label="Parcelamento do cartão"
							>
								<option value="">Selecionar parcelas do cartão...</option>
								{condicoes
									.filter((condicao) => condicao.forma_pagamento === "Cartão")
									.map((condicao) => (
										<option key={condicao.id} value={condicao.id}>
											{condicao.nome} — {condicao.numero_parcelas}x
										</option>
									))}
							</select>
						</div>
					)}
					</div>
				))}
				<button
					type="button"
					disabled={!formaPagamentoEfetiva || formaPagamento === "Fiado" || processando || descontoInvalido}
					onClick={() => {
						setFormaPagamento("Misto");
						setCondicaoId(null);
						setPagamentos((atual) => [
							...atual.map((item, indice) =>
								indice === 0 ? { ...item, valor: totalLocal.toFixed(2) } : item,
							),
							{ forma_pagamento: "", valor: "" },
						]);
					}}
					className="text-sm font-medium text-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
				>
					+ Adicionar pagamento
				</button>
				{variasFormas && (
					<p className={`mt-1 text-xs ${pagamentosValidos ? "text-success-600" : "text-error-600"}`}>
						Total dos pagamentos: {formatarMoeda(pagamentos.reduce((soma, item) => soma + lerValorMonetario(item.valor), 0))} de {formatarMoeda(total)}
					</p>
				)}
				{variasFormas && valorCartaoAlocado > 0 && condicaoCartaoMisto && (
					<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
						Cartão: {condicaoCartaoMisto.numero_parcelas}x de aproximadamente {formatarMoeda(valorCartaoAlocado / condicaoCartaoMisto.numero_parcelas)} (valor do cartão: {formatarMoeda(valorCartaoAlocado)}).
					</p>
				)}
			</div>

			{valorDinheiroAlocado > 0 && (
				<div>
					<Label>Valor recebido (R$)</Label>
					<Input
						type="text"
						inputMode="decimal"
						value={valorRecebido}
						onChange={(e) => setValorRecebido(e.target.value)}
						min="0"
						step={0.01}
					/>
					{recebidoNum > 0 && (
						<p
							className={`mt-1 text-sm font-medium ${troco >= 0 ? "text-success-600 dark:text-success-400" : "text-error-600 dark:text-error-400"}`}
						>
							{troco >= 0
								? `Troco: ${formatarMoeda(troco)}`
								: `Falta: ${formatarMoeda(Math.abs(troco))}`}
						</p>
					)}
					{recebidoCentavos > 0 && recebidoCentavos < dinheiroCentavos && (
						<p className="mt-1 text-xs text-error-600 dark:text-error-400">
							Venda não finalizada: complete o valor ou escolha outra forma de pagamento.
						</p>
					)}
				</div>
			)}

			{parcelamentoAtivo && (
				<div className="space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
					<div>
						<Label>Condição de parcelamento</Label>
						<select
							value={condicaoId ?? ""}
							onChange={(event) =>
								setCondicaoId(
									event.target.value ? Number(event.target.value) : null,
								)
							}
							className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
						>
							<option value="">Selecione...</option>
							{condicoes.map((item) => (
								<option key={item.id} value={item.id}>
									{item.nome} — {Number(item.acrescimo_percentual).toFixed(2)}%
								</option>
							))}
						</select>
						{condicoes.length === 0 && (
							<p className="mt-1 text-xs text-error-600 dark:text-error-400">
								Não há condição ativa para esta forma de pagamento.
							</p>
						)}
					</div>

					{formaPagamento === "Fiado" && (
						<>
							<div>
								<Label>Primeiro vencimento</Label>
								<Input
									type="date"
									value={dataPrimeiroVencimento}
									onChange={(event) => setDataPrimeiroVencimento(event.target.value)}
								/>
							</div>
							{!clienteFiadoSelecionado && (
								<p className="text-xs text-error-600 dark:text-error-400">
									Selecione um cliente para vender fiado.
								</p>
							)}
						</>
					)}
					{formaPagamento === "Cartão" && (
						<p className="text-xs text-gray-500 dark:text-gray-400">
							O parcelamento fica registrado na venda; não cria contas a receber do cliente.
						</p>
					)}
					{erroPreviaParcelamento && (
						<p className="text-xs text-error-600 dark:text-error-400">
							{erroPreviaParcelamento}
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
				{parcelamentoAtivo && condicao && (
					<div className="flex justify-between text-gray-500 dark:text-gray-400">
						<span>Acréscimo ({Number(condicao.acrescimo_percentual).toFixed(2)}%)</span>
						<span>{formatarMoeda(acrescimo)}</span>
					</div>
				)}
				<div className="flex justify-between text-base font-semibold text-gray-800 dark:text-white/90">
					<span>Total</span>
					<span>{formatarMoeda(total)}</span>
				</div>
				{parcelamentoAtivo && previaParcelamento && (
					<div className="pt-1 text-xs text-gray-500 dark:text-gray-400">
						{previaParcelamento.parcelas.map((parcela) => (
							<p key={parcela.numero}>
								{parcela.numero}/{previaParcelamento.parcelas.length}: {formatarMoeda(parcela.valor)}
								{formaPagamento === "Fiado" && parcela.vencimento
									? ` — vence ${new Date(`${parcela.vencimento}T12:00:00`).toLocaleDateString("pt-BR")}`
									: ""}
							</p>
						))}
					</div>
				)}
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
