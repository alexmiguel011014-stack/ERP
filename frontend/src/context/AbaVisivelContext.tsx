"use client";
import { createContext, useContext } from "react";

// true = a aba que contém este componente é a que está na tela agora.
// Fora de qualquer aba (ex.: rota que não é módulo, tela de login) o
// default também é true — "visível" é a suposição segura pra quem não
// participa do sistema de abas. Quem precisa disso: usePageHeader (só a
// aba visível manda no título do header) e Modal (só a aba visível pode
// travar o scroll do body / ouvir Esc).
export const AbaVisivelContext = createContext(true);

export function useAbaVisivel() {
	return useContext(AbaVisivelContext);
}
