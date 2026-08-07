(() => {
	"use strict";
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
	}

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

	/* ==================== Inicializar ==================== */

	atualizarCodigoNovo();
})();
