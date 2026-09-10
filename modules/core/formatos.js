(function () {
	function parseAtributos(valor) {
		if (!valor) return null;
		if (typeof valor === "object") return valor;
		try {
			var obj = JSON.parse(valor);
			return Array.isArray(obj) ? obj : null;
		} catch {
			return null;
		}
	}

	// Formata os atributos (chave: valor) de uma variação.
	// Se não houver atributos, usa o fallback legado (tamanho/cor).
	window.formatarAtributos = function (atributos, tamanho, cor) {
		var pars = parseAtributos(atributos);
		var partes = [];

		if (pars) {
			pars.forEach(function (a) {
				if (a && a.chave && a.valor) {
					partes.push(String(a.chave).trim() + ": " + String(a.valor).trim());
				}
			});
		}

		if (partes.length === 0) {
			if (tamanho) partes.push("Tamanho: " + tamanho);
			if (cor) partes.push("Cor: " + cor);
		}

		return partes.join(" | ") || "---";
	};

	window.parseAtributos = parseAtributos;

	// Formata valor monetário: "R$ 0.00".
	window.formatarMoeda = function (v) {
		return "R$ " + (Number(v) || 0).toFixed(2);
	};

	// Formata data ISO (ou "YYYY-MM-DD") para "dd/mm/aaaa".
	window.formatarData = function (iso) {
		if (!iso) return "---";
		var p = String(iso).split("T")[0].split("-");
		return p[2] + "/" + p[1] + "/" + p[0];
	};

	// Retorna o valor de um atributo por chave (insensível a caixa).
	window.obterAtributo = function (atributos, chaveProcurada) {
		var pars = parseAtributos(atributos);
		if (!pars) return null;
		var alvo = String(chaveProcurada).toLowerCase();
		for (var i = 0; i < pars.length; i++) {
			if (
				pars[i] &&
				pars[i].chave &&
				String(pars[i].chave).trim().toLowerCase() === alvo
			) {
				return pars[i].valor;
			}
		}
		return null;
	};
})();
