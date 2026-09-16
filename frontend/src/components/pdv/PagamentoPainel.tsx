"use client";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { formatarMoeda, lerDecimalInformado, lerValorMonetario } from "./formatos";
import type {
	CondicaoParcelamento,
	PreviaVendaParcelada,
} from "@/lib/erpApi";

export type PagamentoLinha = {
	id: string;
	formaPagamento: string;
	valor: string;
	condicaoId: number | null;
};

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
	pagamentos,
	onAlterarPagamento,
	onAdicionarPagamento,
	onRemoverPagamento,
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
	pagamentos: PagamentoLinha[];
	onAlterarPagamento: (id: string, dados: Partial<PagamentoLinha>) => void;
	onAdicionarPagamento: () => void;
	onRemoverPagamento: (id: string) => void;
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
	// Parser pt-BR compartilhado (1.4.1): aceita "12,50", "R$ 12,50", "1.250,00";
	// texto inválido bloqueia a venda em vez de virar 0 silenciosamente.
	const descontoInformado = lerDecimalInformado(desconto);
	const descontoInvalido = desconto.trim() !== "" && descontoInformado === null;
	const descontoNum = Math.max(0, descontoInformado ?? 0);
	const condicao = condicoes.find((item) => item.id === condicaoId) || null;
	const valorBase = Math.max(0, subtotal);
	const acrescimoLocal = condicao
		? Math.round(valorBase * Number(condicao.acrescimo_percentual || 0) * 100) /
			10000
		: 0;
	const totalLocal = Math.max(0, valorBase + acrescimoLocal - descontoNum);
	const total = previaParcelamento?.total ?? totalLocal;
	const acrescimo = previaParcelamento?.acrescimo ?? acrescimoLocal;
	const misto = pagamentos.length > 1;
	const valorDinheiro = misto
		? pagamentos
				.filter((item) => item.formaPagamento === "Dinheiro")
				.reduce((soma, item) => soma + lerValorMonetario(item.valor), 0)
		: total;
	const linhasMistasValidas = !misto || pagamentos.every(
		(item) => !!item.formaPagamento && lerValorMonetario(item.valor) > 0,
	);
	const temFiadoMisto = misto && pagamentos.some((item) => item.formaPagamento === "Fiado");
	const parcelamentoAtivo = formaPagamento === "Fiado" || formaPagamento === "Cartão";
	// Comparações em centavos: 0.1 + 0.2 não pode bloquear um troco de R$ 0,00.
	const recebidoCentavos = Math.round(lerValorMonetario(valorRecebido) * 100);
	const recebidoNum = recebidoCentavos / 100;
	const dinheiroCentavos = Math.round(valorDinheiro * 100);
	const temDinheiro =
		formaPagamento === "Dinheiro" ||
		pagamentos.some((item) => item.formaPagamento === "Dinheiro");
	const troco = temDinheiro ? (recebidoCentavos - dinheiroCentavos) / 100 : 0;

	const podeFinalizar =
		!carrinhoVazio &&
		!descontoInvalido &&
		!!formaPagamento &&
		!processando &&
		linhasMistasValidas &&
		!temFiadoMisto &&
		(!temDinheiro || recebidoCentavos >= dinheiroCentavos) &&
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
				/>
				{descontoInvalido && (
					<p className="mt-1 text-xs text-error-600 dark:text-error-400">
						Informe um desconto válido.
					</p>
				)}
			</div>

			<div>
				<Label>Forma de pagamento</Label>
				{pagamentos.length <= 1 ? (
					// Embrulhado num div de propósito: a suíte e2e (parcelamento.spec.ts)
					// acha o select como descendente do irmão do rótulo, nos dois modos.
					<div>
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
				) : (
					<div className="space-y-2">
						{pagamentos.map((pagamento, indice) => (
							<div key={pagamento.id} className="space-y-2 rounded-lg border border-gray-200 p-2 dark:border-gray-700">
								<div className="flex gap-2">
									<select
										value={pagamento.formaPagamento}
										onChange={(e) => onAlterarPagamento(pagamento.id, { formaPagamento: e.target.value, condicaoId: null })}
										className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
									>
										{FORMAS_PAGAMENTO.filter((f) => f.value).map((f) => (
											<option key={f.value} value={f.value}>{f.label}</option>
										))}
									</select>
									<Input
										type="text"
										inputMode="decimal"
										value={pagamento.valor}
										onChange={(e) => onAlterarPagamento(pagamento.id, { valor: e.target.value })}
										placeholder="Valor base"
										className="w-32"
									/>
									<button type="button" onClick={() => onRemoverPagamento(pagamento.id)} className="px-1 text-error-600" aria-label={`Remover pagamento ${indice + 1}`}>×</button>
								</div>
								{pagamento.formaPagamento === "Cartão" && (
									<select
										value={pagamento.condicaoId ?? condicaoId ?? ""}
										onChange={(e) => onAlterarPagamento(pagamento.id, { condicaoId: e.target.value ? Number(e.target.value) : null })}
										className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
									>
										<option value="">Condição do cartão...</option>
										{condicoes.map((item) => <option key={item.id} value={item.id}>{item.nome} — {Number(item.acrescimo_percentual).toFixed(2)}%</option>)}
									</select>
								)}
							</div>
						))}
						<button type="button" onClick={onAdicionarPagamento} className="text-sm font-medium text-brand-600 dark:text-brand-400">+ Adicionar pagamento</button>
						<p className="text-xs text-gray-500 dark:text-gray-400">Os valores são a divisão do total após o desconto. A taxa do cartão é somada somente à linha do cartão.</p>
						{temFiadoMisto && <p className="text-xs text-error-600 dark:text-error-400">Fiado não pode ser misturado com outra forma de pagamento.</p>}
					</div>
				)}
				{pagamentos.length === 1 && formaPagamento && formaPagamento !== "Fiado" && (
					<button type="button" onClick={onAdicionarPagamento} className="mt-2 text-sm font-medium text-brand-600 dark:text-brand-400">+ Adicionar pagamento</button>
				)}
			</div>

			{temDinheiro && (
				<div>
					<Label>Valor recebido (R$)</Label>
					<Input
						type="text"
						inputMode="decimal"
						value={valorRecebido}
						onChange={(e) => setValorRecebido(e.target.value)}
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
			{misto && previaParcelamento?.pagamentos && (
				<div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
					{previaParcelamento.pagamentos.map((pagamento, indice) => (
						<div key={`${pagamento.forma_pagamento}-${indice}`}>
							<p>{pagamento.forma_pagamento}: {formatarMoeda(pagamento.valorBase)}{pagamento.acrescimo > 0 ? ` + ${formatarMoeda(pagamento.acrescimo)} = ${formatarMoeda(pagamento.valorFinal)}` : ""}</p>
							{pagamento.forma_pagamento === "Cartão" && pagamento.parcelas.length > 1 && <p>{pagamento.parcelas.length}x: {pagamento.parcelas.map((parcela) => formatarMoeda(parcela.valor)).join(" · ")}</p>}
						</div>
					))}
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
					disabled={carrinhoVazio || processando || misto}
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
