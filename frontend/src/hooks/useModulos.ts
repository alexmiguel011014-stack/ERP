"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";

export type ManifestoNavbar = {
	secao: "principal" | "gestao" | "administracao";
	label: string;
	dica?: string;
	icone: string;
	ordem: number;
	abaDashboard: boolean;
	workspaceParam?: string;
};

export type ManifestoModulo = {
	id: string;
	nome: string;
	tipo: "pagina" | "workspace-dashboard";
	entrada: string | null;
	permissao:
		| { tipo: "sempre" }
		| { tipo: "admin" }
		| { tipo: "modulo"; nomeModulo: string };
	navbar: ManifestoNavbar | null;
};

// O módulo "dashboard" é o único cuja página real vive na raiz do app
// (app/(admin)/page.tsx é "/") — sem esse caso especial o link apontava pra
// "/dashboard", rota inexistente no export estático (ver AppSidebar.tsx pro
// histórico completo desse bug).
export function hrefDoModulo(m: ManifestoModulo): string {
	if (m.id === "dashboard") return "/";
	return `/${m.id}`;
}

// next.config.ts usa trailingSlash:true (exigido pelo export estático, cada
// rota vira pasta/index.html) — por causa disso usePathname() devolve
// "/financeiro/" (barra no final), enquanto hrefDoModulo() gera "/financeiro"
// (sem barra, é o que os <Link> usam). Sem essa normalização a comparação
// `hrefDoModulo(m) === pathname` nunca bate pra nenhuma rota fora a raiz "/".
export function normalizarPathname(pathname: string): string {
	if (pathname !== "/" && pathname.endsWith("/")) {
		return pathname.slice(0, -1);
	}
	return pathname;
}

// Uma rota pertence ao módulo cujo href é igual a ela OU é prefixo dela
// ("/produtos/estoque" é do módulo "produtos") — sub-rotas de um workspace
// contam como a mesma aba. O Dashboard ("/") só casa exato, senão seria
// prefixo de tudo.
export function moduloDaRota(
	modulos: ManifestoModulo[],
	rota: string,
): ManifestoModulo | undefined {
	return modulos.find((m) => {
		const href = hrefDoModulo(m);
		if (href === "/") return rota === "/";
		return rota === href || rota.startsWith(href + "/");
	});
}

// Lista única de módulos com item de sidebar, já filtrada pela permissão da
// sessão atual — fonte compartilhada entre AppSidebar.tsx (o que aparece
// como link) e TabsContext.tsx (o que pode virar aba), pra não duplicar essa
// lógica de permissão em dois lugares que podiam divergir.
export function useModulosPermitidos() {
	const { isAdmin, podeModulo } = useAuth();
	const [modulos, setModulos] = useState<ManifestoModulo[]>([]);

	useEffect(() => {
		if (!window.api?.getModulosCarregados) return;
		window.api
			.getModulosCarregados()
			.then((lista) => setModulos(lista as ManifestoModulo[]))
			.catch(() => setModulos([]));
	}, []);

	// useMemo: a lista é dependência de efeitos em TabsContext — sem
	// memoizar, um array novo a cada render reexecutava esses efeitos à toa.
	return useMemo(() => {
		function permissaoLiberada(m: ManifestoModulo) {
			if (m.permissao.tipo === "sempre") return true;
			if (m.permissao.tipo === "admin") return isAdmin;
			return podeModulo(m.permissao.nomeModulo);
		}
		return modulos.filter((m) => m.navbar).filter(permissaoLiberada);
	}, [modulos, isAdmin, podeModulo]);
}
