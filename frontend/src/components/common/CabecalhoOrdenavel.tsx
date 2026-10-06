"use client";
import type { ReactNode } from "react";

// <th> clicável no estilo do Explorador do Windows: a coluna ativa mostra ▲/▼
// e expõe `aria-sort`. Mesmo visual dos <th> comuns das listas (GOALS 30).
export default function CabecalhoOrdenavel({
	children,
	ordenado,
	onClick,
}: {
	children: ReactNode;
	ordenado: "ascending" | "descending" | "none";
	onClick: () => void;
}) {
	return (
		<th
			aria-sort={ordenado}
			className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400"
		>
			<button
				type="button"
				onClick={onClick}
				className={`inline-flex items-center gap-1 uppercase hover:text-gray-600 dark:hover:text-gray-200 ${
					ordenado !== "none" ? "text-gray-600 dark:text-gray-200" : ""
				}`}
			>
				{children}
				<span aria-hidden="true" className="w-3 text-[10px]">
					{ordenado === "ascending" ? "▲" : ordenado === "descending" ? "▼" : ""}
				</span>
			</button>
		</th>
	);
}
