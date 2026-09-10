"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { erpApi, type Fornecedor, type FornecedorFormData } from "@/lib/erpApi";
import { mascaraCpfCnpj, mascaraTelefone } from "@/lib/utils/mascaras";

const FORM_VAZIO: FornecedorFormData = {
	nome: "",
	cnpj: "",
	telefone: "",
	email: "",
	contato: "",
	prazo_pagamento_dias: 0,
	observacao: "",
};

export default function FornecedorFormModal({
	isOpen,
	onClose,
	fornecedorEditando,
	onSalvo,
}: {
	isOpen: boolean;
	onClose: () => void;
	fornecedorEditando: Fornecedor | null;
	onSalvo: () => void;
}) {
	const [form, setForm] = useState<FornecedorFormData>(FORM_VAZIO);
	const [erro, setErro] = useState<string | null>(null);
	const [salvando, setSalvando] = useState(false);

	useEffect(() => {
		if (!isOpen) return;
		setErro(null);
		if (fornecedorEditando) {
			setForm({
				nome: fornecedorEditando.nome || "",
				// Passa pela máscara mesmo em registros existentes — normaliza CNPJ/
				// telefone salvos "crus" antes da máscara existir (ex: excesso de
				// dígitos, letras coladas) assim que o cadastro é reaberto.
				cnpj: mascaraCpfCnpj(fornecedorEditando.cnpj || ""),
				telefone: mascaraTelefone(fornecedorEditando.telefone || ""),
				email: fornecedorEditando.email || "",
				contato: fornecedorEditando.contato || "",
				prazo_pagamento_dias: fornecedorEditando.prazo_pagamento_dias || 0,
				observacao: fornecedorEditando.observacao || "",
			});
		} else {
			setForm(FORM_VAZIO);
		}
	}, [isOpen, fornecedorEditando]);

	function campo(nome: keyof FornecedorFormData, valor: string | number) {
		setForm((f) => ({ ...f, [nome]: valor }));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!form.nome.trim()) {
			setErro("Nome / Razão Social é obrigatório.");
			return;
		}
		setSalvando(true);
		setErro(null);
		const dados: FornecedorFormData = {
			nome: form.nome.trim(),
			cnpj: (form.cnpj || "").replace(/\D/g, "").slice(0, 14) || null,
			telefone: form.telefone?.trim() || null,
			email: form.email?.trim() || null,
			contato: form.contato?.trim() || null,
			prazo_pagamento_dias: Number(form.prazo_pagamento_dias) || 0,
			observacao: form.observacao?.trim() || null,
		};
		try {
			if (fornecedorEditando) {
				await erpApi.fornecedores.atualizar(fornecedorEditando.id, dados);
			} else {
				await erpApi.fornecedores.salvar(dados);
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
				{fornecedorEditando ? "Editar Fornecedor" : "Novo Fornecedor"}
			</h2>
			<form onSubmit={handleSubmit} className="space-y-4">
				<div>
					<Label>
						Nome / Razão Social <span className="text-error-500">*</span>
					</Label>
					<Input
						value={form.nome}
						onChange={(e) => campo("nome", e.target.value)}
						placeholder="Ex: Kimonos Brasil Ltda"
					/>
				</div>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<Label>CNPJ</Label>
						<Input
							value={form.cnpj || ""}
							onChange={(e) => campo("cnpj", mascaraCpfCnpj(e.target.value))}
							placeholder="00.000.000/0000-00"
						/>
					</div>
					<div>
						<Label>Telefone</Label>
						<Input
							value={form.telefone || ""}
							onChange={(e) =>
								campo("telefone", mascaraTelefone(e.target.value))
							}
							placeholder="(11) 99999-8888"
						/>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<Label>E-mail</Label>
						<Input
							type="email"
							value={form.email || ""}
							onChange={(e) => campo("email", e.target.value)}
							placeholder="contato@fornecedor.com"
						/>
					</div>
					<div>
						<Label>Pessoa de contato</Label>
						<Input
							value={form.contato || ""}
							onChange={(e) => campo("contato", e.target.value)}
							placeholder="Ex: João Vendas"
						/>
					</div>
				</div>
				<div>
					<Label>Prazo de pagamento (dias)</Label>
					<Input
						type="number"
						value={form.prazo_pagamento_dias}
						onChange={(e) => campo("prazo_pagamento_dias", e.target.value)}
					/>
				</div>
				<div>
					<Label>Observação</Label>
					<Input
						value={form.observacao || ""}
						onChange={(e) => campo("observacao", e.target.value)}
						placeholder="opcional"
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
						{salvando ? "Salvando..." : "Salvar Fornecedor"}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
