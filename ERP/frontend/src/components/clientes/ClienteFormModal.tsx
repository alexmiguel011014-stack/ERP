"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { erpApi, type Cliente, type ClienteFormData } from "@/lib/erpApi";
import { mascaraCpfCnpj, mascaraTelefone } from "@/lib/utils/mascaras";

const FORM_VAZIO: ClienteFormData = {
	nome: "",
	cpf_cnpj: "",
	endereco: "",
	telefone: "",
	email: "",
};

export default function ClienteFormModal({
	isOpen,
	onClose,
	clienteEditando,
	onSalvo,
}: {
	isOpen: boolean;
	onClose: () => void;
	clienteEditando: Cliente | null;
	onSalvo: () => void;
}) {
	const [form, setForm] = useState<ClienteFormData>(FORM_VAZIO);
	const [codigo, setCodigo] = useState("");
	const [erro, setErro] = useState<string | null>(null);
	const [salvando, setSalvando] = useState(false);

	useEffect(() => {
		if (!isOpen) return;
		setErro(null);
		if (clienteEditando) {
			setForm({
				nome: clienteEditando.nome || "",
				cpf_cnpj: clienteEditando.cpf_cnpj || "",
				endereco: clienteEditando.endereco || "",
				telefone: clienteEditando.telefone || "",
				email: clienteEditando.email || "",
			});
			setCodigo(clienteEditando.codigo || "");
		} else {
			setForm(FORM_VAZIO);
			setCodigo("");
			erpApi.clientes
				.proximoCodigo()
				.then(setCodigo)
				.catch(() => setCodigo(""));
		}
	}, [isOpen, clienteEditando]);

	function campo(nome: keyof ClienteFormData, valor: string) {
		setForm((f) => ({ ...f, [nome]: valor }));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!form.nome.trim()) {
			setErro("Nome é obrigatório.");
			return;
		}
		setSalvando(true);
		setErro(null);
		const dados: ClienteFormData = {
			nome: form.nome.trim(),
			cpf_cnpj: (form.cpf_cnpj || "").replace(/\D/g, "").slice(0, 14) || null,
			endereco: form.endereco?.trim() || null,
			telefone: form.telefone?.trim() || null,
			email: form.email?.trim() || null,
		};
		try {
			if (clienteEditando) {
				await erpApi.clientes.atualizar(clienteEditando.id, dados);
			} else {
				await erpApi.clientes.salvar(dados);
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
		<Modal isOpen={isOpen} onClose={onClose} className="max-w-[540px] p-6">
			<h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
				{clienteEditando ? "Editar Cliente" : "Novo Cliente"}
			</h2>
			<form onSubmit={handleSubmit} className="space-y-4">
				<div className="grid grid-cols-2 gap-4">
					<div>
						<Label>Código</Label>
						<Input value={codigo} disabled placeholder="C0001" />
					</div>
					<div>
						<Label>
							Nome completo <span className="text-error-500">*</span>
						</Label>
						<Input
							value={form.nome}
							onChange={(e) => campo("nome", e.target.value)}
							placeholder="Ex: Maria Silva ou Loja XYZ"
						/>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<Label>CPF / CNPJ</Label>
						<Input
							value={form.cpf_cnpj || ""}
							onChange={(e) =>
								campo("cpf_cnpj", mascaraCpfCnpj(e.target.value))
							}
							placeholder="000.000.000-00"
						/>
					</div>
					<div>
						<Label>Telefone / WhatsApp</Label>
						<Input
							value={form.telefone || ""}
							onChange={(e) =>
								campo("telefone", mascaraTelefone(e.target.value))
							}
							placeholder="(11) 99999-8888"
						/>
					</div>
				</div>
				<div>
					<Label>Endereço</Label>
					<Input
						value={form.endereco || ""}
						onChange={(e) => campo("endereco", e.target.value)}
						placeholder="Rua, número, bairro, cidade"
					/>
				</div>
				<div>
					<Label>E-mail</Label>
					<Input
						type="email"
						value={form.email || ""}
						onChange={(e) => campo("email", e.target.value)}
						placeholder="exemplo@email.com"
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
						{salvando ? "Salvando..." : "Salvar Cliente"}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
