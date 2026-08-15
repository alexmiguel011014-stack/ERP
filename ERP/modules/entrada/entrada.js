(() => {
	var skuInput = document.getElementById("skuInput");
	var qtdInput = document.getElementById("qtdInput");
	var custoInput = document.getElementById("custoInput");
	var obsInput = document.getElementById("obsInput");
	var produtoPreview = document.getElementById("produtoPreview");
	var btnAdicionar = document.getElementById("btnAdicionar");
	var btnConfirmar = document.getElementById("btnConfirmar");
	var btnLimpar = document.getElementById("btnLimpar");
	var listaItens = document.getElementById("listaItens");
	var listaMov = document.getElementById("listaMov");
	var mensagem = document.getElementById("mensagem");
	var baixaSkuInput = document.getElementById("baixaSkuInput");
	var baixaQtdInput = document.getElementById("baixaQtdInput");
	var baixaMotivoInput = document.getElementById("baixaMotivoInput");
	var baixaProdutoPreview = document.getElementById("baixaProdutoPreview");
	var btnDarBaixa = document.getElementById("btnDarBaixa");
	var btnAbrirListaEstoque = document.getElementById("btnAbrirListaEstoque");
	var filtroCategoriaEstoque = document.getElementById("filtroCategoriaEstoque");

	var itens = [];
	var produtoAtual = null;
	var baixaProdutoAtual = null;
	var categoriaPorProdutoId = {};
	var movimentacoesCache = [];

	// A tela roda embutida num iframe do workspace "Gerenciamento de Produtos".
	// A lista completa do estoque vive em uma aba própria desse mesmo workspace;
	// abrir por aqui só ativa aquela aba no documento pai.
	btnAbrirListaEstoque.addEventListener("click", () => {
		if (window.parent && window.parent !== window) {
			var tab = window.parent.document.querySelector('.gerenciamento-tab[data-src*="estoque-lista.html"]');
			if (tab) { tab.click(); return; }
		}
		window.location.href = "./estoque-lista.html";
	});

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

	/* ---------- Busca de SKU ---------- */

	function buscarProduto() {
		var sku = skuInput.value.trim().toUpperCase();
		produtoAtual = null;
		produtoPreview.textContent = "";
		if (!sku) return;
		if (!window.api || !window.erpBanco.produtos.buscarSKU) {
			mostrarMensagem("API indisponível.", "erro");
			return;
		}
		window.erpBanco.produtos
			.buscarSKU(sku)
			.then((p) => {
				if (!p) {
					mostrarMensagem("SKU não encontrado: " + sku, "erro");
					return;
				}
				produtoAtual = p;
				if (!custoInput.value && p.preco_custo)
					custoInput.value = Number(p.preco_custo).toFixed(2);
				produtoPreview.textContent =
					p.nome +
					" (" +
					detalhesDe(p) +
					") — estoque atual: " +
					p.quantidade_estoque +
					" | custo médio: " +
					formatarMoeda(p.preco_custo);
				qtdInput.focus();
			})
			.catch((err) => {
				mostrarMensagem("Erro ao buscar SKU: " + err, "erro");
			});
	}

	function buscarProdutoBaixa() {
		var sku = baixaSkuInput.value.trim().toUpperCase();
		baixaProdutoAtual = null;
		baixaProdutoPreview.textContent = "";
		if (!sku) return;
		window.erpBanco.produtos
			.buscarSKU(sku)
			.then((p) => {
				if (!p) {
					mostrarMensagem("SKU não encontrado: " + sku, "erro");
					return;
				}
				baixaProdutoAtual = p;
				baixaProdutoPreview.textContent =
					p.nome + " (" + detalhesDe(p) + ") — estoque atual: " + p.quantidade_estoque;
				baixaQtdInput.focus();
			})
			.catch((err) => {
				mostrarMensagem("Erro ao buscar SKU: " + err, "erro");
			});
	}

	skuInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			buscarProduto();
		}
	});

	baixaSkuInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			buscarProdutoBaixa();
		}
	});

	btnDarBaixa.addEventListener("click", () => {
		if (!baixaProdutoAtual) {
			buscarProdutoBaixa();
			mostrarMensagem("Busque um SKU válido antes de dar baixa.", "erro");
			return;
		}
		var qtdBaixa = parseInt(baixaQtdInput.value, 10);
		if (!Number.isInteger(qtdBaixa) || qtdBaixa <= 0) {
			mostrarMensagem("Informe uma quantidade válida para dar baixa.", "erro");
			return;
		}
		var novoSaldo = baixaProdutoAtual.quantidade_estoque - qtdBaixa;
		if (novoSaldo < 0) {
			mostrarMensagem(
				"Essa baixa deixaria o estoque negativo (saldo atual: " +
					baixaProdutoAtual.quantidade_estoque +
					"). Confira a quantidade.",
				"erro",
			);
			return;
		}
		var motivo = baixaMotivoInput.value;
		btnDarBaixa.disabled = true;
		window.erpBanco.estoque
			.ajustarManual({
				variacao_id: baixaProdutoAtual.id,
				quantidade: novoSaldo,
				observacao: motivo + " (baixa de " + qtdBaixa + " un.)",
			})
			.then((resultado) => {
				if (resultado.abaixoDoReservado) {
					mostrarMensagem(
						"Baixa registrada, mas o novo saldo (" + novoSaldo +
							") ficou abaixo do que está reservado em orçamentos abertos (" +
							resultado.quantidade_reservada +
							"). Verifique os orçamentos pendentes desse produto.",
						"erro",
					);
				} else {
					mostrarMensagem("Baixa de estoque registrada!", "sucesso");
				}
				baixaProdutoAtual.quantidade_estoque = novoSaldo;
				baixaProdutoPreview.textContent =
					baixaProdutoAtual.nome + " — estoque atual: " + novoSaldo;
				baixaQtdInput.value = "";
				carregarMovimentacoes();
			})
			.catch((err) => {
				mostrarMensagem("Erro ao registrar baixa: " + err, "erro");
			})
			.finally(() => {
				btnDarBaixa.disabled = false;
			});
	});

	/* ---------- Lista da entrada ---------- */

	btnAdicionar.addEventListener("click", () => {
		if (!produtoAtual) {
			buscarProduto();
			if (!produtoAtual) {
				mostrarMensagem("Busque um SKU válido antes de adicionar.", "erro");
				return;
			}
		}
		var qtd = parseInt(qtdInput.value, 10);
		if (!Number.isInteger(qtd) || qtd <= 0) {
			mostrarMensagem("Quantidade inválida.", "erro");
			return;
		}
		var custo = custoInput.value !== "" ? Number(custoInput.value) : null;
		if (custo !== null && (!Number.isFinite(custo) || custo < 0)) {
			mostrarMensagem("Custo inválido.", "erro");
			return;
		}

		var existente = null;
		for (var i = 0; i < itens.length; i++) {
			if (itens[i].variacao_id === produtoAtual.id) {
				existente = itens[i];
				break;
			}
		}
		if (existente) {
			existente.quantidade += qtd;
			if (custo !== null) existente.custo_unitario = custo;
		} else {
			itens.push({
				variacao_id: produtoAtual.id,
				nome: produtoAtual.nome,
				detalhes: detalhesDe(produtoAtual),
				sku: produtoAtual.sku,
				quantidade: qtd,
				custo_unitario: custo,
			});
		}

		produtoAtual = null;
		produtoPreview.textContent = "";
		skuInput.value = "";
		qtdInput.value = "1";
		custoInput.value = "";
		skuInput.focus();
		renderizarItens();
	});

	function renderizarItens() {
		listaItens.innerHTML = "";
		if (itens.length === 0) {
			listaItens.innerHTML =
				'<div class="empty-state">Nenhum item adicionado.</div>';
			btnConfirmar.disabled = true;
			return;
		}
		btnConfirmar.disabled = false;

		itens.forEach((item, index) => {
			var div = document.createElement("div");
			div.className = "item-lista";
			div.innerHTML =
				'<div class="info"><div class="titulo"></div><div class="detalhe"></div></div>' +
				'<div class="acoes"><button type="button" class="btn btn-small btn-danger">Remover</button></div>';
			div.querySelector(".titulo").textContent =
				item.nome + " (" + item.detalhes + ")";
			div.querySelector(".detalhe").textContent =
				"SKU: " +
				item.sku +
				" | Qtd: " +
				item.quantidade +
				(item.custo_unitario !== null
					? " | Custo: " + formatarMoeda(item.custo_unitario)
					: " | Custo: não informado");
			div.querySelector("button").addEventListener("click", () => {
				itens.splice(index, 1);
				renderizarItens();
			});
			listaItens.appendChild(div);
		});
	}

	btnLimpar.addEventListener("click", () => {
		itens = [];
		obsInput.value = "";
		renderizarItens();
		skuInput.focus();
	});

	btnConfirmar.addEventListener("click", () => {
		if (itens.length === 0) return;
		if (
			!confirm("Confirmar entrada de " + itens.length + " item(ns) no estoque?")
		)
			return;
		if (!window.api || !window.erpBanco.estoque.registrarEntrada) {
			mostrarMensagem("API indisponível.", "erro");
			return;
		}

		btnConfirmar.disabled = true;
		btnConfirmar.textContent = "Registrando...";

		window.erpBanco.estoque
			.registrarEntrada({
				itens: itens.map((i) => ({
					variacao_id: i.variacao_id,
					quantidade: i.quantidade,
					custo_unitario: i.custo_unitario,
				})),
				observacao: obsInput.value.trim() || null,
				origem: "manual",
			})
			.then(() => {
				mostrarMensagem("Entrada registrada com sucesso!", "sucesso");
				itens = [];
				obsInput.value = "";
				renderizarItens();
				carregarMovimentacoes();
				btnConfirmar.textContent = "Confirmar Entrada";
				skuInput.focus();
			})
			.catch((err) => {
				mostrarMensagem("Erro ao registrar entrada: " + err, "erro");
				btnConfirmar.disabled = false;
				btnConfirmar.textContent = "Confirmar Entrada";
			});
	});

	/* ---------- Movimentações ---------- */

	function renderizarMovimentacoes() {
		var categoriaFiltro = filtroCategoriaEstoque.value;
		var rows = movimentacoesCache;
		if (categoriaFiltro) {
			rows = rows.filter((m) => {
				var catId = categoriaPorProdutoId[m.produto_nome];
				return String(catId) === categoriaFiltro;
			});
		}

		listaMov.innerHTML = "";
		if (!rows || rows.length === 0) {
			listaMov.innerHTML =
				'<div class="empty-state">Nenhuma movimentação registrada.</div>';
			return;
		}
		rows.forEach((m) => {
			var div = document.createElement("div");
			div.className = "item-lista";
			var data = m.data ? new Date(m.data).toLocaleString("pt-BR") : "---";
			var sinal =
				m.tipo === "ajuste" && Number(m.quantidade) < 0 ? "" : "+";
			div.innerHTML =
				'<div class="info"><div class="titulo"></div><div class="detalhe"></div></div>' +
				'<span class="badge badge-verde">' +
				sinal +
				m.quantidade +
				"</span>";
			div.querySelector(".titulo").textContent =
				m.produto_nome + " (" + detalhesDe(m) + ")";
			div.querySelector(".detalhe").textContent =
				data +
				" | Origem: " +
				(m.origem || "manual") +
				(m.custo_unitario !== null && m.custo_unitario !== undefined
					? " | Custo: " + formatarMoeda(m.custo_unitario)
					: "") +
				(m.observacao ? " | " + m.observacao : "");
			listaMov.appendChild(div);
		});
	}

	function carregarMovimentacoes() {
		if (!window.api || !window.erpBanco.estoque.movimentacoes) {
			listaMov.innerHTML = '<div class="empty-state">API indisponível.</div>';
			return;
		}
		if (window.erpSkeletonCards) listaMov.innerHTML = window.erpSkeletonCards(4);
		window.erpBanco.estoque
			.movimentacoes(30)
			.then((rows) => {
				movimentacoesCache = rows || [];
				renderizarMovimentacoes();
			})
			.catch((err) => {
				listaMov.innerHTML = '<div class="empty-state">Erro: ' + err + "</div>";
			});
	}

	/* ---------- Filtro de categoria ---------- */

	function popularFiltroCategoria() {
		Promise.all([
			erpCategoryStore.getCategoriasFlux(),
			window.api && window.erpBanco.produtos.buscar
				? window.erpBanco.produtos.buscar()
				: Promise.resolve([]),
		]).then(([categorias, produtos]) => {
			categoriaPorProdutoId = {};
			(produtos || []).forEach((p) => {
				if (p.categoria_id) categoriaPorProdutoId[p.nome] = p.categoria_id;
			});
			// A movimentação só traz o nome do produto, não o id — o mapa é
			// indexado por nome para permitir o cruzamento no filtro.
			var valorAtual = filtroCategoriaEstoque.value;
			filtroCategoriaEstoque.innerHTML =
				'<option value="">Todas as categorias</option>';
			(categorias || []).forEach((c) => {
				var opt = document.createElement("option");
				opt.value = c.id;
				opt.textContent = c.nome;
				filtroCategoriaEstoque.appendChild(opt);
			});
			filtroCategoriaEstoque.value = valorAtual;
		});
	}

	filtroCategoriaEstoque.addEventListener("change", renderizarMovimentacoes);

	function iniciarEstoque() {
		popularFiltroCategoria();
		carregarMovimentacoes();
	}

	if (window.erpAuthPromise)
		window.erpAuthPromise.then(iniciarEstoque).catch(() => {});
	else iniciarEstoque();
})();
