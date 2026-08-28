// Espelha modules/core/formatos.js (mesma convenção pt-BR) — pequeno o
// bastante pra não valer a pena compartilhar arquivo entre os dois
// frontends nesta fase da migração. Mesmo padrão de components/dashboard/formatos.ts.
export function formatarMoeda(valor: number | null | undefined): string {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(valor ?? 0);
}

export function formatarPercentual(valor: number | null | undefined): string {
	if (valor === null || valor === undefined) return "---";
	return `${valor.toFixed(1)}%`;
}

export function formatarData(iso: string | null | undefined): string {
	if (!iso) return "---";
	const [ano, mes, dia] = iso.split("-");
	return `${dia}/${mes}/${ano}`;
}
