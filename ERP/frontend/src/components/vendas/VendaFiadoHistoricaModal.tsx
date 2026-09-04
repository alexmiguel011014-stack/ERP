"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Button from "@/components/ui/button/Button";
import ClienteSelector from "@/components/pdv/ClienteSelector";
import BuscaProduto from "@/components/pdv/BuscaProduto";
import { useClientes } from "@/hooks/useClientes";
import { erpApi, type Cliente, type ProdutoBusca } from "@/lib/erpApi";

// Crediário histórico com vínculo real (GOALS.md "4. Crediário histórico") —
// lançamento manual, um de cada vez: o dono informa cliente+SKU+data (dados
// que o "Crediário" da planilha antiga não tinha prontos) e o ERP cria a
// Venda histórica + o recebível já vinculado ao cliente. Reaproveita
// ClienteSelector e BuscaProduto do PDV (mesma busca, sem UI nova).
export default function VendaFiadoHistoricaModal({
	isOpen,
	onClose,
	onSalvo,
}: {
	isOpen: boolean;
	onClose: () => void;
	onSalvo: () => void;
}) {
	const { clientes } = useClientes();
	const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(
		null,
	);
	const [produtoSelecionado, setProdutoSelecionado] =
		useState<ProdutoBusca | null>(null);
	const [quantidade, setQuantidade] = useState("1");
	const [valorUnitario, setValorUnitario] = useState("");
	const [data, setData] = useState("");
	const [statusRecebivel, setStatusRecebivel] = useState<"aberto" | "pago">(
		"aberto",
	);
	const [erro, setErro] = useState<string | null>(null);
	const [salvando, setSalvando] = useState(false);

	const hoje = new Date().toISOString().slice(0, 10);

	useEffect(() => {
		if (!isOpen) return;
		setClienteSelecionado(null);
		setProdutoSelecionado(null);
		setQuantidade("1");
		setValorUnitario("");
		setData("");
		setStatusRecebivel("aberto");
		setErro(null);
	}, [isOpen]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setErro(null);

		if (!clienteSelecionado) {
			setErro("Selecione o cliente devedor.");
			return;
		}
		if (!produtoSelecionado) {
			setErro("Selecione o produto (SKU) vendido.");
			return;
		}
		const qtd = Number(quantidade);
		if (!Number.isFinite(qtd) || qtd <= 0) {
			setErro("Quantidade inválida.");
			return;
		}
		const valor = Number(valorUnitario);
		if (!Number.isFinite(valor) || valor < 0) {
			setErro("Valor unitário inválido.");
			return;
		}
		if (!data) {
			setErro("Informe a data da venda.");
			return;
		}
		if (data > hoje) {
			setErro(
				"A data precisa ser no passado — não é possível lançar venda futura como histórica.",
			);
			return;
		}

		setSalvando(true);
		try {
			await erpApi.vendas.registrarVendaFiadoHistorica({
				cliente_id: clienteSelecionado.id,
				sku: produtoSelecionado.sku,
				quantidade: qtd,
				valorUnitario: valor,
				data,
				statusRecebivel,
			});
			onSalvo();
			onClose();
		} catch (erroSalvar) {
			setErro(
				erroSalvar instanceof Error ? erroSalvar.message : String(erroSalvar),
			);
		} finally {
			setSalvando(false);
		}
	}

	return (
		<Modal isOpen={isOpen} onClose={onClose} className="max-w-[600px] p-6">
			<h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
				Lançar Venda Histórica
			</h2>
			<p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
				Registra uma dívida de crediário antiga já vinculada a um cliente — não
				baixa o estoque atual nem exige caixa aberto.
			</p>
			<form onSubmit={handleSubmit} className="space-y-4">
				<div>
					<Label>
						Cliente devedor <span className="text-error-500">*</span>
					</Label>
					<ClienteSelector
						clientes={clientes}
						clienteSelecionado={clienteSelecionado}
						onSelecionar={setClienteSelecionado}
						onLimpar={() => setClienteSelecionado(null)}
					/>
				</div>

				<div>
					<Label>
						Produto / SKU <span className="text-error-500">*</span>
					</Label>
					{produtoSelecionado ? (
						<div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-800 dark:bg-white/5">
							<span className="truncate font-medium text-gray-800 dark:text-white/90">
								{produtoSelecionado.nome} ({produtoSelecionado.sku})
							</span>
							<button
								type="button"
								onClick={() => setProdutoSelecionado(null)}
								className="shrink-0 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
							>
								Trocar
							</button>
						</div>
					) : (
						<BuscaProduto
							onSelecionar={(produto) => {
								setProdutoSelecionado(produto);
								setValorUnitario(String(produto.preco));
							}}
						/>
					)}
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div>
						<Label>
							Quantidade <span className="text-error-500">*</span>
						</Label>
						<Input
							type="number"
							min="1"
							step={1}
							value={quantidade}
							onChange={(e) => setQuantidade(e.target.value)}
						/>
					</div>
					<div>
						<Label>
							Valor unitário (R$) <span className="text-error-500">*</span>
						</Label>
						<Input
							type="number"
							min="0"
							step={0.01}
							value={valorUnitario}
							onChange={(e) => setValorUnitario(e.target.value)}
						/>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div>
						<Label>
							Data da venda <span className="text-error-500">*</span>
						</Label>
						<Input
							type="date"
							max={hoje}
							value={data}
							onChange={(e) => setData(e.target.value)}
						/>
					</div>
					<div>
						<Label>
							Status do recebível <span className="text-error-500">*</span>
						</Label>
						<Select
							options={[
								{ value: "aberto", label: "Em aberto (ainda deve)" },
								{ value: "pago", label: "Já foi pago" },
							]}
							defaultValue="aberto"
							onChange={(v) =>
								setStatusRecebivel(v === "pago" ? "pago" : "aberto")
							}
						/>
					</div>
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
						{salvando ? "Salvando..." : "Lançar Venda"}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
