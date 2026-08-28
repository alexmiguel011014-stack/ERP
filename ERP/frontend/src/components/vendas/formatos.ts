// Espelha modules/core/formatos.js (mesma convenção pt-BR) — pequeno o
// bastante pra não valer a pena compartilhar arquivo entre os dois
// frontends nesta fase da migração. Mesmo padrão de components/dashboard/formatos.ts.
export function formatarMoeda(valor: number | null | undefined): string {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(valor ?? 0);
}

export function formatarData(iso: string | null | undefined): string {
	if (!iso) return "---";
	const data = new Date(iso);
	if (Number.isNaN(data.getTime())) return iso;
	return data.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}
