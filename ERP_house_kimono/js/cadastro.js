(function () {
  var form = document.getElementById("formProduto");
  var nomeInput = document.getElementById("nome");
  var codigoInput = document.getElementById("codigoProduto");
  var btnLimpar = document.getElementById("btnLimpar");
  var btnCancelarEdicao = document.getElementById("btnCancelarEdicao");
  var mensagem = document.getElementById("mensagem");
  var btnSalvar = form.querySelector('button[type="submit"]');
  var produtoEditandoId = document.getElementById("produtoEditandoId");

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
  var buscaProduto = document.getElementById("buscaProduto");
  var tbodyProdutos = document.getElementById("corpoProdutos");
  var avisoProdutos = document.getElementById("avisoProdutos");

  var salvando = false;
  var todasCategorias = [];     // flat list from categoriasWithUsage
  var produtosCarregados = [];
  var selecionadosAtuais = [];  // IDs selecionados (string)

  function esc(texto) {
    return String(texto == null ? "" : texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function codigoFormatado(numero) {
    var n = parseInt(numero, 10) || 0;
    return "#" + String(n).padStart(4, "0");
  }

  /* ==================== Dropdown Categorias ==================== */

  function carregarCategorias() {
    return erpCategoryStore.getCategoriasFlux().then(function (lista) {
      todasCategorias = lista;
      renderPopoverList();
      atualizarChips();
      return todasCategorias;
    }).catch(function (err) {
      catPopoverList.innerHTML = '<div class="cat-popover-empty">Erro: ' + esc(err) + '</div>';
      return [];
    });
  }

  // Reage a mudanças de categorias vindas de outras telas
  erpCategoryStore.onChange(function (lista) {
    todasCategorias = lista;
    renderPopoverList();
    atualizarChips();
  });

  function categoriasFiltradas() {
    var q = (catSearch.value || "").trim().toLowerCase();
    if (!q) return todasCategorias;
    return todasCategorias.filter(function (c) {
      return (c.codigo || "").toLowerCase().indexOf(q) !== -1 ||
             (c.nome || "").toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderPopoverList() {
    var filtradas = categoriasFiltradas();
    catPopoverList.innerHTML = "";
    if (filtradas.length === 0) {
      catPopoverList.innerHTML = '<div class="cat-popover-empty">Nenhuma categoria encontrada.</div>';
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
      nomeSpan.innerHTML = esc(c.nome) +
        (c.categoria_pai_nome ? '<small>' + esc(c.categoria_pai_nome) + '</small>' : '');
      row.appendChild(nomeSpan);
      catPopoverList.appendChild(row);
    });
  }

  function coletarSelecionados() {
    var checks = catPopoverList.querySelectorAll('input[type="checkbox"]:checked');
    selecionadosAtuais = Array.prototype.map.call(checks, function (cb) { return String(cb.value); });
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
        if (String(todasCategorias[i].id) === sid) { cat = todasCategorias[i]; break; }
      }
      if (!cat) return;
      var chip = document.createElement("span");
      chip.className = "cat-chip";
      chip.innerHTML = esc(cat.codigo) + ' ' + esc(cat.nome);
      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "cat-chip-remove";
      removeBtn.innerHTML = "&times;";
      removeBtn.title = "Remover " + cat.nome;
      removeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        selecionadosAtuais = selecionadosAtuais.filter(function (id) { return id !== sid; });
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
    var inside = catPopover.contains(e.target) || btnCatDropdown.contains(e.target);
    if (!inside) fecharPopover();
  }

  btnCatDropdown.addEventListener("click", function (e) {
    e.stopPropagation();
    if (catPopover.hidden) { abrirPopover(); } else { fecharPopover(); }
  });

  catSearch.addEventListener("input", renderPopoverList);
  catSearch.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { fecharPopover(); btnCatDropdown.focus(); }
  });

  /* ==================== Modal Adicionar Categoria ==================== */

  function abrirModalAddCat() {
    fecharPopover();
    modalAddCat.hidden = false;
    addCatNome.value = "";
    addCatPai.innerHTML = '<option value="">Nenhum (criar grupo principal)</option>';
    todasCategorias.forEach(function (c) {
      if (c.tipo === "categoria") {
        var opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.nome;
        addCatPai.appendChild(opt);
      }
    });
    if (window.api && window.api.proximoCodigoCategoria) {
      window.api.proximoCodigoCategoria().then(function (codigo) {
        addCatCodigo.value = codigo;
      }).catch(function () {
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

  document.getElementById("btnAddCategoria").addEventListener("click", abrirModalAddCat);
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
    if (!window.api || !window.api.salvarCategoria) {
      mostrarMensagem("API indisponível.", "erro");
      return;
    }
    btnSalvarAddCat.disabled = true;
    window.api.salvarCategoria(nome, paiId).then(function (resultado) {
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
    }).catch(function (err) {
      mostrarMensagem("Erro ao salvar: " + err, "erro");
    }).then(function () {
      btnSalvarAddCat.disabled = false;
    });
  });

  /* ==================== Código do Produto ==================== */

  function atualizarCodigoNovo() {
    if (produtoEditandoId.value) return;
    if (!window.api || !window.api.proximoCodigoProduto) { codigoInput.value = ""; return; }
    window.api.proximoCodigoProduto().then(function (proximo) {
      codigoInput.placeholder = codigoFormatado(proximo) + " (ao salvar)";
      codigoInput.value = codigoFormatado(proximo);
    }).catch(function () {
      codigoInput.placeholder = "Será gerado ao salvar";
    });
  }

  /* ==================== Produtos / Modal ==================== */

  function carregarProdutos() {
    if (!window.api || !window.api.listarProdutosDetalhados) {
      if (avisoProdutos) avisoProdutos.innerHTML = "API indisponível.";
      return;
    }
    window.api.listarProdutosDetalhados().then(function (dados) {
      produtosCarregados = Array.isArray(dados) ? dados : [];
      if (modalLista.hasAttribute("hidden")) return;
      renderizarProdutos();
    }).catch(function (err) {
      if (avisoProdutos) avisoProdutos.innerHTML = "Erro ao carregar produtos: " + esc(err);
    });
  }

  function abrirModal() {
    modalLista.hidden = false;
    if (!produtosCarregados.length) { carregarProdutos(); } else { renderizarProdutos(); }
  }

  function fecharModal() { modalLista.hidden = true; }

  function tagsCategorias(p) {
    var tags = [];
    if (Array.isArray(p.categorias_selecionadas)) {
      p.categorias_selecionadas.forEach(function (c) { tags.push(c.nome); });
    }
    if (tags.length === 0) {
      if (p.categoria_nome) tags.push(p.categoria_nome);
      if (p.subcategoria_nome) tags.push(p.subcategoria_nome);
      if (tags.length === 0 && p.categoria_legada) tags.push(p.categoria_legada);
    }
    return tags;
  }

  function renderizarProdutos() {
    if (!tbodyProdutos) return;
    tbodyProdutos.innerHTML = "";
    if (avisoProdutos) avisoProdutos.innerHTML = "";
    var filtro = (buscaProduto.value || "").trim().toLowerCase();
    var produtosFiltrados = produtosCarregados.filter(function (p) {
      if (!filtro) return true;
      return [p.nome, tagsCategorias(p).join(" ")].join(" ").toLowerCase().indexOf(filtro) !== -1;
    });
    if (produtosFiltrados.length === 0) {
      tbodyProdutos.innerHTML = '<tr><td colspan="6"><div class="empty-state">' +
        (produtosCarregados.length === 0 ? "Nenhum produto cadastrado ainda." : "Nenhum produto encontrado para a busca.") +
        '</div></td></tr>';
      return;
    }
    produtosFiltrados.forEach(function (p) {
      var tr = document.createElement("tr");
      var tdCodigo = document.createElement("td");
      tdCodigo.innerHTML = '<span class="prod-codigo">' + esc(codigoFormatado(p.id)) + '</span>';
      tr.appendChild(tdCodigo);
      var tdNome = document.createElement("td");
      tdNome.innerHTML = '<span class="prod-nome">' + esc(p.nome) + '</span>';
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
      } else { tagsBox.innerHTML = '<span class="tag-empty">---</span>'; }
      tdCats.appendChild(tagsBox);
      tr.appendChild(tdCats);
      var tdPreco = document.createElement("td"); tdPreco.className = "td-futuro";
      tdPreco.innerHTML = '<span class="placeholder-cell">&mdash;</span>'; tr.appendChild(tdPreco);
      var tdOutros = document.createElement("td"); tdOutros.className = "td-futuro";
      tdOutros.innerHTML = '<span class="placeholder-cell">&mdash;</span>'; tr.appendChild(tdOutros);

      var tdAcoes = document.createElement("td");
      var btnEditar = document.createElement("button");
      btnEditar.type = "button"; btnEditar.className = "btn btn-small btn-editar"; btnEditar.textContent = "Editar";
      btnEditar.addEventListener("click", function () { fecharModal(); editarProduto(p.id); });
      var btnExcluir = document.createElement("button");
      btnExcluir.type = "button"; btnExcluir.className = "btn btn-small btn-excluir"; btnExcluir.textContent = "Excluir";
      btnExcluir.addEventListener("click", function () { excluirProduto(p.id, p.nome); });
      var acoes = document.createElement("div"); acoes.className = "acoes-prod";
      acoes.appendChild(btnEditar); acoes.appendChild(btnExcluir);
      tdAcoes.appendChild(acoes); tr.appendChild(tdAcoes);
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
  }

  function editarProduto(id) {
    var p = null;
    for (var i = 0; i < produtosCarregados.length; i++) {
      if (String(produtosCarregados[i].id) === String(id)) { p = produtosCarregados[i]; break; }
    }
    if (!p) { mostrarMensagem("Produto não encontrado.", "erro"); return; }
    selecionadosAtuais = Array.isArray(p.categorias_selecionadas)
      ? p.categorias_selecionadas.map(function (c) { return String(c.id); })
      : [];
    if (selecionadosAtuais.length === 0) {
      if (p.subcategoria_id) selecionadosAtuais.push(String(p.subcategoria_id));
      else if (p.categoria_id) selecionadosAtuais.push(String(p.categoria_id));
    }
    erpCategoryStore.refresh().then(function () {
      todasCategorias = erpCategoryStore.getCache();
      nomeInput.value = p.nome;
      produtoEditandoId.value = String(p.id);
      codigoInput.value = codigoFormatado(p.id);
      btnSalvar.textContent = "Salvar Alterações";
      btnCancelarEdicao.style.display = "inline-block";
      atualizarDropdownLabel();
      atualizarChips();
      var container = document.querySelector(".container");
      if (container && container.scrollIntoView) container.scrollIntoView({ behavior: "smooth", block: "start" });
      nomeInput.focus();
    });
  }

  function excluirProduto(id, nome) {
    if (!window.api || !window.api.removerProduto) { mostrarMensagem("API indisponível.", "erro"); return; }
    if (!confirm('Excluir o produto "' + nome + '"? Esta ação não pode ser desfeita.')) return;
    window.api.removerProduto(id).then(function () {
      mostrarMensagem("Produto excluído com sucesso!", "sucesso");
      carregarProdutos(); atualizarCodigoNovo();
    }).catch(function (err) { mostrarMensagem("Erro ao excluir: " + err, "erro"); });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    mensagem.className = "mensagem"; mensagem.style.display = "none";
    if (salvando) return;
    var nomeProduto = nomeInput.value.trim();
    if (!nomeProduto) { mostrarMensagem("Nome do produto é obrigatório.", "erro"); nomeInput.focus(); return; }
    var categoriasSel = coletarSelecionados().map(function (id) { return parseInt(id, 10); });
    var dados = {
      nome: nomeProduto,
      categoria: null, categoria_id: null, subcategoria_id: null,
      categoriasSelecionadas: categoriasSel,
      variacoes: []
    };
    salvando = true; btnSalvar.disabled = true; btnSalvar.textContent = "Salvando...";
    var editandoId = produtoEditandoId.value;
    if (!window.api || !window.api.salvarProduto || !window.api.atualizarProduto) {
      mostrarMensagem("API não disponível.", "erro");
      btnSalvar.disabled = false; btnSalvar.textContent = "Salvar Produto"; salvando = false; return;
    }
    var operacao = editandoId ? window.api.atualizarProduto(editandoId, dados) : window.api.salvarProduto(dados);
    operacao.then(function () {
      mostrarMensagem(editandoId ? "Produto atualizado com sucesso!" : "Produto salvo com sucesso!", "sucesso");
      form.reset(); limparEdicao(); erpCategoryStore.refresh(); carregarProdutos(); atualizarCodigoNovo();
      btnSalvar.disabled = false; salvando = false; nomeInput.focus();
    }).catch(function (err) {
      mostrarMensagem("Erro ao salvar: " + err, "erro");
      btnSalvar.disabled = false;
      btnSalvar.textContent = editandoId ? "Salvar Alterações" : "Salvar Produto";
      salvando = false;
    });
  });

  btnLimpar.addEventListener("click", function () {
    form.reset(); limparEdicao(); erpCategoryStore.refresh();
    mensagem.className = "mensagem"; mensagem.style.display = "none"; atualizarCodigoNovo();
  });

  btnCancelarEdicao.addEventListener("click", function () {
    limparEdicao(); form.reset(); erpCategoryStore.refresh();
    mensagem.className = "mensagem"; mensagem.style.display = "none"; atualizarCodigoNovo(); nomeInput.focus();
  });

  btnListaProdutos.addEventListener("click", abrirModal);
  if (btnListaCategorias) btnListaCategorias.addEventListener("click", function () { window.location.href = "categorias.html"; });
  btnFecharModal.addEventListener("click", fecharModal);
  modalLista.addEventListener("click", function (e) { if (e.target === modalLista) fecharModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modalLista.hasAttribute("hidden")) fecharModal(); });
  if (buscaProduto) buscaProduto.addEventListener("input", renderizarProdutos);

  function mostrarMensagem(texto, tipo) {
    mensagem.textContent = texto;
    mensagem.className = "mensagem " + (tipo === "sucesso" ? "success" : "error");
    mensagem.style.display = "block";
  }

  erpCategoryStore.refresh();
  carregarProdutos();
  atualizarCodigoNovo();
})();