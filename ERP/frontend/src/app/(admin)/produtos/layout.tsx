"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { normalizarPathname } from "@/hooks/useModulos";

const ABAS = [
	{ href: "/produtos/cadastro", label: "Cadastro de Produto" },
	{ href: "/produtos/estoque", label: "Estoque" },
	{ href: "/produtos/precificacao", label: "Precificação" },
];

export default function ProdutosLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const pathname = usePathname();

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800">
				{ABAS.map((a) => (
					<Link
						key={a.href}
						href={a.href}
						className={
							normalizarPathname(pathname) === a.href
								? "border-b-2 border-brand-500 px-3 py-2 text-sm font-semibold text-brand-600 dark:text-brand-400"
								: "px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
						}
					>
						{a.label}
					</Link>
				))}
			</div>
			{children}
		</div>
	);
}
