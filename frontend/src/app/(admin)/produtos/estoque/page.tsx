"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Button from "@/components/ui/button/Button";
import { usePageHeader } from "@/context/PageHeaderContext";
import EstoqueReposicaoForm, { EntradaUnica } from "@/components/produtos/EstoqueReposicaoForm";
import { SaidaUnica } from "@/components/produtos/EstoqueBaixaForm";
import MovimentacoesList from "@/components/produtos/MovimentacoesList";
import { EstoqueDialog } from "@/components/produtos/EstoqueDialog";
import { EstoqueListaPanel } from "@/components/produtos/EstoqueListaView";
import { useAbaVisivel } from "@/context/AbaVisivelContext";
import { useEstoqueVisaoGeral } from "@/hooks/useEstoqueVisaoGeral";
import { useEstoqueReposicao } from "@/hooks/useEstoqueReposicao";
import type { EstoqueVisaoGeralLinha } from "@/lib/erpApi";

type AcaoUnica = {
	tipo: "entrada" | "saida";
	linha: EstoqueVisaoGeralLinha;
};

type DestinoDescarte =
	| { tipo: "fechar" }
	| { tipo: "acao"; acao: AcaoUnica };

export default function EstoquePage() {
	usePageHeader("Estoque", "Adicione produtos, registre saídas e consulte os saldos.");
	const { linhas, carregando, erro, recarregar } = useEstoqueVisaoGeral();
	const rascunhoReposicao = useEstoqueReposicao();
	const abaVisivel = useAbaVisivel();
	const abaVisivelAnterior = useRef(abaVisivel);
	const [movimentacoesAbertas, setMovimentacoesAbertas] = useState(false);
	const [entradaLoteAberta, setEntradaLoteAberta] = useState(false);
	const [registrandoLote, setRegistrandoLote] = useState(false);
	const [acaoUnica, setAcaoUnica] = useState<AcaoUnica | null>(null);
	const [unicaSuja, setUnicaSuja] = useState(false);
	const unicaSujaRef = useRef(false);
	const [registrandoUnica, setRegistrandoUnica] = useState(false);
	const registrandoUnicaRef = useRef(false);
	const minimoSalvandoRef = useRef(false);
	const fecharAposEscritaRef = useRef(false);
	const tituloAcaoRef = useRef<HTMLElement | null>(null);
	const restaurarFocoTituloAcaoRef = useRef(false);
	const [destinoDescarte, setDestinoDescarte] = useState<DestinoDescarte | null>(null);
	const [mensagem, setMensagem] = useState<{
		texto: string;
		sucesso: boolean;
	} | null>(null);

	useEffect(() => {
		if (abaVisivel && !abaVisivelAnterior.current) void recarregar();
		abaVisivelAnterior.current = abaVisivel;
	}, [abaVisivel, recarregar]);

	useLayoutEffect(() => {
		if (destinoDescarte || !restaurarFocoTituloAcaoRef.current) return;
		restaurarFocoTituloAcaoRef.current = false;
		tituloAcaoRef.current?.focus();
	}, [destinoDescarte]);

	function mostrarMensagem(texto: string, sucesso: boolean) {
		setMensagem({ texto, sucesso });
		setTimeout(() => setMensagem(null), 4500);
	}

	const temRascunhoReposicao =
		rascunhoReposicao.itens.length > 0 || Boolean(rascunhoReposicao.observacao.trim());

	const alterarEstadoSujo = useCallback((sujo: boolean) => {
		unicaSujaRef.current = sujo;
		setUnicaSuja(sujo);
	}, []);

	const alterarEstadoRegistro = useCallback((registrando: boolean) => {
		registrandoUnicaRef.current = registrando;
		setRegistrandoUnica(registrando);
		if (!registrando && fecharAposEscritaRef.current) {
			fecharAposEscritaRef.current = false;
			unicaSujaRef.current = false;
			setUnicaSuja(false);
			setDestinoDescarte(null);
			setAcaoUnica(null);
		}
	}, []);

	const alterarEstadoMinimo = useCallback((salvando: boolean) => {
		minimoSalvandoRef.current = salvando;
	}, []);

	function solicitarFechamentoUnico() {
		if (registrandoUnicaRef.current || minimoSalvandoRef.current) return;
		if (destinoDescarte) {
			setDestinoDescarte(null);
			return;
		}
		if (unicaSujaRef.current) {
			setDestinoDescarte({ tipo: "fechar" });
			return;
		}
		setAcaoUnica(null);
	}

	function abrirAcaoUnica(proxima: AcaoUnica) {
		if (registrandoUnicaRef.current || minimoSalvandoRef.current) return;
		if (
			acaoUnica?.tipo === proxima.tipo &&
			acaoUnica.linha.variacao_id === proxima.linha.variacao_id
		) return;
		if (unicaSujaRef.current) {
			setDestinoDescarte({ tipo: "acao", acao: proxima });
			return;
		}
		setDestinoDescarte(null);
		setUnicaSuja(false);
		setAcaoUnica(proxima);
	}

	function confirmarDescarteUnico() {
		if (registrandoUnicaRef.current) return;
		const destino = destinoDescarte;
		unicaSujaRef.current = false;
		setUnicaSuja(false);
		setDestinoDescarte(null);
		setAcaoUnica(destino?.tipo === "acao" ? destino.acao : null);
	}

	function sucessoDaEscritaUnica() {
		fecharAposEscritaRef.current = true;
		unicaSujaRef.current = false;
		setUnicaSuja(false);
		void recarregar();
	}

	function mostrarResultadoEntradaUnica(quantidade: number) {
		sucessoDaEscritaUnica();
		mostrarMensagem(`Entrada de ${quantidade} unidade(s) registrada com sucesso!`, true);
	}

	function mostrarResultadoSaidaUnica() {
		sucessoDaEscritaUnica();
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<p className="text-sm text-gray-600 dark:text-gray-300">
				Vendas concluídas reduzem o estoque automaticamente. O estoque mínimo
				é um limite para alerta e não altera o saldo.
			</p>
			<div
				className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
				role="group"
				aria-label="Ações do estoque"
			>
				<Button type="button" onClick={() => setEntradaLoteAberta(true)}>Entrada em lote</Button>
				<Button type="button" variant="outline" onClick={() => setMovimentacoesAbertas(true)}>
					Ver movimentações
				</Button>
				{temRascunhoReposicao && (
					<span role="status" className="text-sm text-warning-700 dark:text-warning-400">
						Rascunho pendente · {rascunhoReposicao.itens.length > 0
							? `${rascunhoReposicao.itens.length} item(ns)`
							: "observação salva"}
					</span>
				)}
			</div>
			<EstoqueDialog
				isOpen={entradaLoteAberta}
				title="Entrada em lote"
				onClose={() => setEntradaLoteAberta(false)}
				busy={registrandoLote}
			>
				<EstoqueReposicaoForm
					{...rascunhoReposicao}
					onRegistrandoChange={setRegistrandoLote}
					onConfirmado={() => {
						void recarregar();
						setEntradaLoteAberta(false);
						mostrarMensagem("Entrada registrada com sucesso!", true);
					}}
				/>
			</EstoqueDialog>
			<section role="region" aria-labelledby="lista-estoque">
				<h2 id="lista-estoque" className="mb-2 text-lg font-semibold text-gray-800 dark:text-white/90">
					Lista completa do estoque
				</h2>
				<div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
					<EstoqueListaPanel
						linhas={linhas}
						carregando={carregando}
						erro={erro}
						recarregar={recarregar}
						surface="card"
						onBusyChange={alterarEstadoMinimo}
						onAdicionar={(linha) => abrirAcaoUnica({ tipo: "entrada", linha })}
						onRetirar={(linha) => abrirAcaoUnica({ tipo: "saida", linha })}
					/>
				</div>
			</section>

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

			{acaoUnica && (
				<EstoqueDialog
					isOpen
					title={acaoUnica.tipo === "entrada" ? "Adicionar estoque" : "Retirar estoque"}
					initialFocusRef={tituloAcaoRef}
					onClose={solicitarFechamentoUnico}
					busy={registrandoUnica}
				>
					<div className="p-4">
						<p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
							{acaoUnica.linha.produto_nome} · SKU {acaoUnica.linha.sku}
							{unicaSuja && <span className="ml-2 text-warning-700 dark:text-warning-400">Alterações não salvas</span>}
						</p>
						<fieldset
							disabled={registrandoUnica || Boolean(destinoDescarte)}
							onChangeCapture={() => {
								unicaSujaRef.current = true;
								setUnicaSuja(true);
							}}
							className="min-w-0 border-0 p-0"
						>
							{acaoUnica.tipo === "entrada" ? (
								<EntradaUnica
									key={`entrada-${acaoUnica.linha.variacao_id}`}
									variacao_id={acaoUnica.linha.variacao_id}
									sku={acaoUnica.linha.sku}
									quantidade_estoque={acaoUnica.linha.quantidade_estoque}
									onEstadoSujo={alterarEstadoSujo}
									onRegistrandoChange={alterarEstadoRegistro}
									onMensagem={mostrarMensagem}
									onSucesso={mostrarResultadoEntradaUnica}
								/>
							) : (
								<SaidaUnica
									key={`saida-${acaoUnica.linha.variacao_id}`}
									variacao_id={acaoUnica.linha.variacao_id}
									sku={acaoUnica.linha.sku}
									quantidade_estoque={acaoUnica.linha.quantidade_estoque}
									quantidade_reservada={acaoUnica.linha.quantidade_reservada}
									onEstadoSujo={alterarEstadoSujo}
									onRegistrandoChange={alterarEstadoRegistro}
									onMensagem={mostrarMensagem}
									onSucesso={mostrarResultadoSaidaUnica}
								/>
							)}
						</fieldset>
						{destinoDescarte && (
							<div
								className="mt-4 rounded-lg border border-warning-300 bg-warning-50 p-4 dark:border-warning-700 dark:bg-warning-500/10"
								role="group"
								aria-label="Confirmar descarte das alterações"
							>
								<p className="text-sm text-gray-800 dark:text-white/90">
									{destinoDescarte.tipo === "acao"
										? "Descartar as alterações desta variação e abrir a selecionada?"
										: "Descartar as alterações não salvas?"}
								</p>
								<div className="mt-3 flex gap-3">
									<Button type="button" onClick={confirmarDescarteUnico} disabled={registrandoUnica}>
										Descartar alterações
									</Button>
									<Button
										type="button"
										variant="outline"
										onClick={() => {
											restaurarFocoTituloAcaoRef.current = true;
											setDestinoDescarte(null);
										}}
										disabled={registrandoUnica}
									>
										Continuar editando
									</Button>
								</div>
							</div>
						)}
					</div>
				</EstoqueDialog>
			)}
			<MovimentacoesList
				isOpen={movimentacoesAbertas}
				onClose={() => setMovimentacoesAbertas(false)}
			/>
		</div>
	);
}
