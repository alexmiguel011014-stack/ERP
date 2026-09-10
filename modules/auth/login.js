(function () {
  // Remove credenciais persistidas por versões antigas do aplicativo.
  localStorage.removeItem("erp_senha");
  localStorage.removeItem("erp_auth");
  localStorage.removeItem("erp_perfil");

  var usuarioInput = document.getElementById("usuario");
  var senhaInput = document.getElementById("senha");
  var btnEntrar = document.getElementById("btnEntrar");
  var mensagem = document.getElementById("mensagem");
  var form = document.getElementById("formLogin");

  function mostrarMensagem(texto, tipo) {
    mensagem.textContent = texto;
    mensagem.className = "mensagem " + tipo;
    mensagem.style.display = "block";
    setTimeout(function () {
      mensagem.style.display = "none";
    }, 5000);
  }

  if (window.api && window.api.getAuthSession) {
    window.api.getAuthSession().then(function (sessao) {
      if (sessao && sessao.autenticado) window.location.href = "../dashboard/index.html";
    }).catch(function () {});
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    btnEntrar.disabled = true;
    btnEntrar.textContent = "Entrando...";

    var usuario = usuarioInput.value.trim();
    var senha = senhaInput.value;

    if (!window.api || !window.api.unlockWithProfile) {
      mostrarMensagem("O aplicativo precisa ser executado pelo Electron.", "erro");
      btnEntrar.disabled = false;
      btnEntrar.textContent = "Entrar";
      return;
    }

    window.api
      .unlockWithProfile(usuario, senha)
      .then(function (res) {
        window.erpPerfil = res.usuario.perfil;
        mostrarMensagem("Login realizado! Bem-vindo, " + res.usuario.nome + ".", "sucesso");
        var splash = document.getElementById("loginSplash");
        if (splash) splash.classList.add("ativo");
        setTimeout(function () {
          if (splash) splash.classList.add("saindo");
          window.location.href = "../dashboard/index.html";
        }, 3000);
      })
      .catch(function (err) {
        mostrarMensagem(err || "Usuário ou senha incorreta.", "erro");
        btnEntrar.disabled = false;
        btnEntrar.textContent = "Entrar";
        senhaInput.value = "";
        senhaInput.focus();
      });
  });

  window.erpCheckAuth = function () {
    return !!window.erpPerfil;
  };

  window.erpLogout = function () {
    var sair = window.api && window.api.logout ? window.api.logout() : Promise.resolve();
    sair.finally(function () { window.location.href = "./login.html"; });
  };
})();