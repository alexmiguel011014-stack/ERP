(function () {
  var form = document.getElementById("formCliente");
  var listaClientes = document.getElementById("listaClientes");
  var mensagem = document.getElementById("mensagem");
  var btnSalvar = form.querySelector('button[type="submit"]');

  var carregando = false;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    mensagem.className = "mensagem";
    mensagem.style.display = "none";

    if (carregando) return;

    var nome = document.getElementById("nome").value.trim();
    var telefone = document.getElementById("telefone").value.trim();
    var academia = document.getElementById("academia").value.trim();
    var faixa = document.getElementById("faixa").value;

    if (!nome) {
      mostrarMensagem("Nome e obrigatório.", "erro");
      return;
    }

    var dados = {
      nome: nome,
      telefone: telefone || null,
      academia: academia || null,
      faixa: faixa || null,
    };

    carregando = true;
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";

    if (!window.api || !window.api.salvarCliente) {
      mostrarMensagem("API indisponvel.", "erro");
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar Cliente";
      carregando = false;
      return;
    }

    window.api
      .salvarCliente(dados)
      .then(function () {
        mostrarMensagem("Cliente salvo com sucesso!", "sucesso");
        form.reset();
        carregarClientes();
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar Cliente";
        carregando = false;
      })
      .catch(function (err) {
        mostrarMensagem("Erro ao salvar: " + err, "erro");
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar Cliente";
        carregando = false;
      });
  });

  document.getElementById("btnLimpar").addEventListener("click", function () {
    mensagem.className = "mensagem";
    mensagem.style.display = "none";
  });

  function carregarClientes() {
    if (!window.api || !window.api.getClientes) {
      listaClientes.innerHTML = '<div class="empty-state">API indisponvel.</div>';
      return;
    }

    window.api
      .getClientes()
      .then(function (clientes) {
        listaClientes.innerHTML = "";

        if (!clientes || clientes.length === 0) {
          listaClientes.innerHTML = '<div class="empty-state">Nenhum cliente cadastrado ainda.</div>';
          return;
        }

        clientes.forEach(function (c) {
          var div = document.createElement("div");
          div.className = "lista-item";

          var info = document.createElement("div");
          info.className = "cliente-info";

          var nomeEl = document.createElement("div");
          nomeEl.className = "cliente-nome";
          nomeEl.textContent = c.nome;

          var detailEl = document.createElement("div");
          detailEl.className = "cliente-detail";
          var parts = [];
          if (c.telefone) parts.push(c.telefone);
          if (c.academia) parts.push(c.academia);
          if (c.faixa) parts.push("Faixa: " + c.faixa);
          detailEl.textContent = parts.join(" | ");

          info.appendChild(nomeEl);
          info.appendChild(detailEl);

          var btnRemover = document.createElement("button");
          btnRemover.type = "button";
          btnRemover.className = "btn-remover";
          btnRemover.textContent = "Remover";
          btnRemover.addEventListener("click", function () {
            removerCliente(c.id, c.nome);
          });

          div.appendChild(info);
          div.appendChild(btnRemover);
          listaClientes.appendChild(div);
        });
      })
      .catch(function () {
        listaClientes.innerHTML = '<div class="empty-state">Erro ao carregar clientes.</div>';
      });
  }

  function removerCliente(id, nome) {
    if (!confirm("Remover o cliente \"" + nome + "\"? Esta ação não pode ser desfeita.")) {
      return;
    }

    if (!window.api || !window.api.removerCliente) {
      mostrarMensagem("API indisponvel.", "erro");
      return;
    }

    window.api
      .removerCliente(id)
      .then(function () {
        mostrarMensagem("Cliente removido.", "sucesso");
        carregarClientes();
      })
      .catch(function (err) {
        mostrarMensagem("Erro ao remover: " + err, "erro");
      });
  }

  function mostrarMensagem(texto, tipo) {
    mensagem.textContent = texto;
    mensagem.className = "mensagem " + tipo;
    mensagem.style.display = "block";
    setTimeout(function () {
      mensagem.style.display = "none";
    }, 4000);
  }

  carregarClientes();
})();