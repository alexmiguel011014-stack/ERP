(() => {
	"use strict";
	var skuInput = document.getElementById("skuInput");
	var carrinhoAccordion = document.getElementById("carrinhoAccordion");
	var carrinhoVazio = document.getElementById("carrinhoVazio");
	var totalValue = document.getElementById("totalValue");
	var formaPagamento = document.getElementById("formaPagamento");
	var clienteSelect = document.getElementById("clienteSelect");
	var descontoInput = document.getElementById("descontoInput");
	var observacaoInput = document.getElementById("observacaoInput");
	var btnFinalizar = document.getElementById("btnFinalizar");
	var btnOrcamento = document.getElementById("btnOrcamento");
	var btnCancelar = document.getElementById("btnCancelarVenda");
	var mensagemPDV = document.getElementById("mensagemPDV");
	var loadingOverlay = document.getElementById("loadingOverlay");
	var pdvDate = document.getElementById("pdvDate");
	var btnBuscarProduto = document.getElementById("btnBuscarProduto");

	var carrinho = [];
	var imagemCache = {};
	var carrinhoItemAberto = -1; // índice do card expandido; -1 = nenhum

	function esc(t) {
		return String(t == null ? "" : t)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	pdvDate.textContent = new Date().toLocaleDateString("pt-BR");

	/* ---------- Clientes ---------- */

	var clienteBusca = document.getElementById("clienteBusca");
	var clienteResultados = document.getElementById("clienteResultados");
	var clienteEscolhido = document.getElementById("clienteEscolhido");
	var clienteEscolhidoNome = document.getElementById("clienteEscolhidoNome");
	var btnLimparCliente = document.getElementById("btnLimparCliente");
	var clientesCache = [];

	function carregarClientes() {
		if (!window.api || !window.erpBanco.clientes.listar) return;
		window.erpBanco.clientes
			.listar()
			.then((rows) => {
				clientesCache = rows || [];
			})
			.catch((erro) => {
				console.error("Erro ao carregar clientes:", erro);
				mostrarMensagem(
					"Não foi possível carregar os clientes: " + erro,
					"erro",
				);
			});
	}

	if (window.erpAuthPromise) {
		window.erpAuthPromise
			.then(() => {
				carregarClientes();
				carregarCarrinho();
			})
			.catch((erro) => {
				console.error("Autenticação do PDV falhou:", erro);
			});
	} else {
		carregarClientes();
		carregarCarrinho();
	}

	function normalizar(t) {
		return String(t || "")
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase();
	}

	clienteBusca.addEventListener("input", () => {
		var termo = normalizar(clienteBusca.value.trim());
		if (!termo) {
			clienteResultados.style.display = "none";
			clienteResultados.innerHTML = "";
			return;
		}
		var achados = clientesCache
			.filter(
				(c) =>
					normalizar(c.nome).indexOf(termo) !== -1 ||
					normalizar(c.codigo).indexOf(termo) !== -1,
			)
			.slice(0, 8);
		if (achados.length === 0) {
			clienteResultados.innerHTML =
				'<div style="padding:8px; font-size:0.85rem; color:#94A3B8;">Nenhum cliente encontrado.</div>';
			clienteResultados.style.display = "block";
			return;
		}
		clienteResultados.innerHTML = achados
			.map(
				(c, i) =>
					'<div class="cliente-item" data-index="' +
					i +
					'" style="padding:6px 8px; cursor:pointer; font-size:0.85rem; border-bottom:1px solid #F1F5F9;">' +
					esc((c.codigo ? c.codigo + " - " : "") + c.nome) +
					"</div>",
			)
			.join("");
		clienteResultados.querySelectorAll(".cliente-item").forEach((el, i) => {
			el.addEventListener(
				"mouseenter",
				() => (el.style.background = "#F1F5F9"),
			);
			el.addEventListener("mouseleave", () => (el.style.background = ""));
			el.addEventListener("click", () => escolherCliente(achados[i]));
		});
		clienteResultados.style.display = "block";
	});

	function escolherCliente(c) {
		clienteSelect.value = c.id;
		clienteEscolhidoNome.textContent =
			(c.codigo ? c.codigo + " - " : "") + c.nome;
		clienteEscolhido.style.display = "flex";
		clienteBusca.value = "";
		clienteBusca.style.display = "none";
		clienteResultados.style.display = "none";
		clienteResultados.innerHTML = "";
		reaplicarPrecoClienteNoCarrinho();
	}

	function limparClienteSelecionado() {
		clienteSelect.value = "";
		clienteEscolhidoNome.textContent = "";
		clienteEscolhido.style.display = "none";
		clienteBusca.style.display = "block";
		clienteBusca.value = "";
	}

	btnLimparCliente.addEventListener("click", () => {
		limparClienteSelecionado();
		clienteBusca.focus();
	});

	document.addEventListener("click", (e) => {
		if (
			clienteResultados.style.display === "block" &&
			!clienteResultados.contains(e.target) &&
			e.target !== clienteBusca
		) {
			clienteResultados.style.display = "none";
		}
	});

	// Aplica o preço combinado com o cliente selecionado (se houver) a um item
	// recém-adicionado ao carrinho. Sem cliente ou sem preço especial, mantém
	// o preço padrão do produto já atribuído ao item.
	function aplicarPrecoCliente(item, variacaoId) {
		if (!item) return;
		var clienteId = clienteSelect.value ? Number(clienteSelect.value) : null;
		if (!clienteId || !window.erpBanco.clientes.precoEspecial) return;
		window.erpBanco.clientes
			.precoEspecial(clienteId, variacaoId)
			.then((preco) => {
				if (preco !== null && preco !== undefined) {
					item.preco_unitario = Number(preco);
					salvarCarrinho();
					renderizarCarrinho();
				}
			})
			.catch(() => {});
	}

	// Trocar o cliente com itens já no carrinho reaplica o preço especial de
	// cada item (ou volta ao padrão se o novo cliente não tiver combinado nada).
	function reaplicarPrecoClienteNoCarrinho() {
		if (carrinho.length === 0) return;
		var clienteId = clienteSelect.value ? Number(clienteSelect.value) : null;
		if (!clienteId || !window.erpBanco.clientes.precoEspecial) return;
		carrinho.forEach((item) => {
			window.erpBanco.clientes
				.precoEspecial(clienteId, item.variacao_id)
				.then((preco) => {
					if (preco !== null && preco !== undefined) {
						item.preco_unitario = Number(preco);
						salvarCarrinho();
						renderizarCarrinho();
					}
				})
				.catch(() => {});
		});
	}

	/* ---------- Totais ---------- */

	function subtotalCarrinho() {
		return carrinho.reduce(
			(acc, item) => acc + item.preco_unitario * item.quantidade,
			0,
		);
	}

	function descontoAtual() {
		var d = Number(descontoInput.value);
		if (!Number.isFinite(d) || d < 0) return 0;
		return d;
	}

	function totalCarrinho() {
		return Math.max(0, subtotalCarrinho() - descontoAtual());
	}

	function atualizarTotal() {
		totalValue.textContent =
			"R$ " +
			totalCarrinho().toLocaleString("pt-BR", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			});
		if (typeof atualizarTroco === "function") atualizarTroco();
	}

	descontoInput.addEventListener("input", atualizarTotal);

	/* ---------- Troco ---------- */

	var grupoTroco = document.getElementById("grupoTroco");
	var valorRecebidoInput = document.getElementById("valorRecebidoInput");
	var trocoResultado = document.getElementById("trocoResultado");

	function esconderGrupoTroco() {
		grupoTroco.style.display = "none";
		valorRecebidoInput.value = "";
		trocoResultado.textContent = "";
	}

	function atualizarTroco() {
		var recebido = Number(valorRecebidoInput.value);
		if (!Number.isFinite(recebido) || recebido <= 0) {
			trocoResultado.textContent = "";
			return;
		}
		var troco = recebido - totalCarrinho();
		if (troco < 0) {
			trocoResultado.style.color = "var(--cor-erro)";
			trocoResultado.textContent =
				"Falta R$ " +
				Math.abs(troco).toLocaleString("pt-BR", {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				});
		} else {
			trocoResultado.style.color = "var(--cor-sucesso)";
			trocoResultado.textContent =
				"Troco: R$ " +
				troco.toLocaleString("pt-BR", {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				});
		}
	}

	formaPagamento.addEventListener("change", () => {
		if (formaPagamento.value === "Dinheiro") {
			grupoTroco.style.display = "block";
			valorRecebidoInput.focus();
		} else {
			esconderGrupoTroco();
		}
	});

	valorRecebidoInput.addEventListener("input", atualizarTroco);

	function salvarCarrinho() {
		try {
			localStorage.setItem("pdv_carrinho", JSON.stringify(carrinho));
		} catch (e) {
			console.error("Erro ao salvar carrinho:", e);
		}
	}

	function carregarCarrinho() {
		try {
			var dados = localStorage.getItem("pdv_carrinho");
			if (dados) {
				carrinho = JSON.parse(dados);
				if (Array.isArray(carrinho)) {
					renderizarCarrinho();
					mostrarMensagem(
						"Carrinho restaurado de uma sessão anterior.",
						"info",
					);
				}
			}
		} catch (e) {
			console.error("Erro ao carregar carrinho:", e);
			carrinho = [];
		}
	}

	function limparCarrinhoPersistente() {
		localStorage.removeItem("pdv_carrinho");
	}

	function mostrarLoading(mostrar) {
		if (loadingOverlay) {
			loadingOverlay.style.display = mostrar ? "flex" : "none";
		}
	}

	var produtosEncontrados = [];
	var produtosLista = document.getElementById("produtosEncontrados");
	var produtosTbody = produtosLista
		? produtosLista.querySelector("tbody")
		: null;
	var produtoSelecionadoIndex = -1;

	function renderizarProdutosEncontrados() {
		if (!produtosTbody) return;
		produtosTbody.innerHTML = "";
		if (!produtosEncontrados.length) {
			produtosEncontrados = [];
			produtosLista.style.display = "none";
			produtoSelecionadoIndex = -1;
			return;
		}
		produtosEncontrados.forEach((p, i) => {
			var tr = document.createElement("tr");
			tr.style.cursor = "pointer";
			tr.style.background = i === produtoSelecionadoIndex ? "#E0F2FE" : "";
			tr.addEventListener("click", () => {
				selecionarProdutoLista(i);
			});
			var precoCel =
				Number(p.preco || 0) > 0
					? Number(p.preco).toFixed(2)
					: '<span style="color:var(--cor-erro);font-weight:600;">Sem preço</span>';
			var disponivelCel = Number.isFinite(Number(p.quantidade_disponivel))
				? Number(p.quantidade_disponivel)
				: p.quantidade_estoque || 0;
			tr.innerHTML =
				"<td>" +
				esc(p.sku || "") +
				"</td>" +
				"<td>" +
				esc(p.nome) +
				"</td>" +
				'<td style="text-align:right;">' +
				precoCel +
				"</td>" +
				'<td style="text-align:right;">' +
				disponivelCel +
				"</td>";
			produtosTbody.appendChild(tr);
		});
		produtosLista.style.display = "block";
	}

	function selecionarProdutoLista(index) {
		if (index < 0 || index >= produtosEncontrados.length) return;
		var p = produtosEncontrados[index];
		produtosLista.style.display = "none";
		produtosEncontrados = [];
		produtoSelecionadoIndex = -1;
		if (produtosTbody) produtosTbody.innerHTML = "";
		adicionarProdutoCarrinho(p);
	}

	function adicionarProdutoCarrinho(produto) {
		if (!(Number(produto.preco) > 0)) {
			mostrarAlertaPreco(produto);
			skuInput.value = "";
			skuInput.focus();
			return;
		}
		var disponivel = Number.isFinite(Number(produto.quantidade_disponivel))
			? Number(produto.quantidade_disponivel)
			: produto.quantidade_estoque;
		if (disponivel <= 0) {
			mostrarAlertaEstoque(produto, "Sem estoque");
			skuInput.value = "";
			skuInput.focus();
			return;
		}
		var minimo = Number.isFinite(Number(produto.estoque_minimo))
			? Number(produto.estoque_minimo)
			: 5;
		if (disponivel <= minimo) mostrarAlertaEstoque(produto, "Estoque Baixo");

		var existente = carrinho.find((item) => item.variacao_id === produto.id);

		if (existente) {
			if (existente.quantidade >= disponivel) {
				mostrarMensagem("Estoque insuficiente para " + produto.nome, "erro");
				return;
			}
			existente.quantidade += 1;
			carrinhoItemAberto = carrinho.indexOf(existente);
		} else {
			carrinho.push({
				variacao_id: produto.id,
				nome: produto.nome,
				detalhes: formatarAtributos(
					produto.atributos,
					produto.tamanho,
					produto.cor,
				),
				tamanho: produto.tamanho,
				cor: produto.cor,
				preco_unitario: produto.preco,
				quantidade: 1,
				estoque: disponivel,
				imagem: produto.imagem || null,
			});
			carrinhoItemAberto = carrinho.length - 1;
		}

		aplicarPrecoCliente(carrinho[carrinho.length - 1] || existente, produto.id);
		salvarCarrinho();
		renderizarCarrinho();
		skuInput.value = "";
		skuInput.focus();
	}

	function buscarPorTermo(termo) {
		if (!window.api || !window.erpBanco.produtos.buscarPorTermo) {
			mostrarMensagem("API de pesquisa indisponível.", "erro");
			return;
		}
		mostrarLoading(true);
		window.erpBanco.produtos
			.buscarPorTermo(termo)
			.then((lista) => {
				produtosEncontrados = Array.isArray(lista) ? lista : [];
				produtoSelecionadoIndex = produtosEncontrados.length ? 0 : -1;
				renderizarProdutosEncontrados();
				if (!produtosEncontrados.length) {
					mostrarMensagem("Produto não encontrado: " + termo, "erro");
				}
			})
			.catch((err) => {
				mostrarMensagem("Erro na busca: " + err, "erro");
				console.error("Erro ao pesquisar produtos:", err);
			})
			.finally(() => {
				mostrarLoading(false);
			});
	}

	// Tecla Enter: código do produto exato ou busca por nome.
	skuInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			var termo = skuInput.value.trim();
			if (!termo) return;
			if (
				produtosLista &&
				produtosLista.style.display === "block" &&
				produtosEncontrados.length
			) {
				selecionarProdutoLista(produtoSelecionadoIndex);
				return;
			}
			buscarPorTermo(termo);
		}
		if (e.key === "ArrowDown") {
			if (
				produtosEncontrados.length &&
				produtosLista.style.display === "block"
			) {
				e.preventDefault();
				produtoSelecionadoIndex =
					(produtoSelecionadoIndex + 1) % produtosEncontrados.length;
				renderizarProdutosEncontrados();
			}
		}
		if (e.key === "ArrowUp") {
			if (
				produtosEncontrados.length &&
				produtosLista.style.display === "block"
			) {
				e.preventDefault();
				produtoSelecionadoIndex =
					(produtoSelecionadoIndex - 1 + produtosEncontrados.length) %
					produtosEncontrados.length;
				renderizarProdutosEncontrados();
			}
		}
	});

	if (btnBuscarProduto) {
		btnBuscarProduto.addEventListener("click", (e) => {
			e.preventDefault();
			var termo = skuInput.value.trim();
			if (
				produtosLista &&
				produtosLista.style.display === "block" &&
				produtosEncontrados.length
			) {
				selecionarProdutoLista(produtoSelecionadoIndex);
			} else {
				buscarPorTermo(termo);
			}
		});
	}

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			e.preventDefault();
			if (produtosLista && produtosLista.style.display === "block") {
				produtosLista.style.display = "none";
				produtosEncontrados = [];
				produtoSelecionadoIndex = -1;
				skuInput.value = "";
				skuInput.focus();
				return;
			}
			if (carrinho.length > 0) {
				confirmarCancelamento();
			} else {
				window.location.href = "../dashboard/index.html";
			}
		}
		if (e.key === "F2") {
			e.preventDefault();
			window.location.href = "../produtos/cadastro.html";
		}
	});

	if (btnCancelar) {
		btnCancelar.addEventListener("click", () => {
			confirmarCancelamento();
		});
	}

	function confirmarCancelamento() {
		if (carrinho.length === 0) {
			window.location.href = "../dashboard/index.html";
			return;
		}

		var total = carrinho.reduce(
			(acc, item) => acc + item.preco_unitario * item.quantidade,
			0,
		);

		var msg =
			"Cancelar venda?\n\n" +
			"Itens no carrinho: " +
			carrinho.length +
			"\n" +
			"Total: R$ " +
			total.toFixed(2) +
			"\n\n" +
			"Esta ação não pode ser desfeita.";

		if (confirm(msg)) {
			limparCarrinho();
			window.location.href = "../dashboard/index.html";
		}
	}

	function mostrarAlertaEstoque(produto, tipo) {
		var cor =
			tipo === "Sem estoque" ? "var(--cor-erro)" : "var(--cor-destaque-solido)";
		var mensagemTexto =
			tipo === "Sem estoque"
				? "Sem estoque para: " + produto.nome
				: "Estoque baixo: " +
					produto.nome +
					" (" +
					produto.quantidade_estoque +
					" unidades)";

		mostrarMensagem(mensagemTexto, "erro");

		var alerta = document.createElement("div");
		alerta.style.cssText =
			"position: fixed; top: 60px; right: 20px; background: " +
			cor +
			"; color: white; padding: 12px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000; font-size: 14px; max-width: 300px;";
		alerta.innerHTML =
			'<div style="font-weight: 600; margin-bottom: 4px;">' +
			tipo +
			"</div>" +
			"<div>" +
			produto.nome +
			"</div>" +
			"<div>SKU: " +
			produto.sku +
			"</div>" +
			"<div>Detalhes: " +
			formatarAtributos(produto.atributos, produto.tamanho, produto.cor) +
			"</div>" +
			"<div>Estoque: " +
			produto.quantidade_estoque +
			" unidades</div>";
		document.body.appendChild(alerta);

		setTimeout(() => {
			alerta.style.transition = "opacity 0.3s";
			alerta.style.opacity = "0";
			setTimeout(() => {
				if (alerta.parentNode) {
					alerta.parentNode.removeChild(alerta);
				}
			}, 300);
		}, 4000);
	}

	// Produto novo criado no Cadastro nasce com preço zerado até ser
	// configurado na aba Precificação — bloqueia a venda em vez de deixar
	// passar de graça, e deixa claro qual é o próximo passo.
	function mostrarAlertaPreco(produto) {
		mostrarMensagem(
			"Preço não definido para: " +
				produto.nome +
				". Configure em Precificação antes de vender.",
			"erro",
		);

		var alerta = document.createElement("div");
		alerta.style.cssText =
			"position: fixed; top: 60px; right: 20px; background: var(--cor-erro); color: white; padding: 12px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000; font-size: 14px; max-width: 300px;";
		alerta.innerHTML =
			'<div style="font-weight: 600; margin-bottom: 4px;">Sem preço definido</div>' +
			"<div>" +
			produto.nome +
			"</div>" +
			"<div>SKU: " +
			produto.sku +
			"</div>" +
			"<div>Configure o preço na aba Precificação.</div>";
		document.body.appendChild(alerta);

		setTimeout(() => {
			alerta.style.transition = "opacity 0.3s";
			alerta.style.opacity = "0";
			setTimeout(() => {
				if (alerta.parentNode) {
					alerta.parentNode.removeChild(alerta);
				}
			}, 300);
		}, 4000);
	}

	function renderizarCarrinho() {
		carrinhoAccordion.innerHTML = "";

		if (carrinho.length === 0) {
			carrinhoVazio.style.display = "";
			totalValue.textContent = "R$ 0,00";
			btnFinalizar.disabled = true;
			btnOrcamento.disabled = true;
			return;
		}

		carrinhoVazio.style.display = "none";

		carrinho.forEach((item, index) => {
			var subtotal = item.preco_unitario * item.quantidade;
			var minimoItem = Number.isFinite(Number(item.estoque_minimo))
				? Number(item.estoque_minimo)
				: 5;
			var estoqueBaixo =
				item.estoque !== undefined && item.estoque <= minimoItem;
			var detalhesTexto =
				item.detalhes ||
				formatarAtributos(item.atributos, item.tamanho, item.cor);

			var card = document.createElement("div");
			card.className =
				"carrinho-item" + (index === carrinhoItemAberto ? " open" : "");

			var header = document.createElement("button");
			header.type = "button";
			header.className = "carrinho-item-header";

			var numero = document.createElement("span");
			numero.className = "carrinho-item-numero";
			numero.textContent = String(index + 1).padStart(2, "0");
			header.appendChild(numero);

			var thumb = document.createElement("span");
			thumb.className = "carrinho-item-thumb";
			header.appendChild(thumb);
			if (item.imagem) {
				if (imagemCache[item.imagem]) {
					thumb.style.backgroundImage =
						"url('" + imagemCache[item.imagem] + "')";
				} else if (window.erpBanco.produtos.imagem) {
					window.erpBanco.produtos
						.imagem(item.imagem)
						.then((dataUrl) => {
							if (dataUrl) {
								imagemCache[item.imagem] = dataUrl;
								thumb.style.backgroundImage = "url('" + dataUrl + "')";
							}
						})
						.catch(() => {});
				}
			}

			var resumo = document.createElement("span");
			resumo.className = "carrinho-item-resumo";
			var nomeSpan = document.createElement("span");
			nomeSpan.className =
				"carrinho-item-nome" + (estoqueBaixo ? " estoque-baixo" : "");
			nomeSpan.textContent = item.nome;
			if (estoqueBaixo)
				header.title = "Estoque baixo: " + item.estoque + " unidades";
			var subSpan = document.createElement("span");
			subSpan.className = "carrinho-item-sub";
			subSpan.textContent =
				(detalhesTexto || "") + " \u00b7 Qtd: " + item.quantidade;
			resumo.appendChild(nomeSpan);
			resumo.appendChild(subSpan);
			header.appendChild(resumo);

			var subtotalSpan = document.createElement("span");
			subtotalSpan.className = "carrinho-item-subtotal";
			subtotalSpan.textContent = "R$ " + subtotal.toFixed(2);
			header.appendChild(subtotalSpan);

			var seta = document.createElement("span");
			seta.className = "carrinho-item-seta";
			seta.innerHTML = "&#8250;";
			header.appendChild(seta);

			header.addEventListener("click", () => {
				carrinhoItemAberto = carrinhoItemAberto === index ? -1 : index;
				renderizarCarrinho();
			});

			var body = document.createElement("div");
			body.className = "carrinho-item-body";
			var bodyInner = document.createElement("div");
			bodyInner.className = "carrinho-item-body-inner";

			var qtdControle = document.createElement("div");
			qtdControle.className = "carrinho-item-qtd-controle";
			var btnMenos = document.createElement("button");
			btnMenos.type = "button";
			btnMenos.className = "btn-qtd";
			btnMenos.textContent = "\u2212";
			btnMenos.title = "Diminuir 1";
			btnMenos.addEventListener("click", (e) => {
				e.stopPropagation();
				diminuirQtd(index);
			});
			var spanQtd = document.createElement("span");
			spanQtd.textContent = " " + item.quantidade + " ";
			var btnMais = document.createElement("button");
			btnMais.type = "button";
			btnMais.className = "btn-qtd";
			btnMais.textContent = "+";
			btnMais.title = "Adicionar 1";
			btnMais.addEventListener("click", (e) => {
				e.stopPropagation();
				aumentarQtd(index);
			});
			qtdControle.appendChild(btnMenos);
			qtdControle.appendChild(spanQtd);
			qtdControle.appendChild(btnMais);

			var precoUnit = document.createElement("span");
			precoUnit.className = "carrinho-item-preco";
			precoUnit.textContent =
				"Unit\u00e1rio: R$ " + item.preco_unitario.toFixed(2);

			var btnRemover = document.createElement("button");
			btnRemover.type = "button";
			btnRemover.className = "btn-remover";
			btnRemover.textContent = "Remover";
			btnRemover.title = "Remover item";
			btnRemover.addEventListener("click", (e) => {
				e.stopPropagation();
				removerItem(index);
			});

			bodyInner.appendChild(qtdControle);
			bodyInner.appendChild(precoUnit);
			bodyInner.appendChild(btnRemover);
			body.appendChild(bodyInner);

			card.appendChild(header);
			card.appendChild(body);
			carrinhoAccordion.appendChild(card);
		});

		atualizarTotal();
		btnFinalizar.disabled = false;
		btnOrcamento.disabled = false;
	}

	function diminuirQtd(index) {
		if (carrinho[index].quantidade > 1) {
			carrinho[index].quantidade -= 1;
		} else {
			carrinho.splice(index, 1);
		}
		salvarCarrinho();
		renderizarCarrinho();
	}

	function aumentarQtd(index) {
		if (carrinho[index].quantidade < carrinho[index].estoque) {
			carrinho[index].quantidade += 1;
			salvarCarrinho();
			renderizarCarrinho();
		} else {
			mostrarMensagem(
				"Estoque insuficiente para " + carrinho[index].nome,
				"erro",
			);
		}
	}

	function removerItem(index) {
		carrinho.splice(index, 1);
		salvarCarrinho();
		renderizarCarrinho();
	}

	function limparCarrinho() {
		carrinho = [];
		carrinhoItemAberto = -1;
		limparCarrinhoPersistente();
		renderizarCarrinho();
		skuInput.value = "";
		formaPagamento.value = "";
		limparClienteSelecionado();
		descontoInput.value = "0";
		observacaoInput.value = "";
		skuInput.focus();
		mostrarMensagem("Carrinho limpo.", "info");
	}

	btnOrcamento.addEventListener("click", () => {
		if (carrinho.length === 0) {
			mostrarMensagem("Carrinho vazio.", "erro");
			return;
		}

		if (
			!confirm(
				"Salvar como orçamento?\n\nO estoque NÃO será baixado agora. Converta em venda depois, na tela de Histórico.",
			)
		) {
			return;
		}

		registrarVenda("orcamento");
	});

	btnFinalizar.addEventListener("click", () => {
		if (carrinho.length === 0) {
			mostrarMensagem("Carrinho vazio.", "erro");
			return;
		}

		var pagamento = formaPagamento.value;
		if (!pagamento) {
			mostrarMensagem("Selecione a forma de pagamento.", "erro");
			return;
		}

		var total = totalCarrinho();
		var desconto = descontoAtual();
		var recebido = Number(valorRecebidoInput.value);

		if (pagamento === "Dinheiro") {
			if (!Number.isFinite(recebido) || recebido <= 0) {
				mostrarMensagem("Informe o valor recebido.", "erro");
				valorRecebidoInput.focus();
				return;
			}
			if (recebido < total) {
				mostrarMensagem("Valor recebido é menor que o total da venda.", "erro");
				valorRecebidoInput.focus();
				return;
			}
		}

		var mensagemConfirmacao =
			"Finalizar venda?\n\n" +
			"Itens: " +
			carrinho.length +
			"\n" +
			"Subtotal: R$ " +
			subtotalCarrinho().toFixed(2) +
			(desconto > 0 ? "\nDesconto: R$ " + desconto.toFixed(2) : "") +
			"\n" +
			"Total: R$ " +
			total.toFixed(2) +
			"\n" +
			"Pagamento: " +
			pagamento +
			(pagamento === "Dinheiro"
				? "\nRecebido: R$ " +
					recebido.toFixed(2) +
					"\nTroco: R$ " +
					(recebido - total).toFixed(2)
				: "") +
			(pagamento === "Fiado"
				? "\n\nAtenção: será gerada uma conta a receber."
				: "");

		if (!confirm(mensagemConfirmacao)) {
			return;
		}

		registrarVenda("finalizada");
	});

	function registrarVenda(status) {
		mostrarLoading(true);
		btnFinalizar.disabled = true;
		btnOrcamento.disabled = true;
		btnFinalizar.textContent =
			status === "orcamento" ? "Salvando..." : "Finalizando...";

		var dados = {
			itens: carrinho,
			forma_pagamento: formaPagamento.value || null,
			cliente_id: clienteSelect.value ? Number(clienteSelect.value) : null,
			desconto: descontoAtual(),
			observacao: observacaoInput.value.trim() || null,
			total: totalCarrinho(),
			status: status,
		};

		if (!window.api || !window.erpBanco.vendas.finalizar) {
			mostrarMensagem("API indisponível.", "erro");
			mostrarLoading(false);
			btnFinalizar.disabled = false;
			btnOrcamento.disabled = false;
			btnFinalizar.textContent = "Finalizar Venda";
			return;
		}

		window.api
			.finalizarVenda(dados)
			.then((resultado) => {
				if (status === "orcamento") {
					mostrarMensagem(
						"Orçamento salvo! ID: " + resultado.vendaId,
						"sucesso",
					);
				} else {
					mostrarMensagem(
						"Venda finalizada com sucesso! ID: " + resultado.vendaId,
						"sucesso",
					);

					var dadosRecibo = {
						vendaId: resultado.vendaId,
						itens: carrinho,
						subtotal: subtotalCarrinho(),
						desconto: descontoAtual(),
						total: totalCarrinho(),
						forma_pagamento: dados.forma_pagamento,
						cliente_nome: clienteSelect.value
							? clienteEscolhidoNome.textContent
							: null,
						valorRecebido:
							dados.forma_pagamento === "Dinheiro"
								? Number(valorRecebidoInput.value) || 0
								: null,
						data: new Date().toISOString(),
					};
					mostrarRecibo(dadosRecibo);
				}

				carrinho = [];
				limparCarrinhoPersistente();
				renderizarCarrinho();
				formaPagamento.value = "";
				limparClienteSelecionado();
				descontoInput.value = "0";
				observacaoInput.value = "";
				skuInput.value = "";
				esconderGrupoTroco();
				btnFinalizar.disabled = false;
				btnOrcamento.disabled = false;
				btnFinalizar.textContent = "Finalizar Venda";
				mostrarLoading(false);
				skuInput.focus();
			})
			.catch((err) => {
				mostrarMensagem(
					"Erro ao " +
						(status === "orcamento" ? "salvar orçamento" : "finalizar venda") +
						": " +
						err,
					"erro",
				);
				btnFinalizar.disabled = false;
				btnOrcamento.disabled = false;
				btnFinalizar.textContent = "Finalizar Venda";
				mostrarLoading(false);
			});
	}

	function mostrarRecibo(dados) {
		var overlay = document.getElementById("receiptOverlay");
		var htmlEl = document.getElementById("receiptHTML");

		if (!overlay || !htmlEl) return;

		var data = new Date(dados.data);
		var dataStr =
			data.toLocaleDateString("pt-BR") + " " + data.toLocaleTimeString("pt-BR");

		var html = "";
		html +=
			"<div style='text-align: center; margin-bottom: 10px; font-size: 14px; font-weight: bold;'>";
		html += "ALLU ERP";
		html += "</div>";
		html +=
			"<div style='text-align: center; font-size: 10px; color: #666; margin-bottom: 10px;'>";
		html += "Cnpj: -- | Frente de Caixa";
		html += "</div>";
		html +=
			"<hr style='border: none; border-top: 1px dashed #ccc; margin: 8px 0;'>";
		html +=
			"<div style='font-size: 10px; margin-bottom: 4px;'><span style='display:inline-block;width:50%;'>Venda #" +
			dados.vendaId +
			"</span><span style='display:inline-block;width:50%; text-align:right;'>" +
			dataStr +
			"</span></div>";
		html +=
			"<div style='font-size: 10px; margin-bottom: 4px;'><span style='display:inline-block;width:50%;'>Pagamento:</span><span style='display:inline-block;width:50%; text-align:right;'>" +
			dados.forma_pagamento +
			"</span></div>";
		if (dados.cliente_nome) {
			html +=
				"<div style='font-size: 10px; margin-bottom: 4px;'><span style='display:inline-block;width:30%;'>Cliente:</span><span style='display:inline-block;width:70%; text-align:right;'>" +
				dados.cliente_nome +
				"</span></div>";
		}
		html +=
			"<hr style='border: none; border-top: 1px dashed #ccc; margin: 8px 0;'>";

		dados.itens.forEach((item) => {
			var subtotal = item.preco_unitario * item.quantidade;
			var detalhes =
				item.detalhes ||
				formatarAtributos(item.atributos, item.tamanho, item.cor);
			var nomeLinha = item.nome;
			if (detalhes && detalhes !== "---") {
				nomeLinha += " (" + detalhes + ")";
			}
			html += "<div style='font-size: 9px; margin-bottom: 2px;'>";
			html +=
				"<div style='display:inline-block;width:60%;'>" + nomeLinha + "</div>";
			html +=
				"<div style='display:inline-block;width:12%; text-align:right;'>" +
				item.quantidade +
				"x</div>";
			html +=
				"<div style='display:inline-block;width:28%; text-align:right;'>" +
				subtotal.toFixed(2) +
				"</div>";
			html += "</div>";
		});

		html +=
			"<hr style='border: none; border-top: 1px dashed #ccc; margin: 8px 0;'>";
		if (dados.desconto > 0) {
			html +=
				"<div style='font-size: 10px; text-align: right;'>Subtotal: R$ " +
				dados.subtotal.toFixed(2) +
				"</div>";
			html +=
				"<div style='font-size: 10px; text-align: right;'>Desconto: - R$ " +
				dados.desconto.toFixed(2) +
				"</div>";
		}
		html +=
			"<div style='font-size: 12px; font-weight: bold; text-align: right; margin-bottom: 4px;'>Total: R$ " +
			dados.total.toFixed(2) +
			"</div>";
		if (dados.valorRecebido !== null && dados.valorRecebido !== undefined) {
			html +=
				"<div style='font-size: 10px; text-align: right;'>Recebido: R$ " +
				dados.valorRecebido.toFixed(2) +
				"</div>";
			html +=
				"<div style='font-size: 10px; text-align: right; font-weight: bold;'>Troco: R$ " +
				(dados.valorRecebido - dados.total).toFixed(2) +
				"</div>";
		}
		html +=
			"<div style='text-align: center; font-size: 9px; color: #666; margin-top: 10px;'>Obrigado pela preferencia!</div>";

		htmlEl.innerHTML = html;
		overlay.style.display = "flex";
	}

	window.imprimirRecibo = () => {
		window.print();
	};

	window.fecharRecibo = () => {
		var overlay = document.getElementById("receiptOverlay");
		if (overlay) overlay.style.display = "none";
	};

	function mostrarMensagem(texto, tipo) {
		mensagemPDV.textContent = texto;
		mensagemPDV.className = "mensagem-pdv " + tipo;
		mensagemPDV.style.display = "block";

		setTimeout(() => {
			mensagemPDV.style.display = "none";
		}, 4000);
	}

	/* ---------- Devolução / troca ---------- */

	var devolucaoOverlay = document.getElementById("devolucaoOverlay");
	var btnAbrirDevolucao = document.getElementById("btnAbrirDevolucao");
	var btnFecharDevolucao = document.getElementById("btnFecharDevolucao");
	var btnBuscarVendaDevolucao = document.getElementById(
		"btnBuscarVendaDevolucao",
	);
	var btnConfirmarDevolucao = document.getElementById("btnConfirmarDevolucao");
	var devVendaId = document.getElementById("devVendaId");
	var devMotivo = document.getElementById("devMotivo");
	var devMensagem = document.getElementById("devMensagem");
	var devItens = document.getElementById("devItens");

	function devMsg(texto, cor) {
		devMensagem.textContent = texto;
		devMensagem.style.color = cor || "var(--cor-erro)";
	}

	function abrirDevolucao() {
		devVendaId.value = "";
		devMotivo.value = "";
		devMensagem.textContent = "";
		devItens.innerHTML = "";
		btnConfirmarDevolucao.disabled = true;
		devolucaoOverlay.style.display = "flex";
		devVendaId.focus();
	}

	function fecharDevolucao() {
		devolucaoOverlay.style.display = "none";
	}

	if (btnAbrirDevolucao)
		btnAbrirDevolucao.addEventListener("click", abrirDevolucao);
	if (btnFecharDevolucao)
		btnFecharDevolucao.addEventListener("click", fecharDevolucao);

	function buscarVendaParaDevolucao() {
		var vendaId = parseInt(devVendaId.value, 10);
		devItens.innerHTML = "";
		btnConfirmarDevolucao.disabled = true;
		if (!Number.isInteger(vendaId) || vendaId <= 0) {
			devMsg("Informe um número de venda válido.");
			return;
		}
		if (!window.erpBanco.vendas.itens) {
			devMsg("API indisponível.");
			return;
		}
		window.erpBanco.vendas
			.itens(vendaId)
			.then((itensVenda) => {
				itensVenda = itensVenda || [];
				if (itensVenda.length === 0) {
					devMsg("Venda não encontrada ou sem itens.");
					return;
				}
				devMsg("Venda #" + vendaId + " localizada.", "var(--cor-sucesso)");
				devItens.innerHTML = itensVenda
					.map((i) => {
						var disponivel = i.quantidade - (i.quantidade_devolvida || 0);
						return (
							'<div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #F1F5F9;" data-item-id="' +
							i.id +
							'" data-variacao-id="' +
							i.variacao_id +
							'" data-preco="' +
							i.preco_unitario +
							'">' +
							'<span style="flex:1; font-size:0.85rem;">' +
							esc(i.produto_nome || i.nome || "Item") +
							" (" +
							i.quantidade +
							"x " +
							Number(i.preco_unitario).toFixed(2) +
							")" +
							(i.quantidade_devolvida > 0
								? " — já devolvido: " + i.quantidade_devolvida
								: "") +
							"</span>" +
							'<input type="number" min="0" max="' +
							disponivel +
							'" step="1" value="0" class="qtd-devolver" style="width:60px;" ' +
							(disponivel <= 0 ? "disabled" : "") +
							"/>" +
							"</div>"
						);
					})
					.join("");
				btnConfirmarDevolucao.disabled = false;
			})
			.catch((err) => {
				devMsg("Erro: " + err);
			});
	}

	if (btnBuscarVendaDevolucao)
		btnBuscarVendaDevolucao.addEventListener("click", buscarVendaParaDevolucao);
	devVendaId.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			buscarVendaParaDevolucao();
		}
	});

	if (btnConfirmarDevolucao) {
		btnConfirmarDevolucao.addEventListener("click", () => {
			var vendaId = parseInt(devVendaId.value, 10);
			var itensSelecionados = [];
			devItens.querySelectorAll("[data-item-id]").forEach((linha) => {
				var qtd = parseInt(linha.querySelector(".qtd-devolver").value, 10);
				if (Number.isInteger(qtd) && qtd > 0) {
					itensSelecionados.push({
						item_venda_id: Number(linha.getAttribute("data-item-id")),
						quantidade: qtd,
					});
				}
			});
			if (itensSelecionados.length === 0) {
				devMsg("Informe ao menos uma quantidade a devolver.");
				return;
			}
			if (
				!confirm(
					"Confirmar devolução de " +
						itensSelecionados.length +
						" item(ns)? O estoque será estornado.",
				)
			)
				return;

			btnConfirmarDevolucao.disabled = true;
			window.erpBanco.vendas
				.registrarDevolucao({
					venda_id: vendaId,
					itens: itensSelecionados,
					motivo: devMotivo.value.trim() || null,
				})
				.then((r) => {
					mostrarMensagem(
						"Devolução registrada! Valor: R$ " +
							Number(r.valorTotal).toFixed(2),
						"sucesso",
					);
					fecharDevolucao();
				})
				.catch((err) => {
					devMsg("Erro: " + err);
					btnConfirmarDevolucao.disabled = false;
				});
		});
	}

	/* ---------- Fechamento de caixa ---------- */

	var caixaStatusBadge = document.getElementById("caixaStatusBadge");
	var btnCaixa = document.getElementById("btnCaixa");
	var caixaOverlay = document.getElementById("caixaOverlay");
	var btnFecharCaixaOverlay = document.getElementById("btnFecharCaixaOverlay");
	var caixaFechadoBox = document.getElementById("caixaFechadoBox");
	var caixaAbertoBox = document.getElementById("caixaAbertoBox");
	var caixaValorAbertura = document.getElementById("caixaValorAbertura");
	var btnConfirmarAbrirCaixa = document.getElementById(
		"btnConfirmarAbrirCaixa",
	);
	var caixaResumoInfo = document.getElementById("caixaResumoInfo");
	var caixaValorFechamento = document.getElementById("caixaValorFechamento");
	var caixaObservacaoFechamento = document.getElementById(
		"caixaObservacaoFechamento",
	);
	var btnConfirmarFecharCaixa = document.getElementById(
		"btnConfirmarFecharCaixa",
	);
	var caixaMensagem = document.getElementById("caixaMensagem");

	function caixaMsg(texto, cor) {
		caixaMensagem.textContent = texto || "";
		caixaMensagem.style.color = cor || "var(--cor-erro)";
	}

	function formatarMoedaCaixa(v) {
		return (
			"R$ " +
			Number(v || 0)
				.toFixed(2)
				.replace(".", ",")
		);
	}

	function atualizarBadgeCaixa() {
		if (!caixaStatusBadge || !window.erpBanco || !window.erpBanco.caixa) return;
		window.erpBanco.caixa
			.aberto()
			.then((caixa) => {
				if (caixa) {
					caixaStatusBadge.textContent = "Caixa aberto";
					caixaStatusBadge.style.background = "#DCFCE7";
					caixaStatusBadge.style.color = "var(--cor-sucesso)";
				} else {
					caixaStatusBadge.textContent = "Caixa fechado";
					caixaStatusBadge.style.background = "#FEE2E2";
					caixaStatusBadge.style.color = "var(--cor-erro)";
				}
			})
			.catch(() => {});
	}

	function abrirCaixaModal() {
		caixaMsg("");
		caixaOverlay.style.display = "flex";
		if (!window.erpBanco || !window.erpBanco.caixa) return;
		window.erpBanco.caixa
			.aberto()
			.then((caixa) => {
				if (caixa) {
					caixaFechadoBox.style.display = "none";
					caixaAbertoBox.style.display = "block";
					caixaValorFechamento.value = "";
					caixaObservacaoFechamento.value = "";
					return window.erpBanco.caixa.resumo().then((resumo) => {
						if (!resumo) return;
						caixaResumoInfo.innerHTML =
							"Aberto em: " +
							new Date(resumo.data_abertura).toLocaleString("pt-BR") +
							"<br>" +
							"Valor de abertura: " +
							formatarMoedaCaixa(resumo.valor_abertura) +
							"<br>" +
							"Vendido em dinheiro: " +
							formatarMoedaCaixa(resumo.vendido_em_dinheiro) +
							"<br>" +
							"<strong>Esperado no caixa agora: " +
							formatarMoedaCaixa(resumo.valor_esperado_agora) +
							"</strong>";
					});
				} else {
					caixaFechadoBox.style.display = "block";
					caixaAbertoBox.style.display = "none";
					caixaValorAbertura.value = "0";
				}
			})
			.catch((err) => caixaMsg("Erro ao carregar caixa: " + err));
	}

	function fecharCaixaModal() {
		caixaOverlay.style.display = "none";
	}

	if (btnCaixa) btnCaixa.addEventListener("click", abrirCaixaModal);
	if (btnFecharCaixaOverlay)
		btnFecharCaixaOverlay.addEventListener("click", fecharCaixaModal);
	caixaOverlay.addEventListener("click", (e) => {
		if (e.target === caixaOverlay) fecharCaixaModal();
	});

	if (btnConfirmarAbrirCaixa) {
		btnConfirmarAbrirCaixa.addEventListener("click", () => {
			var valor = Number(caixaValorAbertura.value);
			if (!Number.isFinite(valor) || valor < 0) {
				caixaMsg("Valor de abertura inválido.");
				return;
			}
			btnConfirmarAbrirCaixa.disabled = true;
			window.erpBanco.caixa
				.abrir(valor)
				.then(() => {
					mostrarMensagem("Caixa aberto!", "sucesso");
					atualizarBadgeCaixa();
					fecharCaixaModal();
				})
				.catch((err) => caixaMsg("Erro: " + err))
				.finally(() => {
					btnConfirmarAbrirCaixa.disabled = false;
				});
		});
	}

	if (btnConfirmarFecharCaixa) {
		btnConfirmarFecharCaixa.addEventListener("click", () => {
			var valor = Number(caixaValorFechamento.value);
			if (!Number.isFinite(valor) || valor < 0) {
				caixaMsg("Informe o valor contado no caixa.");
				return;
			}
			if (
				!confirm(
					"Confirmar fechamento do caixa com " +
						formatarMoedaCaixa(valor) +
						"?",
				)
			)
				return;
			btnConfirmarFecharCaixa.disabled = true;
			window.erpBanco.caixa
				.fechar(valor, caixaObservacaoFechamento.value.trim())
				.then((r) => {
					var diffTexto =
						r.diferenca === 0
							? "Caixa fechado sem diferença."
							: "Caixa fechado. Diferença: " +
								formatarMoedaCaixa(r.diferenca) +
								(r.diferenca < 0 ? " (faltou)" : " (sobrou)");
					mostrarMensagem(diffTexto, r.diferenca === 0 ? "sucesso" : "erro");
					atualizarBadgeCaixa();
					fecharCaixaModal();
				})
				.catch((err) => caixaMsg("Erro: " + err))
				.finally(() => {
					btnConfirmarFecharCaixa.disabled = false;
				});
		});
	}

	atualizarBadgeCaixa();
})();
