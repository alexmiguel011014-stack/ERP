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

	var painelProdutosFornecedor = document.getElementById("painelProdutosFornecedor");
	var nomeFornecedorAtual = document.getElementById("nomeFornecedorAtual");
	var pfSku = document.getElementById("pfSku");
	var pfCusto = document.getElementById("pfCusto");
	var pfPrazo = document.getElementById("pfPrazo");
	var pfCodigo = document.getElementById("pfCodigo");
	var pfPreview = document.getElementById("pfPreview");
	var btnAddProdutoFornecedor = document.getElementById("btnAddProdutoFornecedor");
	var listaProdutosFornecedor = document.getElementById("listaProdutosFornecedor");

	var fornecedores = [];
	var produtoFornecedorAtual = null;

	function detalhesDe(p) {
		if (window.formatarAtributos)
			return window.formatarAtributos(p.atributos, p.tamanho, p.cor);
		return [p.tamanho, p.cor].filter(Boolean).join(" / ") || "---";
	}

	function formatarMoeda(v) {
		return "R$ " + (Number(v) || 0).toFixed(2);
	}

	function limparFormProdutoFornecedor() {
		produtoFornecedorAtual = null;
		pfSku.value = "";
		pfCusto.value = "0";
		pfPrazo.value = "";
		pfCodigo.value = "";
		pfPreview.textContent = "";
	}

	pfSku.addEventListener("keydown", (e) => {
		if (e.key !== "Enter") return;
		e.preventDefault();
		var sku = pfSku.value.trim().toUpperCase();
		produtoFornecedorAtual = null;
		pfPreview.textContent = "";
		if (!sku) return;
		window.erpBanco.produtos
			.buscarSKU(sku)
			.then((p) => {
				if (!p) {
					mostrarMensagem("SKU não encontrado: " + sku, "erro");
					return;
				}
				produtoFornecedorAtual = p;
				pfPreview.textContent = p.nome + " (" + detalhesDe(p) + ")";
				pfCusto.focus();
			})
			.catch((err) => {
				mostrarMensagem("Erro ao buscar SKU: " + err, "erro");
			});
	});

	function carregarProdutosFornecedor(fornecedorId) {
		if (!window.api || !window.erpBanco.fornecedores.produtos) return;
		window.erpBanco.fornecedores
			.produtos(fornecedorId)
			.then((rows) => {
				listaProdutosFornecedor.innerHTML = "";
				if (!rows || rows.length === 0) {
					listaProdutosFornecedor.innerHTML =
						'<div class="empty-state">Nenhum produto vinculado ainda.</div>';
					return;
				}
				rows.forEach((r) => {
					var div = document.createElement("div");
					div.className = "item-lista";
					div.innerHTML =
						'<div class="info"><div class="titulo"></div><div class="detalhe"></div></div>' +
						'<div class="acoes"><button type="button" class="btn btn-small btn-danger">Remover</button></div>';
					div.querySelector(".titulo").textContent =
						r.produto_nome + " (" + detalhesDe(r) + ")";
					div.querySelector(".detalhe").textContent =
						"SKU: " + r.sku + " | Custo: " + formatarMoeda(r.preco_custo) +
						(r.prazo_entrega_dias != null ? " | Prazo: " + r.prazo_entrega_dias + " dia(s)" : "") +
						(r.codigo_fornecedor ? " | Código: " + r.codigo_fornecedor : "");
					div.querySelector("button").addEventListener("click", () => {
						if (!confirm("Remover o vínculo com " + r.produto_nome + "?")) return;
						window.erpBanco.fornecedores
							.removerProduto(r.id)
							.then(() => {
								mostrarMensagem("Vínculo removido.", "sucesso");
								carregarProdutosFornecedor(fornecedorId);
							})
							.catch((err) => mostrarMensagem("Erro: " + err, "erro"));
					});
					listaProdutosFornecedor.appendChild(div);
				});
			})
			.catch((err) => {
				listaProdutosFornecedor.innerHTML =
					'<div class="empty-state">Erro: ' + err + "</div>";
			});
	}

	btnAddProdutoFornecedor.addEventListener("click", () => {
		var fornecedorId = editandoId.value ? Number(editandoId.value) : null;
		if (!fornecedorId) {
			mostrarMensagem("Salve o fornecedor antes de vincular produtos.", "erro");
			return;
		}
		if (!produtoFornecedorAtual) {
			mostrarMensagem("Busque um SKU válido antes de adicionar.", "erro");
			return;
		}
		var custo = Number(pfCusto.value);
		if (!Number.isFinite(custo) || custo < 0) {
			mostrarMensagem("Custo inválido.", "erro");
			return;
		}
		window.erpBanco.fornecedores
			.salvarProduto({
				fornecedor_id: fornecedorId,
				variacao_id: produtoFornecedorAtual.id,
				preco_custo: custo,
				prazo_entrega_dias: pfPrazo.value !== "" ? parseInt(pfPrazo.value, 10) : null,
				codigo_fornecedor: pfCodigo.value.trim() || null,
			})
			.then(() => {
				mostrarMensagem("Produto vinculado ao fornecedor!", "sucesso");
				limparFormProdutoFornecedor();
				carregarProdutosFornecedor(fornecedorId);
			})
			.catch((err) => mostrarMensagem("Erro: " + err, "erro"));
	});

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
		painelProdutosFornecedor.style.display = "none";
		limparFormProdutoFornecedor();
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
					nomeFornecedorAtual.textContent = "— " + f.nome;
					painelProdutosFornecedor.style.display = "block";
					limparFormProdutoFornecedor();
					carregarProdutosFornecedor(f.id);
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
