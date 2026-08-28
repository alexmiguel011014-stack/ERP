"use client";
import { useEffect, useState } from "react";
import { usePageHeader } from "@/context/PageHeaderContext";
import { useCarrinho } from "@/hooks/useCarrinho";
import { useCaixa } from "@/hooks/useCaixa";
import { useClientes } from "@/hooks/useClientes";
import { erpApi, type Cliente, type ProdutoBusca } from "@/lib/erpApi";
import BuscaProduto from "@/components/pdv/BuscaProduto";
import Carrinho from "@/components/pdv/Carrinho";
import ClienteSelector from "@/components/pdv/ClienteSelector";
import PagamentoPainel from "@/components/pdv/PagamentoPainel";
import CaixaBadge from "@/components/pdv/CaixaBadge";
import CaixaModal from "@/components/pdv/CaixaModal";
import ReciboModal, { type DadosRecibo } from "@/components/pdv/ReciboModal";
import DevolucaoModal from "@/components/pdv/DevolucaoModal";
import { formatarMoeda } from "@/components/pdv/formatos";

function formasPagamentoLabel(forma: string): string {
	return forma || "---";
}

const CHAVE_FORMULARIO = "pdv_formulario";

type FormularioSalvo = {
	desconto: string;
	formaPagamento: string;
	valorRecebido: string;
	observacao: string;
	clienteId: number | null;
};

function carregarFormularioSalvo(): FormularioSalvo | null {
	if (typeof window === "undefined") return null;
	try {
		const bruto = window.localStorage.getItem(CHAVE_FORMULARIO);
		return bruto ? JSON.parse(bruto) : null;
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
	const [valorRecebido, setValorRecebido] = useState("");
	const [observacao, setObservacao] = useState("");
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

	// Igual o carrinho: sobrevive a uma navegação/reload acidental antes de
	// finalizar a venda, em vez de perder o que já foi preenchido.
	useEffect(() => {
		const salvo = carregarFormularioSalvo();
		if (salvo) {
			setDesconto(salvo.desconto);
			setFormaPagamento(salvo.formaPagamento);
			setValorRecebido(salvo.valorRecebido);
			setObservacao(salvo.observacao);
			setClienteIdPendente(salvo.clienteId);
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
			const dados: FormularioSalvo = {
				desconto,
				formaPagamento,
				valorRecebido,
				observacao,
				clienteId: clienteSelecionado?.id ?? null,
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
		formularioCarregado,
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

	function resetarFormularioPosVenda() {
		carrinho.limpar();
		setClienteSelecionado(null);
		setDesconto("0");
		setFormaPagamento("");
		setValorRecebido("");
		setObservacao("");
	}

	async function finalizar() {
		const descontoNum = Math.max(0, Number(desconto) || 0);
		const total = Math.max(0, carrinho.subtotal - descontoNum);
		const resumo =
			`Confirmar venda de ${formatarMoeda(total)} via ${formasPagamentoLabel(formaPagamento)}?` +
			(formaPagamento === "Fiado"
				? "\n\nUma conta a receber será criada para este cliente."
				: "");
		if (!confirm(resumo)) return;

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
				forma_pagamento: formaPagamento || null,
				observacao: observacao.trim() || null,
			});
			setRecibo({
				vendaId: resultado.vendaId,
				itens: carrinho.itens,
				subtotal: carrinho.subtotal,
				desconto: descontoNum,
				total,
				formaPagamento,
				clienteNome: clienteSelecionado?.nome ?? null,
				valorRecebido:
					formaPagamento === "Dinheiro" ? Number(valorRecebido) || 0 : null,
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
		if (
			!confirm(
				"Criar orçamento com os itens do carrinho? O estoque NÃO será baixado agora — converta em venda depois, na tela de Vendas.",
			)
		)
			return;

		setProcessando(true);
		try {
			const descontoNum = Math.max(0, Number(desconto) || 0);
			const total = Math.max(0, carrinho.subtotal - descontoNum);
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
						setFormaPagamento={setFormaPagamento}
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
				onAbrir={caixa.abrir}
				onFechar={caixa.fechar}
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
