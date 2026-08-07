(() => {
	var form = document.getElementById("formFornecedor");
	var editandoId = document.getElementById("fornecedorEditandoId");
	var nome = document.getElementById("nome");
	var cnpj = document.getElementById("cnpj");
	var telefone = document.getElementById("telefone");
	var email = document.getElementById("email");
	var contato = document.getElementById("contato");
	var prazo = document.getElementById("prazo");
	var observacao = document.getElementById("observacao");
	var btnSalvar = document.getElementById("btnSalvar");
	var btnLimpar = document.getElementById("btnLimpar");
	var btnCancelarEdicao = document.getElementById("btnCancelarEdicao");
	var lista = document.getElementById("listaFornecedores");
	var mensagem = document.getElementById("mensagem");

	var fornecedores = [];

	function mostrarMensagem(texto, tipo) {
		mensagem.textContent = texto;
		mensagem.className = "mensagem " + tipo;
		mensagem.style.display = "block";
		setTimeout(() => {
			mensagem.style.display = "none";
		}, 4000);
	}

	function limparEdicao() {
		editandoId.value = "";
		btnSalvar.textContent = "Salvar Fornecedor";
		btnCancelarEdicao.style.display = "none";
	}

	function carregar() {
		if (!window.api || !window.erpBanco.fornecedores.listar) {
			lista.innerHTML = '<div class="empty-state">API indisponível.</div>';
			return;
		}
		window.erpBanco.fornecedores
			.listar()
			.then((rows) => {
				fornecedores = Array.isArray(rows) ? rows : [];
				renderizar();
			})
			.catch((err) => {
				lista.innerHTML = '<div class="empty-state">Erro: ' + err + "</div>";
			});
	}

	function renderizar() {
		lista.innerHTML = "";
		if (fornecedores.length === 0) {
			lista.innerHTML =
				'<div class="empty-state">Nenhum fornecedor cadastrado.</div>';
			return;
		}
		fornecedores.forEach((f) => {
			var div = document.createElement("div");
			div.className = "item-lista";
			div.innerHTML =
				'<div class="info"><div class="titulo"></div><div class="detalhe"></div></div>' +
				'<div class="acoes">' +
				'<button type="button" class="btn btn-small" data-acao="editar">Editar</button>' +
				'<button type="button" class="btn btn-small btn-danger" data-acao="excluir">Excluir</button>' +
				"</div>";
			div.querySelector(".titulo").textContent = f.nome;
			var partes = [];
			if (f.cnpj) partes.push("CNPJ: " + f.cnpj);
			if (f.telefone) partes.push("Tel: " + f.telefone);
			if (f.contato) partes.push("Contato: " + f.contato);
			partes.push("Prazo: " + (f.prazo_pagamento_dias || 0) + " dia(s)");
			if (f.observacao) partes.push(f.observacao);
			div.querySelector(".detalhe").textContent = partes.join(" | ");

			div
				.querySelector('[data-acao="editar"]')
				.addEventListener("click", () => {
					editandoId.value = f.id;
					nome.value = f.nome || "";
					cnpj.value = f.cnpj || "";
					telefone.value = f.telefone || "";
					email.value = f.email || "";
					contato.value = f.contato || "";
					prazo.value = f.prazo_pagamento_dias || 0;
					observacao.value = f.observacao || "";
					btnSalvar.textContent = "Salvar Alterações";
					btnCancelarEdicao.style.display = "inline-block";
					window.scrollTo({ top: 0, behavior: "smooth" });
					nome.focus();
				});

			div
				.querySelector('[data-acao="excluir"]')
				.addEventListener("click", () => {
					if (!confirm('Excluir "' + f.nome + '"?')) return;
					window.erpBanco.fornecedores
						.remover(f.id)
						.then(() => {
							mostrarMensagem("Fornecedor removido.", "sucesso");
							carregar();
						})
						.catch((err) => {
							mostrarMensagem("Erro: " + err, "erro");
						});
				});

			lista.appendChild(div);
		});
	}

	form.addEventListener("submit", (e) => {
		e.preventDefault();
		var dados = {
			nome: nome.value.trim(),
			cnpj: cnpj.value.trim() || null,
			telefone: telefone.value.trim() || null,
			email: email.value.trim() || null,
			contato: contato.value.trim() || null,
			prazo_pagamento_dias: parseInt(prazo.value, 10) || 0,
			observacao: observacao.value.trim() || null,
		};
		if (!dados.nome) {
			mostrarMensagem("O nome é obrigatório.", "erro");
			return;
		}

		btnSalvar.disabled = true;
		var promessa = editandoId.value
			? window.erpBanco.fornecedores.atualizar(editandoId.value, dados)
			: window.erpBanco.fornecedores.salvar(dados);

		promessa
			.then(() => {
				mostrarMensagem(
					editandoId.value ? "Fornecedor atualizado!" : "Fornecedor salvo!",
					"sucesso",
				);
				form.reset();
				prazo.value = "0";
				limparEdicao();
				carregar();
				btnSalvar.disabled = false;
			})
			.catch((err) => {
				mostrarMensagem("Erro: " + err, "erro");
				btnSalvar.disabled = false;
			});
	});

	btnLimpar.addEventListener("click", () => {
		form.reset();
		prazo.value = "0";
		limparEdicao();
	});

	btnCancelarEdicao.addEventListener("click", () => {
		form.reset();
		prazo.value = "0";
		limparEdicao();
	});

	carregar();
})();
