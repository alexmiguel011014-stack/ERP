"use client";
import { useEffect, useState } from "react";

// useState que sobrevive a sair da tela e voltar (ou fechar e reabrir o
// app) — mesmo mecanismo já usado pro carrinho e formulário de pagamento do
// PDV, generalizado pra qualquer formulário de rascunho. Nunca use isso pra
// campo de senha — persistir credencial em localStorage é risco de
// segurança, não só uma questão de UX.
export function usePersistedState<T>(chave: string, valorInicial: T) {
	const [valor, setValor] = useState<T>(valorInicial);
	const [carregado, setCarregado] = useState(false);

	useEffect(() => {
		try {
			const bruto = window.localStorage.getItem(chave);
			if (bruto !== null) setValor(JSON.parse(bruto));
		} catch {
			// localStorage indisponível ou JSON corrompido — segue com o valor
			// inicial, não é motivo pra quebrar a tela.
		}
		setCarregado(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (!carregado) return;
		try {
			window.localStorage.setItem(chave, JSON.stringify(valor));
		} catch {
			// idem — só significa que o rascunho não sobrevive a um reload.
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [valor, carregado]);

	function limpar() {
		setValor(valorInicial);
		try {
			window.localStorage.removeItem(chave);
		} catch {
			/* idem */
		}
	}

	return [valor, setValor, limpar] as const;
}
