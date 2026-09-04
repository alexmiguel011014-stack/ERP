"use client";
import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { usePageHeader } from "@/context/PageHeaderContext";
import { erpApi, type Consignacao, type StatusConsignacao } from "@/lib/erpApi";
import { formatarAtributos } from "@/lib/utils/formatos";
import ConsignacaoFormModal from "@/components/produtos/ConsignacaoFormModal";

function formatarMoeda(valor: number | null | undefined): string {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(valor ?? 0);
}

function formatarData(iso: string | null): string {
	if (!iso) return "---";
	const data = new Date(iso);
	if (Number.isNaN(data.getTime())) return iso.slice(0, 10);
	return data.toLocaleDateString("pt-BR");
}

const BADGE_POR_STATUS: Record<
	StatusConsignacao,
	"warning" | "success" | "primary" | "error"
> = {
	emprestado: "warning",
	devolvido: "success",
	vendido: "primary",
	perdido: "error",
};

const LABEL_POR_STATUS: Record<StatusConsignacao, string> = {
	emprestado: "Emprestado",
	devolvido: "Devolvido",
	vendido: "Vendido",
	perdido: "Perdido",
};

const FORMAS_PAGAMENTO = ["PIX", "Cartão", "Dinheiro", "Fiado"];

function VenderConsignacaoModal({
	consignacao,
	onClose,
	onConfirmado,
}: {
	consignacao: Consignacao | null;
	onClose: () => void;
	onConfirmado: () => void;
}) {
	const [precoUnitario, setPrecoUnitario] = useState("");
	const [formaPagamento, setFormaPagamento] = useState("");
	const [erro, setErro] = useState<string | null>(null);
	const [salvando, setSalvando] = useState(false);

	useEffect(() => {
		if (!consignacao) return;
		setPrecoUnitario(consignacao.preco ? String(consignacao.preco) : "");
		setFormaPagamento("");
		setErro(null);
	}, [consignacao]);

	if (!consignacao) return null;

	async function confirmar() {
		if (!consignacao) return;
		const preco = Number(precoUnitario);
		if (!Number.isFinite(preco) || preco < 0) {
			setErro("Preço unitário inválido.");
			return;
		}
		setSalvando(true);
		setErro(null);
		try {
			const resultado = await erpApi.consignacoes.marcarVendida(
				consignacao.id,
				{ preco_unitario: preco, forma_pagamento: formaPagamento || null },
			);
			if ("erro" in resultado) {
				setErro(resultado.erro);
				return;
			}
			onConfirmado();
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setSalvando(false);
		}
	}

	return (
		<div className="fixed inset-0 z-99999 flex items-center justify-center overflow-y-auto">
			<div
				className="fixed inset-0 h-full w-full bg-gray-400/50 backdrop-blur-[32px]"
				onClick={onClose}
			/>
			<div className="relative w-full max-w-[420px] rounded-2xl bg-white p-6 dark:bg-gray-900">
				<h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
					Confirmar venda — {consignacao.produto_nome}
				</h3>
				<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
					{consignacao.quantidade}x {consignacao.sku} ·{" "}
					{consignacao.cliente_nome || "sem cliente"}
				</p>

				<div className="mt-4 grid grid-cols-2 gap-3">
					<div>
						<Label>Preço unitário</Label>
						<Input
							type="number"
							step={0.01}
							value={precoUnitario}
							onChange={(e) => setPrecoUnitario(e.target.value)}
						/>
					</div>
					<div>
						<Label>Forma de pagamento</Label>
						<select
							value={formaPagamento}
							onChange={(e) => setFormaPagamento(e.target.value)}
							className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
						>
							<option value="">A definir</option>
							{FORMAS_PAGAMENTO.map((f) => (
								<option key={f} value={f}>
									{f}
								</option>
							))}
						</select>
					</div>
				</div>

				{erro && (
					<div className="mt-3 rounded-lg border border-error-300 bg-error-50 px-3 py-2 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
						{erro}
					</div>
				)}

				<div className="mt-5 flex justify-end gap-3">
					<Button variant="outline" onClick={onClose} disabled={salvando}>
						Cancelar
					</Button>
					<Button onClick={confirmar} disabled={salvando}>
						{salvando ? "Confirmando..." : "Confirmar Venda"}
					</Button>
				</div>
			</div>
		</div>
	);
}

