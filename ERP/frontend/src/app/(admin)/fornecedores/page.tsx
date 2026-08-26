"use client";
import { useState } from "react";
import { useFornecedores } from "@/hooks/useFornecedores";
import FornecedoresTable from "@/components/fornecedores/FornecedoresTable";
import FornecedorFormModal from "@/components/fornecedores/FornecedorFormModal";
import Button from "@/components/ui/button/Button";
import type { Fornecedor } from "@/lib/erpApi";

export default function FornecedoresPage() {
	const { fornecedores, carregando, erro, recarregar } = useFornecedores();
	const [modalAberto, setModalAberto] = useState(false);
	const [fornecedorEditando, setFornecedorEditando] =
		useState<Fornecedor | null>(null);

	function abrirNovo() {
		setFornecedorEditando(null);
		setModalAberto(true);
	}

	function abrirEdicao(f: Fornecedor) {
		setFornecedorEditando(f);
		setModalAberto(true);
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
						Fornecedores
					</h1>
					<p className="text-sm text-gray-500 dark:text-gray-400">
						Contatos comerciais e prazos de pagamento acordados
					</p>
				</div>
				<Button onClick={abrirNovo}>Novo Fornecedor</Button>
			</div>

			{erro && (
				<div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-800 dark:bg-warning-500/10 dark:text-warning-400">
					{erro}
				</div>
			)}

			{carregando ? (
				<div className="animate-pulse text-sm text-gray-400">
					Carregando fornecedores...
				</div>
			) : (
				<FornecedoresTable
					fornecedores={fornecedores}
					onEditar={abrirEdicao}
					onExcluido={recarregar}
				/>
			)}

			<FornecedorFormModal
				isOpen={modalAberto}
				onClose={() => setModalAberto(false)}
				fornecedorEditando={fornecedorEditando}
				onSalvo={recarregar}
			/>
		</div>
	);
}
