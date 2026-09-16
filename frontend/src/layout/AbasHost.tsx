"use client";
import type { ComponentType } from "react";
import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useTabs } from "@/context/TabsContext";
import AbaErrorBoundary from "./AbaErrorBoundary";
import AbaViva from "./AbaViva";
import ProdutosWorkspace from "./ProdutosWorkspace";

// Keep-alive real das abas do header. Substitui o AbasAtivasWrapper antigo,
// que guardava o `children` do layout num cache por rota — só que no App
// Router do Next esse `children` é o OuterLayoutRouter interno, que sempre
// renderiza o segmento ATIVO: cada entrada do cache virava mais uma cópia
// da página atual (com N abas abertas, a tela visível existia N vezes no
// DOM, cada troca de aba remontava as N cópias e disparava N× todo IPC de
// carga — o "campos travam e destravam sozinhos depois de minutos" medido
// em 2026-09-15), e nenhuma aba escondida era de fato preservada.
//
// Aqui a página de cada aba é instanciada por este componente, a partir de
// um registro próprio (TELAS), em vez de vir do router do Next: uma
// instância por aba aberta, escondida por `hidden` (display:none, ver
// AbaViva.tsx) enquanto outra está ativa, então useState/scroll/modal
// aberto sobrevivem à troca — e o foco volta pro último campo usado.
// O `children` do layout (a página que o Next roteou) só é renderizado
// quando a rota atual NÃO é de um módulo com aba (ex.: /categorias) — e
// nesse caso é a única instância, nunca duplicada. A navegação continua
// 100% pelo router do Next (URL, usePathname, Link, router.push): o host
// só decide quem aparece.
//
// Carregamento sob demanda (next/dynamic): cada tela só entra no bundle
// carregado quando sua aba é aberta pela primeira vez, igual ao code-split
// por rota que o Next já fazia. ssr:false porque tudo aqui depende de
// window.api (o export estático já não pré-renderizava nada útil dessas
// telas — o layout devolve null antes da sessão carregar).
const carregar = (importar: () => Promise<{ default: ComponentType }>) =>
	dynamic(importar, { ssr: false });

// Chave = id do módulo no manifesto (modules/*/modulo.json). Um módulo sem
// entrada aqui ainda funciona — cai no `children` do Next, só sem keep-alive.
const TELAS: Record<string, ComponentType> = {
	dashboard: carregar(() => import("@/app/(admin)/page")),
	pdv: carregar(() => import("@/app/(admin)/pdv/page")),
	produtos: ProdutosWorkspace,
	clientes: carregar(() => import("@/app/(admin)/clientes/page")),
	fornecedores: carregar(() => import("@/app/(admin)/fornecedores/page")),
	compras: carregar(() => import("@/app/(admin)/compras/page")),
	financeiro: carregar(() => import("@/app/(admin)/financeiro/page")),
	relatorios: carregar(() => import("@/app/(admin)/relatorios/page")),
	importacao: carregar(() => import("@/app/(admin)/importacao/page")),
	acessos: carregar(() => import("@/app/(admin)/acessos/page")),
	banco: carregar(() => import("@/app/(admin)/banco/page")),
	atualizacao: carregar(() => import("@/app/(admin)/atualizacao/page")),
};

export default function AbasHost({ children }: { children: React.ReactNode }) {
	const { abas, abaAtivaId, pronto } = useTabs();

	// Gráficos (ApexCharts) medem o container no mount; um gráfico que nasceu
	// ou recebeu dados enquanto a aba estava em display:none precisa de um
	// resize ao reaparecer pra se redesenhar no tamanho certo.
	useEffect(() => {
		if (abaAtivaId) window.dispatchEvent(new Event("resize"));
	}, [abaAtivaId]);

	// Sem manifesto ainda não dá pra saber se a rota atual vira aba — mostrar
	// o `children` do Next nesse meio-tempo montaria a página duas vezes
	// (uma pelo router, outra pelo host logo em seguida).
	if (!pronto) return null;

	const semTelaRegistrada = abaAtivaId !== null && !TELAS[abaAtivaId];

	return (
		<>
			{abas.map((aba) => {
				const Tela = TELAS[aba.id];
				if (!Tela) return null;
				return (
					<AbaViva key={aba.id} visivel={aba.id === abaAtivaId}>
						<AbaErrorBoundary pathname={aba.href}>
							<Tela />
						</AbaErrorBoundary>
					</AbaViva>
				);
			})}
			{(abaAtivaId === null || semTelaRegistrada) && children}
		</>
	);
}
