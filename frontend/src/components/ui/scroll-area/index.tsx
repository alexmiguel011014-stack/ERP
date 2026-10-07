"use client";
import React, { useEffect, useRef } from "react";

export type TamanhoScrollArea = "sm" | "md" | "lg" | "xl";

// Tetos fixos em rem, limitados por uma fração da altura da janela pra
// encolherem em telas baixas (mínimo do app: 1024x640). Strings literais, não
// concatenadas: o Tailwind v4 só gera a utilidade de valor arbitrário que vê
// escrita por inteiro no código.
const TETO: Record<TamanhoScrollArea, string> = {
	sm: "max-h-[min(16rem,45dvh)]",
	md: "max-h-[min(24rem,55dvh)]",
	lg: "max-h-[min(32rem,65dvh)]",
	xl: "max-h-[min(40rem,calc(100dvh-18rem))]",
};

// Cabeçalho de tabela fixo. O fundo precisa ser opaco (o card no tema escuro é
// translúcido) e o divisor é um box-shadow inset: com `border-collapse` (preflight
// do Tailwind) a borda de um `th` sticky rola embora junto com as linhas.
const CABECALHO_FIXO =
	"[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-white [&_thead_th]:shadow-[inset_0_-1px_0_var(--color-gray-100)] dark:[&_thead_th]:shadow-[inset_0_-1px_0_var(--color-gray-800)]";

// Fundo opaco do `th` no tema escuro = a superfície onde a tabela está (no claro
// é branco nos dois casos). Medido no app: o card é o fundo da página (#101828)
// com 3% de branco por cima = rgb(23,31,46); o Modal é gray-900 liso. Com a cor
// errada o cabeçalho vira uma faixa visível.
export type SuperficieScrollArea = "card" | "modal";
const FUNDO_ESCURO_DO_CABECALHO: Record<SuperficieScrollArea, string> = {
	card: "dark:[&_thead_th]:bg-[#171f2e]",
	modal: "dark:[&_thead_th]:bg-gray-900",
};

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
	size?: TamanhoScrollArea;
	// "y": só vertical. "both": tabelas largas, que também rolam na horizontal.
	axis?: "y" | "both";
	stickyHeader?: boolean;
	// Onde a tabela está: define o fundo opaco do cabeçalho fixo no tema escuro.
	surface?: SuperficieScrollArea;
	// Degradê no rodapé enquanto houver mais conteúdo abaixo: sem barra de
	// rolagem visível, é a única pista de que a lista continua.
	fade?: boolean;
}

// Região de altura máxima fixa com rolagem interna e barra escondida (wheel,
// trackpad e teclado seguem funcionando). Vai DENTRO do card, só em volta do que
// cresce com os dados — título, filtros e totais ficam fora, sempre à vista.
export function ScrollArea({
	size = "md",
	axis = "y",
	stickyHeader = false,
	surface = "card",
	fade = true,
	className = "",
	children,
	...rest
}: ScrollAreaProps) {
	const ref = useRef<HTMLDivElement>(null);

	// O atributo é escrito direto no nó (sem useState): um re-render do React a
	// cada evento de scroll seria custo à toa, e o React não conhece o atributo,
	// então nunca o sobrescreve.
	useEffect(() => {
		const el = ref.current;
		if (!el || !fade) return;
		const atualizar = () => {
			const maisAbaixo = el.scrollHeight - el.scrollTop - el.clientHeight > 1;
			el.dataset.maisAbaixo = String(maisAbaixo);
		};
		atualizar();
		el.addEventListener("scroll", atualizar, { passive: true });
		// Mudança de tamanho da própria região (janela, aba que volta a ficar
		// visível) e de conteúdo (linhas que entram/saem: o box não muda, só o
		// scrollHeight, por isso o MutationObserver).
		const tamanho = new ResizeObserver(atualizar);
		tamanho.observe(el);
		const conteudo = new MutationObserver(atualizar);
		conteudo.observe(el, { childList: true, subtree: true });
		return () => {
			el.removeEventListener("scroll", atualizar);
			tamanho.disconnect();
			conteudo.disconnect();
			delete el.dataset.maisAbaixo;
		};
	}, [fade]);

	const classes = [
		"scroll-area no-scrollbar min-w-0",
		TETO[size],
		axis === "both" ? "overflow-auto" : "overflow-y-auto",
		stickyHeader ? `${CABECALHO_FIXO} ${FUNDO_ESCURO_DO_CABECALHO[surface]}` : "",
		className,
	]
		.filter(Boolean)
		.join(" ");

	return (
		<div
			ref={ref}
			role={rest["aria-label"] ? "region" : undefined}
			className={classes}
			{...rest}
		>
			{children}
		</div>
	);
}

export default ScrollArea;
