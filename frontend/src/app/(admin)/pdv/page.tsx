"use client";
import { useEffect, useRef, useState } from "react";
import { usePageHeader } from "@/context/PageHeaderContext";
import { useCarrinho } from "@/hooks/useCarrinho";
import { useCaixa } from "@/hooks/useCaixa";
import { useClientes } from "@/hooks/useClientes";
import {
	erpApi,
	type Cliente,
	type CondicaoParcelamento,
	type PagamentoVendaInput,
	type PreviaVendaParcelada,
	type ProdutoBusca,
} from "@/lib/erpApi";
import BuscaProduto from "@/components/pdv/BuscaProduto";
import Carrinho from "@/components/pdv/Carrinho";
import ClienteSelector from "@/components/pdv/ClienteSelector";
import PagamentoPainel, {
	type PagamentoCheckout,
} from "@/components/pdv/PagamentoPainel";
import CaixaBadge from "@/components/pdv/CaixaBadge";
import CaixaModal from "@/components/pdv/CaixaModal";
import ReciboModal, {
	type DadosRecibo,
	type PagamentoRecibo,
} from "@/components/pdv/ReciboModal";
import DevolucaoModal from "@/components/pdv/DevolucaoModal";
import {
	formatarMoeda,
	lerDecimalInformado,
	lerValorMonetario,
} from "@/components/pdv/formatos";

function formasPagamentoLabel(forma: string): string {
	return forma || "---";
}

const CHAVE_FORMULARIO = "pdv_formulario";
const FORMAS_PAGAMENTO_VALIDAS = ["PIX", "Cartão", "Dinheiro", "Fiado"] as const;

function normalizarFormaPagamento(
	valor: string | null | undefined,
): PagamentoVendaInput["forma_pagamento"] | "" {
	return FORMAS_PAGAMENTO_VALIDAS.includes(
		valor as PagamentoVendaInput["forma_pagamento"],
	)
		? (valor as PagamentoVendaInput["forma_pagamento"])
		: "";
}

type FormularioSalvo = {
	desconto: string;
	formaPagamento: string;
	valorRecebido: string;
	observacao: string;
	clienteId: number | null;
	condicaoParcelamentoId: number | null;
	dataPrimeiroVencimento: string;
	requestId: string | null;
	pagamentos?: PagamentoCheckout[];
};

function carregarFormularioSalvo(): FormularioSalvo | null {
	if (typeof window === "undefined") return null;
	try {
		const bruto = window.localStorage.getItem(CHAVE_FORMULARIO);
		if (!bruto) return null;
		const salvo = JSON.parse(bruto) as Partial<FormularioSalvo> | null;
		if (!salvo || typeof salvo !== "object") return null;
		const formaPagamento = normalizarFormaPagamento(salvo.formaPagamento);
		const pagamentos = Array.isArray(salvo.pagamentos)
			? salvo.pagamentos
					.filter((pagamento) => pagamento && typeof pagamento === "object")
					.map((pagamento) => ({
						forma_pagamento: normalizarFormaPagamento(pagamento.forma_pagamento),
						valor:
							typeof pagamento.valor === "string"
								? pagamento.valor
								: Number.isFinite(Number(pagamento.valor))
									? String(pagamento.valor)
									: "",
					}))
			: undefined;
		return {
			desconto: typeof salvo.desconto === "string" ? salvo.desconto : "0",
			formaPagamento,
			valorRecebido:
				typeof salvo.valorRecebido === "string" ? salvo.valorRecebido : "",
			observacao: typeof salvo.observacao === "string" ? salvo.observacao : "",
			clienteId:
				typeof salvo.clienteId === "number" && Number.isInteger(salvo.clienteId)
					? salvo.clienteId
					: null,
			condicaoParcelamentoId:
				typeof salvo.condicaoParcelamentoId === "number" &&
				Number.isInteger(salvo.condicaoParcelamentoId)
				? salvo.condicaoParcelamentoId
				: null,
			dataPrimeiroVencimento:
				typeof salvo.dataPrimeiroVencimento === "string"
					? salvo.dataPrimeiroVencimento
					: "",
			requestId: typeof salvo.requestId === "string" ? salvo.requestId : null,
			pagamentos,
		};
	} catch {
		return null;
	}
}

