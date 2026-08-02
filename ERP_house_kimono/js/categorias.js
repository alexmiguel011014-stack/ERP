(function () {
  var form = document.getElementById("formCategoria");
  var nomeInput = document.getElementById("nomeCategoria");
  var paiSelect = document.getElementById("categoriaPai");
  var listaSubcategorias = document.getElementById("listaSubcategorias");
  var btnAddSubcategoria = document.getElementById("btnAddSubcategoria");
  var lista = document.getElementById("listaCategorias");
  var mensagem = document.getElementById("mensagem");
  var btnLimpar = document.getElementById("btnLimpar");
  var btnSalvar = form.querySelector('button[type="submit"]');
  var avisoSub = document.getElementById("avisoSub");
  var grupoNome = document.getElementById("grupoNome");
  var salvando = false;

  function esc(texto) {
    return String(texto == null ? "" : texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function adicionarLinhaSubcategoria(nome) {
    var div = document.createElement("div");
    div.className = "subcategoria-linha";

    var input = document.createElement("input");
    input.type = "text";
    input.className = "subcategoria-input";
    input.placeholder = "Ex: Masculino, Feminino, Infantil...";
    input.value = nome || "";

    var btnRemover = document.createElement("button");
    btnRemover.type = "button";
    btnRemover.className = "btn btn-remover-sub";
    btnRemover.textContent = "x";
    btnRemover.title = "Remover subcategoria";
    btnRemover.addEventListener("click", function () {
      div.remove();
    });

    div.appendChild(input);
    div.appendChild(btnRemover);
    listaSubcategorias.appendChild(div);
    input.focus();
  }

  function coletarSubcategorias() {
    var inputs = listaSubcategorias.querySelectorAll(".subcategoria-input");
    var nomes = [];
    for (var i = 0; i < inputs.length; i++) {
      var n = inputs[i].value.trim();
      if (n) nomes.push(n);
    }
    return nomes;
  }

  function preencherSelectPai(cats) {
    var atual = paiSelect.value;
    paiSelect.innerHTML = '<option value="">Nenhuma (criar categoria principal)</option>';
    cats.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.nome;
      paiSelect.appendChild(opt);
    });
    if (atual) paiSelect.value = atual;
    atualizarModo();
  }

  function atualizarModo() {
    var temPai = !!paiSelect.value;
    if (grupoNome) grupoNome.hidden = temPai;
    nomeInput.hidden = temPai;
    if (temPai) {
      nomeInput.removeAttribute("required");
      btnSalvar.textContent = "Salvar Subcategorias";
      if (avisoSub) {
        avisoSub.innerHTML =
          "As subcategorias abaixo serão adicionadas a: <strong>" +
          esc(paiSelect.options[paiSelect.selectedIndex].textContent) +
          "</strong> (máx. 2 níveis).";
      }
    } else {
      nomeInput.setAttribute("required", "");
      btnSalvar.textContent = "Salvar Categoria";
      if (avisoSub) {
        avisoSub.innerHTML =
          "Selecione uma categoria principal para adicionar subcategorias a ela (máx. 2 níveis).";
      }
    }
  }

  function renderizarHierarquia(cats) {
    lista.innerHTML = "";

    if (!cats || cats.length === 0) {
      lista.innerHTML = '<div class="empty-state">Nenhuma categoria cadastrada.</div>';
      return;
    }

    cats.forEach(function (c) {
      var div = document.createElement("div");
      div.className = "cat-item";
      div.innerHTML = '<span class="cat-nome">' + esc(c.nome) + "</span>";

      var subs = c.subcategorias || [];
      if (subs.length > 0) {
        var ul = document.createElement("ul");
        ul.className = "cat-subs";
        subs.forEach(function (s) {
          var li = document.createElement("li");
          li.innerHTML = '<span class="cat-sub-nome">' + esc(s.nome) + "</span>";
          ul.appendChild(li);
        });
        div.appendChild(ul);
      }

      lista.appendChild(div);
    });
  }

  function carregarCategorias() {
    if (!window.api || !window.api.getCategorias) {
      lista.innerHTML = '<div class="empty-state">API indisponível.</div>';
      return;
    }

    lista.innerHTML = '<div class="empty-state">Carregando...</div>';

    window.api
      .getCategorias()
      .then(function (cats) {
        cats = Array.isArray(cats) ? cats : [];
        preencherSelectPai(cats);
        renderizarHierarquia(cats);
      })
      .catch(function (err) {
        lista.innerHTML = '<div class="empty-state">Erro ao carregar categorias: ' + esc(err) + "</div>";
      });
  }

  function mostrarMensagem(texto, tipo) {
    mensagem.textContent = texto;
    mensagem.className = "mensagem " + tipo;
    mensagem.style.display = "block";
  }

  btnAddSubcategoria.addEventListener("click", function () {
    adicionarLinhaSubcategoria("");
  });

  paiSelect.addEventListener("change", atualizarModo);

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    if (salvando) return;

    var nome = nomeInput.value.trim();
    var paiId = parseInt(paiSelect.value, 10) || null;
    var subcategorias = coletarSubcategorias();

    if (!nome && subcategorias.length === 0) {
      mostrarMensagem("Informe o nome da categoria ou ao menos uma subcategoria.", "erro");
      if (!paiId) nomeInput.focus();
      return;
    }

    if (nome && paiId && subcategorias.length > 0) {
      mostrarMensagem("Não é possível criar subcategorias dentro de uma subcategoria (máximo de 2 níveis).", "erro");
      return;
    }

    salvando = true;
    btnSalvar.disabled = true;

    if (!window.api || !window.api.salvarCategoriaComSubcategorias) {
      mostrarMensagem("API indisponível.", "erro");
      salvando = false;
      btnSalvar.disabled = false;
      return;
    }

    window.api
      .salvarCategoriaComSubcategorias({
        nome: nome || null,
        categoriaPaiId: paiId,
        subcategorias: subcategorias,
      })
      .then(function () {
        var total = subcategorias.length + (nome ? 1 : 0);
        mostrarMensagem(
          total > 1
            ? total + " categorias salvas com sucesso!"
            : "Categoria salva com sucesso!",
          "sucesso"
        );
        nomeInput.value = "";
        paiSelect.value = "";
        listaSubcategorias.innerHTML = "";
        atualizarModo();
        carregarCategorias();
        if (!paiId) nomeInput.focus();
      })
      .catch(function (err) {
        mostrarMensagem("Erro ao salvar categoria: " + err, "erro");
      })
      .then(function () {
        salvando = false;
        btnSalvar.disabled = false;
      });
  });

  btnLimpar.addEventListener("click", function () {
    nomeInput.value = "";
    paiSelect.value = "";
    listaSubcategorias.innerHTML = "";
    atualizarModo();
    mensagem.className = "mensagem";
    mensagem.style.display = "none";
  });

  carregarCategorias();
})();
