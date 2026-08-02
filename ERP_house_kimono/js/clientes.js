(function () {
  var form = document.getElementById("formCliente");
  var nomeInput = document.getElementById("nome");
  var codigoInput = document.getElementById("codigoCliente");
  var cpfCnpjInput = document.getElementById("cpf_cnpj");
  var telefoneInput = document.getElementById("telefone");
  var emailInput = document.getElementById("email");
  var academiaInput = document.getElementById("academia");
  var faixaSelect = document.getElementById("faixa");
  var clienteEditandoId = document.getElementById("clienteEditandoId");
  var btnSalvar = form.querySelector('button[type="submit"]');
  var btnLimpar = document.getElementById("btnLimpar");
  var btnCancelarEdicao = document.getElementById("btnCancelarEdicao");
  var mensagem = document.getElementById("mensagem");
  var buscaCliente = document.getElementById("buscaCliente");
  var totalClientes = document.getElementById("totalClientes");
  var tbody = document.getElementById("corpoClientes");

  var salvando = false;
  var clientes = [];

  function esc(t) {
    return String(t == null ? "" : t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  /* ==================== Máscaras ==================== */

  function mascaraTelefone(v) {
    v = v.replace(/\D/g, "");
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length > 7) return "(" + v.slice(0,2) + ") " + v.slice(2,7) + "-" + v.slice(7);
    if (v.length > 2) return "(" + v.slice(0,2) + ") " + v.slice(2);
    return v;
  }

  function mascaraCPF_CNPJ(v) {
    v = v.replace(/\D/g, "");
    if (v.length > 14) v = v.slice(0, 14);
    if (v.length <= 11) {
      if (v.length > 9) return v.slice(0,3)+"."+v.slice(3,6)+"."+v.slice(6,9)+"-"+v.slice(9);
      if (v.length > 6) return v.slice(0,3)+"."+v.slice(3,6)+"."+v.slice(6);
      if (v.length > 3) return v.slice(0,3)+"."+v.slice(3);
    } else {
      if (v.length > 12) return v.slice(0,2)+"."+v.slice(2,5)+"."+v.slice(5,8)+"/"+v.slice(8,12)+"-"+v.slice(12);
      if (v.length > 8) return v.slice(0,2)+"."+v.slice(2,5)+"."+v.slice(5,8)+"/"+v.slice(8);
      if (v.length > 5) return v.slice(0,2)+"."+v.slice(2,5)+"."+v.slice(5);
      if (v.length > 2) return v.slice(0,2)+"."+v.slice(2);
    }
    return v;
  }

  telefoneInput.addEventListener("input", function () {
    var cursor = telefoneInput.selectionStart;
    var antes = telefoneInput.value;
    telefoneInput.value = mascaraTelefone(telefoneInput.value);
    var diff = telefoneInput.value.length - antes.length;
    telefoneInput.setSelectionRange(cursor + diff, cursor + diff);
  });

  cpfCnpjInput.addEventListener("input", function () {
    var cursor = cpfCnpjInput.selectionStart;
    var antes = cpfCnpjInput.value;
    cpfCnpjInput.value = mascaraCPF_CNPJ(cpfCnpjInput.value);
    var diff = cpfCnpjInput.value.length - antes.length;
    cpfCnpjInput.setSelectionRange(cursor + diff, cursor + diff);
  });

  /* ==================== Código auto ==================== */

  function atualizarCodigoNovo() {
    if (clienteEditandoId.value) return;
    if (!window.api || !window.api.proximoCodigoCliente) {
      codigoInput.value = ""; codigoInput.placeholder = "#CLI0001"; return;
    }
    window.api.proximoCodigoCliente().then(function (c) {
      codigoInput.value = c;
    }).catch(function () {
      codigoInput.placeholder = "#CLI0001";
    });
  }

  function fmtCodigoCliente(id) { return "#CLI" + String(id).padStart(4, "0"); }

  /* ==================== Limpar / Cancelar edição ==================== */

  function limparEdicao() {
    clienteEditandoId.value = "";
    btnSalvar.textContent = "Salvar Cliente";
    btnCancelarEdicao.style.display = "none";
  }

  /* ==================== Carregar tabela ==================== */

  function carregarClientes() {
    if (!window.api || !window.api.getClientes) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state">API indisponível.</div></td></tr>';
      return;
    }
    window.api.getClientes().then(function (lista) {
      clientes = Array.isArray(lista) ? lista : [];
      renderizarTabela();
    }).catch(function () {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state">Erro ao carregar.</div></td></tr>';
    });
  }

  function renderizarTabela() {
    tbody.innerHTML = "";
    var q = (buscaCliente.value || "").trim().toLowerCase();
    var filtrados = clientes.filter(function (c) {
      if (!q) return true;
      var txt = [c.nome, c.telefone, c.academia, c.cpf_cnpj, c.email || ""].join(" ").toLowerCase();
      return txt.indexOf(q) !== -1;
    });

    totalClientes.textContent = filtrados.length + " cliente" + (filtrados.length !== 1 ? "s" : "");
    if (clientes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state">Nenhum cliente cadastrado.</div></td></tr>';
      totalClientes.textContent = "0 clientes";
      return;
    }
    if (filtrados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state">Nenhum resultado para a busca.</div></td></tr>';
      return;
    }

    filtrados.forEach(function (c) {
      var tr = document.createElement("tr");

      // Código
      var tdCod = document.createElement("td");
      tdCod.innerHTML = '<span class="cli-codigo">' + esc(fmtCodigoCliente(c.id)) + '</span>';
      tr.appendChild(tdCod);

      // Nome
      var tdNome = document.createElement("td");
      tdNome.innerHTML = '<span class="cli-nome">' + esc(c.nome) + '</span>';
      tr.appendChild(tdNome);

      // Telefone
      var tdTel = document.createElement("td");
      tdTel.innerHTML = c.telefone ? '<span class="cli-detail">' + esc(c.telefone) + '</span>' : '<span class="badge-empty">&mdash;</span>';
      tr.appendChild(tdTel);

      // Academia / Faixa
      var tdAf = document.createElement("td");
      var badBox = document.createElement("div");
      badBox.className = "badge-list";
      if (c.academia) {
        var b1 = document.createElement("span");
        b1.className = "badge badge-academia";
        b1.textContent = c.academia;
        badBox.appendChild(b1);
      }
      if (c.faixa) {
        var b2 = document.createElement("span");
        b2.className = "badge badge-faixa";
        b2.textContent = c.faixa;
        badBox.appendChild(b2);
      }
      if (!c.academia && !c.faixa) badBox.innerHTML = '<span class="badge-empty">&mdash;</span>';
      tdAf.appendChild(badBox);
      tr.appendChild(tdAf);

      // Ações
      var tdAcoes = document.createElement("td");
      var acoesDiv = document.createElement("div");
      acoesDiv.className = "acoes";

      var btnEditar = document.createElement("button");
      btnEditar.type = "button";
      btnEditar.className = "btn btn-small btn-editar";
      btnEditar.textContent = "Editar";
      btnEditar.addEventListener("click", function () { editarCliente(c.id); });
      acoesDiv.appendChild(btnEditar);

      var btnExcluir = document.createElement("button");
      btnExcluir.type = "button";
      btnExcluir.className = "btn btn-small btn-excluir";
      btnExcluir.textContent = "Excluir";
      btnExcluir.addEventListener("click", function () { excluirCliente(c.id, c.nome); });
      acoesDiv.appendChild(btnExcluir);

      tdAcoes.appendChild(acoesDiv);
      tr.appendChild(tdAcoes);

      tbody.appendChild(tr);
    });
  }

  /* ==================== Editar ==================== */

  function editarCliente(id) {
    var c = null;
    for (var i = 0; i < clientes.length; i++) {
      if (clientes[i].id === id) { c = clientes[i]; break; }
    }
    if (!c) { mostrarMensagem("Cliente não encontrado.", "error"); return; }

    clienteEditandoId.value = c.id;
    codigoInput.value = fmtCodigoCliente(c.id);
    nomeInput.value = c.nome || "";
    cpfCnpjInput.value = c.cpf_cnpj || "";
    telefoneInput.value = c.telefone || "";
    emailInput.value = c.email || "";
    academiaInput.value = c.academia || "";
    faixaSelect.value = c.faixa || "";
    btnSalvar.textContent = "Salvar Alterações";
    btnCancelarEdicao.style.display = "inline-block";
    nomeInput.focus();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ==================== Excluir ==================== */

  function excluirCliente(id, nome) {
    if (!confirm('Excluir "' + nome + '"? Esta ação não pode ser desfeita.')) return;
    if (!window.api || !window.api.removerCliente) { mostrarMensagem("API indisponível.", "error"); return; }
    window.api.removerCliente(id).then(function () {
      mostrarMensagem("Cliente removido.", "success");
      carregarClientes();
      atualizarCodigoNovo();
    }).catch(function (err) { mostrarMensagem("Erro: " + err, "error"); });
  }

  /* ==================== Salvar ==================== */

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    mensagem.className = "mensagem"; mensagem.style.display = "none";
    if (salvando) return;

    var nome = nomeInput.value.trim();
    if (!nome) { mostrarMensagem("Nome é obrigatório.", "error"); nomeInput.focus(); return; }

    var dados = {
      nome: nome,
      cpf_cnpj: cpfCnpjInput.value.replace(/\D/g, "").slice(0, 14) || null,
      telefone: telefoneInput.value.trim() || null,
      email: emailInput.value.trim() || null,
      academia: academiaInput.value.trim() || null,
      faixa: faixaSelect.value || null
    };

    salvando = true; btnSalvar.disabled = true;
    var editando = clienteEditandoId.value;

    if (editando) {
      if (!window.api || !window.api.atualizarCliente) { mostrarMensagem("API indisponível.", "error"); btnSalvar.disabled = false; salvando = false; return; }
      window.api.atualizarCliente(editando, dados).then(function () {
        mostrarMensagem("Cliente atualizado!", "success");
        form.reset(); limparEdicao(); carregarClientes(); atualizarCodigoNovo();
        btnSalvar.disabled = false; salvando = false; nomeInput.focus();
      }).catch(function (err) {
        mostrarMensagem("Erro: " + err, "error");
        btnSalvar.disabled = false; salvando = false;
      });
    } else {
      if (!window.api || !window.api.salvarCliente) { mostrarMensagem("API indisponível.", "error"); btnSalvar.disabled = false; salvando = false; return; }
      window.api.salvarCliente(dados).then(function () {
        mostrarMensagem("Cliente salvo!", "success");
        form.reset(); limparEdicao(); carregarClientes(); atualizarCodigoNovo();
        btnSalvar.disabled = false; salvando = false; nomeInput.focus();
      }).catch(function (err) {
        mostrarMensagem("Erro: " + err, "error");
        btnSalvar.disabled = false; salvando = false;
      });
    }
  });

  btnLimpar.addEventListener("click", function () {
    form.reset(); limparEdicao(); atualizarCodigoNovo();
    mensagem.className = "mensagem"; mensagem.style.display = "none";
  });

  btnCancelarEdicao.addEventListener("click", function () {
    form.reset(); limparEdicao(); atualizarCodigoNovo();
    mensagem.className = "mensagem"; mensagem.style.display = "none";
  });

  if (buscaCliente) buscaCliente.addEventListener("input", renderizarTabela);

  function mostrarMensagem(texto, tipo) {
    mensagem.textContent = texto;
    mensagem.className = "mensagem " + (tipo === "success" ? "success" : "error");
    mensagem.style.display = "block";
    setTimeout(function () { mensagem.style.display = "none"; }, 3500);
  }

  carregarClientes();
  atualizarCodigoNovo();
})();