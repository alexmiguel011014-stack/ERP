"use client";
import { avisar, confirmar } from "@/lib/dialogo";

// Açúcar pros componentes: `const { confirmar, avisar } = useDialogo();` e
// `if (!(await confirmar("..."))) return;`. As funções são estáveis (módulo),
// então podem entrar em dependências de hooks sem recriar nada. Fora de
// componentes, importe direto de "@/lib/dialogo".
export function useDialogo() {
	return { confirmar, avisar };
}
