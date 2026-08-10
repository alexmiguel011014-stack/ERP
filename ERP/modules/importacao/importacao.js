(() => {
	var arquivoInput = document.getElementById("arquivoInput");
	var previaResultado = document.getElementById("previaResultado");
	var btnImportar = document.getElementById("btnImportar");
	var mensagem = document.getElementById("mensagem");

	var linhasCarregadas = null;

	function mostrarMensagem(texto, tipo) {
		mensagem.textContent = texto;
		mensagem.className = "mensagem " + tipo;
		mensagem.style.display = "block";
		setTimeout(() => {
			mensagem.style.display = "none";
		}, 4500);
	}

	function validarFormato(dados) {
		if (!Array.isArray(dados)) return "O arquivo precisa conter uma lista (array) de vendas.";
		if (dados.length === 0) return "A lista está vazia.";
		for (var i = 0; i < dados.length; i++) {
			var l = dados[i];
			if (!l || typeof l !== "object") return "Linha " + (i + 1) + " inválida.";
			if (!l.sku || !l.quantidade || l.valorUnitario === undefined || !l.data) {
				return "Linha " + (i + 1) + " está com campos faltando (sku, quantidade, valorUnitario, data).";
			}
		}
		return null;
	}

	arquivoInput.addEventListener("change", () => {
		linhasCarregadas = null;
		previaResultado.textContent = "";
		btnImportar.disabled = true;
		var arquivo = arquivoInput.files[0];
		if (!arquivo) return;

		var leitor = new FileReader();
		leitor.onload = () => {
			var dados;
			try {
				dados = JSON.parse(leitor.result);
			} catch (e) {
				mostrarMensagem("Arquivo não é um JSON válido.", "erro");
				return;
			}
			var erroFormato = validarFormato(dados);
			if (erroFormato) {
				mostrarMensagem(erroFormato, "erro");
				return;
			}
			linhasCarregadas = dados;
			previaResultado.textContent =
				dados.length + " linha(s) reconhecida(s) no arquivo. Linhas com SKU não cadastrado serão puladas na importação.";
			btnImportar.disabled = false;
		};
		leitor.onerror = () => {
			mostrarMensagem("Erro ao ler o arquivo.", "erro");
		};
		leitor.readAsText(arquivo);
	});

	btnImportar.addEventListener("click", () => {
		if (!linhasCarregadas) return;
		if (
			!confirm(
				"Importar " + linhasCarregadas.length + " linha(s) de venda histórica? Essa ação não altera o estoque atual.",
			)
		)
			return;
		if (!window.api || !window.erpBanco.vendas.importarHistorico) {
			mostrarMensagem("API indisponível.", "erro");
			return;
		}
		btnImportar.disabled = true;
		btnImportar.textContent = "Importando...";
		window.erpBanco.vendas
			.importarHistorico(linhasCarregadas)
			.then((resultado) => {
				mostrarMensagem(
					"Importação concluída: " + resultado.importadas + " venda(s) importada(s), " +
						resultado.puladas + " pulada(s) de " + resultado.total + " linha(s) no total.",
					"sucesso",
				);
				linhasCarregadas = null;
				previaResultado.textContent = "";
				arquivoInput.value = "";
				btnImportar.textContent = "Confirmar Importação";
			})
			.catch((err) => {
				mostrarMensagem("Erro ao importar: " + err, "erro");
				btnImportar.disabled = false;
				btnImportar.textContent = "Confirmar Importação";
			});
	});
})();
