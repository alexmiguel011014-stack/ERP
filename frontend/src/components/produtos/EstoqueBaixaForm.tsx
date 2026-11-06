"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import {
	erpApi,
	type ResultadoSaidaEstoque,
} from "@/lib/erpApi";

const MOTIVOS = [
	"Avaria",
	"Perda",
	"Troca/Devolução ao fornecedor",
	"Contagem física",
	"Outro",
];

export function SaidaUnica({
	variacao_id,
	sku,
	quantidade_estoque,
	quantidade_reservada,
	onSucesso,
	onEstadoSujo,
	onRegistrandoChange,
	onMensagem,
}: {
	variacao_id: number | null;
	sku: string | null;
	quantidade_estoque: number | null;
	quantidade_reservada: number | null;
	onSucesso: (variacaoId: number, resultado: ResultadoSaidaEstoque) => void;
	onEstadoSujo: (sujo: boolean) => void;
	onRegistrandoChange: (registrando: boolean) => void;
	onMensagem: (texto: string, sucesso: boolean) => void;
}) {
	const idCampos = useId();
	const [qtd, setQtd] = useState("");
	const [motivo, setMotivo] = useState(MOTIVOS[0]);
	const [erro, setErro] = useState<string | null>(null);
	const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
	const [registrando, setRegistrando] = useState(false);
	const envioEmCurso = useRef(false);
	const botaoConfirmarBaixaRef = useRef<HTMLButtonElement>(null);
	const restaurarFocoConfirmarRef = useRef(false);
	const sujo = qtd !== "" || motivo !== MOTIVOS[0];
	const quantidade = Number(qtd);
	const saldoEstimado =
		quantidade_estoque !== null && Number.isInteger(quantidade) && quantidade > 0
			? quantidade_estoque - quantidade
			: null;
	const abaixoDoReservado =
		saldoEstimado !== null &&
		quantidade_reservada !== null &&
		saldoEstimado < quantidade_reservada;

	useEffect(() => {
		onEstadoSujo(sujo);
	}, [onEstadoSujo, sujo]);

	useEffect(() => {
		setConfirmacaoAberta(false);
		setErro(null);
	}, [variacao_id]);

	useLayoutEffect(() => {
		if (confirmacaoAberta || !restaurarFocoConfirmarRef.current) return;
		restaurarFocoConfirmarRef.current = false;
		botaoConfirmarBaixaRef.current?.focus();
	}, [confirmacaoAberta]);

	function validarQuantidade(): number | null {
		if (variacao_id === null) {
			setErro("Selecione uma variação antes de dar baixa.");
			return null;
		}
		if (!Number.isInteger(quantidade) || quantidade <= 0) {
			setErro("Informe uma quantidade inteira e positiva.");
			document.getElementById(`${idCampos}-quantidade`)?.focus();
			return null;
		}
		setErro(null);
		return quantidade;
	}

	function solicitarBaixa() {
		if (registrando) return;
		if (validarQuantidade() === null) return;
		if (abaixoDoReservado) {
			setConfirmacaoAberta(true);
			return;
		}
		void registrarBaixa();
	}

	async function registrarBaixa() {
		if (envioEmCurso.current || variacao_id === null) return;
		const qtdBaixa = validarQuantidade();
		if (qtdBaixa === null) return;
		const variacaoIdEnviada = variacao_id;
		const motivoEnviado = motivo;
		envioEmCurso.current = true;
		setRegistrando(true);
		onRegistrandoChange(true);
		setConfirmacaoAberta(false);
		try {
			let resultado: ResultadoSaidaEstoque;
			try {
				resultado = await erpApi.estoque.registrarSaida({
					variacao_id: variacaoIdEnviada,
					quantidade: qtdBaixa,
					observacao: `${motivoEnviado} (baixa de ${qtdBaixa} un.)`,
				});
			} catch (erroRegistro) {
				onMensagem(
					"Erro ao registrar baixa: " +
						(erroRegistro instanceof Error ? erroRegistro.message : String(erroRegistro)),
					false,
				);
				return;
			}

			setQtd("");
			setMotivo(MOTIVOS[0]);
			try {
				onSucesso(variacaoIdEnviada, resultado);
			} catch {
				onMensagem("Baixa registrada; não foi possível atualizar os dados exibidos.", false);
				return;
			}
			if (resultado.abaixoDoReservado) {
				onMensagem(
					`Baixa registrada, mas o novo saldo (${resultado.quantidade_estoque}) ficou abaixo do que está reservado em orçamentos abertos (${resultado.quantidade_reservada}). Verifique os orçamentos pendentes desse produto.`,
					false,
				);
			} else {
				onMensagem(
					`Baixa de estoque registrada! Estoque atual: ${resultado.quantidade_estoque}.`,
					true,
				);
			}
		} finally {
			setRegistrando(false);
			onRegistrandoChange(false);
			envioEmCurso.current = false;
		}
	}

	return (
		<div className="mt-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div>
					<Label htmlFor={`${idCampos}-quantidade`}>Quantidade a dar baixa</Label>
					<Input
						id={`${idCampos}-quantidade`}
						type="number"
						value={qtd}
						onChange={(e) => {
							setQtd(e.target.value);
							setErro(null);
							setConfirmacaoAberta(false);
						}}
						min="1"
						step={1}
						placeholder="1"
						disabled={registrando}
						error={Boolean(erro && erro.includes("quantidade"))}
					/>
				</div>
				<div>
					<Label htmlFor={`${idCampos}-motivo`}>Motivo</Label>
					<select
						id={`${idCampos}-motivo`}
						value={motivo}
						disabled={registrando}
						onChange={(e) => {
							setMotivo(e.target.value);
							setConfirmacaoAberta(false);
						}}
						className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
					>
						{MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
					</select>
				</div>
			</div>
			{erro && <p className="mt-2 text-sm text-error-600 dark:text-error-400" role="alert">{erro}</p>}
			{variacao_id !== null && (
				<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
					<span className="text-gray-600 dark:text-gray-300">
						SKU: {sku} · Saldo atual: {quantidade_estoque} · Reservado: {quantidade_reservada} · Disponível: {(quantidade_estoque ?? 0) - (quantidade_reservada ?? 0)}
					</span>
					<strong className="text-gray-800 dark:text-white/90">Saldo estimado: {saldoEstimado ?? "—"}</strong>
				</div>
			)}
			{abaixoDoReservado && (
				<p className="mt-3 rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-warning-700 dark:border-warning-800 dark:bg-warning-500/10 dark:text-warning-400" role="status">
					Esta baixa deixará parte dos orçamentos abertos sem cobertura. Confira antes de continuar.
				</p>
			)}
			{confirmacaoAberta && (
				<div className="mt-4 rounded-lg border border-warning-300 bg-warning-50 p-4 dark:border-warning-700 dark:bg-warning-500/10" role="group" aria-label="Confirmar baixa abaixo do reservado">
					<p className="text-sm text-gray-800 dark:text-white/90">O saldo estimado ficará abaixo das unidades reservadas. Deseja registrar a baixa mesmo assim?</p>
					<div className="mt-3 flex gap-3">
						<Button type="button" onClick={() => void registrarBaixa()} disabled={registrando}>{registrando ? "Registrando..." : "Registrar mesmo assim"}</Button>
						<Button type="button" variant="outline" onClick={() => {
							restaurarFocoConfirmarRef.current = true;
							setConfirmacaoAberta(false);
						}} disabled={registrando}>Cancelar</Button>
					</div>
				</div>
			)}
			{!confirmacaoAberta && (
				<Button
					ref={botaoConfirmarBaixaRef}
					type="button"
					className="mt-4 bg-error-500 hover:bg-error-600"
					onClick={solicitarBaixa}
					disabled={registrando}
				>
					{registrando ? "Registrando..." : "Confirmar Baixa"}
				</Button>
			)}
		</div>
	);
}
