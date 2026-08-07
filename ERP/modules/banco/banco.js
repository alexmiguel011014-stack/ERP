(function () {
  "use strict";

  var painelSenha = document.getElementById("painelSenha");
  var painelDados = document.getElementById("painelDados");
  var senhaAdmin = document.getElementById("senhaAdmin");
  var btnConfirmarSenha = document.getElementById("btnConfirmarSenha");
  var selectTabela = document.getElementById("selectTabela");
  var btnAtualizar = document.getElementById("btnAtualizar");
  var infoTabela = document.getElementById("infoTabela");
  var containerTabela = document.getElementById("containerTabela");
  var msgSenha = document.getElementById("msgSenha");

  var autorizado = false;
  var tabelas = [];

  function esc(t) {
    return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function mostrarMensagem(texto, tipo) {
    msgSenha.textContent = texto;
    msgSenha.className = "mensagem " + (tipo || "erro");
    msgSenha.style.display = "block";
  }

  btnConfirmarSenha.addEventListener("click", function () {
    var senha = senhaAdmin.value;
    if (!senha) {
      mostrarMensagem("Informe a senha do admin.", "erro");
      return;
    }
    btnConfirmarSenha.disabled = true;
    window.erpBanco.banco
      .verificarSenhaAdmin(senha)
      .then(function (res) {
        if (res && res.ok) {
          autorizado = true;
          painelSenha.style.display = "none";
          painelDados.style.display = "block";
          carregarTabelas();
        } else {
          mostrarMensagem("Senha incorreta ou usuário sem perfil admin.", "erro");
          senhaAdmin.value = "";
          senhaAdmin.focus();
        }
      })
      .catch(function (erro) {
        mostrarMensagem(erro || "Falha ao verificar a senha.", "erro");
      })
      .finally(function () {
        btnConfirmarSenha.disabled = false;
      });
  });

  selectTabela.addEventListener("change", function () {
    if (selectTabela.value) consultarTabela(selectTabela.value);
  });

  btnAtualizar.addEventListener("click", function () {
    if (selectTabela.value) consultarTabela(selectTabela.value);
    else carregarTabelas();
  });

  senhaAdmin.addEventListener("keydown", function (e) {
    if (e.key === "Enter") btnConfirmarSenha.click();
  });

  function listarTabelas() {
    return window.erpBanco.banco.listarTabelas().catch(function (erro) {
      console.error("Erro ao listar tabelas:", erro);
      alert("Falha ao listar tabelas: " + (erro || ""));
      return [];
    });
  }

  function carregarTabelas() {
    listarTabelas().then(function (tabelas) {
      var atual = selectTabela.value;
      selectTabela.innerHTML = '<option value="">Selecione a tabela...</option>';
      (tabelas || []).forEach(function (tabela) {
        var opt = document.createElement("option");
        opt.value = tabela;
        opt.textContent = tabela;
        selectTabela.appendChild(opt);
      });
      if (atual && tabelas.indexOf(atual) !== -1) {
        selectTabela.value = atual;
        consultarTabela(atual);
      } else {
        containerTabela.innerHTML = '<div class="empty-state">Selecione uma tabela para visualizar.</div>';
        infoTabela.textContent = "";
      }
    });
  }

  function consultarTabela(tabela) {
    containerTabela.innerHTML = '<div class="empty-state">Consultando ' + esc(tabela) + "...</div>";
    infoTabela.textContent = "";
    window.erpBanco.banco
      .consultarTabela(tabela, 200)
      .then(function (res) {
        infoTabela.innerHTML =
          "<strong>" + esc(res.tabela) + "</strong> &middot; " +
          res.total + " registros (exibindo até " + res.limite + ")";
        if (!res.colunas || !res.colunas.length || !res.linhas.length) {
          containerTabela.innerHTML = '<div class="empty-state">Tabela vazia.</div>';
          return;
        }
        var html = "<table><thead><tr>";
        res.colunas.forEach(function (c) { html += "<th>" + esc(c) + "</th>"; });
        html += "</tr></thead><tbody>";
        res.linhas.forEach(function (linha) {
          html += "<tr>";
          res.colunas.forEach(function (c) {
            var v = linha[c];
            if (v && typeof v === "object") v = JSON.stringify(v);
            html += "<td>" + esc(v) + "</td>";
          });
          html += "</tr>";
        });
        html += "</tbody></table>";
        containerTabela.innerHTML = html;
      })
      .catch(function (erro) {
        containerTabela.innerHTML = '<div class="mensagem error" style="display:block;">' +
          esc(erro || "Falha ao consultar tabela.") + "</div>";
      });
  }

  window.addEventListener("erp-erro-sessao", function () {
    painelDados.style.display = "none";
    painelSenha.style.display = "flex";
  });
})();