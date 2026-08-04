(function () {
  var senhaInput = document.getElementById("senha");
  var btnEntrar = document.getElementById("btnEntrar");
  var mensagem = document.getElementById("mensagem");
  var form = document.getElementById("formLogin");
  var btnAlterarSenha = document.getElementById("btnAlterarSenha");
  var modalSenha = document.getElementById("modalSenha");
  var btnConfirmarSenha = document.getElementById("btnConfirmarSenha");
  var btnCancelarSenha = document.getElementById("btnCancelarSenha");

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

  if (localStorage.getItem("erp_auth") === "true") {
    window.location.href = "index.html";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    btnEntrar.disabled = true;
    btnEntrar.textContent = "Entrando...";

    var senhaDigitada = senhaInput.value;

    if (senhaDigitada === getSenha()) {
      btnEntrar.disabled = true;
      btnEntrar.textContent = "Verificando...";
      if (window.api && window.api.unlockDB) {
        window.api
          .unlockDB(senhaDigitada)
          .then(function () {
            localStorage.setItem("erp_auth", "true");
            mostrarMensagem("Login realizado com sucesso!", "sucesso");
            setTimeout(function () {
              window.location.href = "index.html";
            }, 800);
          })
          .catch(function (err) {
            mostrarMensagem("Senha não corresponde ao banco de dados.", "erro");
            btnEntrar.disabled = false;
            btnEntrar.textContent = "Entrar";
            senhaInput.value = "";
            senhaInput.focus();
          });
      } else {
        localStorage.setItem("erp_auth", "true");
        mostrarMensagem("Login realizado com sucesso!", "sucesso");
        setTimeout(function () {
          window.location.href = "index.html";
        }, 800);
      }
    } else {
      mostrarMensagem("Senha incorreta. Tente novamente.", "erro");
      btnEntrar.disabled = false;
      btnEntrar.textContent = "Entrar";
      senhaInput.value = "";
      senhaInput.focus();
    }
  });

  btnAlterarSenha.addEventListener("click", function () {
    if (modalSenha) modalSenha.style.display = "flex";
    document.getElementById("senhaAtual").value = "";
    document.getElementById("senhaNova").value = "";
    document.getElementById("senhaConfirmar").value = "";
    document.getElementById("senhaAtual").focus();
  });

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

      if (window.api && window.api.changeDBKey) {
        window.api
          .changeDBKey(nova)
          .then(function () {
            setSenha(nova);
            if (modalSenha) modalSenha.style.display = "none";
            mostrarMensagem("Senha alterada com sucesso!", "sucesso");
          })
          .catch(function (err) {
            mostrarMensagem("Erro ao alterar a senha do banco: " + err, "erro");
          });
      } else {
        setSenha(nova);
        if (modalSenha) modalSenha.style.display = "none";
        mostrarMensagem("Senha alterada com sucesso!", "sucesso");
      }
    });
  }

  window.erpCheckAuth = function () {
    return localStorage.getItem("erp_auth") === "true";
  };

  window.erpLogout = function () {
    localStorage.removeItem("erp_auth");
    window.location.href = "login.html";
  };
})();
