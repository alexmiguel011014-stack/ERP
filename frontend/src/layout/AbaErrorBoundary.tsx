"use client";
import { Component, type ReactNode } from "react";

type Props = { pathname: string; children: ReactNode };
type State = { erro: Error | null };

// Achado real (2026-08-29, investigação do travamento de navegação): o app
// não tinha NENHUM error boundary em lugar nenhum — uma exceção na fase de
// commit do React em QUALQUER aba do cache do AbasAtivasWrapper (inclusive
// uma escondida, já que o cache mantém tudo genuinamente montado) deixava a
// árvore inteira silenciosamente parada, sem sinal nenhum além de "clico e
// não acontece nada". Um boundary por aba isola o crash na aba que quebrou —
// as outras já montadas no cache continuam normais. `console.error` aqui já
// cai no erp-crash.log via o handler de console-message existente
// (main.js:criarJanelaPrincipal).
export default class AbaErrorBoundary extends Component<Props, State> {
	state: State = { erro: null };

	static getDerivedStateFromError(erro: Error) {
		return { erro };
	}

	componentDidCatch(erro: Error, info: { componentStack: string }) {
		console.error(
			`[AbaErrorBoundary] aba "${this.props.pathname}" travou: ${erro.message}${info.componentStack}`,
		);
	}

	render() {
		if (this.state.erro) {
			return (
				<div className="p-6 text-sm text-red-600 dark:text-red-400">
					Esta aba encontrou um erro e não pôde ser exibida. Feche a aba e abra
					o módulo novamente.
				</div>
			);
		}
		return this.props.children;
	}
}
