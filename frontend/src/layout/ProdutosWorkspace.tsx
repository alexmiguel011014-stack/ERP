"use client";
import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAbaVisivel } from "@/context/AbaVisivelContext";
import { normalizarPathname } from "@/hooks/useModulos";
import AbaViva from "./AbaViva";

// Tela do módulo "produtos" (workspace com sub-abas). Antes a barra de
// sub-abas vivia em app/(admin)/produtos/layout.tsx como layout aninhado do
// Next — mas o AbasHost instancia as telas por conta própria (ver lá), e um
// layout de rota do Next não faz parte dessa árvore. As sub-telas seguem o
// mesmo keep-alive das abas do header: cada uma monta na primeira visita e
// fica só escondida depois, então o formulário de cadastro em progresso
// sobrevive a um pulo até Estoque e volta.
const carregar = (importar: () => Promise<{ default: ComponentType }>) =>
	dynamic(importar, { ssr: false });

const SUB_TELAS: { sub: string; label: string; Tela: ComponentType }[] = [
	{
		sub: "cadastro",
		label: "Cadastro de Produto",
		Tela: carregar(() => import("@/app/(admin)/produtos/cadastro/page")),
	},
	{
		sub: "estoque",
		label: "Estoque",
		Tela: carregar(() => import("@/app/(admin)/produtos/estoque/page")),
	},
	{
		sub: "precificacao",
		label: "Precificação",
		Tela: carregar(() => import("@/app/(admin)/produtos/precificacao/page")),
	},
	{
		sub: "consignacao",
		label: "Consignação",
		Tela: carregar(() => import("@/app/(admin)/produtos/consignacao/page")),
	},
];

const PREFIXO = "/produtos/";

function subDaRota(pathname: string): string | null {
	if (!pathname.startsWith(PREFIXO)) return null;
	const alvo = pathname.slice(PREFIXO.length);
	return SUB_TELAS.some((t) => t.sub === alvo) ? alvo : null;
}

export default function ProdutosWorkspace() {
	const pathname = normalizarPathname(usePathname());
	const abaVisivel = useAbaVisivel();
	// Sub-tela ativa vem da URL enquanto o usuário está dentro de /produtos/*;
	// fora daí (aba escondida, ou clique na aba do header que leva a
	// "/produtos" sem sufixo) mantém a última — voltar pra aba volta pra onde
	// a pessoa estava, não pro Cadastro.
	const [sub, setSub] = useState(() => subDaRota(pathname) ?? "cadastro");
	const visitadas = useRef(new Set<string>([sub]));

	useEffect(() => {
		const alvo = subDaRota(pathname);
		if (!alvo) return;
		visitadas.current.add(alvo);
		setSub(alvo);
	}, [pathname]);

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800">
				{SUB_TELAS.map((t) => (
					<Link
						key={t.sub}
						href={PREFIXO + t.sub}
						className={
							sub === t.sub
								? "border-b-2 border-brand-500 px-3 py-2 text-sm font-semibold text-brand-600 dark:text-brand-400"
								: "px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
						}
					>
						{t.label}
					</Link>
				))}
			</div>
			{/* Cada sub-tela chama usePageHeader com seu próprio título — só a
			    que está na tela (aba do header visível E sub-aba ativa) pode
			    mandar no cabeçalho, por isso o contexto é estreitado aqui. */}
			{SUB_TELAS.filter((t) => visitadas.current.has(t.sub)).map((t) => (
				<AbaViva key={t.sub} visivel={abaVisivel && sub === t.sub}>
					<t.Tela />
				</AbaViva>
			))}
		</div>
	);
}
