"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { formatarMoeda } from "./formatos";
import type { CaixaAberto, ResumoCaixa } from "@/lib/erpApi";

export default function CaixaModal({
	isOpen,
	onClose,
	caixa,
	resumo,
	onCarregarResumo,
	onAbrir,
	onFechar,
}: {
	isOpen: boolean;
	onClose: () => void;
	caixa: CaixaAberto | null;
	resumo: ResumoCaixa | null;
	onCarregarResumo: () => Promise<void>;
	onAbrir: (valor: number) => Promise<void>;
	onFechar: (
		valor: number,
		observacao: string | null,
	) => Promise<{ diferenca: number }>;
}) {
	const [valorAbertura, setValorAbertura] = useState("0");
	const [valorContado, setValorContado] = useState("");
	const [observacao, setObservacao] = useState("");
	const [processando, setProcessando] = useState(false);
	const [erro, setErro] = useState<string | null>(null);

	useEffect(() => {
		if (isOpen && caixa) onCarregarResumo();
		if (isOpen) {
			setErro(null);
			setValorContado("");
			setObservacao("");
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen, caixa]);

	async function confirmarAbrir() {
		const valor = Number(valorAbertura);
		if (!Number.isFinite(valor) || valor < 0) {
			setErro("Valor de abertura inválido.");
			return;
		}
		setProcessando(true);
		setErro(null);
		try {
			await onAbrir(valor);
			onClose();
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setProcessando(false);
		}
	}

	async function confirmarFechar() {
		const valor = Number(valorContado);
		if (!Number.isFinite(valor) || valor < 0) {
			setErro("Valor contado inválido.");
			return;
		}
		if (!confirm("Fechar o caixa com o valor informado?")) return;
		setProcessando(true);
		setErro(null);
		try {
			await onFechar(valor, observacao.trim() || null);
			onClose();
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setProcessando(false);
		}
	}

	return (
		<Modal isOpen={isOpen} onClose={onClose} className="max-w-md p-6">
			<h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
				Caixa
			</h2>

			{erro && (
				<div className="mt-3 rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
					{erro}
				</div>
			)}

			{!caixa ? (
				<div className="mt-4 space-y-3">
					<div>
						<Label>Valor de abertura (R$)</Label>
						<Input
							type="number"
							value={valorAbertura}
							onChange={(e) => setValorAbertura(e.target.value)}
							min="0"
							step={0.01}
						/>
					</div>
					<Button
						onClick={confirmarAbrir}
						disabled={processando}
						className="w-full"
					>
						{processando ? "Abrindo..." : "Abrir Caixa"}
					</Button>
				</div>
			) : (
				<div className="mt-4 space-y-3">
					{resumo && (
						<div className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-white/5">
							<p className="text-gray-500 dark:text-gray-400">
								Aberto em:{" "}
								<span className="text-gray-800 dark:text-white/90">
									{new Date(resumo.data_abertura).toLocaleString("pt-BR")}
								</span>
							</p>
							<p className="text-gray-500 dark:text-gray-400">
								Valor de abertura:{" "}
								<span className="text-gray-800 dark:text-white/90">
									{formatarMoeda(resumo.valor_abertura)}
								</span>
							</p>
							<p className="text-gray-500 dark:text-gray-400">
								Vendido em dinheiro:{" "}
								<span className="text-gray-800 dark:text-white/90">
									{formatarMoeda(resumo.vendido_em_dinheiro)}
								</span>
							</p>
							<p className="font-semibold text-gray-800 dark:text-white/90">
								Esperado agora: {formatarMoeda(resumo.valor_esperado_agora)}
							</p>
						</div>
					)}
					<div>
						<Label>Valor contado (R$)</Label>
						<Input
							type="number"
							value={valorContado}
							onChange={(e) => setValorContado(e.target.value)}
							min="0"
							step={0.01}
							placeholder="0,00"
						/>
					</div>
					<div>
						<Label>Observação (opcional)</Label>
						<Input
							value={observacao}
							onChange={(e) => setObservacao(e.target.value)}
						/>
					</div>
					<Button
						onClick={confirmarFechar}
						disabled={processando}
						className="w-full"
					>
						{processando ? "Fechando..." : "Fechar Caixa"}
					</Button>
				</div>
			)}
		</Modal>
	);
}
