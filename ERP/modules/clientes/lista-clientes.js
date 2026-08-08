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
	var btnLixeiraClientes = document.getElementById("btnLixeiraClientes");
	var btnExportarClientesCsv = document.getElementById("btnExportarClientesCsv");

	var clientes = [];
	var clienteSelecionado = null;
	var verLixeira = false;

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
			.listar(verLixeira)
			.then((lista) => {
				clientes = Array.isArray(lista) ? lista : [];
				if (verLixeira) clientes = clientes.filter((c) => Number(c.ativo) === 0);
				renderizarTabela();
			})
			.catch(() => {
				tbody.innerHTML =
					'<tr><td colspan="6"><div class="empty-state">Erro ao carregar.</div></td></tr>';
			});
	}

	function atualizarBotaoLixeira() {
		if (!btnLixeiraClientes) return;
		btnLixeiraClientes.textContent = verLixeira ? "Ver ativos" : "Lixeira";
		btnLixeiraClientes.classList.toggle("btn-primary", verLixeira);
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

			if (verLixeira) {
				var btnRestaurar = document.createElement("button");
				btnRestaurar.type = "button";
				btnRestaurar.className = "btn btn-small";
				btnRestaurar.textContent = "Restaurar";
				btnRestaurar.addEventListener("click", () => restaurarCliente(c));
				acoesDiv.appendChild(btnRestaurar);

				var btnExcluirDef = document.createElement("button");
				btnExcluirDef.type = "button";
				btnExcluirDef.className = "btn btn-small btn-excluir";
				btnExcluirDef.textContent = "Excluir definitivo";
				btnExcluirDef.addEventListener("click", () => excluirClientePermanente(c));
				acoesDiv.appendChild(btnExcluirDef);
			} else {
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

				var btnExcluir = document.createElement("button");
				btnExcluir.type = "button";
				btnExcluir.className = "btn btn-small btn-excluir";
				btnExcluir.textContent = "Excluir";
				btnExcluir.addEventListener("click", () => excluirCliente(c));
				acoesDiv.appendChild(btnExcluir);
			}

			tdAcoes.appendChild(acoesDiv);
			tr.appendChild(tdAcoes);

			tbody.appendChild(tr);
		});
	}

	function excluirCliente(c) {
		if (!window.erpBanco.clientes.remover) return;
		if (!confirm('Enviar o cliente "' + c.nome + '" para a lixeira? Ele para de aparecer nas buscas e no PDV, mas pode ser restaurado depois.'))
			return;
		window.erpBanco.clientes
			.remover(c.id)
			.then(() => {
				mostrarMensagem("Cliente enviado para a lixeira.", "success");
				carregarClientes();
			})
			.catch((err) => mostrarMensagem("Erro ao excluir: " + err, "error"));
	}

	function restaurarCliente(c) {
		if (!window.erpBanco.clientes.restaurar) return;
		window.erpBanco.clientes
			.restaurar(c.id)
			.then(() => {
				mostrarMensagem('Cliente "' + c.nome + '" restaurado.', "success");
				carregarClientes();
			})
			.catch((err) => mostrarMensagem("Erro ao restaurar: " + err, "error"));
	}

	function excluirClientePermanente(c) {
		if (!window.erpBanco.clientes.excluirPermanente) return;
		if (!confirm('Excluir definitivamente o cliente "' + c.nome + '"? Esta ação não pode ser desfeita.'))
			return;
		window.erpBanco.clientes
			.excluirPermanente(c.id)
			.then(() => {
				mostrarMensagem("Cliente excluído definitivamente.", "success");
				carregarClientes();
			})
			.catch((err) => mostrarMensagem("Erro ao excluir: " + err, "error"));
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

	if (btnLixeiraClientes) {
		btnLixeiraClientes.addEventListener("click", () => {
			verLixeira = !verLixeira;
			atualizarBotaoLixeira();
			carregarClientes();
		});
	}

	function csvCampo(v) {
		return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
	}

	if (btnExportarClientesCsv) {
		btnExportarClientesCsv.addEventListener("click", () => {
			if (clientes.length === 0) {
				mostrarMensagem("Nenhum cliente para exportar.", "error");
				return;
			}
			var cabecalho = "Codigo,Nome,CPF/CNPJ,Telefone,Email,Endereco,Academia,Faixa";
			var linhas = clientes.map((c) =>
				[csvCampo(c.codigo), csvCampo(c.nome), csvCampo(c.cpf_cnpj), csvCampo(c.telefone),
					csvCampo(c.email), csvCampo(c.endereco), csvCampo(c.academia), csvCampo(c.faixa)].join(","),
			);
			var csv = cabecalho + "\n" + linhas.join("\n");
			var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
			var url = URL.createObjectURL(blob);
			var a = document.createElement("a");
			a.href = url;
			a.download = "clientes_" + new Date().toISOString().slice(0, 10) + ".csv";
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			mostrarMensagem("CSV de clientes exportado!", "success");
		});
	}

	carregarClientes();
})();
