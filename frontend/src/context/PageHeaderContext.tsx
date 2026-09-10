"use client";
import type React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Cabecalho = { titulo: string; subtitulo?: React.ReactNode } | null;

type PageHeaderContextType = {
	cabecalho: Cabecalho;
	setCabecalho: (v: Cabecalho) => void;
};

const PageHeaderContext = createContext<PageHeaderContextType | undefined>(
	undefined,
);

export function PageHeaderProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [cabecalho, setCabecalho] = useState<Cabecalho>(null);
	const valor = useMemo(() => ({ cabecalho, setCabecalho }), [cabecalho]);
	return (
		<PageHeaderContext.Provider value={valor}>
			{children}
		</PageHeaderContext.Provider>
	);
}

export function usePageHeaderContext() {
	const ctx = useContext(PageHeaderContext);
	if (!ctx) {
		throw new Error(
			"usePageHeaderContext must be used within a PageHeaderProvider",
		);
	}
	return ctx;
}

// Cada página chama isso pra declarar seu próprio título — quem realmente
// renderiza é o AppHeader, então o título "viaja" pra fora do container da
// página. Limpa no unmount pra não deixar título de página antiga vazando
// pra uma página nova que ainda não chamou o hook.
export function usePageHeader(titulo: string, subtitulo?: React.ReactNode) {
	// setCabecalho vem de useState — referência estável entre renders, não
	// precisa entrar na dependência do efeito abaixo além de uma vez.
	const { setCabecalho } = usePageHeaderContext();
	useEffect(() => {
		setCabecalho({ titulo, subtitulo });
		return () => setCabecalho(null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [titulo, subtitulo]);
}
