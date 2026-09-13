// Portado de modules/core/formatos.js — usado por toda tela que lista
// variações de produto (Compras, Entrada, Vendas, PDV...), não só uma.
export type AtributoVariacao = { chave?: string; valor?: string };

/** Converte valores digitados no padrão brasileiro para número em reais. */
export function lerValorMonetario(
	valorTexto: string | number | null | undefined,
): number {
	if (typeof valorTexto === "number") {
		return Number.isFinite(valorTexto) ? valorTexto : 0;
	}

	const texto = String(valorTexto ?? "")
		.trim()
		.replace(/\s/g, "")
		.replace(/^R\$/i, "");
	if (!texto) return 0;

	const sinal = texto.startsWith("-") ? "-" : "";
	const semSinal = sinal ? texto.slice(1) : texto;
	const normalizado = semSinal.includes(",")
		? semSinal.replace(/\./g, "").replace(",", ".")
		: /^\d{1,3}(\.\d{3})+$/.test(semSinal)
			? semSinal.replace(/\./g, "")
			: semSinal;
	const numero = Number(sinal + normalizado);
	return Number.isFinite(numero) ? numero : 0;
}

/** Lê um decimal digitado e diferencia texto inválido de zero legítimo. */
export function lerDecimalInformado(
	valorTexto: string | number | null | undefined,
): number | null {
	if (typeof valorTexto === "number") {
		return Number.isFinite(valorTexto) ? valorTexto : null;
	}
	const texto = String(valorTexto ?? "")
		.trim()
		.replace(/\s/g, "")
		.replace(/^R\$/i, "");
	if (
		!texto ||
		(!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(texto) &&
			!/^\-?\d+\.\d+$/.test(texto))
	) {
		return null;
	}
	const numero = lerValorMonetario(texto);
	return Number.isFinite(numero) ? numero : null;
}

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
