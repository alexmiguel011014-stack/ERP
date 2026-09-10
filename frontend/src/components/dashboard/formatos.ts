// Espelha modules/core/formatos.js (mesma convenção pt-BR) — pequeno o
// bastante pra não valer a pena compartilhar arquivo entre os dois
// frontends nesta fase da migração.
export function formatarMoeda(valor: number | null | undefined): string {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(valor ?? 0);
}

export function formatarPercentual(valor: number | null | undefined): string {
	if (valor === null || valor === undefined) return "";
	const sinal = valor >= 0 ? "+" : "";
	return `${sinal}${valor.toFixed(1)}%`;
}
