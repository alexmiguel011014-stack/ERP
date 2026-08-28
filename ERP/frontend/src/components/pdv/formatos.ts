// Espelha modules/core/formatos.js (mesma convenção pt-BR) — pequeno o
// bastante pra não valer a pena compartilhar arquivo entre os dois
// frontends nesta fase da migração.
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
