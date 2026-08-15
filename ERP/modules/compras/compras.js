(() => {
	var fornecedorSelect = document.getElementById("fornecedorSelect");
	var skuInput = document.getElementById("skuInput");
	var qtdInput = document.getElementById("qtdInput");
	var custoInput = document.getElementById("custoInput");
	var obsInput = document.getElementById("obsInput");
	var produtoPreview = document.getElementById("produtoPreview");
	var cotacaoPreview = document.getElementById("cotacaoPreview");
	var btnAdicionar = document.getElementById("btnAdicionar");
	var btnCriar = document.getElementById("btnCriar");
	var btnLimpar = document.getElementById("btnLimpar");
	var listaItens = document.getElementById("listaItens");
	var totalPedido = document.getElementById("totalPedido");
	var listaPedidos = document.getElementById("listaPedidos");
	var mensagem = document.getElementById("mensagem");

	var itens = [];
	var produtoAtual = null;

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

	/* ---------- Fornecedores ---------- */

	function carregarFornecedores() {
		if (!window.api || !window.erpBanco.fornecedores.listar) return;
		window.erpBanco.fornecedores
			.listar()
			.then((rows) => {
				(rows || []).forEach((f) => {
					var opt = document.createElement("option");
					opt.value = f.id;
					opt.textContent = f.nome;
					fornecedorSelect.appendChild(opt);
				});
			})
			.catch(() => {});
	}

	/* ---------- Itens do pedido ---------- */

	// Mostra todos os fornecedores cadastrados para o SKU, do mais barato ao
	// mais caro, para ajudar a escolher com quem comprar (cotação comparativa).
	function mostrarCotacao(variacaoId) {
		cotacaoPreview.textContent = "";
		if (!window.erpBanco.fornecedores.cotacao) return;
		window.erpBanco.fornecedores
			.cotacao(variacaoId)
			.then((linhas) => {
				if (!linhas || linhas.length <= 1) return;
				cotacaoPreview.innerHTML =
					"<strong>Cotação:</strong> " +
					linhas
						.map(
							(l, i) =>
								(i === 0 ? "🏆 " : "") +
								l.fornecedor_nome +
								": " +
								formatarMoeda(l.preco_custo) +
								(l.prazo_entrega_dias != null
									? " (" + l.prazo_entrega_dias + "d)"
									: ""),
						)
						.join(" | ");
			})
			.catch(() => {});
	}

	function buscarProduto() {
		var sku = skuInput.value.trim().toUpperCase();
		produtoAtual = null;
		produtoPreview.textContent = "";
		cotacaoPreview.textContent = "";
		if (!sku) return;
		window.erpBanco.produtos
			.buscarSKU(sku)
			.then((p) => {
				if (!p) {
					mostrarMensagem("SKU não encontrado: " + sku, "erro");
					return;
				}
				produtoAtual = p;
				if (p.preco_custo) custoInput.value = Number(p.preco_custo).toFixed(2);

				var fornecedorId = fornecedorSelect.value ? Number(fornecedorSelect.value) : null;
				var previewBase =
					p.nome + " (" + detalhesDe(p) + ") — estoque atual: " + p.quantidade_estoque;

				if (fornecedorId && window.erpBanco.fornecedores.custoProduto) {
					window.erpBanco.fornecedores
						.custoProduto(fornecedorId, p.id)
						.then((precoFornecedor) => {
							if (precoFornecedor) {
								custoInput.value = Number(precoFornecedor.preco_custo).toFixed(2);
								produtoPreview.textContent =
									previewBase + " — custo deste fornecedor: R$ " +
									Number(precoFornecedor.preco_custo).toFixed(2) +
									(precoFornecedor.prazo_entrega_dias != null
										? " (prazo " + precoFornecedor.prazo_entrega_dias + "d)"
										: "");
							} else {
								produtoPreview.textContent = previewBase;
							}
						})
						.catch(() => {
							produtoPreview.textContent = previewBase;
						});
				} else {
					produtoPreview.textContent = previewBase;
				}
				mostrarCotacao(p.id);
				qtdInput.focus();
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

	btnAdicionar.addEventListener("click", () => {
		if (!produtoAtual) {
			mostrarMensagem("Busque um SKU válido antes de adicionar.", "erro");
			return;
		}
		var qtd = parseInt(qtdInput.value, 10);
		var custo = Number(custoInput.value);
		if (!Number.isInteger(qtd) || qtd <= 0) {
			mostrarMensagem("Quantidade inválida.", "erro");
			return;
		}
		if (!Number.isFinite(custo) || custo < 0) {
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
			existente.custo_unitario = custo;
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
		custoInput.value = "0";
		skuInput.focus();
		renderizarItens();
	});

	function renderizarItens() {
		listaItens.innerHTML = "";
		if (itens.length === 0) {
			listaItens.innerHTML =
				'<div class="empty-state">Nenhum item no pedido.</div>';
			btnCriar.disabled = true;
			totalPedido.value = "R$ 0,00";
			return;
		}
		btnCriar.disabled = false;

		var total = 0;
		itens.forEach((item, index) => {
			total += item.quantidade * item.custo_unitario;
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
				" | " +
				item.quantidade +
				" x " +
				formatarMoeda(item.custo_unitario) +
				" = " +
				formatarMoeda(item.quantidade * item.custo_unitario);
			div.querySelector("button").addEventListener("click", () => {
				itens.splice(index, 1);
				renderizarItens();
			});
			listaItens.appendChild(div);
		});
		totalPedido.value = formatarMoeda(total);
	}

	btnLimpar.addEventListener("click", () => {
		itens = [];
		obsInput.value = "";
		fornecedorSelect.value = "";
		renderizarItens();
		skuInput.focus();
	});

	btnCriar.addEventListener("click", () => {
		if (itens.length === 0) return;
		if (!confirm("Criar pedido de compra com " + itens.length + " item(ns)?"))
			return;

		btnCriar.disabled = true;
		btnCriar.textContent = "Criando...";

		window.erpBanco.compras
			.criarPedido({
				fornecedor_id: fornecedorSelect.value
					? Number(fornecedorSelect.value)
					: null,
				observacao: obsInput.value.trim() || null,
				itens: itens.map((i) => ({
					variacao_id: i.variacao_id,
					quantidade: i.quantidade,
					custo_unitario: i.custo_unitario,
				})),
			})
			.then((r) => {
				mostrarMensagem(
					"Pedido #" + r.pedidoId + " criado com sucesso!",
					"sucesso",
				);
				itens = [];
				obsInput.value = "";
				renderizarItens();
				carregarPedidos();
				btnCriar.textContent = "Criar Pedido";
			})
			.catch((err) => {
				mostrarMensagem("Erro: " + err, "erro");
				btnCriar.disabled = false;
				btnCriar.textContent = "Criar Pedido";
			});
	});

	/* ---------- Lista de pedidos ---------- */

	function imprimirPedido(p) {
		window.erpBanco.compras
			.itensPedido(p.id)
			.then((itens) => {
				var data = p.data_pedido
					? new Date(p.data_pedido).toLocaleDateString("pt-BR")
					: "---";
				var total = 0;
				var linhas = (itens || [])
					.map((i) => {
						var subtotal = i.quantidade * i.custo_unitario;
						total += subtotal;
						return (
							"<tr>" +
							"<td style='padding:6px; border-bottom:1px solid #E2E8F0;'>" + (i.produto_nome || "") + " (" + detalhesDe(i) + ")</td>" +
							"<td style='padding:6px; border-bottom:1px solid #E2E8F0;'>" + (i.sku || "") + "</td>" +
							"<td style='padding:6px; border-bottom:1px solid #E2E8F0; text-align:right;'>" + i.quantidade + "</td>" +
							"<td style='padding:6px; border-bottom:1px solid #E2E8F0; text-align:right;'>" + formatarMoeda(i.custo_unitario) + "</td>" +
							"<td style='padding:6px; border-bottom:1px solid #E2E8F0; text-align:right;'>" + formatarMoeda(subtotal) + "</td>" +
							"</tr>"
						);
					})
					.join("");
				var html =
					"<div style='font-family: system-ui, sans-serif; color:#1E293B;'>" +
					"<h2 style='margin-bottom:4px;'>Pedido de Compra #" + p.id + "</h2>" +
					"<p style='color:#64748B; margin-bottom:16px;'>Data: " + data + " | Status: " + p.status + "</p>" +
					"<p style='margin-bottom:16px;'><strong>Fornecedor:</strong> " + (p.fornecedor_nome || "não informado") + "</p>" +
					(p.observacao ? "<p style='margin-bottom:16px;'><strong>Observação:</strong> " + p.observacao + "</p>" : "") +
					"<table style='width:100%; border-collapse:collapse; font-size:0.85rem;'>" +
					"<thead><tr style='background:#F8FAFC;'><th style='padding:6px; text-align:left;'>Produto</th><th style='padding:6px; text-align:left;'>SKU</th><th style='padding:6px; text-align:right;'>Qtd</th><th style='padding:6px; text-align:right;'>Custo Unit.</th><th style='padding:6px; text-align:right;'>Subtotal</th></tr></thead>" +
					"<tbody>" + linhas + "</tbody>" +
					"</table>" +
					"<p style='text-align:right; font-size:1.1rem; font-weight:700; margin-top:12px;'>Total: " + formatarMoeda(total) + "</p>" +
					"</div>";
				document.getElementById("printContent").innerHTML = html;
				document.getElementById("printOverlay").style.display = "flex";
			})
			.catch((err) => {
				mostrarMensagem("Erro ao preparar impressão: " + err, "erro");
			});
	}

	function badgeStatus(status) {
		if (status === "aberto")
			return '<span class="badge badge-amarela">Aberto</span>';
		if (status === "parcial")
			return '<span class="badge badge-amarela">Recebido parcial</span>';
		if (status === "recebido")
			return '<span class="badge badge-verde">Recebido</span>';
		return '<span class="badge badge-cinza">Cancelado</span>';
	}

	function carregarPedidos() {
		if (!window.api || !window.erpBanco.compras.pedidos) {
			listaPedidos.innerHTML =
				'<div class="empty-state">API indisponível.</div>';
			return;
		}
		if (window.erpSkeletonCards) listaPedidos.innerHTML = window.erpSkeletonCards(4);
		window.erpBanco.compras
			.pedidos()
			.then((rows) => {
				listaPedidos.innerHTML = "";
				if (!rows || rows.length === 0) {
					listaPedidos.innerHTML =
						'<div class="empty-state">Nenhum pedido de compra.</div>';
					return;
				}
				rows.forEach((p) => {
					var div = document.createElement("div");
					div.className = "item-lista";
					var data = p.data_pedido
						? new Date(p.data_pedido).toLocaleDateString("pt-BR")
						: "---";
					div.innerHTML =
						'<div class="info"><div class="titulo"></div><div class="detalhe"></div></div>' +
						'<div class="acoes">' +
						badgeStatus(p.status) +
						"</div>";

					div.querySelector(".titulo").textContent =
						"Pedido #" + p.id + " — " + formatarMoeda(p.total);
					div.querySelector(".detalhe").textContent =
						data +
						" | Fornecedor: " +
						(p.fornecedor_nome || "não informado") +
						(p.observacao ? " | " + p.observacao : "");

					var acoes = div.querySelector(".acoes");

					var btnDetalhes = document.createElement("button");
					btnDetalhes.type = "button";
					btnDetalhes.className = "btn btn-small";
					btnDetalhes.textContent = "Itens";
					btnDetalhes.addEventListener("click", () => {
						toggleItens(div, p.id, p.status);
					});
					acoes.appendChild(btnDetalhes);

					var btnImprimir = document.createElement("button");
					btnImprimir.type = "button";
					btnImprimir.className = "btn btn-small";
					btnImprimir.textContent = "Imprimir";
					btnImprimir.addEventListener("click", () => {
						imprimirPedido(p);
					});
					acoes.appendChild(btnImprimir);

					if (p.status === "aberto" || p.status === "parcial") {
						var btnReceber = document.createElement("button");
						btnReceber.type = "button";
						btnReceber.className = "btn btn-small";
						btnReceber.style.background = "#DCFCE7";
						btnReceber.style.color = "var(--cor-sucesso)";
						btnReceber.style.borderColor = "#86EFAC";
						btnReceber.textContent = "Receber";
						btnReceber.addEventListener("click", () => {
							toggleItens(div, p.id, p.status, true);
						});
						acoes.appendChild(btnReceber);

						var btnCancelar = document.createElement("button");
						btnCancelar.type = "button";
						btnCancelar.className = "btn btn-small btn-danger";
						btnCancelar.textContent =
							p.status === "parcial" ? "Cancelar restante" : "Cancelar";
						btnCancelar.addEventListener("click", () => {
							if (!confirm("Cancelar o pedido #" + p.id + "?")) return;
							window.erpBanco.compras
								.cancelarPedido(p.id)
								.then(() => {
									mostrarMensagem("Pedido cancelado.", "sucesso");
									carregarPedidos();
								})
								.catch((err) => {
									mostrarMensagem("Erro: " + err, "erro");
								});
						});
						acoes.appendChild(btnCancelar);
					}

					listaPedidos.appendChild(div);
				});
			})
			.catch((err) => {
				listaPedidos.innerHTML =
					'<div class="empty-state">Erro: ' + err + "</div>";
			});
	}

	function toggleItens(container, pedidoId, status, modoReceber) {
		var existente = container.querySelector(".itens-pedido");
		if (existente) {
			existente.parentNode.removeChild(existente);
			if (!modoReceber) return;
		}
		window.erpBanco.compras
			.itensPedido(pedidoId)
			.then((itensPedido) => {
				var box = document.createElement("div");
				box.className = "itens-pedido";
				box.style.cssText =
					"width:100%; margin-top:8px; padding:10px 12px; background:#F8FAFC; border-radius:8px; font-size:0.8rem; color:#475569;";
				itensPedido = itensPedido || [];
				if (itensPedido.length === 0) {
					box.textContent = "Sem itens.";
					container.querySelector(".info").appendChild(box);
					return;
				}

				if (!modoReceber) {
					box.innerHTML = itensPedido
						.map(
							(i) =>
								"<div>" +
								i.quantidade +
								"x " +
								i.produto_nome +
								" (" +
								detalhesDe(i) +
								") — " +
								formatarMoeda(i.custo_unitario) +
								" un." +
								(i.quantidade_recebida > 0
									? " — recebido: " + i.quantidade_recebida + "/" + i.quantidade
									: "") +
								"</div>",
						)
						.join("");
					container.querySelector(".info").appendChild(box);
					return;
				}

				// Modo recebimento: um input de quantidade por item, pré-preenchido
				// com o que ainda falta receber.
				var linhas = itensPedido
					.map((i) => {
						var falta = i.quantidade - i.quantidade_recebida;
						return (
							'<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;" data-item-id="' +
							i.id +
							'" data-falta="' +
							falta +
							'">' +
							'<span style="flex:1;">' +
							i.produto_nome +
							" (" +
							detalhesDe(i) +
							") — falta " +
							falta +
							" de " +
							i.quantidade +
							"</span>" +
							'<input type="number" min="0" max="' +
							falta +
							'" step="1" value="' +
							falta +
							'" class="qtd-receber" style="width:70px;" ' +
							(falta <= 0 ? "disabled" : "") +
							"/>" +
							"</div>"
						);
					})
					.join("");

				box.innerHTML =
					linhas +
					'<div class="form-actions" style="margin-top:8px;">' +
					'<button type="button" class="btn btn-small btn-success btn-confirmar-recebimento">Confirmar recebimento</button>' +
					"</div>";

				box
					.querySelector(".btn-confirmar-recebimento")
					.addEventListener("click", () => {
						var itensRecebidos = [];
						box.querySelectorAll("[data-item-id]").forEach((linha) => {
							var qtd = parseInt(
								linha.querySelector(".qtd-receber").value,
								10,
							);
							if (Number.isInteger(qtd) && qtd > 0) {
								itensRecebidos.push({
									item_id: Number(linha.getAttribute("data-item-id")),
									quantidade: qtd,
								});
							}
						});
						if (itensRecebidos.length === 0) {
							mostrarMensagem("Informe ao menos uma quantidade a receber.", "erro");
							return;
						}
						window.erpBanco.compras
							.receberPedido(pedidoId, itensRecebidos)
							.then((r) => {
								mostrarMensagem(
									r.status === "parcial"
										? "Recebimento parcial registrado."
										: "Pedido #" + pedidoId + " recebido totalmente!",
									"sucesso",
								);
								carregarPedidos();
							})
							.catch((err) => {
								mostrarMensagem("Erro: " + err, "erro");
							});
					});

				container.querySelector(".info").appendChild(box);
			})
			.catch((err) => {
				mostrarMensagem("Erro: " + err, "erro");
			});
	}

	carregarFornecedores();
	carregarPedidos();
})();