export default function PdvPage() {
	usePageHeader("Frente de Caixa", "Vendas, orçamentos e devoluções.");

	const carrinho = useCarrinho();
	const caixa = useCaixa();
	const { clientes } = useClientes();

	const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(
		null,
	);
	const [desconto, setDesconto] = useState("0");
	const [formaPagamento, setFormaPagamento] = useState("");
	const [pagamentos, setPagamentos] = useState<PagamentoCheckout[]>([
		{ forma_pagamento: "", valor: "" },
	]);
	const [valorRecebido, setValorRecebido] = useState("");
	const [observacao, setObservacao] = useState("");
	const [condicoesParcelamento, setCondicoesParcelamento] = useState<
		CondicaoParcelamento[]
	>([]);
	const [condicaoParcelamentoId, setCondicaoParcelamentoId] = useState<
		number | null
	>(null);
	const [dataPrimeiroVencimento, setDataPrimeiroVencimento] = useState("");
	const [previaParcelamento, setPreviaParcelamento] =
		useState<PreviaVendaParcelada | null>(null);
	const [erroPreviaParcelamento, setErroPreviaParcelamento] = useState<string | null>(
		null,
	);
	const [requestId, setRequestId] = useState<string | null>(null);
	const [processando, setProcessando] = useState(false);
	const [mensagem, setMensagem] = useState<{
		texto: string;
		sucesso: boolean;
	} | null>(null);
	const [caixaModalAberto, setCaixaModalAberto] = useState(false);
	const [devolucaoAberta, setDevolucaoAberta] = useState(false);
	const [recibo, setRecibo] = useState<DadosRecibo | null>(null);
	const [clienteIdPendente, setClienteIdPendente] = useState<number | null>(
		null,
	);
	const [formularioCarregado, setFormularioCarregado] = useState(false);
	const limpezaFormularioPendente = useRef(false);
	const temCartaoNoPagamento = pagamentos.some(
		(pagamento) => pagamento.forma_pagamento === "Cartão",
	);

	// Igual o carrinho: sobrevive a uma navegação/reload acidental antes de
	// finalizar a venda, em vez de perder o que já foi preenchido.
	useEffect(() => {
		const salvo = carregarFormularioSalvo();
		if (salvo) {
			const formaSalva = normalizarFormaPagamento(salvo.formaPagamento);
			const pagamentosSalvos = salvo.pagamentos?.length
				? salvo.pagamentos.map((pagamento, indice) =>
						indice === 0 && !pagamento.forma_pagamento
							? { ...pagamento, forma_pagamento: formaSalva }
							: pagamento,
					)
				: [{ forma_pagamento: formaSalva, valor: "" }];
			setDesconto(salvo.desconto);
			setFormaPagamento(salvo.formaPagamento);
			setPagamentos(pagamentosSalvos);
			setValorRecebido(salvo.valorRecebido);
			setObservacao(salvo.observacao);
			setClienteIdPendente(salvo.clienteId);
			setCondicaoParcelamentoId(salvo.condicaoParcelamentoId ?? null);
			setDataPrimeiroVencimento(salvo.dataPrimeiroVencimento || "");
			setRequestId(salvo.requestId || null);
		}
		setFormularioCarregado(true);
	}, []);

	// O cliente salvo só guarda o id — resolve pro objeto Cliente assim que a
	// lista carregar (não dá pra persistir o objeto inteiro com segurança,
	// dados como telefone/endereço podem mudar entre sessões).
	useEffect(() => {
		if (clienteIdPendente === null || clientes.length === 0) return;
		const encontrado = clientes.find((c) => c.id === clienteIdPendente);
		if (encontrado) setClienteSelecionado(encontrado);
		setClienteIdPendente(null);
	}, [clienteIdPendente, clientes]);

	useEffect(() => {
		if (!formularioCarregado) return;
		try {
			if (limpezaFormularioPendente.current) {
				limpezaFormularioPendente.current = false;
				window.localStorage.removeItem(CHAVE_FORMULARIO);
				return;
			}
			const dados: FormularioSalvo = {
				desconto,
				formaPagamento,
				valorRecebido,
				observacao,
				clienteId: clienteSelecionado?.id ?? null,
				condicaoParcelamentoId,
				dataPrimeiroVencimento,
				requestId,
				pagamentos,
			};
			window.localStorage.setItem(CHAVE_FORMULARIO, JSON.stringify(dados));
		} catch {
			// localStorage indisponível — só significa que o formulário não
			// sobrevive a um reload, não é motivo pra quebrar o PDV.
		}
	}, [
		desconto,
		formaPagamento,
		valorRecebido,
		observacao,
		clienteSelecionado,
		condicaoParcelamentoId,
		dataPrimeiroVencimento,
		requestId,
		pagamentos,
		formularioCarregado,
	]);

	useEffect(() => {
		const formaParcelavel =
			formaPagamento === "Fiado"
				? "Fiado"
				: formaPagamento === "Cartão" || temCartaoNoPagamento
					? "Cartão"
					: null;
		if (!formaParcelavel) {
			setCondicoesParcelamento([]);
			setCondicaoParcelamentoId(null);
			setPreviaParcelamento(null);
			setErroPreviaParcelamento(null);
			return;
		}
		let ativo = true;
		erpApi.precificacao
			.condicoesParcelamento(formaParcelavel)
			.then((condicoes) => {
				if (!ativo) return;
				setCondicoesParcelamento(condicoes);
				setCondicaoParcelamentoId((atual) =>
					condicoes.some((condicao) => condicao.id === atual)
						? atual
						: (condicoes[0]?.id ?? null),
				);
			})
			.catch((erro) => {
				if (ativo) {
					mostrarMensagem(
						"Não foi possível carregar as condições: " +
							(erro instanceof Error ? erro.message : String(erro)),
						false,
					);
				}
			});
		return () => {
			ativo = false;
		};
	}, [formaPagamento, temCartaoNoPagamento]);

	useEffect(() => {
		if (
			(formaPagamento !== "Fiado" && formaPagamento !== "Cartão") ||
			!condicaoParcelamentoId ||
			carrinho.itens.length === 0 ||
			(formaPagamento === "Fiado" &&
				(!clienteSelecionado || !dataPrimeiroVencimento))
		) {
			setPreviaParcelamento(null);
			setErroPreviaParcelamento(null);
			return;
		}
		let ativo = true;
		erpApi.vendas
			.calcularParcelada({
				itens: carrinho.itens.map((item) => ({
					variacao_id: item.variacao_id,
					quantidade: item.quantidade,
					preco_unitario: item.preco_unitario,
				})),
				total: Math.max(0, carrinho.subtotal - lerValorMonetario(desconto)),
				desconto: Math.max(0, lerValorMonetario(desconto)),
				cliente_id: clienteSelecionado?.id ?? null,
				forma_pagamento: formaPagamento,
				condicao_parcelamento_id: condicaoParcelamentoId,
				data_primeiro_vencimento:
					formaPagamento === "Fiado" ? dataPrimeiroVencimento : null,
			})
			.then((previa) => {
				if (ativo) {
					setPreviaParcelamento(previa);
					setErroPreviaParcelamento(null);
				}
			})
			.catch((erro) => {
				if (ativo) {
					setPreviaParcelamento(null);
					setErroPreviaParcelamento(
						erro instanceof Error ? erro.message : String(erro),
					);
				}
			});
		return () => {
			ativo = false;
		};
	}, [
		carrinho.itens,
		carrinho.subtotal,
		clienteSelecionado,
		condicaoParcelamentoId,
		dataPrimeiroVencimento,
		desconto,
		formaPagamento,
		pagamentos,
	]);

	useEffect(() => {
		setRequestId(null);
	}, [
		carrinho.itens,
		clienteSelecionado,
		condicaoParcelamentoId,
		dataPrimeiroVencimento,
		desconto,
		formaPagamento,
		pagamentos,
	]);

	function mostrarMensagem(texto: string, sucesso: boolean) {
		setMensagem({ texto, sucesso });
		setTimeout(() => setMensagem(null), 4500);
	}

	async function adicionarProduto(produto: ProdutoBusca) {
		await carrinho.adicionar(produto, clienteSelecionado?.id ?? null);
	}

	async function selecionarCliente(cliente: Cliente) {
		setClienteSelecionado(cliente);
		await carrinho.reprecificarParaCliente(cliente.id);
	}

	function limparCliente() {
		setClienteSelecionado(null);
	}

	function alterarFormaPagamento(forma: string) {
		if (forma === "Misto") {
			setFormaPagamento("Misto");
			setCondicaoParcelamentoId(null);
			setPreviaParcelamento(null);
			setErroPreviaParcelamento(null);
			setDataPrimeiroVencimento("");
			return;
		}
		setFormaPagamento(forma);
		setPagamentos((atual) => {
			const linhas: PagamentoCheckout[] = atual.length
				? atual
				: [{ forma_pagamento: "", valor: "" }];
			const formaNormalizada = normalizarFormaPagamento(forma);
			return linhas.map((linha, indice) =>
				indice === 0 ? { ...linha, forma_pagamento: formaNormalizada } : linha,
			);
		});
		setCondicaoParcelamentoId(null);
		setPreviaParcelamento(null);
		setErroPreviaParcelamento(null);
		if (forma === "Fiado" && !dataPrimeiroVencimento) {
			setDataPrimeiroVencimento(new Date().toISOString().slice(0, 10));
		}
		if (forma !== "Fiado") setDataPrimeiroVencimento("");
	}

	function resetarFormularioPosVenda() {
		limpezaFormularioPendente.current = true;
		try {
			window.localStorage.removeItem(CHAVE_FORMULARIO);
		} catch {
			/* localStorage indisponível — o estado ainda será limpo. */
		}
		carrinho.limpar();
		setClienteSelecionado(null);
		setDesconto("0");
		setFormaPagamento("");
		setPagamentos([{ forma_pagamento: "", valor: "" }]);
		setValorRecebido("");
		setObservacao("");
		setCondicaoParcelamentoId(null);
		setDataPrimeiroVencimento("");
		setPreviaParcelamento(null);
		setErroPreviaParcelamento(null);
		setRequestId(null);
	}

	async function finalizar() {
		const descontoNumInformado = lerDecimalInformado(desconto);
		if (desconto.trim() !== "" && descontoNumInformado === null) {
			mostrarMensagem("Informe um desconto válido.", false);
			return;
		}
		const descontoNum = Math.max(0, descontoNumInformado ?? 0);
		const total =
			previaParcelamento?.total ??
			Math.max(0, carrinho.subtotal - descontoNum);
		const condicao = condicoesParcelamento.find(
			(item) => item.id === condicaoParcelamentoId,
		);
		const formaPagamentoFinal =
			pagamentos.length > 1 ? "Misto" : formaPagamento;
		const pagamentosParaEnviar: PagamentoVendaInput[] =
			pagamentos.length > 1
				? pagamentos.map((pagamento) => ({
						forma_pagamento: pagamento.forma_pagamento as PagamentoVendaInput["forma_pagamento"],
						valor: lerValorMonetario(pagamento.valor),
					}))
				: formaPagamento
					? [{
							forma_pagamento: normalizarFormaPagamento(formaPagamento) as PagamentoVendaInput["forma_pagamento"],
							valor: total,
						}]
					: [];
		const idDaVenda =
			requestId ||
			(typeof crypto !== "undefined" && crypto.randomUUID
				? crypto.randomUUID()
				: `pdv-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		setRequestId(idDaVenda);
		const resumo =
			`Confirmar venda de ${formatarMoeda(total)} via ${formasPagamentoLabel(formaPagamentoFinal)}?` +
			(formaPagamentoFinal === "Fiado"
				? `\n\n${previaParcelamento?.parcelas.length || 0} parcela(s) serão criadas para este cliente.`
				: formaPagamentoFinal === "Cartão"
					? `\n\n${condicao?.nome || "Condição"} será registrada na venda; nenhuma conta a receber será criada.`
				: "");
		if (!confirm(resumo)) {
			setRequestId(null);
			return;
		}

		setProcessando(true);
		try {
			const resultado = await erpApi.vendas.finalizar({
				itens: carrinho.itens.map((i) => ({
					variacao_id: i.variacao_id,
					quantidade: i.quantidade,
					preco_unitario: i.preco_unitario,
				})),
				status: "finalizada",
				desconto: descontoNum,
				total,
				cliente_id: clienteSelecionado?.id ?? null,
				forma_pagamento: formaPagamentoFinal || null,
				pagamentos: pagamentosParaEnviar,
				valor_recebido:
					pagamentosParaEnviar.some(
						(pagamento) => pagamento.forma_pagamento === "Dinheiro",
					)
						? lerValorMonetario(valorRecebido)
						: null,
				condicao_parcelamento_id: condicaoParcelamentoId,
				data_primeiro_vencimento:
					formaPagamentoFinal === "Fiado" ? dataPrimeiroVencimento : null,
				request_id: idDaVenda,
				observacao: observacao.trim() || null,
			});
			setRecibo({
				vendaId: resultado.vendaId,
				itens: carrinho.itens,
				subtotal: carrinho.subtotal,
				desconto: descontoNum,
				total: resultado.total ?? total,
				formaPagamento: formaPagamentoFinal,
				pagamentos: pagamentosParaEnviar.map(
					(pagamento): PagamentoRecibo => ({
						forma_pagamento: pagamento.forma_pagamento,
						valor: pagamento.valor,
					}),
				),
				condicaoNome: condicao?.nome || null,
				parcelas: resultado.parcelas || previaParcelamento?.parcelas || [],
				clienteNome: clienteSelecionado?.nome ?? null,
				valorRecebido:
					pagamentosParaEnviar.some(
						(pagamento) => pagamento.forma_pagamento === "Dinheiro",
					)
						? lerValorMonetario(valorRecebido) || 0
						: null,
				data: new Date().toISOString(),
			});
			resetarFormularioPosVenda();
			caixa.recarregar();
		} catch (e) {
			mostrarMensagem(
				"Erro ao finalizar venda: " +
					(e instanceof Error ? e.message : String(e)),
				false,
			);
		} finally {
			setProcessando(false);
		}
	}

	async function criarOrcamento() {
		if (pagamentos.length > 1) {
			mostrarMensagem(
				"Pagamento dividido só pode ser usado ao finalizar a venda. Remova a divisão para criar um orçamento.",
				false,
			);
			return;
		}
		if (
			!confirm(
				"Criar orçamento com os itens do carrinho? O estoque NÃO será baixado agora — converta em venda depois, na tela de Vendas.",
			)
		)
			return;

		setProcessando(true);
		try {
			const descontoNumInformado = lerDecimalInformado(desconto);
			if (desconto.trim() !== "" && descontoNumInformado === null) {
				mostrarMensagem("Informe um desconto válido.", false);
				return;
			}
			const descontoNum = Math.max(0, descontoNumInformado ?? 0);
			const total =
				previaParcelamento?.total ??
				Math.max(0, carrinho.subtotal - descontoNum);
			const resultado = await erpApi.vendas.finalizar({
				itens: carrinho.itens.map((i) => ({
					variacao_id: i.variacao_id,
					quantidade: i.quantidade,
					preco_unitario: i.preco_unitario,
				})),
				status: "orcamento",
				desconto: descontoNum,
				total,
				cliente_id: clienteSelecionado?.id ?? null,
				forma_pagamento: formaPagamento || null,
				condicao_parcelamento_id: condicaoParcelamentoId,
				data_primeiro_vencimento:
					formaPagamento === "Fiado" ? dataPrimeiroVencimento : null,
				observacao: observacao.trim() || null,
			});
			mostrarMensagem(`Orçamento #${resultado.vendaId} criado!`, true);
			resetarFormularioPosVenda();
		} catch (e) {
			mostrarMensagem(
				"Erro ao criar orçamento: " +
					(e instanceof Error ? e.message : String(e)),
				false,
			);
		} finally {
			setProcessando(false);
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<CaixaBadge
					aberto={caixa.aberto}
					carregando={caixa.carregando}
					onClick={() => setCaixaModalAberto(true)}
				/>
				<button
					type="button"
					onClick={() => setDevolucaoAberta(true)}
					className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
				>
					Devolução / Troca
				</button>
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

			{carrinho.alerta && (
				<div
					className={
						carrinho.alerta.tipo === "estoque-baixo"
							? "rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-800 dark:bg-warning-500/10 dark:text-warning-400"
							: "rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400"
					}
				>
					{carrinho.alerta.mensagem}
				</div>
			)}

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
				<div className="flex min-h-[500px] flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
					<BuscaProduto onSelecionar={adicionarProduto} />
					<Carrinho
						itens={carrinho.itens}
						onAumentar={carrinho.aumentar}
						onDiminuir={carrinho.diminuir}
						onRemover={carrinho.remover}
					/>
				</div>

				<div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
					<ClienteSelector
						clientes={clientes}
						clienteSelecionado={clienteSelecionado}
						onSelecionar={selecionarCliente}
						onLimpar={limparCliente}
					/>
					<PagamentoPainel
						subtotal={carrinho.subtotal}
						desconto={desconto}
						setDesconto={setDesconto}
				formaPagamento={formaPagamento}
						setFormaPagamento={alterarFormaPagamento}
						pagamentos={pagamentos}
						setPagamentos={setPagamentos}
						condicoes={condicoesParcelamento}
						condicaoId={condicaoParcelamentoId}
						setCondicaoId={setCondicaoParcelamentoId}
						previaParcelamento={previaParcelamento}
						erroPreviaParcelamento={erroPreviaParcelamento}
						clienteFiadoSelecionado={!!clienteSelecionado}
						dataPrimeiroVencimento={dataPrimeiroVencimento}
						setDataPrimeiroVencimento={setDataPrimeiroVencimento}
						valorRecebido={valorRecebido}
						setValorRecebido={setValorRecebido}
						observacao={observacao}
						setObservacao={setObservacao}
						carrinhoVazio={carrinho.itens.length === 0}
						processando={processando}
						caixaAberto={caixa.aberto}
						onFinalizar={finalizar}
						onOrcamento={criarOrcamento}
					/>
				</div>
			</div>

			<CaixaModal
				isOpen={caixaModalAberto}
				onClose={() => setCaixaModalAberto(false)}
				caixa={caixa.caixa}
				resumo={caixa.resumo}
				onCarregarResumo={caixa.carregarResumo}
				onAbrir={async (valor) => {
					await caixa.abrir(valor);
					mostrarMensagem("Caixa aberto.", true);
				}}
				onFechar={async (valor, observacao) => {
					const resultado = await caixa.fechar(valor, observacao);
					const diff = resultado.diferenca;
					mostrarMensagem(
						diff === 0
							? "Caixa fechado — sem diferença."
							: diff > 0
								? `Caixa fechado — sobrou ${formatarMoeda(diff)}.`
								: `Caixa fechado — faltou ${formatarMoeda(Math.abs(diff))}.`,
						true,
					);
					return resultado;
				}}
			/>

			<ReciboModal dados={recibo} onClose={() => setRecibo(null)} />

			<DevolucaoModal
				isOpen={devolucaoAberta}
				onClose={() => setDevolucaoAberta(false)}
				onDevolucaoRegistrada={(valorTotal) =>
					mostrarMensagem(
						`Devolução registrada — ${formatarMoeda(valorTotal)} estornado.`,
						true,
					)
				}
			/>
		</div>
	);
}
