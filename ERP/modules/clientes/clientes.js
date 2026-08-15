(() => {
	"use strict";

	// Quando esta tela roda dentro de um iframe de aba (?embedded=1), o link
	// "Lista de Clientes" precisa preservar esse parâmetro — senão a página
	// destino não sabe que está embutida, navbar.js monta uma sidebar/navbar
	// completa dentro do iframe (duplicada sobre a sidebar real do Dashboard).
	if (new URLSearchParams(window.location.search).get("embedded") === "1") {
		var linkListaClientes = document.getElementById("linkListaClientes");
		if (linkListaClientes) {
			linkListaClientes.href = "./lista-clientes.html?embedded=1";
		}
	}

	var form = document.getElementById("formCliente");
	var nomeInput = document.getElementById("nome");
	var codigoInput = document.getElementById("codigoCliente");
	var cpfCnpjInput = document.getElementById("cpf_cnpj");
	var enderecoInput = document.getElementById("endereco");
	var telefoneInput = document.getElementById("telefone");
	var emailInput = document.getElementById("email");
	var clienteEditandoId = document.getElementById("clienteEditandoId");
	var btnSalvar = document.getElementById("btnSalvar");
	var btnLimpar = document.getElementById("btnLimpar");
	var btnCancelarEdicao = document.getElementById("btnCancelarEdicao");
	var mensagem = document.getElementById("mensagem");
	var movimentacoesSection = document.getElementById("movimentacoesSection");
	var movimentacoesContainer = document.getElementById(
		"movimentacoesContainer",
	);
	var btnVerMovimentacoes = document.getElementById("btnVerMovimentacoes");
	var modal = document.getElementById("movimentacoesModal");
	var modalNome = document.getElementById("modalClienteNome");
	var modalMovimentacoes = document.getElementById("modalMovimentacoes");
	var modalClose = document.getElementById("modalClose");

	var precosEspeciaisSection = document.getElementById("precosEspeciaisSection");
	var pePreSku = document.getElementById("pePreSku");
	var pePreco = document.getElementById("pePreco");
	var pePreview = document.getElementById("pePreview");
	var btnAddPrecoEspecial = document.getElementById("btnAddPrecoEspecial");
	var listaPrecosEspeciais = document.getElementById("listaPrecosEspeciais");
	var produtoPrecoEspecialAtual = null;

	var salvando = false;

	function esc(t) {
		return String(t == null ? "" : t)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	/* ==================== M�scaras ==================== */

	function mascaraTelefone(v) {
		v = v.replace(/\D/g, "");
		if (v.length > 11) v = v.slice(0, 11);
		if (v.length > 7)
			return "(" + v.slice(0, 2) + ") " + v.slice(2, 7) + "-" + v.slice(7);
		if (v.length > 2) return "(" + v.slice(0, 2) + ") " + v.slice(2);
		return v;
	}

	function mascaraCPF_CNPJ(v) {
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
		} else {
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
		}
		return v;
	}

	telefoneInput.addEventListener("input", () => {
		var cursor = telefoneInput.selectionStart;
		var antes = telefoneInput.value;
		telefoneInput.value = mascaraTelefone(telefoneInput.value);
		var diff = telefoneInput.value.length - antes.length;
		telefoneInput.setSelectionRange(cursor + diff, cursor + diff);
	});

	cpfCnpjInput.addEventListener("input", () => {
		var cursor = cpfCnpjInput.selectionStart;
		var antes = cpfCnpjInput.value;
		cpfCnpjInput.value = mascaraCPF_CNPJ(cpfCnpjInput.value);
		var diff = cpfCnpjInput.value.length - antes.length;
		cpfCnpjInput.setSelectionRange(cursor + diff, cursor + diff);
	});

	/* ==================== C�digo auto ==================== */

	function atualizarCodigoNovo() {
		if (clienteEditandoId.value) return;
		if (!window.api || !window.erpBanco.clientes.proximoCodigo) {
			codigoInput.value = "";
			codigoInput.placeholder = "C0001";
			return;
		}
		window.erpBanco.clientes
			.proximoCodigo()
			.then((c) => {
				codigoInput.value = c;
			})
			.catch(() => {
				codigoInput.placeholder = "C0001";
			});
	}

	/* ==================== Limpar / Cancelar ==================== */

	function limparEdicao() {
		clienteEditandoId.value = "";
		btnSalvar.textContent = "Salvar Cliente";
		btnCancelarEdicao.style.display = "none";
		movimentacoesSection.style.display = "none";
		movimentacoesContainer.innerHTML = "";
		precosEspeciaisSection.style.display = "none";
		limparFormPrecoEspecial();
	}

	/* ==================== Preços especiais ==================== */

	function limparFormPrecoEspecial() {
		produtoPrecoEspecialAtual = null;
		pePreSku.value = "";
		pePreco.value = "0";
		pePreview.textContent = "";
	}

	function detalhesProdutoPreco(p) {
		if (window.formatarAtributos)
			return window.formatarAtributos(p.atributos, p.tamanho, p.cor);
		return [p.tamanho, p.cor].filter(Boolean).join(" / ") || "---";
	}

	pePreSku.addEventListener("keydown", (e) => {
		if (e.key !== "Enter") return;
		e.preventDefault();
		var sku = pePreSku.value.trim().toUpperCase();
		produtoPrecoEspecialAtual = null;
		pePreview.textContent = "";
		if (!sku || !window.erpBanco.produtos.buscarSKU) return;
		window.erpBanco.produtos
			.buscarSKU(sku)
			.then((p) => {
				if (!p) {
					mostrarMensagem("SKU não encontrado: " + sku, "error");
					return;
				}
				produtoPrecoEspecialAtual = p;
				pePreview.textContent =
					p.nome + " (" + detalhesProdutoPreco(p) + ") — preço padrão: R$ " +
					Number(p.preco).toFixed(2);
				pePreco.focus();
			})
			.catch((err) => {
				mostrarMensagem("Erro ao buscar SKU: " + err, "error");
			});
	});

	function carregarPrecosEspeciais(clienteId) {
		if (!window.erpBanco.clientes.precos) return;
		if (window.erpSkeletonCards) listaPrecosEspeciais.innerHTML = window.erpSkeletonCards(2);
		window.erpBanco.clientes
			.precos(clienteId)
			.then((rows) => {
				listaPrecosEspeciais.innerHTML = "";
				if (!rows || rows.length === 0) {
					listaPrecosEspeciais.innerHTML =
						'<div class="empty-state">Nenhum preço especial cadastrado.</div>';
					return;
				}
				rows.forEach((r) => {
					var div = document.createElement("div");
					div.className = "item-lista";
					div.innerHTML =
						'<div class="info"><div class="titulo"></div><div class="detalhe"></div></div>' +
						'<div class="acoes"><button type="button" class="btn btn-small btn-danger">Remover</button></div>';
					div.querySelector(".titulo").textContent =
						r.produto_nome + " (" + detalhesProdutoPreco(r) + ")";
					div.querySelector(".detalhe").textContent =
						"SKU: " + r.sku + " | Preço especial: R$ " +
						Number(r.preco).toFixed(2) +
						" | Padrão: R$ " + Number(r.preco_padrao).toFixed(2);
					div.querySelector("button").addEventListener("click", () => {
						if (!confirm("Remover o preço especial para " + r.produto_nome + "?"))
							return;
						window.erpBanco.clientes
							.removerPreco(r.id)
							.then(() => {
								mostrarMensagem("Preço especial removido.", "success");
								carregarPrecosEspeciais(clienteId);
							})
							.catch((err) => mostrarMensagem("Erro: " + err, "error"));
					});
					listaPrecosEspeciais.appendChild(div);
				});
			})
			.catch((err) => {
				listaPrecosEspeciais.innerHTML =
					'<div class="empty-state">Erro: ' + err + "</div>";
			});
	}

	btnAddPrecoEspecial.addEventListener("click", () => {
		var clienteId = clienteEditandoId.value ? Number(clienteEditandoId.value) : null;
		if (!clienteId) {
			mostrarMensagem("Salve o cliente antes de definir preços especiais.", "error");
			return;
		}
		if (!produtoPrecoEspecialAtual) {
			mostrarMensagem("Busque um SKU válido antes de adicionar.", "error");
			return;
		}
		var preco = Number(pePreco.value);
		if (!Number.isFinite(preco) || preco < 0) {
			mostrarMensagem("Preço inválido.", "error");
			return;
		}
		window.erpBanco.clientes
			.salvarPreco({
				cliente_id: clienteId,
				variacao_id: produtoPrecoEspecialAtual.id,
				preco: preco,
			})
			.then(() => {
				mostrarMensagem("Preço especial salvo!", "success");
				limparFormPrecoEspecial();
				carregarPrecosEspeciais(clienteId);
			})
			.catch((err) => mostrarMensagem("Erro: " + err, "error"));
	});

	/* ==================== Mensagens ==================== */

	function mostrarMensagem(texto, tipo) {
		mensagem.textContent = texto;
		mensagem.className =
			"mensagem " + (tipo === "success" ? "success" : "error");
		mensagem.style.display = "block";
		setTimeout(() => {
			mensagem.style.display = "none";
		}, 3500);
	}

	/* ==================== Salvar ==================== */

	form.addEventListener("submit", (e) => {
		e.preventDefault();
		mensagem.className = "mensagem";
		mensagem.style.display = "none";
		if (salvando) return;

		var nome = nomeInput.value.trim();
		if (!nome) {
			mostrarMensagem("Nome � obrigat�rio.", "error");
			nomeInput.focus();
			return;
		}

		var dados = {
			nome: nome,
			cpf_cnpj: cpfCnpjInput.value.replace(/\D/g, "").slice(0, 14) || null,
			endereco: enderecoInput.value.trim() || null,
			telefone: telefoneInput.value.trim() || null,
			email: emailInput.value.trim() || null,
		};

		salvando = true;
		btnSalvar.disabled = true;
		var editando = clienteEditandoId.value;

		function finalizar() {
			salvando = false;
			btnSalvar.disabled = false;
			nomeInput.focus();
		}

		if (editando) {
			if (!window.api || !window.erpBanco.clientes.atualizar) {
				mostrarMensagem("API indispon�vel.", "error");
				finalizar();
				return;
			}
			window.erpBanco.clientes
				.atualizar(editando, dados)
				.then(() => {
					mostrarMensagem("Cliente atualizado!", "success");
					form.reset();
					limparEdicao();
					atualizarCodigoNovo();
					finalizar();
				})
				.catch((err) => {
					mostrarMensagem("Erro: " + err, "error");
					finalizar();
				});
		} else {
			if (!window.api || !window.erpBanco.clientes.salvar) {
				mostrarMensagem("API indispon�vel.", "error");
				finalizar();
				return;
			}
			window.erpBanco.clientes
				.salvar(dados)
				.then(() => {
					mostrarMensagem("Cliente salvo!", "success");
					form.reset();
					limparEdicao();
					atualizarCodigoNovo();
					finalizar();
				})
				.catch((err) => {
					mostrarMensagem("Erro: " + err, "error");
					finalizar();
				});
		}
	});

	btnLimpar.addEventListener("click", () => {
		form.reset();
		limparEdicao();
		atualizarCodigoNovo();
		mensagem.className = "mensagem";
		mensagem.style.display = "none";
	});

	btnCancelarEdicao.addEventListener("click", () => {
		form.reset();
		limparEdicao();
		atualizarCodigoNovo();
		mensagem.className = "mensagem";
		mensagem.style.display = "none";
	});

	/* ==================== Movimenta��es ==================== */

	btnVerMovimentacoes.addEventListener("click", (e) => {
		e.stopPropagation();
		if (!clienteEditandoId.value) return;
		if (!window.api || !window.erpBanco.clientes.movimentacoes) return;
		modalNome.textContent = nomeInput.value || "cliente";
		modalMovimentacoes.innerHTML = '<p class="subtitle">Carregando...</p>';
		modal.style.display = "flex";
		window.erpBanco.clientes
			.movimentacoes(clienteEditandoId.value)
			.then((dados) => {
				var lista = Array.isArray(dados) ? dados : [];
				if (lista.length === 0) {
					modalMovimentacoes.innerHTML =
						'<p class="subtitle">Nenhuma movimenta��o registrada.</p>';
					return;
				}
				var html =
					'<table class="modal-table"><thead><tr><th>Data</th><th>Venda n�</th><th>Total</th><th>Pagamento</th><th>Itens</th></tr></thead><tbody>';
				lista.forEach((reg) => {
					var v = reg.venda;
					var itensHtml = "";
					if (reg.itens && reg.itens.length) {
						itensHtml = reg.itens
							.map(
								(it) =>
									esc(it.produto_nome) +
									" (" +
									(it.sku || "") +
									") � " +
									it.quantidade +
									"x R$ " +
									Number(it.preco_unitario || 0).toFixed(2),
							)
							.join("<br>");
					}
					html +=
						"<tr><td>" +
						esc((v.data_venda || "").slice(0, 10)) +
						"</td>" +
						"<td>" +
						v.id +
						"</td>" +
						"<td>R$ " +
						Number(v.total || 0).toFixed(2) +
						"</td>" +
						"<td>" +
						esc(v.forma_pagamento) +
						"</td>" +
						"<td>" +
						itensHtml +
						"</td></tr>";
				});
				html += "</tbody></table>";
				modalMovimentacoes.innerHTML = html;
			})
			.catch(() => {
				modalMovimentacoes.innerHTML =
					'<p class="subtitle">Erro ao carregar movimenta��es.</p>';
			});
	});

	modalClose.addEventListener("click", () => {
		modal.style.display = "none";
	});
	modal.addEventListener("click", (e) => {
		if (e.target === modal) modal.style.display = "none";
	});

	/* ==================== Carregar para edição ==================== */

	function preencherFormCliente(c) {
		clienteEditandoId.value = c.id;
		codigoInput.value = c.codigo || "";
		nomeInput.value = c.nome || "";
		cpfCnpjInput.value = c.cpf_cnpj || "";
		enderecoInput.value = c.endereco || "";
		telefoneInput.value = c.telefone || "";
		emailInput.value = c.email || "";
		btnSalvar.textContent = "Salvar Alterações";
		btnCancelarEdicao.style.display = "inline-block";
		movimentacoesSection.style.display = "block";
		precosEspeciaisSection.style.display = "block";
		limparFormPrecoEspecial();
		carregarPrecosEspeciais(c.id);
	}

	function carregarClienteDaURL() {
		var params = new URLSearchParams(window.location.search);
		var id = parseInt(params.get("id"), 10);
		if (!Number.isInteger(id) || id <= 0) return;
		if (!window.erpBanco.clientes.listar) return;
		window.erpBanco.clientes
			.listar()
			.then((rows) => {
				var c = (rows || []).find((r) => r.id === id);
				if (!c) {
					mostrarMensagem("Cliente não encontrado.", "error");
					return;
				}
				preencherFormCliente(c);
			})
			.catch((err) => {
				mostrarMensagem("Erro ao carregar cliente: " + err, "error");
			});
	}

	/* ==================== Inicializar ==================== */

	atualizarCodigoNovo();
	carregarClienteDaURL();
})();
