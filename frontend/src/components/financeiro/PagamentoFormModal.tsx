"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { erpApi, type NovoPagamento, type Venda } from "@/lib/erpApi";
import { formatarMoeda } from "@/components/dashboard/formatos";

const METODOS = [
	{ value: "pix", label: "Pix" },
	{ value: "boleto", label: "Boleto" },
	{ value: "dinheiro", label: "Dinheiro" },
	{ value: "cartão", label: "Cartão" },
	{ value: "outro", label: "Outro" },
];

export default function PagamentoFormModal({
	isOpen,
	onClose,
	onSalvo,
}: {
	isOpen: boolean;
	onClose: () => void;
	onSalvo: () => void;
}) {
	const [vendas, setVendas] = useState<Venda[]>([]);
	const [vendaId, setVendaId] = useState("");
	const [metodo, setMetodo] = useState("pix");
	const [identificador, setIdentificador] = useState("");
	const [dataRecebimento, setDataRecebimento] = useState("");
	const [valorRecebido, setValorRecebido] = useState("");
	const [observacao, setObservacao] = useState("");
	const [erro, setErro] = useState<string | null>(null);
	const [salvando, setSalvando] = useState(false);

	const [gerandoQr, setGerandoQr] = useState(false);
	const [qr, setQr] = useState<{
		dataUrl: string;
		copiaECola: string;
		status: string;
	} | null>(null);
	const [copiado, setCopiado] = useState(false);

	useEffect(() => {
		if (!isOpen) return;
		setErro(null);
		setVendaId("");
		setMetodo("pix");
		setIdentificador("");
		setDataRecebimento(new Date().toISOString().slice(0, 10));
		setValorRecebido("");
		setObservacao("");
		setQr(null);
		setCopiado(false);
		erpApi.vendas
			.listar()
			.then(setVendas)
			.catch(() => setVendas([]));
	}, [isOpen]);

	async function gerarQrPix() {
		const valor = parseFloat(valorRecebido);
		if (!valor || valor <= 0) {
			setErro("Informe o valor antes de gerar o QR Code.");
			return;
		}
		setGerandoQr(true);
		setErro(null);
		try {
			const resultado = await erpApi.pagamentos.gerarQrCodePix({
				valor,
				txid: identificador.trim() || undefined,
				descricao: vendaId ? "Venda " + vendaId : undefined,
			});
			if (!identificador.trim() && resultado.txid) {
				setIdentificador(resultado.txid);
			}
			setQr({
				dataUrl: resultado.qrCodeDataUrl,
				copiaECola: resultado.copiaECola,
				status: resultado.automatico
					? "Confirmação automática habilitada — o pagamento será detectado sozinho."
					: "Confirmação manual: marque como recebido depois que o cliente pagar.",
			});
		} catch (e) {
			setErro(
				"Erro ao gerar QR Code Pix: " +
					(e instanceof Error ? e.message : String(e)),
			);
		} finally {
			setGerandoQr(false);
		}
	}

	function copiarCodigo() {
		if (!qr) return;
		navigator.clipboard
			.writeText(qr.copiaECola)
			.then(() => setCopiado(true))
			.catch(() => {});
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const dados: NovoPagamento = {
			venda_id: Number(vendaId),
			cliente_id: null,
			metodo,
			numero_identificador: identificador.trim(),
			data_recebimento: dataRecebimento,
			valor_recebido: parseFloat(valorRecebido),
			status: "pendente",
			observacao: observacao.trim(),
		};
		if (!dados.venda_id) {
			setErro("Selecione uma venda primeiro.");
			return;
		}
		if (!dados.numero_identificador) {
			setErro("Informe o identificador (TXID Pix ou número do boleto).");
			return;
		}
		if (!dados.valor_recebido || dados.valor_recebido <= 0) {
			setErro("Informe um valor válido maior que zero.");
			return;
		}
		setSalvando(true);
		setErro(null);
		try {
			await erpApi.pagamentos.registrar(dados);
			onSalvo();
			onClose();
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setSalvando(false);
		}
	}

	return (
		<Modal isOpen={isOpen} onClose={onClose} className="max-w-[560px] p-6">
			<h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
				Lançar Novo Pagamento
			</h2>
			<form onSubmit={handleSubmit} className="space-y-4">
				<div>
					<Label>Venda</Label>
					<select
						value={vendaId}
						onChange={(e) => setVendaId(e.target.value)}
						className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
					>
						<option value="">-- Selecione uma venda --</option>
						{vendas.map((v) => (
							<option key={v.id} value={v.id}>
								Venda {v.id} (Cliente {v.cliente_nome || "—"} —{" "}
								{v.total ? formatarMoeda(v.total) : "—"})
							</option>
						))}
					</select>
				</div>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<Label>Método</Label>
						<select
							value={metodo}
							onChange={(e) => {
								setMetodo(e.target.value);
								setQr(null);
							}}
							className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
						>
							{METODOS.map((m) => (
								<option key={m.value} value={m.value}>
									{m.label}
								</option>
							))}
						</select>
					</div>
					<div>
						<Label>Número/Identificador</Label>
						<Input
							value={identificador}
							onChange={(e) => setIdentificador(e.target.value)}
							placeholder="TXID Pix ou Nº do Boleto"
						/>
					</div>
				</div>

				{metodo === "pix" && (
					<div>
						<Button
							type="button"
							variant="outline"
							onClick={gerarQrPix}
							disabled={gerandoQr}
						>
							{gerandoQr ? "Gerando..." : "Gerar QR Code Pix"}
						</Button>
						{qr && (
							<div className="mt-3">
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img
									src={qr.dataUrl}
									alt="QR Code Pix"
									className="mb-2 h-[180px] w-[180px]"
								/>
								<textarea
									readOnly
									rows={3}
									value={qr.copiaECola}
									className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
								/>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={copiarCodigo}
									className="mt-2"
								>
									{copiado ? "Copiado!" : "Copiar código"}
								</Button>
								<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
									{qr.status}
								</p>
							</div>
						)}
					</div>
				)}

				<div className="grid grid-cols-2 gap-4">
					<div>
						<Label>Data Recebimento</Label>
						<Input
							type="date"
							value={dataRecebimento}
							onChange={(e) => setDataRecebimento(e.target.value)}
						/>
					</div>
					<div>
						<Label>Valor Recebido</Label>
						<Input
							type="number"
							value={valorRecebido}
							onChange={(e) => setValorRecebido(e.target.value)}
							min="0.01"
							step={0.01}
						/>
					</div>
				</div>
				<div>
					<Label>Observação</Label>
					<Input
						value={observacao}
						onChange={(e) => setObservacao(e.target.value)}
						placeholder="Observações sobre o recebimento"
					/>
				</div>

				{erro && (
					<div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
						{erro}
					</div>
				)}
				<div className="flex justify-end gap-3 pt-2">
					<Button variant="outline" type="button" onClick={onClose}>
						Cancelar
					</Button>
					<Button type="submit" disabled={salvando}>
						{salvando ? "Gravando..." : "Gravar Pagamento"}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
