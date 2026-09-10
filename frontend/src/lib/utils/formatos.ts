// Portado de modules/core/formatos.js — usado por toda tela que lista
// variações de produto (Compras, Entrada, Vendas, PDV...), não só uma.
export type AtributoVariacao = { chave?: string; valor?: string };

function parseAtributos(valor: unknown): AtributoVariacao[] | null {
	if (!valor) return null;
	if (typeof valor === "object") return Array.isArray(valor) ? valor : null;
	try {
		const obj = JSON.parse(String(valor));
		return Array.isArray(obj) ? obj : null;
	} catch {
		return null;
	}
}

export function formatarAtributos(
	atributos: unknown,
	tamanho?: string | null,
	cor?: string | null,
): string {
	const pares = parseAtributos(atributos);
	const partes: string[] = [];

	if (pares) {
		pares.forEach((a) => {
			if (a && a.chave && a.valor) {
				partes.push(`${String(a.chave).trim()}: ${String(a.valor).trim()}`);
			}
		});
	}

	if (partes.length === 0) {
		if (tamanho) partes.push(`Tamanho: ${tamanho}`);
		if (cor) partes.push(`Cor: ${cor}`);
	}

	return partes.join(" | ") || "---";
}
