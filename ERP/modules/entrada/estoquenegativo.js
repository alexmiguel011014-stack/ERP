(() => {
	var listaEstoque = document.getElementById("listaEstoque");
	var statsEstoque = document.getElementById("statsEstoque");
	var mensagem = document.getElementById("mensagem");

	function carregarEstoqueNegativo() {
		if (!window.api || !window.erpBanco.estoque.negativo) {
			listaEstoque.innerHTML =
				'<div class="empty-state">API indisponvel.</div>';
			return;
		}

		listaEstoque.innerHTML = '<div class="empty-state">Carregando...</div>';

		window.api
			.getEstoqueNegativo()
			.then((dados) => {
				listaEstoque.innerHTML = "";
				statsEstoque.innerHTML = "";

				if (!dados || dados.length === 0) {
					listaEstoque.innerHTML =
						'<div class="empty-state" style="color: #16A34A;">Nenhum produto com estoque negativo. Tudo certo!</div>';
					return;
				}

				statsEstoque.innerHTML =
					'<div class="stat-card" style="border-color: #FECACA;"><div class="stat-value" style="color: #DC2626;">' +
					dados.length +
					'</div><div class="stat-label">Produtos com estoque negativo</div></div>';

				dados.forEach((item) => {
					var div = document.createElement("div");
					div.className = "venda-item";

					var info = document.createElement("div");
					info.className = "venda-info";

					var top = document.createElement("div");
					top.className = "venda-top";
					top.innerHTML =
						'<span class="venda-id">' +
						item.produto_nome +
						"</span>" +
						'<span class="venda-total" style="color: #DC2626;">-' +
						Math.abs(item.quantidade_estoque) +
						" un.</span>";

					var bottom = document.createElement("div");
					bottom.className = "venda-bottom";
					bottom.innerHTML =
						'<span style="color: #94A3B8;">SKU: ' +
						(item.sku || "---") +
						"</span>" +
						'<span style="color: #94A3B8;">Detalhes: ' +
						formatarAtributos(item.atributos, item.tamanho, item.cor) +
						"</span>" +
						'<span style="color: #DC2626; font-weight: 600;">Estoque: ' +
						item.quantidade_estoque +
						" unidades</span>";

					info.appendChild(top);
					info.appendChild(bottom);

					div.appendChild(info);
					listaEstoque.appendChild(div);
				});
			})
			.catch((err) => {
				listaEstoque.innerHTML =
					'<div class="empty-state">Erro ao carregar estoque: ' +
					err +
					"</div>";
			});
	}

	function mostrarMensagem(texto, tipo) {
		mensagem.textContent = texto;
		mensagem.className = "mensagem " + tipo;
		mensagem.style.display = "block";
		setTimeout(() => {
			mensagem.style.display = "none";
		}, 4000);
	}

	carregarEstoqueNegativo();
})();
