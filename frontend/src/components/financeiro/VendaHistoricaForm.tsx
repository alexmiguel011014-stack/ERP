"use client";

import { useState } from "react";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import ClienteSelector from "@/components/pdv/ClienteSelector";
import type {
	Cliente,
	FormaPagamentoHistorica,
	VendaHistoricaDados,
} from "@/lib/erpApi";
import { erpApi } from "@/lib/erpApi";

const FORMAS: FormaPagamentoHistorica[] = [
	"Genérico",
	"PIX",
	"Cartão",
	"Dinheiro",
	"Fiado",
];

function novoRequestId() {
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return `venda-historica-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function VendaHistoricaForm({
	clientes,
	onSalvo,
	onErro,
}: {
	clientes: Cliente[];
	onSalvo: (mensagem: string) => void;
	onErro: (mensagem: string) => void;
}) {
	const [nome, setNome] = useState("");
	const [total, setTotal] = useState("");
	const [dataVenda, setDataVenda] = useState("");
	const [formaPagamento, setFormaPagamento] =
		useState<FormaPagamentoHistorica>("Genérico");
	const [cliente, setCliente] = useState<Cliente | null>(null);
	const [statusRecebivel, setStatusRecebivel] = useState<"aberto" | "pago">(
		"pago",
	);
	const [dataVencimento, setDataVencimento] = useState("");
	const [salvando, setSalvando] = useState(false);
	const hoje = new Date().toISOString().slice(0, 10);

	function limpar() {
		setNome("");
		setTotal("");
		setDataVenda("");
		setFormaPagamento("Genérico");
		setCliente(null);
		setStatusRecebivel("pago");
		setDataVencimento("");
	}

	async function registrar() {
		const dados: VendaHistoricaDados = {
			nome: nome.trim(),
			total: Number(total),
			data_venda: dataVenda,
			cliente_id: cliente?.id || null,
			forma_pagamento: formaPagamento,
			status_recebivel: formaPagamento === "Fiado" ? statusRecebivel : undefined,
			data_primeiro_vencimento:
				formaPagamento === "Fiado" && statusRecebivel === "aberto"
					? dataVencimento
					: null,
			request_id: novoRequestId(),
		};

		if (!dados.nome) {
			onErro("Informe o nome/descrição da venda.");
			return;
		}
		if (!Number.isFinite(dados.total) || dados.total <= 0) {
			onErro("Informe um valor total maior que zero.");
			return;
		}
		if (!dados.data_venda) {
			onErro("Informe a data da venda.");
			return;
		}
		if (dados.data_venda > hoje) {
			onErro("A data da venda não pode estar no futuro.");
			return;
		}
		if (
			formaPagamento === "Fiado" &&
			statusRecebivel === "aberto" &&
			!dataVencimento
		) {
			onErro("Informe o primeiro vencimento do fiado em aberto.");
			return;
		}

		setSalvando(true);
		try {
			const resultado = await erpApi.vendas.registrarHistorica(dados);
			onSalvo(
				`Venda histórica #${resultado.vendaId} registrada. Ela já aparece nos relatórios.`,
			);
			limpar();
		} catch (e) {
			onErro(e instanceof Error ? e.message : String(e));
		} finally {
			setSalvando(false);
		}
	}

	return (
		<div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-500/10">
			<div>
				<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
					Registrar venda histórica
				</h2>
				<p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
					Use para registrar uma venda antiga sem alterar o estoque atual. Os campos
					com * são obrigatórios.
				</p>
			</div>
			<div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				<div className="lg:col-span-2">
					<Label>Nome/descrição da venda *</Label>
					<Input
						value={nome}
						onChange={(e) => setNome(e.target.value)}
						placeholder="Ex.: Vendas de janeiro — balcão"
						max="255"
					/>
				</div>
				<div>
					<Label>Valor total (R$) *</Label>
					<Input
						type="number"
						value={total}
						onChange={(e) => setTotal(e.target.value)}
						min="0.01"
						step={0.01}
					/>
				</div>
				<div>
					<Label>Data da venda *</Label>
					<Input
						type="date"
						value={dataVenda}
						onChange={(e) => setDataVenda(e.target.value)}
						max={hoje}
					/>
				</div>
				<div>
					<Label>Cliente (opcional)</Label>
					<ClienteSelector
						clientes={clientes}
						clienteSelecionado={cliente}
						onSelecionar={setCliente}
						onLimpar={() => setCliente(null)}
					/>
					{formaPagamento === "Fiado" && (
						<p className="mt-1 text-xs text-warning-700 dark:text-warning-400">
							Obrigatório para Fiado.
						</p>
					)}
				</div>
				<div>
					<Label>Método de pagamento</Label>
					<select
						value={formaPagamento}
						onChange={(e) =>
							setFormaPagamento(e.target.value as FormaPagamentoHistorica)
						}
						className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
					>
						{FORMAS.map((forma) => (
							<option key={forma} value={forma}>
								{forma}
							</option>
						))}
					</select>
					<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
						Se não souber, mantenha Genérico.
					</p>
				</div>
				{formaPagamento === "Fiado" && (
					<div>
						<Label>Situação do Fiado</Label>
						<select
							value={statusRecebivel}
							onChange={(e) =>
								setStatusRecebivel(
									e.target.value === "aberto" ? "aberto" : "pago",
								)
							}
							className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
						>
							<option value="pago">Já recebido</option>
							<option value="aberto">Em aberto</option>
						</select>
					</div>
				)}
				{formaPagamento === "Fiado" && statusRecebivel === "aberto" && (
					<div>
						<Label>Primeiro vencimento *</Label>
						<Input
							type="date"
							value={dataVencimento}
							onChange={(e) => setDataVencimento(e.target.value)}
							min={dataVenda || undefined}
						/>
					</div>
				)}
			</div>
			<div className="mt-4 flex justify-end">
				<Button onClick={registrar} disabled={salvando}>
					{salvando ? "Registrando..." : "Registrar venda histórica"}
				</Button>
			</div>
		</div>
	);
}
