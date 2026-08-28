"use client";
import { useMemo, useState } from "react";
import { normalizar } from "./formatos";
import type { Cliente } from "@/lib/erpApi";

export default function ClienteSelector({
	clientes,
	clienteSelecionado,
	onSelecionar,
	onLimpar,
}: {
	clientes: Cliente[];
	clienteSelecionado: Cliente | null;
	onSelecionar: (cliente: Cliente) => void;
	onLimpar: () => void;
}) {
	const [busca, setBusca] = useState("");

	const resultados = useMemo(() => {
		const alvo = normalizar(busca);
		if (!alvo) return [];
		return clientes
			.filter(
				(c) =>
					normalizar(c.nome).includes(alvo) ||
					(c.codigo && normalizar(c.codigo).includes(alvo)),
			)
			.slice(0, 8);
	}, [busca, clientes]);

	if (clienteSelecionado) {
		return (
			<div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-800 dark:bg-white/5">
				<span className="truncate font-medium text-gray-800 dark:text-white/90">
					{clienteSelecionado.nome}
				</span>
				<button
					type="button"
					onClick={onLimpar}
					className="shrink-0 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
				>
					Trocar
				</button>
			</div>
		);
	}

	return (
		<div className="relative">
			<input
				type="text"
				value={busca}
				onChange={(e) => setBusca(e.target.value)}
				placeholder="Buscar cliente (opcional)..."
				className="h-9 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
			/>
			{resultados.length > 0 && (
				<div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-theme-lg dark:border-gray-800 dark:bg-gray-900">
					{resultados.map((c) => (
						<button
							key={c.id}
							type="button"
							onClick={() => {
								onSelecionar(c);
								setBusca("");
							}}
							className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/5"
						>
							{c.nome}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
