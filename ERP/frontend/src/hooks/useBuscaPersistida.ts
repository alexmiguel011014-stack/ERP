"use client";
import { useEffect, useState } from "react";

// Guarda o texto de busca em sessionStorage (não só na URL da página atual)
// — a primeira versão só escrevia via history.replaceState, o que só ajuda
// no botão "voltar" do navegador; clicar de novo no link da sidebar navega
// pra "/clientes" sem parâmetro nenhum, perdendo o valor de qualquer forma.
// sessionStorage sobrevive a qualquer jeito de voltar pra tela (sidebar,
// botão voltar, o que for), e reseta sozinho quando o app fecha de verdade
// — mesmo comportamento "dura enquanto a sessão está aberta" que o sistema
// de abas antigo tinha.
export function useBuscaPersistida(chave: string) {
	const chaveCompleta = "busca:" + chave;
	const [valor, setValorState] = useState("");

	useEffect(() => {
		try {
			setValorState(sessionStorage.getItem(chaveCompleta) || "");
		} catch {
			/* sessionStorage indisponível (ex.: modo privado) — segue sem persistir */
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function setValor(novoValor: string) {
		setValorState(novoValor);
		try {
			if (novoValor) {
				sessionStorage.setItem(chaveCompleta, novoValor);
			} else {
				sessionStorage.removeItem(chaveCompleta);
			}
		} catch {
			/* ignora — a busca ainda funciona, só não persiste */
		}
	}

	return [valor, setValor] as const;
}
