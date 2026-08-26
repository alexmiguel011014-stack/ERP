// Portado de modules/clientes/clientes.js — mesma lógica, mesmo resultado.
export function mascaraTelefone(v: string): string {
	v = v.replace(/\D/g, "");
	if (v.length > 11) v = v.slice(0, 11);
	if (v.length > 7)
		return "(" + v.slice(0, 2) + ") " + v.slice(2, 7) + "-" + v.slice(7);
	if (v.length > 2) return "(" + v.slice(0, 2) + ") " + v.slice(2);
	return v;
}

export function mascaraCpfCnpj(v: string): string {
	v = v.replace(/\D/g, "");
	if (v.length > 14) v = v.slice(0, 14);
	if (v.length <= 11) {
		if (v.length > 9)
			return (
				v.slice(0, 3) +
				"." +
				v.slice(3, 6) +
				"." +
				v.slice(6, 9) +
				"-" +
				v.slice(9)
			);
		if (v.length > 6)
			return v.slice(0, 3) + "." + v.slice(3, 6) + "." + v.slice(6);
		if (v.length > 3) return v.slice(0, 3) + "." + v.slice(3);
		return v;
	}
	if (v.length > 12)
		return (
			v.slice(0, 2) +
			"." +
			v.slice(2, 5) +
			"." +
			v.slice(5, 8) +
			"/" +
			v.slice(8, 12) +
			"-" +
			v.slice(12)
		);
	if (v.length > 8)
		return (
			v.slice(0, 2) +
			"." +
			v.slice(2, 5) +
			"." +
			v.slice(5, 8) +
			"/" +
			v.slice(8)
		);
	if (v.length > 5)
		return v.slice(0, 2) + "." + v.slice(2, 5) + "." + v.slice(5);
	if (v.length > 2) return v.slice(0, 2) + "." + v.slice(2);
	return v;
}
