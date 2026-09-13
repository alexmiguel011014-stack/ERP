// Espelha modules/core/formatos.js (mesma convenção pt-BR) — pequeno o
// bastante pra não valer a pena compartilhar arquivo entre os dois
// frontends nesta fase da migração.
export function formatarMoeda(valor: number | null | undefined): string {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(valor ?? 0);
}

export function lerValorMonetario(valorTexto: string | number): number {
	const texto = String(valorTexto ?? "").trim().replace(/\s/g, "");
	if (texto.includes(",")) return Number(texto.replace(/\./g, "").replace(",", "."));
	if (/^\d{1,3}(\.\d{3})+$/.test(texto)) return Number(texto.replace(/\./g, ""));
	return Number(texto);
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
