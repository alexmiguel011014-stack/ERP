"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import ClienteSelector from "@/components/pdv/ClienteSelector";
import BuscaProduto from "@/components/pdv/BuscaProduto";
import { formatarAtributos } from "@/lib/utils/formatos";
import { erpApi, type Cliente, type ProdutoBusca } from "@/lib/erpApi";

export default function ConsignacaoFormModal({
	isOpen,
	onClose,
	onSalvo,
}: {
	isOpen: boolean;
	onClose: () => void;
	onSalvo: () => void;
}) {
	const [clientes, setClientes] = useState<Cliente[]>([]);
	const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(
		null,
	);
	const [produtoSelecionado, setProdutoSelecionado] =
		useState<ProdutoBusca | null>(null);
	const [quantidade, setQuantidade] = useState("1");
	const [dataPrevistaRetorno, setDataPrevistaRetorno] = useState("");
	const [observacao, setObservacao] = useState("");
	const [erro, setErro] = useState<string | null>(null);
	const [salvando, setSalvando] = useState(false);

	useEffect(() => {
		if (!isOpen) return;
		setErro(null);
		setClienteSelecionado(null);
		setProdutoSelecionado(null);
		setQuantidade("1");
		setDataPrevistaRetorno("");
		setObservacao("");
		erpApi.clientes
			.listar()
			.then(setClientes)
			.catch(() => setClientes([]));
	}, [isOpen]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!produtoSelecionado) {
			setErro("Selecione o produto/variação a consignar.");
			return;
		}
		const qtd = Number(quantidade);
		if (!Number.isInteger(qtd) || qtd <= 0) {
			setErro("Quantidade inválida.");
			return;
		}
		setSalvando(true);
		setErro(null);
		try {
			const resultado = await erpApi.consignacoes.registrar({
				cliente_id: clienteSelecionado?.id ?? null,
				variacao_id: produtoSelecionado.id,
				quantidade: qtd,
				data_prevista_retorno: dataPrevistaRetorno || null,
				observacao: observacao.trim() || null,
			});
			if ("erro" in resultado) {
				setErro(resultado.erro);
				return;
			}
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
				Nova Consignação
			</h2>
			<form onSubmit={handleSubmit} className="space-y-4">
				<div>
					<Label>Cliente (opcional)</Label>
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
							<span className="min-w-0 truncate">
								<span className="font-medium text-gray-800 dark:text-white/90">
									{produtoSelecionado.nome}
								</span>{" "}
								<span className="text-gray-400">
									({produtoSelecionado.sku} ·{" "}
									{formatarAtributos(
										produtoSelecionado.atributos,
										produtoSelecionado.tamanho,
										produtoSelecionado.cor,
									)}
									)
								</span>
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
						<BuscaProduto onSelecionar={setProdutoSelecionado} />
					)}
					{produtoSelecionado && (
						<p className="mt-1 text-xs text-gray-400">
							{produtoSelecionado.quantidade_disponivel} disponível em estoque
						</p>
					)}
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div>
						<Label>Quantidade</Label>
						<Input
							type="number"
							min="1"
							value={quantidade}
							onChange={(e) => setQuantidade(e.target.value)}
						/>
					</div>
					<div>
						<Label>Retorno previsto</Label>
						<Input
							type="date"
							value={dataPrevistaRetorno}
							onChange={(e) => setDataPrevistaRetorno(e.target.value)}
						/>
					</div>
				</div>

				<div>
					<Label>Observação</Label>
					<Input
						value={observacao}
						onChange={(e) => setObservacao(e.target.value)}
						placeholder="Ex: levou para experimentar em casa"
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
					<Button type="submit" disabled={salvando || !produtoSelecionado}>
						{salvando ? "Salvando..." : "Registrar Consignação"}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
