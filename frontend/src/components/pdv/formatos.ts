// A moeda continua específica do PDV, mas o parser é compartilhado entre os
// formulários do frontend (inclusive Financeiro e Precificação).
export {
	lerDecimalInformado,
	lerValorMonetario,
} from "@/lib/utils/formatos";

export function formatarMoeda(valor: number | null | undefined): string {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(valor ?? 0);
}

// Remove acentos (NFD + \p{Diacritic}) pra comparação de busca sem
// sensibilidade a acento.
export function normalizar(texto: string): string {
	return texto
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.trim();
}
