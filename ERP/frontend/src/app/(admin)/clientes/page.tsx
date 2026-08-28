"use client";
import { useState } from "react";
import { usePageHeader } from "@/context/PageHeaderContext";
import { useClientes } from "@/hooks/useClientes";
import ClientesTable from "@/components/clientes/ClientesTable";
import ClienteFormModal from "@/components/clientes/ClienteFormModal";
import Button from "@/components/ui/button/Button";
import type { Cliente } from "@/lib/erpApi";

export default function ClientesPage() {
	usePageHeader("Clientes", "Cadastro e edição de clientes");
	const { clientes, carregando, erro, recarregar } = useClientes();
	const [modalAberto, setModalAberto] = useState(false);
	const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null);

	function abrirNovo() {
		setClienteEditando(null);
		setModalAberto(true);
	}

	function abrirEdicao(c: Cliente) {
		setClienteEditando(c);
		setModalAberto(true);
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="flex justify-end">
				<Button onClick={abrirNovo}>Novo Cliente</Button>
			</div>

			{erro && (
				<div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-800 dark:bg-warning-500/10 dark:text-warning-400">
					{erro}
				</div>
			)}

			{carregando ? (
				<div className="animate-pulse text-sm text-gray-400">
					Carregando clientes...
				</div>
			) : (
				<ClientesTable
					clientes={clientes}
					onEditar={abrirEdicao}
					onExcluido={recarregar}
				/>
			)}

			<ClienteFormModal
				isOpen={modalAberto}
				onClose={() => setModalAberto(false)}
				clienteEditando={clienteEditando}
				onSalvo={recarregar}
			/>
		</div>
	);
}
