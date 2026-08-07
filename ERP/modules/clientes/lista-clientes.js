(() => {
	"use strict";
	var buscaCliente = document.getElementById("buscaCliente");
	var totalClientes = document.getElementById("totalClientes");
	var tbody = document.getElementById("corpoClientes");
	var mensagem = document.getElementById("mensagem");
	var modal = document.getElementById("movimentacoesModal");
	var modalNome = document.getElementById("modalClienteNome");
	var modalMovimentacoes = document.getElementById("modalMovimentacoes");
	var modalClose = document.getElementById("modalClose");

	var clientes = [];
	var clienteSelecionado = null;

	function esc(t) {
		return String(t == null ? "" : t)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	function mostrarMensagem(texto, tipo) {
		mensagem.textContent = texto;
		mensagem.className =
			"mensagem " + (tipo === "success" ? "success" : "error");
		mensagem.style.display = "block";
		setTimeout(() => {
			mensagem.style.display = "none";
		}, 3500);
	}

	function carregarClientes() {
		if (!window.api || !window.erpBanco.clientes.listar) {
			tbody.innerHTML =
				'<tr><td colspan="6"><div class="empty-state">API indisponível.</div></td></tr>';
			return;
		}
		window.erpBanco.clientes
			.listar()
			.then((lista) => {
				clientes = Array.isArray(lista) ? lista : [];
				renderizarTabela();
			})
			.catch(() => {
				tbody.innerHTML =
					'<tr><td colspan="6"><div class="empty-state">Erro ao carregar.</div></td></tr>';
			});
	}

	function renderizarTabela() {
		tbody.innerHTML = "";
		var q = (buscaCliente.value || "").trim().toLowerCase();
		var filtrados = clientes.filter((c) => {
			if (!q) return true;
			var txt = [c.nome, c.cpf_cnpj, c.telefone, c.email || ""]
				.join(" ")
				.toLowerCase();
			return txt.indexOf(q) !== -1;
		});

		totalClientes.textContent =
			filtrados.length + " cliente" + (filtrados.length !== 1 ? "s" : "");
		if (filtrados.length === 0) {
			tbody.innerHTML =
				'<tr><td colspan="6"><div class="empty-state">Nenhum cliente encontrado.</div></td></tr>';
			return;
		}

		filtrados.forEach((c) => {
			var tr = document.createElement("tr");

			var tdCod = document.createElement("td");
			tdCod.innerHTML =
				'<span class="cli-codigo">' +
				esc(c.codigo || "C" + String(c.id).padStart(4, "0")) +
				"</span>";
			tr.appendChild(tdCod);

			var tdNome = document.createElement("td");
			tdNome.innerHTML = '<span class="cli-nome">' + esc(c.nome) + "</span>";
			tr.appendChild(tdNome);

			var tdDoc = document.createElement("td");
			tdDoc.textContent = c.cpf_cnpj ? esc(c.cpf_cnpj) : "&mdash;";
			tr.appendChild(tdDoc);

			var tdTel = document.createElement("td");
			tdTel.textContent = c.telefone ? esc(c.telefone) : "&mdash;";
			tr.appendChild(tdTel);

			var tdEmail = document.createElement("td");
			tdEmail.textContent = c.email ? esc(c.email) : "&mdash;";
			tr.appendChild(tdEmail);

			var tdAcoes = document.createElement("td");
			var acoesDiv = document.createElement("div");
			acoesDiv.className = "acoes";

			var btnEditar = document.createElement("button");
			btnEditar.type = "button";
			btnEditar.className = "btn btn-small btn-editar";
			btnEditar.textContent = "Editar";
			btnEditar.addEventListener("click", () => {
				window.location.href = "./clientes.html?id=" + c.id;
			});
			acoesDiv.appendChild(btnEditar);

			var btnMov = document.createElement("button");
			btnMov.type = "button";
			btnMov.className = "btn btn-small btn-secondary";
			btnMov.textContent = "Movimentações";
			btnMov.addEventListener("click", () => {
				abrirMovimentacoes(c);
			});
			acoesDiv.appendChild(btnMov);

			tdAcoes.appendChild(acoesDiv);
			tr.appendChild(tdAcoes);

			tbody.appendChild(tr);
		});
	}

	function abrirMovimentacoes(c) {
		if (!window.api || !window.erpBanco.clientes.movimentacoes) return;
		clienteSelecionado = c;
		modalNome.textContent = c.nome;
		modalMovimentacoes.innerHTML = '<p class="subtitle">Carregando...</p>';
		modal.style.display = "flex";
		window.erpBanco.clientes
			.movimentacoes(c.id)
			.then((dados) => {
				var lista = Array.isArray(dados) ? dados : [];
				if (lista.length === 0) {
					modalMovimentacoes.innerHTML =
						'<p class="subtitle">Nenhuma movimentação registrada.</p>';
					return;
				}
				var html =
					'<table class="modal-table"><thead><tr><th>Data</th><th>Venda nº</th><th>Total</th><th>Pagamento</th><th>Itens</th></tr></thead><tbody>';
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
									") — " +
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
					'<p class="subtitle">Erro ao carregar movimentações.</p>';
			});
	}

	modalClose.addEventListener("click", () => {
		modal.style.display = "none";
	});
	modal.addEventListener("click", (e) => {
		if (e.target === modal) modal.style.display = "none";
	});

	if (buscaCliente) buscaCliente.addEventListener("input", renderizarTabela);

	carregarClientes();
})();
