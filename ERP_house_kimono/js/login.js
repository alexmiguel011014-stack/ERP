(function () {
  var senhaInput = document.getElementById("senha");
  var btnEntrar = document.getElementById("btnEntrar");
  var mensagem = document.getElementById("mensagem");
  var form = document.getElementById("formLogin");
  var btnAlterarSenha = document.getElementById("btnAlterarSenha");
  var modalSenha = document.getElementById("modalSenha");
  var btnConfirmarSenha = document.getElementById("btnConfirmarSenha");
  var btnCancelarSenha = document.getElementById("btnCancelarSenha");

  var btnSenhaVendedor = document.getElementById("btnSenhaVendedor");
  var modalVendedor = document.getElementById("modalVendedor");
  var senhaVendedor = document.getElementById("senhaVendedor");
  var btnConfirmarVendedor = document.getElementById("btnConfirmarVendedor");
  var btnCancelarVendedor = document.getElementById("btnCancelarVendedor");
  var msgVendedor = document.getElementById("msgVendedor");

  function mostrarMensagem(texto, tipo) {
    mensagem.textContent = texto;
    mensagem.className = "mensagem " + tipo;
    mensagem.style.display = "block";
    setTimeout(function () {
      mensagem.style.display = "none";
    }, 4000);
  }

  function getSenha() {
    return localStorage.getItem("erp_senha") || "123456";
  }

  function setSenha(novaSenha) {
    localStorage.setItem("erp_senha", novaSenha);
  }

  function aplicarLogin(senha, perfil) {
    localStorage.setItem("erp_senha", senha);
    localStorage.setItem("erp_auth", "true");
    localStorage.setItem("erp_perfil", perfil);
  }

  if (localStorage.getItem("erp_auth") === "true") {
    window.location.href = "index.html";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    btnEntrar.disabled = true;
    btnEntrar.textContent = "Entrando...";

    var senhaDigitada = senhaInput.value;

    if (!window.api || !window.api.unlockWithProfile) {
      // Fallback offline simples (sem Electron): valida contra senha armazenada.
      if (senhaDigitada === getSenha()) {
        aplicarLogin(senhaDigitada, "admin");
        window.location.href = "index.html";
      } else {
        mostrarMensagem("Senha incorreta. Tente novamente.", "erro");
        btnEntrar.disabled = false;
        btnEntrar.textContent = "Entrar";
        senhaInput.value = "";
        senhaInput.focus();
      }
      return;
    }

    window.api
      .unlockWithProfile(senhaDigitada)
      .then(function (res) {
        aplicarLogin(senhaDigitada, res.perfil);
        mostrarMensagem("Login realizado (" + res.perfil + ")!", "sucesso");
        setTimeout(function () {
          window.location.href = "index.html";
        }, 800);
      })
      .catch(function () {
        mostrarMensagem("Senha incorreta. Tente novamente.", "erro");
        btnEntrar.disabled = false;
        btnEntrar.textContent = "Entrar";
        senhaInput.value = "";
        senhaInput.focus();
      });
  });

  /* --- Alterar senha do administrador --- */

  window.abrirAlterarSenha = function () {
    if (modalSenha) modalSenha.style.display = "flex";
    document.getElementById("senhaAtual").value = "";
    document.getElementById("senhaNova").value = "";
    document.getElementById("senhaConfirmar").value = "";
    document.getElementById("senhaAtual").focus();
  };

  if (btnCancelarSenha) {
    btnCancelarSenha.addEventListener("click", function () {
      if (modalSenha) modalSenha.style.display = "none";
    });
  }

  if (btnConfirmarSenha) {
    btnConfirmarSenha.addEventListener("click", function () {
      var atual = document.getElementById("senhaAtual").value;
      var nova = document.getElementById("senhaNova").value;
      var confirmar = document.getElementById("senhaConfirmar").value;

      if (atual !== getSenha()) {
        mostrarMensagem("Senha atual incorreta.", "erro");
        return;
      }
      if (!nova || nova.length < 4) {
        mostrarMensagem("A nova senha deve ter pelo menos 4 caracteres.", "erro");
        return;
      }
      if (nova !== confirmar) {
        mostrarMensagem("As senhas não coincidem.", "erro");
        return;
      }

      if (!window.api || !window.api.changeDBKey) {
        setSenha(nova);
        if (modalSenha) modalSenha.style.display = "none";
        mostrarMensagem("Senha alterada com sucesso!", "sucesso");
        return;
      }

      window.api
        .changeDBKey(nova)
        .then(function () {
          setSenha(nova);
          // A senha do vendedor (se existir) desbloqueia a chave antiga do banco;
          // ao trocar a senha do admin, reconfigure a senha do vendedor.
          window.api.hasVendedorKey().then(function (info) {
            if (info && info.existe) {
              if (modalSenha) modalSenha.style.display = "none";
              mostrarMensagem(
                "Senha alterada. A senha do vendedor foi desativada porque a chave do banco mudou — reconfigure-a agora.",
                "erro"
              );
              window.api.removeVendedorKey();
              window.abrirVendedorSenha();
            } else {
              if (modalSenha) modalSenha.style.display = "none";
              mostrarMensagem("Senha alterada com sucesso!", "sucesso");
            }
          });
        })
        .catch(function (err) {
          mostrarMensagem("Erro ao alterar a senha do banco: " + err, "erro");
        });
    });
  }

  /* --- Senha do vendedor (acesso restrito) --- */

  window.abrirVendedorSenha = function () {
    if (!window.api || !window.api.hasVendedorKey) {
      mostrarMensagem("Funcionalidade indisponível fora do Electron.", "erro");
      return;
    }
    senhaVendedor.value = "";
    msgVendedor.textContent = "";
    msgVendedor.className = "mensagem";
    msgVendedor.style.display = "none";
    modalVendedor.style.display = "flex";

    window.api.hasVendedorKey().then(function (info) {
      if (info && info.existe) {
        senhaVendedor.placeholder = "Senha do vendedor (já definida — digite para substituir)";
      } else {
        senhaVendedor.placeholder = "Digite a senha do vendedor (mínimo 4 caracteres)";
      }
    }).catch(function () {});
    senhaVendedor.focus();
  };

  if (btnCancelarVendedor) {
    btnCancelarVendedor.addEventListener("click", function () {
      if (modalVendedor) modalVendedor.style.display = "none";
    });
  }

  if (btnConfirmarVendedor) {
    btnConfirmarVendedor.addEventListener("click", function () {
      var senhaNova = senhaVendedor.value;
      if (!senhaNova || senhaNova.length < 4) {
        msgVendedor.textContent = "A senha do vendedor deve ter pelo menos 4 caracteres.";
        msgVendedor.className = "mensagem error";
        msgVendedor.style.display = "block";
        return;
      }
      if (!window.api || !window.api.setVendedorKey) {
        msgVendedor.textContent = "Funcionalidade indisponível fora do Electron.";
        msgVendedor.className = "mensagem error";
        msgVendedor.style.display = "block";
        return;
      }
      btnConfirmarVendedor.disabled = true;
      window.api.setVendedorKey(senhaNova)
        .then(function () {
          msgVendedor.textContent = "Senha do vendedor salva com sucesso.";
          msgVendedor.className = "mensagem success";
          msgVendedor.style.display = "block";
          setTimeout(function () {
            if (modalVendedor) modalVendedor.style.display = "none";
          }, 1200);
        })
        .catch(function (err) {
          msgVendedor.textContent = "Erro: " + err;
          msgVendedor.className = "mensagem error";
          msgVendedor.style.display = "block";
          btnConfirmarVendedor.disabled = false;
        });
    });
  }

  window.erpCheckAuth = function () {
    return localStorage.getItem("erp_auth") === "true";
  };

  window.erpLogout = function () {
    localStorage.removeItem("erp_auth");
    localStorage.removeItem("erp_perfil");
    window.location.href = "login.html";
  };
})();
