"use client";
import type React from "react";
import { useEffect, useRef } from "react";
import { AbaVisivelContext } from "@/context/AbaVisivelContext";

// Container de uma tela mantida viva (aba do header ou sub-aba de Produtos):
// esconde com display:none quando não é a ativa, informa a visibilidade pro
// que está dentro (AbaVisivelContext) e devolve o foco pro último campo
// usado quando a tela volta — o texto já sobrevivia (a página nunca
// desmonta), mas o cursor ia parar no botão da aba que foi clicado. A
// seleção/posição do cursor volta junto: o input guarda isso mesmo sem foco.
export default function AbaViva({
	visivel,
	children,
}: {
	visivel: boolean;
	children: React.ReactNode;
}) {
	const raiz = useRef<HTMLDivElement>(null);
	const ultimoFoco = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!visivel) return;
		const el = ultimoFoco.current;
		if (!el) return;
		// requestAnimationFrame: o efeito roda depois do commit, mas o foco só
		// pega num elemento recém-tirado do display:none depois do layout.
		const id = requestAnimationFrame(() => {
			const cont = raiz.current;
			if (!cont || !el.isConnected || !cont.contains(el)) return;
			// Uma sub-aba aninhada (AbaViva dentro de AbaViva) pode já ter
			// devolvido o foco pro campo dela — nesse caso não sobrescreve.
			if (
				cont.contains(document.activeElement) &&
				document.activeElement !== cont
			)
				return;
			// getClientRects (não offsetParent): campo dentro de modal
			// position:fixed também conta como visível.
			if (el.getClientRects().length === 0) return;
			el.focus();
		});
		return () => cancelAnimationFrame(id);
	}, [visivel]);

	return (
		<div
			ref={raiz}
			className={visivel ? "" : "hidden"}
			onFocusCapture={(e) => {
				ultimoFoco.current = e.target as HTMLElement;
			}}
		>
			<AbaVisivelContext.Provider value={visivel}>
				{children}
			</AbaVisivelContext.Provider>
		</div>
	);
}
