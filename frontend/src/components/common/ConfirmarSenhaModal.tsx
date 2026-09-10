"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { erpApi } from "@/lib/erpApi";

// Passo de segurança extra antes de uma ação destrutiva (excluir) — reusa o
// mesmo reautenticador já usado pra abrir a tela de Banco de Dados
// (verificarSenhaAdmin), então isso vale pra admin/dono, não pra qualquer
// funcionário com a permissão de módulo que já bastava pra ação em si.
export default function ConfirmarSenhaModal({
	isOpen,
	titulo,
	descricao,
	onClose,
	onConfirmado,
}: {
	isOpen: boolean;
	titulo: string;
	descricao: string;
	onClose: () => void;
	onConfirmado: () => void;
}) {
	const [senha, setSenha] = useState("");
	const [erro, setErro] = useState<string | null>(null);
	const [verificando, setVerificando] = useState(false);

	function fechar() {
		setSenha("");
		setErro(null);
		onClose();
	}

	async function confirmar(e: React.FormEvent) {
		e.preventDefault();
		if (!senha) {
			setErro("Informe sua senha.");
			return;
		}
		setVerificando(true);
		setErro(null);
		try {
			const res = await erpApi.banco.verificarSenhaAdmin(senha);
			if (!res.ok) {
				setErro("Senha incorreta ou usuário sem perfil admin/dono.");
				return;
			}
			setSenha("");
			onConfirmado();
			onClose();
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setVerificando(false);
		}
	}

	return (
		<Modal isOpen={isOpen} onClose={fechar} className="max-w-[380px] p-6">
			<h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white/90">
				{titulo}
			</h2>
			<p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
				{descricao}
			</p>
			<form onSubmit={confirmar} className="space-y-4">
				<div>
					<Label>Sua senha</Label>
					<Input
						type="password"
						value={senha}
						onChange={(e) => setSenha(e.target.value)}
						placeholder="Confirme sua senha para continuar"
					/>
				</div>
				{erro && (
					<div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
						{erro}
					</div>
				)}
				<div className="flex justify-end gap-3">
					<Button variant="outline" type="button" onClick={fechar}>
						Cancelar
					</Button>
					<Button type="submit" disabled={verificando}>
						{verificando ? "Verificando..." : "Confirmar"}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