export default function ConsignacaoPage() {
	usePageHeader(
		"Consignação",
		"Itens emprestados a clientes (mostruário, leve e decida depois) — ficam fora do estoque vendável até devolução, venda ou perda.",
	);

	const [lista, setLista] = useState<Consignacao[]>([]);
	const [carregando, setCarregando] = useState(false);
	const [erro, setErro] = useState<string | null>(null);
	const [filtroStatus, setFiltroStatus] = useState<StatusConsignacao | "">(
		"emprestado",
	);
	const [formAberto, setFormAberto] = useState(false);
	const [consignacaoParaVender, setConsignacaoParaVender] =
		useState<Consignacao | null>(null);
	const [processandoId, setProcessandoId] = useState<number | null>(null);

	const carregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			const resultado = await erpApi.consignacoes.listar(
				filtroStatus ? { status: filtroStatus } : undefined,
			);
			if ("erro" in resultado) {
				setErro(resultado.erro);
				setLista([]);
				return;
			}
			setLista(resultado);
		} catch (e) {
			setErro(
				e instanceof Error ? e.message : "Erro ao carregar consignações.",
			);
		} finally {
			setCarregando(false);
		}
	}, [filtroStatus]);

	useEffect(() => {
		carregar();
	}, [carregar]);

	async function encerrar(
		consignacao: Consignacao,
		acao: "devolvida" | "perdida",
	) {
		const confirmacao =
			acao === "devolvida"
				? `Confirmar devolução de ${consignacao.quantidade}x ${consignacao.produto_nome}?`
				: `Marcar ${consignacao.quantidade}x ${consignacao.produto_nome} como perdido? Essa ação não pode ser desfeita.`;
		if (!confirm(confirmacao)) return;

		setProcessandoId(consignacao.id);
		try {
			const resultado =
				acao === "devolvida"
					? await erpApi.consignacoes.marcarDevolvida(consignacao.id)
					: await erpApi.consignacoes.marcarPerdida(consignacao.id);
			if ("erro" in resultado) {
				setErro(resultado.erro);
				return;
			}
			carregar();
		} catch (e) {
			setErro(
				e instanceof Error ? e.message : "Erro ao atualizar consignação.",
			);
		} finally {
			setProcessandoId(null);
		}
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<div className="flex flex-wrap items-center gap-3">
					<Label>Status</Label>
					<select
						value={filtroStatus}
						onChange={(e) =>
							setFiltroStatus(e.target.value as StatusConsignacao | "")
						}
						className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
					>
						<option value="">Todos</option>
						<option value="emprestado">Emprestado</option>
						<option value="devolvido">Devolvido</option>
						<option value="vendido">Vendido</option>
						<option value="perdido">Perdido</option>
					</select>
				</div>
				<Button onClick={() => setFormAberto(true)}>Nova Consignação</Button>
			</div>

			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				{erro && (
					<div className="mb-3 rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
						{erro}
					</div>
				)}

				<div className="overflow-x-auto">
					{carregando ? (
						<div className="py-8 text-center text-sm text-gray-400">
							Carregando...
						</div>
					) : lista.length === 0 ? (
						<div className="py-8 text-center text-sm text-gray-400">
							Nenhuma consignação encontrada.
						</div>
					) : (
						<table className="w-full text-left text-sm">
							<thead>
								<tr className="border-b border-gray-100 dark:border-gray-800">
									<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
										Cliente
									</th>
									<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
										Produto
									</th>
									<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
										Qtd.
									</th>
									<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
										Saída
									</th>
									<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
										Retorno previsto
									</th>
									<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
										Status
									</th>
									<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
										Ações
									</th>
								</tr>
							</thead>
							<tbody>
								{lista.map((c) => (
									<tr
										key={c.id}
										className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
									>
										<td className="px-3 py-2 text-gray-600 dark:text-gray-300">
											{c.cliente_nome || "---"}
										</td>
										<td className="px-3 py-2 text-gray-600 dark:text-gray-300">
											<div className="font-medium text-gray-800 dark:text-white/90">
												{c.produto_nome}
											</div>
											<div className="text-xs text-gray-400">
												{c.sku} · {formatarAtributos(null, c.tamanho, c.cor)} ·{" "}
												{formatarMoeda(c.preco)}
											</div>
										</td>
										<td className="px-3 py-2 text-gray-600 dark:text-gray-300">
											{c.quantidade}
										</td>
										<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
											{formatarData(c.data_saida)}
										</td>
										<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
											{formatarData(c.data_prevista_retorno)}
										</td>
										<td className="whitespace-nowrap px-3 py-2">
											<Badge size="sm" color={BADGE_POR_STATUS[c.status]}>
												{LABEL_POR_STATUS[c.status]}
											</Badge>
										</td>
										<td className="whitespace-nowrap px-3 py-2">
											{c.status === "emprestado" ? (
												<div className="flex flex-wrap gap-2">
													<button
														type="button"
														disabled={processandoId === c.id}
														onClick={() => setConsignacaoParaVender(c)}
														className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400"
													>
														Vender
													</button>
													<button
														type="button"
														disabled={processandoId === c.id}
														onClick={() => encerrar(c, "devolvida")}
														className="text-xs font-medium text-success-600 hover:underline disabled:opacity-50 dark:text-success-400"
													>
														Devolvida
													</button>
													<button
														type="button"
														disabled={processandoId === c.id}
														onClick={() => encerrar(c, "perdida")}
														className="text-xs font-medium text-error-600 hover:underline disabled:opacity-50 dark:text-error-400"
													>
														Perdida
													</button>
												</div>
											) : (
												<span className="text-xs text-gray-400">---</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			</div>

			<ConsignacaoFormModal
				isOpen={formAberto}
				onClose={() => setFormAberto(false)}
				onSalvo={carregar}
			/>

			<VenderConsignacaoModal
				consignacao={consignacaoParaVender}
				onClose={() => setConsignacaoParaVender(null)}
				onConfirmado={() => {
					setConsignacaoParaVender(null);
					carregar();
				}}
			/>
		</div>
	);
}
