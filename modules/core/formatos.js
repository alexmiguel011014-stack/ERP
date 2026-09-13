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

	// Formata valor monetário sempre no padrão brasileiro, com agrupamento de
	// milhares e vírgula decimal.
	window.formatarMoeda = function (v) {
		var numero = Number(v);
		return new Intl.NumberFormat("pt-BR", {
			style: "currency",
			currency: "BRL",
		}).format(Number.isFinite(numero) ? numero : 0);
	};

	// Converte valores digitados no padrão brasileiro (ex.: "1.234,56") para
	// número. A função é compartilhada pelas telas legadas que recebem valores
	// monetários como texto.
	window.lerValorMonetario = function (valorTexto) {
		if (typeof valorTexto === "number") {
			return Number.isFinite(valorTexto) ? valorTexto : 0;
		}
		var texto = String(valorTexto == null ? "" : valorTexto)
			.trim()
			.replace(/\s/g, "")
			.replace(/^R\$/i, "");
		if (!texto) return 0;
		var sinal = texto.charAt(0) === "-" ? "-" : "";
		var semSinal = sinal ? texto.slice(1) : texto;
		var normalizado = semSinal.indexOf(",") >= 0
			? semSinal.replace(/\./g, "").replace(",", ".")
			: /^\d{1,3}(\.\d{3})+$/.test(semSinal)
				? semSinal.replace(/\./g, "")
				: semSinal;
		var numero = Number(sinal + normalizado);
		return Number.isFinite(numero) ? numero : 0;
	};

	// Lê um decimal digitado e diferencia texto inválido de zero legítimo.
	window.lerDecimalInformado = function (valorTexto) {
		if (typeof valorTexto === "number") {
			return Number.isFinite(valorTexto) ? valorTexto : null;
		}
		var texto = String(valorTexto == null ? "" : valorTexto)
			.trim()
			.replace(/\s/g, "")
			.replace(/^R\$/i, "");
		if (
			!texto ||
			(!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(texto) &&
				!/^-?\d+\.\d+$/.test(texto))
		) {
			return null;
		}
		var numero = window.lerValorMonetario(texto);
		return Number.isFinite(numero) ? numero : null;
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
