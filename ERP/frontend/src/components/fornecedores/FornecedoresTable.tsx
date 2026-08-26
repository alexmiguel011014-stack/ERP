"use client";
import { useState } from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { erpApi, type Fornecedor } from "@/lib/erpApi";
import { useBuscaPersistida } from "@/hooks/useBuscaPersistida";

export default function FornecedoresTable({
	fornecedores,
	onEditar,
	onExcluido,
}: {
	fornecedores: Fornecedor[];
	onEditar: (f: Fornecedor) => void;
	onExcluido: () => void;
}) {
	const [busca, setBusca] = useBuscaPersistida("busca");
	const [excluindoId, setExcluindoId] = useState<number | null>(null);

	const q = busca.trim().toLowerCase();
	const filtrados = q
		? fornecedores.filter((f) =>
				[f.nome, f.cnpj, f.telefone, f.email || ""]
					.join(" ")
					.toLowerCase()
					.includes(q),
			)
		: fornecedores;

	async function excluir(f: Fornecedor) {
		if (!confirm(`Excluir "${f.nome}"?`)) return;
		setExcluindoId(f.id);
		try {
			await erpApi.fornecedores.remover(f.id);
			onExcluido();
		} catch (e) {
			alert("Erro ao excluir: " + (e instanceof Error ? e.message : String(e)));
		} finally {
			setExcluindoId(null);
		}
	}

	return (
		<div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
			<div className="flex items-center justify-between gap-3 border-b border-gray-100 p-4 dark:border-gray-800">
				<input
					type="text"
					value={busca}
					onChange={(e) => setBusca(e.target.value)}
					placeholder="Buscar por nome, CNPJ, telefone..."
					className="h-10 w-full max-w-xs rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90"
				/>
				<span className="shrink-0 text-xs text-gray-400">
					{filtrados.length} fornecedor{filtrados.length !== 1 ? "es" : ""}
				</span>
			</div>
			<div className="overflow-x-auto">
				<Table>
					<TableHeader className="border-b border-gray-100 dark:border-gray-800">
						<TableRow>
							<TableCell
								isHeader
								className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-400"
							>
								Nome / Razão Social
							</TableCell>
							<TableCell
								isHeader
								className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-400"
							>
								CNPJ
							</TableCell>
							<TableCell
								isHeader
								className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-400"
							>
								Telefone
							</TableCell>
							<TableCell
								isHeader
								className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-400"
							>
								Contato
							</TableCell>
							<TableCell
								isHeader
								className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-400"
							>
								Prazo
							</TableCell>
							<TableCell
								isHeader
								className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-400"
							>
								Ações
							</TableCell>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filtrados.length === 0 ? (
							<TableRow>
								<TableCell className="px-4 py-8 text-center text-sm text-gray-400">
									Nenhum fornecedor encontrado.
								</TableCell>
							</TableRow>
						) : (
							filtrados.map((f) => (
								<TableRow
									key={f.id}
									className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
								>
									<TableCell className="px-4 py-2.5 text-sm font-medium text-gray-800 dark:text-white/90">
										{f.nome}
									</TableCell>
									<TableCell className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">
										{f.cnpj || "—"}
									</TableCell>
									<TableCell className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">
										{f.telefone || "—"}
									</TableCell>
									<TableCell className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">
										{f.contato || "—"}
									</TableCell>
									<TableCell className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">
										{f.prazo_pagamento_dias} dia
										{f.prazo_pagamento_dias !== 1 ? "s" : ""}
									</TableCell>
									<TableCell className="px-4 py-2.5">
										<div className="flex gap-2">
											<button
												onClick={() => onEditar(f)}
												className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400"
											>
												Editar
											</button>
											<button
												onClick={() => excluir(f)}
												disabled={excluindoId === f.id}
												className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-semibold text-error-600 hover:bg-error-100 disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400"
											>
												{excluindoId === f.id ? "Excluindo..." : "Excluir"}
											</button>
										</div>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
