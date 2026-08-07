(function () {
  "use strict";
  var form = document.getElementById("formCliente");
  var nomeInput = document.getElementById("nome");
  var codigoInput = document.getElementById("codigoCliente");
  var cpfCnpjInput = document.getElementById("cpf_cnpj");
  var enderecoInput = document.getElementById("endereco");
  var telefoneInput = document.getElementById("telefone");
  var emailInput = document.getElementById("email");
  var clienteEditandoId = document.getElementById("clienteEditandoId");
  var btnSalvar = document.getElementById("btnSalvar");
  var btnLimpar = document.getElementById("btnLimpar");
  var btnCancelarEdicao = document.getElementById("btnCancelarEdicao");
  var mensagem = document.getElementById("mensagem");
  var movimentacoesSection = document.getElementById("movimentacoesSection");
  var movimentacoesContainer = document.getElementById("movimentacoesContainer");
  var btnVerMovimentacoes = document.getElementById("btnVerMovimentacoes");
  var modal = document.getElementById("movimentacoesModal");
  var modalNome = document.getElementById("modalClienteNome");
  var modalMovimentacoes = document.getElementById("modalMovimentacoes");
  var modalClose = document.getElementById("modalClose");

  var salvando = false;

  function esc(t) {
    return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ==================== Máscaras ==================== */

  function mascaraTelefone(v) {
    v = v.replace(/\D/g, "");
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length > 7) return "(" + v.slice(0, 2) + ") " + v.slice(2, 7) + "-" + v.slice(7);
    if (v.length > 2) return "(" + v.slice(0, 2) + ") " + v.slice(2);
    return v;
  }

  function mascaraCPF_CNPJ(v) {
    v = v.replace(/\D/g, "");
    if (v.length > 14) v = v.slice(0, 14);
    if (v.length <= 11) {
      if (v.length > 9) return v.slice(0, 3) + "." + v.slice(3, 6) + "." + v.slice(6, 9) + "-" + v.slice(9);
      if (v.length > 6) return v.slice(0, 3) + "." + v.slice(3, 6) + "." + v.slice(6);
      if (v.length > 3) return v.slice(0, 3) + "." + v.slice(3);
    } else {
      if (v.length > 12) return v.slice(0, 2) + "." + v.slice(2, 5) + "." + v.slice(5, 8) + "/" + v.slice(8, 12) + "-" + v.slice(12);
      if (v.length > 8) return v.slice(0, 2) + "." + v.slice(2, 5) + "." + v.slice(5, 8) + "/" + v.slice(8);
      if (v.length > 5) return v.slice(0, 2) + "." + v.slice(2, 5) + "." + v.slice(5);
      if (v.length > 2) return v.slice(0, 2) + "." + v.slice(2);
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
      codigoInput.value = "";
      codigoInput.placeholder = "C0001";
      return;
    }
    window.api.proximoCodigoCliente().then(function (c) {
      codigoInput.value = c;
    }).catch(function () {
      codigoInput.placeholder = "C0001";
    });
  }

  /* ==================== Limpar / Cancelar ==================== */

  function limparEdicao() {
    clienteEditandoId.value = "";
    btnSalvar.textContent = "Salvar Cliente";
    btnCancelarEdicao.style.display = "none";
    movimentacoesSection.style.display = "none";
    movimentacoesContainer.innerHTML = "";
  }

  /* ==================== Mensagens ==================== */

  function mostrarMensagem(texto, tipo) {
    mensagem.textContent = texto;
    mensagem.className = "mensagem " + (tipo === "success" ? "success" : "error");
    mensagem.style.display = "block";
    setTimeout(function () {
      mensagem.style.display = "none";
    }, 3500);
  }

  /* ==================== Salvar ==================== */

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    mensagem.className = "mensagem";
    mensagem.style.display = "none";
    if (salvando) return;

    var nome = nomeInput.value.trim();
    if (!nome) {
      mostrarMensagem("Nome é obrigatório.", "error");
      nomeInput.focus();
      return;
    }

    var dados = {
      nome: nome,
      cpf_cnpj: cpfCnpjInput.value.replace(/\D/g, "").slice(0, 14) || null,
      endereco: enderecoInput.value.trim() || null,
      telefone: telefoneInput.value.trim() || null,
      email: emailInput.value.trim() || null
    };

    salvando = true;
    btnSalvar.disabled = true;
    var editando = clienteEditandoId.value;

    function finalizar() {
      salvando = false;
      btnSalvar.disabled = false;
      nomeInput.focus();
    }

    if (editando) {
      if (!window.api || !window.api.atualizarCliente) {
        mostrarMensagem("API indisponível.", "error");
        finalizar();
        return;
      }
      window.api.atualizarCliente(editando, dados).then(function () {
        mostrarMensagem("Cliente atualizado!", "success");
        form.reset();
        limparEdicao();
        atualizarCodigoNovo();
        finalizar();
      }).catch(function (err) {
        mostrarMensagem("Erro: " + err, "error");
        finalizar();
      });
    } else {
      if (!window.api || !window.api.salvarCliente) {
        mostrarMensagem("API indisponível.", "error");
        finalizar();
        return;
      }
      window.api.salvarCliente(dados).then(function () {
        mostrarMensagem("Cliente salvo!", "success");
        form.reset();
        limparEdicao();
        atualizarCodigoNovo();
        finalizar();
      }).catch(function (err) {
        mostrarMensagem("Erro: " + err, "error");
        finalizar();
      });
    }
  });

  btnLimpar.addEventListener("click", function () {
    form.reset();
    limparEdicao();
    atualizarCodigoNovo();
    mensagem.className = "mensagem";
    mensagem.style.display = "none";
  });

  btnCancelarEdicao.addEventListener("click", function () {
    form.reset();
    limparEdicao();
    atualizarCodigoNovo();
    mensagem.className = "mensagem";
    mensagem.style.display = "none";
  });

  /* ==================== Movimentações ==================== */

  btnVerMovimentacoes.addEventListener("click", function (e) {
    e.stopPropagation();
    if (!clienteEditandoId.value) return;
    if (!window.api || !window.api.movimentacoesCliente) return;
    modalNome.textContent = nomeInput.value || "cliente";
    modalMovimentacoes.innerHTML = '<p class="subtitle">Carregando...</p>';
    modal.style.display = "flex";
    window.api.movimentacoesCliente(clienteEditandoId.value).then(function (dados) {
      var lista = Array.isArray(dados) ? dados : [];
      if (lista.length === 0) {
        modalMovimentacoes.innerHTML = '<p class="subtitle">Nenhuma movimentação registrada.</p>';
        return;
      }
      var html = '<table class="modal-table"><thead><tr><th>Data</th><th>Venda nº</th><th>Total</th><th>Pagamento</th><th>Itens</th></tr></thead><tbody>';
      lista.forEach(function (reg) {
        var v = reg.venda;
        var itensHtml = "";
        if (reg.itens && reg.itens.length) {
          itensHtml = reg.itens.map(function (it) {
            return esc(it.produto_nome) + " (" + (it.sku || "") + ") — " + it.quantidade + "x R$ " + Number(it.preco_unitario || 0).toFixed(2);
          }).join("<br>");
        }
        html += "<tr><td>" + esc((v.data_venda || "").slice(0, 10)) + "</td>" +
          "<td>" + v.id + "</td>" +
          "<td>R$ " + Number(v.total || 0).toFixed(2) + "</td>" +
          "<td>" + esc(v.forma_pagamento) + "</td>" +
          "<td>" + itensHtml + "</td></tr>";
      });
      html += "</tbody></table>";
      modalMovimentacoes.innerHTML = html;
    }).catch(function () {
      modalMovimentacoes.innerHTML = '<p class="subtitle">Erro ao carregar movimentações.</p>';
    });
  });

  modalClose.addEventListener("click", function () {
    modal.style.display = "none";
  });
  modal.addEventListener("click", function (e) {
    if (e.target === modal) modal.style.display = "none";
  });

  /* ==================== Inicializar ==================== */

  atualizarCodigoNovo();
})();
