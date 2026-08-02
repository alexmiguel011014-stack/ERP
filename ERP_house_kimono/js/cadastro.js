(function () {
  var form = document.getElementById("formProduto");
  var nomeInput = document.getElementById("nome");
  var categoriaSelect = document.getElementById("categoria");
  var subcategoriaSelect = document.getElementById("subcategoria");
  var btnNovaCategoria = document.getElementById("btnNovaCategoria");
  var btnNovaSubcategoria = document.getElementById("btnNovaSubcategoria");
  var painelNovaCategoria = document.getElementById("painelNovaCategoria");
  var painelNovaSubcategoria = document.getElementById("painelNovaSubcategoria");
  var nomeNovaCategoria = document.getElementById("nomeNovaCategoria");
  var nomeNovaSubcategoria = document.getElementById("nomeNovaSubcategoria");
  var btnSalvarNovaCategoria = document.getElementById("btnSalvarNovaCategoria");
  var btnSalvarNovaSubcategoria = document.getElementById("btnSalvarNovaSubcategoria");
  var btnCancelarNovaCategoria = document.getElementById("btnCancelarNovaCategoria");
  var btnCancelarNovaSubcategoria = document.getElementById("btnCancelarNovaSubcategoria");
  var btnLimpar = document.getElementById("btnLimpar");
  var btnCancelarEdicao = document.getElementById("btnCancelarEdicao");
  var mensagem = document.getElementById("mensagem");
  var btnSalvar = form.querySelector('button[type="submit"]');
  var produtoEditandoId = document.getElementById("produtoEditandoId");
  var buscaProduto = document.getElementById("buscaProduto");
  var tbodyProdutos = document.getElementById("corpoProdutos");
  var avisoProdutos = document.getElementById("avisoProdutos");

  var salvando = false;
  var categoriasCarregadas = [];
  var produtosCarregados = [];

  function carregarCategorias() {
    if (!window.api || !window.api.getCategorias) return Promise.resolve([]);
    return window.api
      .getCategorias()
      .then(function (cats) {
        categoriasCarregadas = Array.isArray(cats) ? cats : [];
        preencherCategorias();
        return categoriasCarregadas;
      })
      .catch(function (err) {
        console.error("Erro ao carregar categorias:", err);
        return [];
      });
  }

  function preencherCategorias() {
    var catAtual = categoriaSelect.value;
    categoriaSelect.innerHTML = '<option value="">Selecione a categoria</option>';
    categoriasCarregadas.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.nome;
      categoriaSelect.appendChild(opt);
    });
    if (catAtual) categoriaSelect.value = catAtual;
    preencherSubcategorias();
  }

  function preencherSubcategorias() {
    var subAtual = subcategoriaSelect.value;
    var catId = parseInt(categoriaSelect.value, 10) || null;
    subcategoriaSelect.innerHTML = '<option value="">Selecione a subcategoria</option>';
    subcategoriaSelect.disabled = !catId;

    if (catId) {
      var cat = null;
      for (var i = 0; i < categoriasCarregadas.length; i++) {
        if (categoriasCarregadas[i].id === catId) {
          cat = categoriasCarregadas[i];
          break;
        }
      }
      var subs = (cat && cat.subcategorias) || [];
      subs.forEach(function (s) {
        var opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.nome;
        subcategoriaSelect.appendChild(opt);
      });
      if (subAtual) subcategoriaSelect.value = subAtual;
    }
  }

  function salvarCategoriaUi(nome, paiId) {
    if (!window.api || !window.api.salvarCategoria) {
      mostrarMensagem("API indisponível.", "erro");
      return Promise.reject(new Error("API indisponível."));
    }
    return window.api
      .salvarCategoria(nome, paiId)
      .then(function (resultado) {
        return window.api.getCategorias().then(function (cats) {
          categoriasCarregadas = Array.isArray(cats) ? cats : [];
          preencherCategorias();
          var alvo = paiId ? subcategoriaSelect : categoriaSelect;
          alvo.value = String(resultado.id);
          preencherSubcategorias();
          mostrarMensagem("Categoria salva com sucesso!", "sucesso");
        });
      })
      .catch(function (err) {
        mostrarMensagem("Erro ao salvar categoria: " + err, "erro");
        throw err;
      });
  }

  function fecharPainelCategoria(painel, input) {
    painel.hidden = true;
    input.value = "";
  }

  function salvarCategoriaPeloPainel(input, painel, paiId) {
    var nome = input.value.trim();
    if (!nome) {
      mostrarMensagem("Informe o nome da categoria.", "erro");
      input.focus();
      return;
    }

    salvarCategoriaUi(nome, paiId)
      .then(function () {
        fecharPainelCategoria(painel, input);
      })
      .catch(function () {});
  }

  function esc(texto) {
    return String(texto == null ? "" : texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function categoriaExibida(p) {
    var partes = [];
    if (p.categoria_nome) partes.push(p.categoria_nome);
    if (p.subcategoria_nome) partes.push(p.subcategoria_nome);
    if (partes.length === 0 && p.categoria_legada) partes.push(p.categoria_legada);
    return partes.join(" / ") || "---";
  }

  function carregarProdutos() {
    if (!window.api || !window.api.listarProdutosDetalhados) {
      if (avisoProdutos) avisoProdutos.innerHTML = "API indisponível.";
      return;
    }

    window.api
      .listarProdutosDetalhados()
      .then(function (dados) {
        produtosCarregados = Array.isArray(dados) ? dados : [];
        renderizarProdutos();
      })
      .catch(function (err) {
        if (avisoProdutos) avisoProdutos.innerHTML = "Erro ao carregar produtos: " + esc(err);
      });
  }

  function renderizarProdutos() {
    if (!tbodyProdutos) return;
    tbodyProdutos.innerHTML = "";
    if (avisoProdutos) avisoProdutos.innerHTML = "";

    var filtro = (buscaProduto.value || "").trim().toLowerCase();

    var produtosFiltrados = produtosCarregados.filter(function (p) {
      if (!filtro) return true;
      var texto = [
        p.nome,
        p.categoria_nome || "",
        p.subcategoria_nome || "",
        p.categoria_legada || "",
      ]
        .join(" ")
        .toLowerCase();
      return texto.indexOf(filtro) !== -1;
    });

    if (produtosFiltrados.length === 0) {
      tbodyProdutos.innerHTML =
        '<tr><td colspan="3"><div class="empty-state">' +
        (produtosCarregados.length === 0
          ? "Nenhum produto cadastrado ainda."
          : "Nenhum produto encontrado para a busca.") +
        "</div></td></tr>";
      return;
    }

    produtosFiltrados.forEach(function (p) {
      var tr = document.createElement("tr");

      var tdNome = document.createElement("td");
      tdNome.innerHTML = '<span class="prod-nome">' + esc(p.nome) + "</span>";
      tr.appendChild(tdNome);

      var tdCat = document.createElement("td");
      tdCat.innerHTML = '<span class="prod-cat">' + esc(categoriaExibida(p)) + "</span>";
      tr.appendChild(tdCat);

      var tdAcoes = document.createElement("td");
      var btnEditar = document.createElement("button");
      btnEditar.type = "button";
      btnEditar.className = "btn btn-small btn-editar";
      btnEditar.textContent = "Editar";
      btnEditar.addEventListener("click", function () {
        editarProduto(p.id);
      });

      var btnExcluir = document.createElement("button");
      btnExcluir.type = "button";
      btnExcluir.className = "btn btn-small btn-excluir";
      btnExcluir.textContent = "Excluir";
      btnExcluir.addEventListener("click", function () {
        excluirProduto(p.id, p.nome);
      });

      var acoes = document.createElement("div");
      acoes.className = "acoes-prod";
      acoes.appendChild(btnEditar);
      acoes.appendChild(btnExcluir);
      tdAcoes.appendChild(acoes);
      tr.appendChild(tdAcoes);

      tbodyProdutos.appendChild(tr);
    });
  }

  function limparEdicao() {
    produtoEditandoId.value = "";
    btnSalvar.textContent = "Salvar Produto";
    btnCancelarEdicao.style.display = "none";
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

    carregarCategorias().then(function () {
      nomeInput.value = p.nome;

      var catSelecionada = false;
      if (p.categoria_id) {
        categoriaSelect.value = String(p.categoria_id);
        preencherSubcategorias();
        if (p.subcategoria_id) subcategoriaSelect.value = String(p.subcategoria_id);
        catSelecionada = true;
      } else if (p.categoria_legada) {
        var cat = null;
        for (var j = 0; j < categoriasCarregadas.length; j++) {
          if (String(categoriasCarregadas[j].nome).toLowerCase() === String(p.categoria_legada).toLowerCase()) {
            cat = categoriasCarregadas[j];
            break;
          }
        }
        if (cat) {
          categoriaSelect.value = String(cat.id);
          preencherSubcategorias();
          catSelecionada = true;
        }
      }
      if (!catSelecionada) {
        categoriaSelect.value = "";
        preencherSubcategorias();
      }

      produtoEditandoId.value = String(p.id);
      btnSalvar.textContent = "Salvar Alterações";
      btnCancelarEdicao.style.display = "inline-block";

      var container = document.querySelector(".container");
      if (container && container.scrollIntoView) {
        container.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      nomeInput.focus();
    });
  }

  function excluirProduto(id, nome) {
    if (!window.api || !window.api.removerProduto) {
      mostrarMensagem("API indisponível.", "erro");
      return;
    }
    var confirmado = confirm('Excluir o produto "' + nome + '"? Esta ação não pode ser desfeita.');
    if (!confirmado) return;

    window.api
      .removerProduto(id)
      .then(function () {
        mostrarMensagem("Produto excluído com sucesso!", "sucesso");
        carregarProdutos();
      })
      .catch(function (err) {
        mostrarMensagem("Erro ao excluir: " + err, "erro");
      });
  }

  btnNovaCategoria.addEventListener("click", function () {
    painelNovaSubcategoria.hidden = true;
    painelNovaCategoria.hidden = !painelNovaCategoria.hidden;
    if (!painelNovaCategoria.hidden) nomeNovaCategoria.focus();
  });

  btnNovaSubcategoria.addEventListener("click", function () {
    if (!categoriaSelect.value) {
      mostrarMensagem("Selecione uma categoria antes de criar a subcategoria.", "erro");
      return;
    }
    painelNovaCategoria.hidden = true;
    painelNovaSubcategoria.hidden = !painelNovaSubcategoria.hidden;
    if (!painelNovaSubcategoria.hidden) nomeNovaSubcategoria.focus();
  });

  btnSalvarNovaCategoria.addEventListener("click", function () {
    salvarCategoriaPeloPainel(nomeNovaCategoria, painelNovaCategoria, null);
  });

  btnSalvarNovaSubcategoria.addEventListener("click", function () {
    salvarCategoriaPeloPainel(
      nomeNovaSubcategoria,
      painelNovaSubcategoria,
      parseInt(categoriaSelect.value, 10) || null
    );
  });

  btnCancelarNovaCategoria.addEventListener("click", function () {
    fecharPainelCategoria(painelNovaCategoria, nomeNovaCategoria);
  });

  btnCancelarNovaSubcategoria.addEventListener("click", function () {
    fecharPainelCategoria(painelNovaSubcategoria, nomeNovaSubcategoria);
  });

  categoriaSelect.addEventListener("change", preencherSubcategorias);

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

    var dados = {
      nome: nomeProduto,
      categoria: null,
      categoria_id: parseInt(categoriaSelect.value, 10) || null,
      subcategoria_id: parseInt(subcategoriaSelect.value, 10) || null,
      variacoes: [],
    };

    salvando = true;
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";

    var editandoId = produtoEditandoId.value;

    if (window.api && window.api.salvarProduto && window.api.atualizarProduto) {
      var operacao = editandoId
        ? window.api.atualizarProduto(editandoId, dados)
        : window.api.salvarProduto(dados);

      operacao
        .then(function () {
          mostrarMensagem(
            editandoId
              ? "Produto atualizado com sucesso!"
              : "Produto salvo com sucesso!",
            "sucesso"
          );
          form.reset();
          limparEdicao();
          preencherCategorias();
          carregarProdutos();
          btnSalvar.disabled = false;
          salvando = false;
          nomeInput.focus();
        })
        .catch(function (err) {
          mostrarMensagem("Erro ao salvar: " + err, "erro");
          btnSalvar.disabled = false;
          salvando = false;
        });
    } else {
      mostrarMensagem("API não disponível. Verifique o preload.", "erro");
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar Produto";
      salvando = false;
    }
  });

  btnLimpar.addEventListener("click", function () {
    form.reset();
    limparEdicao();
    preencherCategorias();
    mensagem.className = "mensagem";
    mensagem.style.display = "none";
  });

  btnCancelarEdicao.addEventListener("click", function () {
    limparEdicao();
    form.reset();
    preencherCategorias();
    mensagem.className = "mensagem";
    mensagem.style.display = "none";
    nomeInput.focus();
  });

  if (buscaProduto) {
    buscaProduto.addEventListener("input", renderizarProdutos);
  }

  function mostrarMensagem(texto, tipo) {
    mensagem.textContent = texto;
    mensagem.className = "mensagem " + tipo;
    mensagem.style.display = "block";
  }

  carregarCategorias();
  carregarProdutos();
})();
