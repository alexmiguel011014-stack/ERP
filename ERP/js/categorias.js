(function () {
  var form = document.getElementById("formCategoria");
  var nomeInput = document.getElementById("nomeCategoria");
  var paiSelect = document.getElementById("categoriaPai");
  var tbody = document.getElementById("corpoCategorias");
  var avisoCategorias = document.getElementById("avisoCategorias");
  var mensagem = document.getElementById("mensagem");
  var btnLimpar = document.getElementById("btnLimpar");
  var btnSalvar = form.querySelector('button[type="submit"]');
  var avisoSub = document.getElementById("avisoSub");
  var grupoNome = document.getElementById("grupoNome");
  var buscaCategoria = document.getElementById("buscaCategoria");
  var salvando = false;

  var categoriasCarregadas = [];

  function esc(texto) {
    return String(texto == null ? "" : texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function mostrarMensagem(texto, tipo) {
    mensagem.textContent = texto;
    mensagem.className = "mensagem " + (tipo === "sucesso" ? "success" : "error");
    mensagem.style.display = "block";
  }

  function preencherSelectPai(cats) {
    var atual = paiSelect.value;
    paiSelect.innerHTML = '<option value="">Categoria principal (cria novo grupo)</option>';
    cats.forEach(function (c) {
      if (!c.categoria_pai_id) {
        var opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.nome;
        paiSelect.appendChild(opt);
      }
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
      btnSalvar.textContent = "Adicionar Atributo";
      if (avisoSub) {
        avisoSub.innerHTML =
          "Os novos atributos serão adicionados a: <strong>" +
          esc(paiSelect.options[paiSelect.selectedIndex].textContent) +
          "</strong> (máx. 2 níveis). Preencha o nome e salve.";
      }
    } else {
      nomeInput.setAttribute("required", "");
      btnSalvar.textContent = "Salvar";
      if (avisoSub) {
        avisoSub.innerHTML =
          "Selecione um grupo para adicionar atributos a ele (máx. 2 níveis).";
      }
    }
  }

  function carregarCategorias() {
    if (avisoCategorias) avisoCategorias.innerHTML = "Carregando...";
    erpCategoryStore.getCategoriasFlux().then(function (lista) {
      categoriasCarregadas = Array.isArray(lista) ? lista : [];
      preencherSelectPai(categoriasCarregadas);
      renderizarTabela();
    }).catch(function (err) {
      if (avisoCategorias) avisoCategorias.innerHTML = "Erro ao carregar categorias: " + esc(err);
    });
  }

  erpCategoryStore.onChange(function (lista) {
    categoriasCarregadas = lista;
    preencherSelectPai(lista);
    renderizarTabela();
  });

  function renderizarTabela() {
    if (avisoCategorias) avisoCategorias.innerHTML = "";
    tbody.innerHTML = "";

    var filtro = (buscaCategoria.value || "").trim().toLowerCase();
    var filtradas = categoriasCarregadas.filter(function (c) {
      if (!filtro) return true;
      var texto = [c.codigo, c.nome, c.categoria_pai_nome || ""].join(" ").toLowerCase();
      return texto.indexOf(filtro) !== -1;
    });

    if (filtradas.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5"><div class="empty-state">' +
        (categoriasCarregadas.length === 0
          ? "Nenhuma categoria cadastrada ainda."
          : "Nenhuma categoria encontrada para a busca.") +
        "</div></td></tr>";
      return;
    }

    filtradas.forEach(function (c) {
      var tr = document.createElement("tr");

      var tdCodigo = document.createElement("td");
      tdCodigo.innerHTML = '<span class="cat-codigo">' + esc(c.codigo) + "</span>";
      tr.appendChild(tdCodigo);

      var tdNome = document.createElement("td");
      var nomeBox = document.createElement("div");
      nomeBox.className = "cat-nome-box";
      nomeBox.innerHTML = '<span class="cat-nome">' + esc(c.nome) + "</span>";
      if (c.categoria_pai_nome) {
        nomeBox.innerHTML +=
          ' <span class="cat-pai-em">(em ' + esc(c.categoria_pai_nome) + ")</span>";
      }
      tdNome.appendChild(nomeBox);
      tr.appendChild(tdNome);

      var tdTipo = document.createElement("td");
      tdTipo.innerHTML =
        c.tipo === "subcategoria"
          ? '<span class="tag tag-sub">atributo</span>'
          : '<span class="tag tag-grupo">grupo</span>';
      tr.appendChild(tdTipo);

      var tdUso = document.createElement("td");
      tdUso.innerHTML =
        '<span class="uso-badge ' +
        (c.uso_count > 0 ? "uso-active" : "uso-zero") +
        '">' +
        c.uso_count +
        "</span>";
      tr.appendChild(tdUso);

      var tdAcoes = document.createElement("td");
      var btnExcluir = document.createElement("button");
      btnExcluir.type = "button";
      btnExcluir.className = "btn btn-small btn-excluir";
      btnExcluir.textContent = "Excluir";
      btnExcluir.addEventListener("click", function () {
        excluirCategoria(c.id, c.nome, c.uso_count);
      });
      tdAcoes.appendChild(btnExcluir);
      tr.appendChild(tdAcoes);

      tbody.appendChild(tr);
    });
  }

  function excluirCategoria(id, nome, uso) {
    if (!window.api || !window.api.removerCategoria) {
      mostrarMensagem("API indisponível.", "erro");
      return;
    }
    if (uso > 0) {
      mostrarMensagem(
        'A categoria "' + nome + '" está vinculada a ' + uso + " produto(s). Remova as vinculações antes.",
        "erro"
      );
      return;
    }
    var confirmado = confirm('Excluir a categoria "' + nome + '"? Esta ação não pode ser desfeita.');
    if (!confirmado) return;

    window.api
      .removerCategoria(id)
      .then(function () {
        mostrarMensagem("Categoria excluída com sucesso!", "sucesso");
        carregarCategorias();
      })
      .catch(function (err) {
        mostrarMensagem("Erro ao excluir: " + err, "erro");
      });
  }

  paiSelect.addEventListener("change", atualizarModo);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (salvando) return;

    var nome = nomeInput.value.trim();
    var paiId = parseInt(paiSelect.value, 10) || null;

    if (!nome && !paiId) {
      mostrarMensagem("Informe o nome da categoria.", "erro");
      nomeInput.focus();
      return;
    }
    if (!nome && paiId) {
      mostrarMensagem("Informe o nome do atributo.", "erro");
      nomeInput.focus();
      return;
    }

    salvando = true;
    btnSalvar.disabled = true;

    if (!window.api || !window.api.salvarCategoria) {
      mostrarMensagem("API indisponível.", "erro");
      salvando = false;
      btnSalvar.disabled = false;
      return;
    }

    window.api
      .salvarCategoria(nome, paiId)
      .then(function () {
        mostrarMensagem(paiId ? "Atributo adicionado!" : "Categoria criada!", "sucesso");
        nomeInput.value = "";
        paiSelect.value = "";
        atualizarModo();
        carregarCategorias();
        if (!paiId) nomeInput.focus();
      })
      .catch(function (err) {
        mostrarMensagem("Erro ao salvar: " + err, "erro");
      })
      .then(function () {
        salvando = false;
        btnSalvar.disabled = false;
      });
  });

  btnLimpar.addEventListener("click", function () {
    nomeInput.value = "";
    paiSelect.value = "";
    atualizarModo();
    mensagem.className = "mensagem";
    mensagem.style.display = "none";
  });

  if (buscaCategoria) {
    buscaCategoria.addEventListener("input", renderizarTabela);
  }

  carregarCategorias();
})();