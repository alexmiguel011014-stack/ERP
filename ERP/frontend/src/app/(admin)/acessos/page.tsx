"use client";
import { useState } from "react";
import { usePageHeader } from "@/context/PageHeaderContext";
import { useUsuarios } from "@/hooks/useUsuarios";
import UsuariosTable from "@/components/acessos/UsuariosTable";
import UsuarioFormModal from "@/components/acessos/UsuarioFormModal";
import LogAtividadesPanel from "@/components/acessos/LogAtividadesPanel";
import Button from "@/components/ui/button/Button";
import type { Usuario } from "@/lib/erpApi";

export default function AcessosPage() {
	usePageHeader(
		"Gerenciar Acessos",
		"Usuários do sistema e suas credenciais de login",
	);
	const { usuarios, carregando, erro, recarregar } = useUsuarios();
	const [modalAberto, setModalAberto] = useState(false);
	const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);

	function abrirNovo() {
		setUsuarioEditando(null);
		setModalAberto(true);
	}

	function abrirEdicao(u: Usuario) {
		setUsuarioEditando(u);
		setModalAberto(true);
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="flex justify-end">
				<Button onClick={abrirNovo}>Novo Usuário</Button>
			</div>

			{erro && (
				<div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-800 dark:bg-warning-500/10 dark:text-warning-400">
					{erro}
				</div>
			)}

			{carregando ? (
				<div className="animate-pulse text-sm text-gray-400">
					Carregando usuários...
				</div>
			) : (
				<UsuariosTable
					usuarios={usuarios}
					onEditar={abrirEdicao}
					onAlterado={recarregar}
				/>
			)}

			<LogAtividadesPanel usuarios={usuarios} />

			<UsuarioFormModal
				isOpen={modalAberto}
				onClose={() => setModalAberto(false)}
				usuarioEditando={usuarioEditando}
				onSalvo={recarregar}
			/>
		</div>
	);
}
