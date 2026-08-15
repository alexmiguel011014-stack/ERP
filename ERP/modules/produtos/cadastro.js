(function () {
	var form = document.getElementById("formProduto");
	var nomeInput = document.getElementById("nome");
	var skuInput = document.getElementById("skuProduto");
	var estoqueInput = document.getElementById("estoqueProduto");
	var btnLimpar = document.getElementById("btnLimpar");
	var btnCancelarEdicao = document.getElementById("btnCancelarEdicao");
	var mensagem = document.getElementById("mensagem");
	var btnSalvar = form.querySelector('button[type="submit"]');
	var produtoEditandoId = document.getElementById("produtoEditandoId");

	var grupoImagemProduto = document.getElementById("grupoImagemProduto");
	var previewImagemProduto = document.getElementById("previewImagemProduto");
	var btnEscolherImagem = document.getElementById("btnEscolherImagem");
	var btnRemoverImagem = document.getElementById("btnRemoverImagem");

	function mostrarPreviewImagem(nomeArquivo) {
		if (!nomeArquivo || !window.erpBanco.produtos.imagem) {
			previewImagemProduto.style.backgroundImage = "";
			previewImagemProduto.textContent = "Sem imagem";
			btnRemoverImagem.style.display = "none";
			return;
		}
		window.erpBanco.produtos
			.imagem(nomeArquivo)
			.then(function (dataUrl) {
				if (!dataUrl) {
					previewImagemProduto.style.backgroundImage = "";
					previewImagemProduto.textContent = "Sem imagem";
					btnRemoverImagem.style.display = "none";
					return;
				}
				previewImagemProduto.style.backgroundImage = "url('" + dataUrl + "')";
				previewImagemProduto.textContent = "";
				btnRemoverImagem.style.display = "inline-block";
			})
			.catch(function () {});
	}

	btnEscolherImagem.addEventListener("click", function () {
		var id = produtoEditandoId.value;
		if (!id) {
			mostrarMensagem("Salve o produto antes de adicionar uma imagem.", "erro");
			return;
		}
		window.erpBanco.produtos
			.escolherImagem(id)
			.then(function (r) {
				if (r && r.cancelado) return;
				if (r && r.success) {
					mostrarMensagem("Imagem atualizada!", "sucesso");
					mostrarPreviewImagem(r.imagem);
				}
			})
			.catch(function (err) {
				mostrarMensagem("Erro ao definir imagem: " + err, "erro");
			});
	});

	btnRemoverImagem.addEventListener("click", function () {
		var id = produtoEditandoId.value;
		if (!id) return;
		if (!confirm("Remover a imagem deste produto?")) return;
		window.erpBanco.produtos
			.removerImagem(id)
			.then(function () {
				mostrarMensagem("Imagem removida.", "sucesso");
				mostrarPreviewImagem(null);
			})
			.catch(function (err) {
				mostrarMensagem("Erro: " + err, "erro");
			});
	});

	// Dropdown de categorias
	var btnCatDropdown = document.getElementById("btnCatDropdown");
	var catDropdownLabel = document.getElementById("catDropdownLabel");
	var catPopover = document.getElementById("catPopover");
	var catPopoverList = document.getElementById("catPopoverList");
	var catSearch = document.getElementById("catSearch");
	var catChips = document.getElementById("catChips");

	// Modal adicionar categoria
	var modalAddCat = document.getElementById("modalAddCat");
	var addCatCodigo = document.getElementById("addCatCodigo");
	var addCatNome = document.getElementById("addCatNome");
	var addCatPai = document.getElementById("addCatPai");
	var btnSalvarAddCat = document.getElementById("btnSalvarAddCat");
	var btnCancelarAddCat = document.getElementById("btnCancelarAddCat");
	var btnFecharModalCat = document.getElementById("btnFecharModalCat");

	var btnListaProdutos = document.getElementById("btnListaProdutos");
	var btnListaCategorias = document.getElementById("btnListaCategorias");
	var modalLista = document.getElementById("modalLista");
	var btnFecharModal = document.getElementById("btnFecharModal");
	var btnLixeiraProdutos = document.getElementById("btnLixeiraProdutos");
	var btnExportarProdutosCsv = document.getElementById(
		"btnExportarProdutosCsv",
	);
	var buscaProduto = document.getElementById("buscaProduto");
	var tbodyProdutos = document.getElementById("corpoProdutos");
	var avisoProdutos = document.getElementById("avisoProdutos");
	var filtroCategoriasProduto = document.getElementById(
		"filtroCategoriasProduto",
	);
	var filtroEstoqueBaixo = document.getElementById("filtroEstoqueBaixo");
	var filtroSemEstoque = document.getElementById("filtroSemEstoque");
	var btnLimparFiltrosProduto = document.getElementById(
		"btnLimparFiltrosProduto",
	);

	var salvando = false;
	var todasCategorias = []; // flat list from categoriasWithUsage
	var produtosCarregados = [];
	var verLixeira = false;
	var selecionadosAtuais = []; // IDs selecionados (string)
	var categoriasFiltroSelecionadas = []; // IDs (string) marcados no filtro da lista

	function esc(texto) {
		return String(texto == null ? "" : texto)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	/* ==================== Dropdown Categorias ==================== */

	// Reage a mudanças de categorias vindas de outras telas
	erpCategoryStore.onChange(function (lista) {
		todasCategorias = lista;
		renderPopoverList();
		atualizarChips();
		if (!modalLista.hasAttribute("hidden")) popularFiltroCategoriasProduto();
	});

	function categoriasFiltradas() {
		var q = (catSearch.value || "").trim().toLowerCase();
		if (!q) return todasCategorias;
		return todasCategorias.filter(function (c) {
			return (
				(c.codigo || "").toLowerCase().indexOf(q) !== -1 ||
				(c.nome || "").toLowerCase().indexOf(q) !== -1
			);
		});
	}

	function renderPopoverList() {
		var filtradas = categoriasFiltradas();
		catPopoverList.innerHTML = "";
		if (filtradas.length === 0) {
			catPopoverList.innerHTML =
				'<div class="cat-popover-empty">Nenhuma categoria encontrada.</div>';
			return;
		}
		filtradas.forEach(function (c) {
			var row = document.createElement("label");
			row.className = "cat-popover-item";
			var cb = document.createElement("input");
			cb.type = "checkbox";
			cb.value = String(c.id);
			cb.checked = selecionadosAtuais.indexOf(String(c.id)) !== -1;
			cb.addEventListener("change", function () {
				coletarSelecionados();
				atualizarDropdownLabel();
				atualizarChips();
			});
			row.appendChild(cb);
			var codeSpan = document.createElement("span");
			codeSpan.className = "cat-popover-code";
			codeSpan.textContent = c.codigo;
			row.appendChild(codeSpan);
			var nomeSpan = document.createElement("span");
			nomeSpan.className = "cat-popover-nome";
			nomeSpan.innerHTML =
				esc(c.nome) +
				(c.categoria_pai_nome
					? "<small>" + esc(c.categoria_pai_nome) + "</small>"
					: "");
			row.appendChild(nomeSpan);
			catPopoverList.appendChild(row);
		});
	}

	function coletarSelecionados() {
		var checks = catPopoverList.querySelectorAll(
			'input[type="checkbox"]:checked',
		);
		selecionadosAtuais = Array.prototype.map.call(checks, function (cb) {
			return String(cb.value);
		});
		if (selecionadosAtuais.length === 0) selecionadosAtuais = [];
		return selecionadosAtuais;
	}

	function atualizarDropdownLabel() {
		var n = selecionadosAtuais.length;
		if (n === 0) {
			catDropdownLabel.textContent = "Selecionar categorias";
		} else if (n === 1) {
			catDropdownLabel.textContent = "1 selecionada";
		} else {
			catDropdownLabel.textContent = n + " selecionadas";
		}
	}

	function atualizarChips() {
		catChips.innerHTML = "";
		selecionadosAtuais.forEach(function (sid) {
			var cat = null;
			for (var i = 0; i < todasCategorias.length; i++) {
				if (String(todasCategorias[i].id) === sid) {
					cat = todasCategorias[i];
					break;
				}
			}
			if (!cat) return;
			var chip = document.createElement("span");
			chip.className = "cat-chip";
			chip.innerHTML = esc(cat.codigo) + " " + esc(cat.nome);
			var removeBtn = document.createElement("button");
			removeBtn.type = "button";
			removeBtn.className = "cat-chip-remove";
			removeBtn.innerHTML = "&times;";
			removeBtn.title = "Remover " + cat.nome;
			removeBtn.addEventListener("click", function (e) {
				e.stopPropagation();
				selecionadosAtuais = selecionadosAtuais.filter(function (id) {
					return id !== sid;
				});
				renderPopoverList();
				atualizarDropdownLabel();
				atualizarChips();
			});
			chip.appendChild(removeBtn);
			catChips.appendChild(chip);
		});
	}

	/* Abrir / fechar popover */
	function abrirPopover() {
		catPopover.hidden = false;
		btnCatDropdown.classList.add("open");
		catSearch.value = "";
		catSearch.focus();
		renderPopoverList();
		document.addEventListener("click", fecharPopoverFora, true);
	}

	function fecharPopover() {
		catPopover.hidden = true;
		btnCatDropdown.classList.remove("open");
		document.removeEventListener("click", fecharPopoverFora, true);
		atualizarDropdownLabel();
		atualizarChips();
	}

	function fecharPopoverFora(e) {
		var inside =
			catPopover.contains(e.target) || btnCatDropdown.contains(e.target);
		if (!inside) fecharPopover();
	}

	btnCatDropdown.addEventListener("click", function (e) {
		e.stopPropagation();
		if (catPopover.hidden) {
			abrirPopover();
		} else {
			fecharPopover();
		}
	});

	catSearch.addEventListener("input", renderPopoverList);
	catSearch.addEventListener("keydown", function (e) {
		if (e.key === "Escape") {
			fecharPopover();
			btnCatDropdown.focus();
		}
	});

	/* ==================== Modal Adicionar Categoria ==================== */

	function abrirModalAddCat() {
		fecharPopover();
		modalAddCat.hidden = false;
		addCatNome.value = "";
		addCatPai.innerHTML =
			'<option value="">Nenhum (criar grupo principal)</option>';
		todasCategorias.forEach(function (c) {
			if (c.tipo === "categoria") {
				var opt = document.createElement("option");
				opt.value = c.id;
				opt.textContent = c.nome;
				addCatPai.appendChild(opt);
			}
		});
		if (
			window.erpBanco &&
			window.erpBanco.categorias &&
			window.erpBanco.categorias.proximoCodigo
		) {
			window.erpBanco.categorias
				.proximoCodigo()
				.then(function (codigo) {
					addCatCodigo.value = codigo;
				})
				.catch(function () {
					addCatCodigo.value = "---";
				});
		} else {
			addCatCodigo.value = "---";
		}
		addCatNome.focus();
	}

	function fecharModalAddCat() {
		modalAddCat.hidden = true;
	}

	document
		.getElementById("btnAddCategoria")
		.addEventListener("click", abrirModalAddCat);
	btnFecharModalCat.addEventListener("click", fecharModalAddCat);
	btnCancelarAddCat.addEventListener("click", fecharModalAddCat);
	modalAddCat.addEventListener("click", function (e) {
		if (e.target === modalAddCat) fecharModalAddCat();
	});
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape" && !modalAddCat.hidden) fecharModalAddCat();
	});

	btnSalvarAddCat.addEventListener("click", function () {
		var nome = addCatNome.value.trim();
		if (!nome) {
			mostrarMensagem("Informe o nome da categoria.", "erro");
			addCatNome.focus();
			return;
		}
		var paiId = parseInt(addCatPai.value, 10) || null;
		if (
			!window.erpBanco ||
			!window.erpBanco.categorias ||
			!window.erpBanco.categorias.salvar
		) {
			mostrarMensagem("API indisponível.", "erro");
			return;
		}
		btnSalvarAddCat.disabled = true;
		window.erpBanco.categorias
			.salvar(nome, paiId)
			.then(function (resultado) {
				fecharModalAddCat();
				erpCategoryStore.refresh().then(function () {
					todasCategorias = erpCategoryStore.getCache();
					// Pré-marca a nova categoria
					if (resultado && resultado.id) {
						var sid = String(resultado.id);
						if (selecionadosAtuais.indexOf(sid) === -1) {
							selecionadosAtuais.push(sid);
						}
						renderPopoverList();
						atualizarDropdownLabel();
						atualizarChips();
					}
					mostrarMensagem("Categoria criada e selecionada!", "sucesso");
				});
			})
			.catch(function (err) {
				mostrarMensagem("Erro ao salvar: " + err, "erro");
			})
			.then(function () {
				btnSalvarAddCat.disabled = false;
			});
	});

	/* ==================== SKU do Produto ==================== */

	function atualizarSkuNovo() {
		if (produtoEditandoId.value) return;
		if (
			!window.erpBanco ||
			!window.erpBanco.produtos ||
			!window.erpBanco.produtos.proximoSku
		) {
			skuInput.value = "";
			return;
		}
		window.erpBanco.produtos
			.proximoSku()
			.then(function (sku) {
				skuInput.value = sku;
			})
			.catch(function () {
				skuInput.value = "";
			});
	}

	// As categorias já são o sistema de classificação genérico do produto
	// (Tamanho, Cor, ou qualquer outro grupo criado em "+ Adicionar Categoria").
	// Os atributos da variação (exigidos pelo banco) são derivados delas, sem
	// pedir a mesma informação de novo em um formulário separado.
	function derivarAtributosDeCategorias(categoriaIds) {
		var atributos = [];
		categoriaIds.forEach(function (id) {
			var cat = null;
			for (var i = 0; i < todasCategorias.length; i++) {
				if (todasCategorias[i].id === id) {
					cat = todasCategorias[i];
					break;
				}
			}
			if (!cat) return;
			atributos.push({
				chave: cat.categoria_pai_nome || "Categoria",
				valor: cat.nome,
			});
		});
		if (atributos.length === 0)
			atributos.push({ chave: "Categoria", valor: "Geral" });
		return atributos;
	}

	/* ==================== Produtos / Modal ==================== */

	function skeletonLinhasProdutos(qtd) {
		var linha =
			'<tr><td colspan="6"><div class="skeleton-linha">' +
			'<span class="skeleton-box skeleton-quadrado"></span>' +
			'<span class="skeleton-col">' +
			'<span class="skeleton-box skeleton-linha-texto" style="width:60%;"></span>' +
			'<span class="skeleton-box skeleton-linha-texto" style="width:35%;"></span>' +
			"</span></div></td></tr>";
		return new Array(qtd || 5).fill(linha).join("");
	}

	function popularFiltroCategoriasProduto() {
		if (!filtroCategoriasProduto) return;
		var raizes = todasCategorias.filter(function (c) {
			return !c.categoria_pai_id;
		});
		if (raizes.length === 0) {
			filtroCategoriasProduto.innerHTML =
				'<div class="empty-state" style="padding:8px 0; font-size:0.78rem;">Nenhuma categoria.</div>';
			return;
		}
		filtroCategoriasProduto.innerHTML = raizes
			.map(function (c) {
				var id = String(c.id);
				var marcado =
					categoriasFiltroSelecionadas.indexOf(id) !== -1 ? "checked" : "";
				return (
					'<label class="filtro-check"><input type="checkbox" data-cat-filtro="' +
					id +
					'" ' +
					marcado +
					"> " +
					esc(c.nome) +
					"</label>"
				);
			})
			.join("");
		Array.prototype.forEach.call(
			filtroCategoriasProduto.querySelectorAll("[data-cat-filtro]"),
			function (chk) {
				chk.addEventListener("change", function () {
					var id = chk.getAttribute("data-cat-filtro");
					var pos = categoriasFiltroSelecionadas.indexOf(id);
					if (chk.checked && pos === -1) categoriasFiltroSelecionadas.push(id);
					else if (!chk.checked && pos !== -1)
						categoriasFiltroSelecionadas.splice(pos, 1);
					renderizarProdutos();
				});
			},
		);
	}

	function carregarProdutos() {
		if (
			!window.erpBanco ||
			!window.erpBanco.produtos ||
			!window.erpBanco.produtos.detalhados
		) {
			if (avisoProdutos) avisoProdutos.innerHTML = "API indisponível.";
			return;
		}
		tbodyProdutos.innerHTML = skeletonLinhasProdutos(5);
		window.erpBanco.produtos
			.detalhados(verLixeira)
			.then(function (dados) {
				produtosCarregados = Array.isArray(dados) ? dados : [];
				if (verLixeira)
					produtosCarregados = produtosCarregados.filter(function (p) {
						return Number(p.ativo) === 0;
					});
				if (modalLista.hasAttribute("hidden")) return;
				renderizarProdutos();
			})
			.catch(function (err) {
				if (avisoProdutos)
					avisoProdutos.innerHTML = "Erro ao carregar produtos: " + esc(err);
			});
	}

	function abrirModal() {
		modalLista.hidden = false;
		popularFiltroCategoriasProduto();
		carregarProdutos();
	}

	function fecharModal() {
		modalLista.hidden = true;
		if (verLixeira) {
			verLixeira = false;
			atualizarBotaoLixeira();
		}
	}

	function atualizarBotaoLixeira() {
		if (!btnLixeiraProdutos) return;
		btnLixeiraProdutos.textContent = verLixeira ? "Ver ativos" : "Lixeira";
		btnLixeiraProdutos.classList.toggle("btn-primary", verLixeira);
	}

	function tagsCategorias(p) {
		var tags = [];
		if (Array.isArray(p.categorias_selecionadas)) {
			p.categorias_selecionadas.forEach(function (c) {
				tags.push(c.nome);
			});
		}
		if (tags.length === 0) {
			if (p.categoria_nome) tags.push(p.categoria_nome);
			if (p.subcategoria_nome) tags.push(p.subcategoria_nome);
			if (tags.length === 0 && p.categoria_legada)
				tags.push(p.categoria_legada);
		}
		return tags;
	}

	function produtoNasCategoriasFiltro(p) {
		if (categoriasFiltroSelecionadas.length === 0) return true;
		var idsProduto = [];
		if (Array.isArray(p.categorias_selecionadas)) {
			p.categorias_selecionadas.forEach(function (c) {
				idsProduto.push(String(c.id));
				if (c.categoria_pai_id) idsProduto.push(String(c.categoria_pai_id));
			});
		}
		if (p.categoria_id) idsProduto.push(String(p.categoria_id));
		if (p.subcategoria_id) idsProduto.push(String(p.subcategoria_id));
		return categoriasFiltroSelecionadas.some(function (id) {
			return idsProduto.indexOf(id) !== -1;
		});
	}

	function produtoNoFiltroEstoque(p) {
		var variacoes = p.variacoes || [];
		if (filtroSemEstoque && filtroSemEstoque.checked) {
			if (
				!variacoes.some(function (v) {
					return Number(v.quantidade_estoque) <= 0;
				})
			)
				return false;
		}
		if (filtroEstoqueBaixo && filtroEstoqueBaixo.checked) {
			if (
				!variacoes.some(function (v) {
					var qtd = Number(v.quantidade_estoque);
					var min = Number(v.estoque_minimo || 0);
					return qtd > 0 && qtd <= min;
				})
			)
				return false;
		}
		return true;
	}

	function renderizarProdutos() {
		if (!tbodyProdutos) return;
		if (avisoProdutos) avisoProdutos.innerHTML = "";
		var filtro = (buscaProduto.value || "").trim().toLowerCase();
		var produtosFiltrados = produtosCarregados.filter(function (p) {
			if (
				filtro &&
				[p.nome, tagsCategorias(p).join(" ")]
					.join(" ")
					.toLowerCase()
					.indexOf(filtro) === -1
			)
				return false;
			if (!produtoNasCategoriasFiltro(p)) return false;
			if (!produtoNoFiltroEstoque(p)) return false;
			return true;
		});
		tbodyProdutos.innerHTML = "";
		if (produtosFiltrados.length === 0) {
			tbodyProdutos.innerHTML =
				'<tr><td colspan="6"><div class="empty-state">' +
				(produtosCarregados.length === 0
					? "Nenhum produto cadastrado ainda."
					: "Nenhum produto encontrado para os filtros aplicados.") +
				"</div></td></tr>";
			return;
		}
		produtosFiltrados.forEach(function (p) {
			var tr = document.createElement("tr");
			var tdCodigo = document.createElement("td");
			var skus = (p.variacoes || [])
				.map(function (v) {
					return v.sku;
				})
				.filter(Boolean);
			tdCodigo.innerHTML =
				'<span class="prod-codigo">' +
				esc(skus.join(", ") || "---") +
				"</span>";
			tr.appendChild(tdCodigo);
			var tdNome = document.createElement("td");
			tdNome.innerHTML = '<span class="prod-nome">' + esc(p.nome) + "</span>";
			tr.appendChild(tdNome);
			var tdCats = document.createElement("td");
			var tagsBox = document.createElement("div");
			tagsBox.className = "tag-list";
			var tags = tagsCategorias(p);
			if (tags.length) {
				tags.forEach(function (t) {
					var span = document.createElement("span");
					span.className = "tag";
					span.textContent = t;
					tagsBox.appendChild(span);
				});
			} else {
				tagsBox.innerHTML = '<span class="tag-empty">---</span>';
			}
			tdCats.appendChild(tagsBox);
			tr.appendChild(tdCats);
			var tdPreco = document.createElement("td");
			tdPreco.className = "td-futuro";
			tdPreco.innerHTML = '<span class="placeholder-cell">&mdash;</span>';
			tr.appendChild(tdPreco);
			var tdOutros = document.createElement("td");
			tdOutros.className = "td-futuro";
			tdOutros.innerHTML = '<span class="placeholder-cell">&mdash;</span>';
			tr.appendChild(tdOutros);

			var tdAcoes = document.createElement("td");
			var acoes = document.createElement("div");
			acoes.className = "acoes-prod";
			if (verLixeira) {
				var btnRestaurar = document.createElement("button");
				btnRestaurar.type = "button";
				btnRestaurar.className = "btn btn-small";
				btnRestaurar.textContent = "Restaurar";
				btnRestaurar.addEventListener("click", function () {
					restaurarProduto(p.id, p.nome);
				});
				var btnExcluirDef = document.createElement("button");
				btnExcluirDef.type = "button";
				btnExcluirDef.className = "btn btn-small btn-excluir";
				btnExcluirDef.textContent = "Excluir definitivo";
				btnExcluirDef.addEventListener("click", function () {
					excluirProdutoPermanente(p.id, p.nome);
				});
				acoes.appendChild(btnRestaurar);
				acoes.appendChild(btnExcluirDef);
			} else {
				var btnEditar = document.createElement("button");
				btnEditar.type = "button";
				btnEditar.className = "btn btn-small btn-editar";
				btnEditar.textContent = "Editar";
				btnEditar.addEventListener("click", function () {
					fecharModal();
					editarProduto(p.id);
				});
				var btnExcluir = document.createElement("button");
				btnExcluir.type = "button";
				btnExcluir.className = "btn btn-small btn-excluir";
				btnExcluir.textContent = "Excluir";
				btnExcluir.addEventListener("click", function () {
					excluirProduto(p.id, p.nome);
				});
				acoes.appendChild(btnEditar);
				acoes.appendChild(btnExcluir);
			}
			tdAcoes.appendChild(acoes);
			tr.appendChild(tdAcoes);
			tbodyProdutos.appendChild(tr);
		});
	}

	/* ==================== Editar / Excluir / Salvar ==================== */

	function limparEdicao() {
		produtoEditandoId.value = "";
		btnSalvar.textContent = "Salvar Produto";
		btnCancelarEdicao.style.display = "none";
		selecionadosAtuais = [];
		atualizarDropdownLabel();
		atualizarChips();
		atualizarSkuNovo();
		grupoImagemProduto.style.display = "none";
	}

	function editarProduto(id) {
		var p = null;
		for (var i = 0; i < produtosCarregados.length; i++) {
			if (String(produtosCarregados[i].id) === String(id)) {
				p = produtosCarregados[i];
				break;
			}
		}
		if (!p) {
			mostrarMensagem("Produto não encontrado.", "erro");
			return;
		}
		selecionadosAtuais = Array.isArray(p.categorias_selecionadas)
			? p.categorias_selecionadas.map(function (c) {
					return String(c.id);
				})
			: [];
		if (selecionadosAtuais.length === 0) {
			if (p.subcategoria_id) selecionadosAtuais.push(String(p.subcategoria_id));
			else if (p.categoria_id) selecionadosAtuais.push(String(p.categoria_id));
		}
		erpCategoryStore.refresh().then(function () {
			todasCategorias = erpCategoryStore.getCache();
			nomeInput.value = p.nome;
			var variacao = p.variacoes && p.variacoes.length ? p.variacoes[0] : null;
			skuInput.value = variacao ? variacao.sku : "";
			estoqueInput.value = variacao
				? Number(variacao.quantidade_estoque || 0)
				: 0;
			produtoEditandoId.value = String(p.id);
			btnSalvar.textContent = "Salvar Alterações";
			btnCancelarEdicao.style.display = "inline-block";
			grupoImagemProduto.style.display = "block";
			mostrarPreviewImagem(p.imagem);
			atualizarDropdownLabel();
			atualizarChips();
			var container = document.querySelector(".container");
			if (container && container.scrollIntoView)
				container.scrollIntoView({ behavior: "smooth", block: "start" });
			nomeInput.focus();
		});
	}

	function excluirProduto(id, nome) {
		if (
			!window.erpBanco ||
			!window.erpBanco.produtos ||
			!window.erpBanco.produtos.remover
		) {
			mostrarMensagem("API indisponível.", "erro");
			return;
		}
		if (
			!confirm(
				'Enviar o produto "' +
					nome +
					'" para a lixeira? Ele para de aparecer nas buscas e no PDV, mas pode ser restaurado depois.',
			)
		)
			return;
		window.erpBanco.produtos
			.remover(id)
			.then(function () {
				mostrarMensagem("Produto enviado para a lixeira.", "sucesso");
				carregarProdutos();
				atualizarSkuNovo();
			})
			.catch(function (err) {
				mostrarMensagem("Erro ao excluir: " + err, "erro");
			});
	}

	function restaurarProduto(id, nome) {
		if (
			!window.erpBanco ||
			!window.erpBanco.produtos ||
			!window.erpBanco.produtos.restaurar
		) {
			mostrarMensagem("API indisponível.", "erro");
			return;
		}
		window.erpBanco.produtos
			.restaurar(id)
			.then(function () {
				mostrarMensagem('Produto "' + nome + '" restaurado.', "sucesso");
				carregarProdutos();
			})
			.catch(function (err) {
				mostrarMensagem("Erro ao restaurar: " + err, "erro");
			});
	}

	function excluirProdutoPermanente(id, nome) {
		if (
			!window.erpBanco ||
			!window.erpBanco.produtos ||
			!window.erpBanco.produtos.excluirPermanente
		) {
			mostrarMensagem("API indisponível.", "erro");
			return;
		}
		if (
			!confirm(
				'Excluir definitivamente o produto "' +
					nome +
					'"? Esta ação não pode ser desfeita.',
			)
		)
			return;
		window.erpBanco.produtos
			.excluirPermanente(id)
			.then(function () {
				mostrarMensagem("Produto excluído definitivamente.", "sucesso");
				carregarProdutos();
			})
			.catch(function (err) {
				mostrarMensagem("Erro ao excluir: " + err, "erro");
			});
	}

	form.addEventListener("submit", function (e) {
		e.preventDefault();
		mensagem.className = "mensagem";
		mensagem.style.display = "none";
		if (salvando) return;
		var nomeProduto = nomeInput.value.trim();
		if (!nomeProduto) {
			mostrarMensagem("Nome do produto é obrigatório.", "erro");
			nomeInput.focus();
			return;
		}
		var skuProduto = skuInput.value.trim().toUpperCase();
		var estoqueProduto = Number(estoqueInput.value);
		if (
			!Number.isInteger(estoqueProduto) ||
			estoqueProduto < 0 ||
			!estoqueInput.value.trim()
		) {
			mostrarMensagem("Estoque inválido. Informe um número inteiro.", "erro");
			estoqueInput.focus();
			return;
		}

		var categoriasSel = coletarSelecionados().map(function (id) {
			return parseInt(id, 10);
		});
		var dados = {
			nome: nomeProduto,
			categoria: null,
			categoria_id: null,
			subcategoria_id: null,
			categoriasSelecionadas: categoriasSel,
			variacoes: [
				{
					sku: skuProduto,
					preco: 0,
					preco_custo: 0,
					quantidade_estoque: estoqueProduto,
					atributos: derivarAtributosDeCategorias(categoriasSel),
				},
			],
		};
		salvando = true;
		btnSalvar.disabled = true;
		btnSalvar.textContent = "Salvando...";
		var editandoId = produtoEditandoId.value;
		if (
			!window.erpBanco ||
			!window.erpBanco.produtos ||
			!window.erpBanco.produtos.salvar ||
			!window.erpBanco.produtos.atualizar
		) {
			mostrarMensagem("API não disponível.", "erro");
			btnSalvar.disabled = false;
			btnSalvar.textContent = "Salvar Produto";
			salvando = false;
			return;
		}
		var operacao;
		try {
			operacao = editandoId
				? window.erpBanco.produtos.atualizar(editandoId, dados)
				: window.erpBanco.produtos.salvar(dados);
		} catch (erroSync) {
			mostrarMensagem(
				"Erro ao salvar: " +
					(erroSync && erroSync.message ? erroSync.message : erroSync),
				"erro",
			);
			btnSalvar.disabled = false;
			btnSalvar.textContent = "Salvar Produto";
			salvando = false;
			return;
		}
		operacao
			.then(function () {
				mostrarMensagem(
					editandoId
						? "Produto atualizado com sucesso!"
						: "Produto salvo com sucesso!",
					"sucesso",
				);
				form.reset();
				limparEdicao();
				erpCategoryStore.refresh();
				carregarProdutos();
				atualizarSkuNovo();
				btnSalvar.disabled = false;
				salvando = false;
				nomeInput.focus();
			})
			.catch(function (err) {
				mostrarMensagem("Erro ao salvar: " + err, "erro");
				btnSalvar.disabled = false;
				btnSalvar.textContent = editandoId
					? "Salvar Alterações"
					: "Salvar Produto";
				salvando = false;
			});
	});

	btnLimpar.addEventListener("click", function () {
		form.reset();
		limparEdicao();
		erpCategoryStore.refresh();
		mensagem.className = "mensagem";
		mensagem.style.display = "none";
		atualizarSkuNovo();
	});

	btnCancelarEdicao.addEventListener("click", function () {
		limparEdicao();
		form.reset();
		erpCategoryStore.refresh();
		mensagem.className = "mensagem";
		mensagem.style.display = "none";
		atualizarSkuNovo();
		nomeInput.focus();
	});

	btnListaProdutos.addEventListener("click", abrirModal);
	if (btnListaCategorias)
		btnListaCategorias.addEventListener("click", function () {
			window.location.href = "categorias.html";
		});
	btnFecharModal.addEventListener("click", fecharModal);
	if (btnLixeiraProdutos) {
		btnLixeiraProdutos.addEventListener("click", function () {
			verLixeira = !verLixeira;
			atualizarBotaoLixeira();
			carregarProdutos();
		});
	}

	function csvCampoProduto(v) {
		return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
	}

	if (btnExportarProdutosCsv) {
		btnExportarProdutosCsv.addEventListener("click", function () {
			if (produtosCarregados.length === 0) {
				mostrarMensagem("Nenhum produto para exportar.", "erro");
				return;
			}
			var cabecalho =
				"SKU,Produto,Categorias,Tamanho,Cor,Preco,PrecoCusto,Estoque";
			var linhas = [];
			produtosCarregados.forEach(function (p) {
				var categorias = tagsCategorias(p).join(" / ");
				var variacoes =
					p.variacoes && p.variacoes.length
						? p.variacoes
						: [
								{
									sku: "",
									tamanho: "",
									cor: "",
									preco: "",
									preco_custo: "",
									quantidade_estoque: "",
								},
							];
				variacoes.forEach(function (v) {
					linhas.push(
						[
							csvCampoProduto(v.sku),
							csvCampoProduto(p.nome),
							csvCampoProduto(categorias),
							csvCampoProduto(v.tamanho),
							csvCampoProduto(v.cor),
							csvCampoProduto(v.preco),
							csvCampoProduto(v.preco_custo),
							csvCampoProduto(v.quantidade_estoque),
						].join(","),
					);
				});
			});
			var csv = cabecalho + "\n" + linhas.join("\n");
			var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
			var url = URL.createObjectURL(blob);
			var a = document.createElement("a");
			a.href = url;
			a.download = "produtos_" + new Date().toISOString().slice(0, 10) + ".csv";
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			mostrarMensagem("CSV de produtos exportado!", "sucesso");
		});
	}
	modalLista.addEventListener("click", function (e) {
		if (e.target === modalLista) fecharModal();
	});
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape" && !modalLista.hasAttribute("hidden")) fecharModal();
	});
	if (buscaProduto) buscaProduto.addEventListener("input", renderizarProdutos);
	if (filtroEstoqueBaixo)
		filtroEstoqueBaixo.addEventListener("change", renderizarProdutos);
	if (filtroSemEstoque)
		filtroSemEstoque.addEventListener("change", renderizarProdutos);
	if (btnLimparFiltrosProduto) {
		btnLimparFiltrosProduto.addEventListener("click", function () {
			categoriasFiltroSelecionadas = [];
			if (filtroEstoqueBaixo) filtroEstoqueBaixo.checked = false;
			if (filtroSemEstoque) filtroSemEstoque.checked = false;
			buscaProduto.value = "";
			popularFiltroCategoriasProduto();
			renderizarProdutos();
		});
	}

	function mostrarMensagem(texto, tipo) {
		mensagem.textContent = texto;
		mensagem.className =
			"mensagem " + (tipo === "sucesso" ? "success" : "error");
		mensagem.style.display = "block";
	}

	function abrirProdutoDaURL() {
		var params = new URLSearchParams(window.location.search);
		var sku = params.get("sku");
		if (!sku || !window.erpBanco.produtos.buscarSKU) return;
		window.erpBanco.produtos
			.buscarSKU(sku)
			.then(function (v) {
				if (!v || !v.produto_id) {
					mostrarMensagem("SKU não encontrado: " + sku, "erro");
					return;
				}
				window.erpBanco.produtos.detalhados().then(function (dados) {
					produtosCarregados = Array.isArray(dados) ? dados : [];
					editarProduto(v.produto_id);
				});
			})
			.catch(function () {});
	}

	function iniciarCadastro() {
		erpCategoryStore.refresh();
		carregarProdutos();
		atualizarSkuNovo();
		abrirProdutoDaURL();
	}

	if (window.erpAuthPromise)
		window.erpAuthPromise.then(iniciarCadastro).catch(function () {});
	else iniciarCadastro();
})();
