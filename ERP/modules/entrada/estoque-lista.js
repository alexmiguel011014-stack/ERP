(() => {
	var statsEstoque = document.getElementById("statsEstoque");
	var corpoEstoque = document.getElementById("corpoEstoque");
	var buscaEstoque = document.getElementById("buscaEstoque");
	var filtroStatus = document.getElementById("filtroStatus");
	var mensagem = document.getElementById("mensagem");

	var estoqueCompleto = [];
	var filtroStatusAtual = "todos";

	function mostrarMensagem(texto, tipo) {
		mensagem.textContent = texto;
		mensagem.className = "mensagem " + tipo;
		mensagem.style.display = "block";
		setTimeout(() => {
			mensagem.style.display = "none";
		}, 4500);
	}

	function formatarMoeda(v) {
		return "R$ " + (Number(v) || 0).toFixed(2);
	}

	function detalhesDe(p) {
		if (window.formatarAtributos)
			return window.formatarAtributos(p.atributos, p.tamanho, p.cor);
		return [p.tamanho, p.cor].filter(Boolean).join(" / ") || "---";
	}

	function statusDe(r) {
		if (r.quantidade_estoque < 0) return "negativo";
		if (r.quantidade_estoque <= r.estoque_minimo) return "baixo";
		return "normal";
	}

	function renderizarStats(rows) {
		var valorTotal = rows.reduce((soma, r) => {
			var qtd = Math.max(0, Number(r.quantidade_estoque) || 0);
			return soma + qtd * (Number(r.preco_custo) || 0);
		}, 0);
		var baixos = rows.filter((r) => statusDe(r) === "baixo").length;
		var negativos = rows.filter((r) => statusDe(r) === "negativo").length;

		statsEstoque.innerHTML =
			'<div class="stat-card"><div class="stat-value">' +
			rows.length +
			'</div><div class="stat-label">SKUs cadastrados</div></div>' +
			'<div class="stat-card"><div class="stat-value verde">' +
			formatarMoeda(valorTotal) +
			'</div><div class="stat-label">Valor em estoque</div></div>' +
			'<div class="stat-card"><div class="stat-value amarelo">' +
			baixos +
			'</div><div class="stat-label">Itens com estoque baixo</div></div>' +
			'<div class="stat-card"><div class="stat-value vermelho">' +
			negativos +
			'</div><div class="stat-label">Itens com estoque negativo</div></div>';
	}

	function salvarMinimoInline(variacaoId, valor, inputEl) {
		var novoMin = parseInt(valor, 10);
		if (!Number.isInteger(novoMin) || novoMin < 0) {
			mostrarMensagem("Estoque mínimo inválido.", "erro");
			return;
		}
		window.erpBanco.estoque
			.salvarMinimo(variacaoId, novoMin)
			.then(() => {
				var item = estoqueCompleto.find((r) => r.variacao_id === variacaoId);
				if (item) item.estoque_minimo = novoMin;
				renderizarEstoque();
			})
			.catch((err) => {
				mostrarMensagem("Erro ao salvar mínimo: " + err, "erro");
				if (inputEl) inputEl.focus();
			});
	}

	function renderizarEstoque() {
		renderizarStats(estoqueCompleto);

		var termo = (buscaEstoque.value || "").trim().toLowerCase();
		var linhas = estoqueCompleto.filter((r) => {
			if (filtroStatusAtual !== "todos" && statusDe(r) !== filtroStatusAtual)
				return false;
			if (!termo) return true;
			var alvo = (r.produto_nome + " " + r.sku).toLowerCase();
			return alvo.indexOf(termo) !== -1;
		});

		corpoEstoque.innerHTML = "";
		if (linhas.length === 0) {
			corpoEstoque.innerHTML =
				'<tr><td colspan="8"><div class="empty-state">Nenhum item encontrado.</div></td></tr>';
			return;
		}

		linhas.forEach((r) => {
			var status = statusDe(r);
			var valor = (Number(r.quantidade_estoque) || 0) * (Number(r.preco_custo) || 0);
			var tr = document.createElement("tr");

			var tdSku = document.createElement("td");
			tdSku.textContent = r.sku;
			tr.appendChild(tdSku);

			var tdProduto = document.createElement("td");
			tdProduto.textContent = r.produto_nome;
			tr.appendChild(tdProduto);

			var tdAtributos = document.createElement("td");
			tdAtributos.textContent = detalhesDe(r);
			tr.appendChild(tdAtributos);

			var tdQtd = document.createElement("td");
			tdQtd.textContent = r.quantidade_estoque;
			if (status === "negativo") tdQtd.style.color = "var(--cor-erro)";
			else if (status === "baixo") tdQtd.style.color = "var(--cor-destaque)";
			tr.appendChild(tdQtd);

			var tdMin = document.createElement("td");
			var inputMin = document.createElement("input");
			inputMin.type = "number";
			inputMin.className = "minimo-input";
			inputMin.min = "0";
			inputMin.step = "1";
			inputMin.value = r.estoque_minimo;
			inputMin.addEventListener("change", () => {
				salvarMinimoInline(r.variacao_id, inputMin.value, inputMin);
			});
			tdMin.appendChild(inputMin);
			tr.appendChild(tdMin);

			var tdCusto = document.createElement("td");
			tdCusto.textContent = formatarMoeda(r.preco_custo);
			tr.appendChild(tdCusto);

			var tdValor = document.createElement("td");
			tdValor.textContent = formatarMoeda(valor);
			if (valor < 0) tdValor.style.color = "var(--cor-erro)";
			tr.appendChild(tdValor);

			var tdStatus = document.createElement("td");
			var badge = document.createElement("span");
			if (status === "negativo") {
				badge.className = "badge badge-vermelha";
				badge.textContent = "Negativo";
			} else if (status === "baixo") {
				badge.className = "badge badge-amarela";
				badge.textContent = "Baixo";
			} else {
				badge.className = "badge badge-verde";
				badge.textContent = "Normal";
			}
			tdStatus.appendChild(badge);
			tr.appendChild(tdStatus);

			corpoEstoque.appendChild(tr);
		});
	}

	function carregarVisaoGeral() {
		if (!window.api || !window.erpBanco.estoque.visaoGeral) {
			corpoEstoque.innerHTML =
				'<tr><td colspan="8"><div class="empty-state">API indisponível.</div></td></tr>';
			return;
		}
		window.erpBanco.estoque
			.visaoGeral()
			.then((rows) => {
				estoqueCompleto = rows || [];
				renderizarEstoque();
			})
			.catch((err) => {
				corpoEstoque.innerHTML =
					'<tr><td colspan="8"><div class="empty-state">Erro: ' + err + "</div></td></tr>";
			});
	}

	buscaEstoque.addEventListener("input", renderizarEstoque);

	filtroStatus.addEventListener("click", (e) => {
		var chip = e.target.closest(".chip");
		if (!chip) return;
		Array.prototype.forEach.call(
			filtroStatus.querySelectorAll(".chip"),
			(c) => c.classList.remove("active"),
		);
		chip.classList.add("active");
		filtroStatusAtual = chip.dataset.status;
		renderizarEstoque();
	});

	if (window.erpAuthPromise)
		window.erpAuthPromise.then(carregarVisaoGeral).catch(() => {});
	else carregarVisaoGeral();
})();
