(function () {
  if (window.location.pathname.split("/").pop() === "login.html") {
    return;
  }

  // Flag de DB pronto — todas as páginas esperam este resolve antes de usar window.api.
  window.erpAuthPronto = !!window.erpAuthPronto;
  window.erpAuthPromise = new Promise(function (resolve, reject) {
    window.erpResolveAuth = resolve;
    window.erpRejectAuth = reject;
  });

  window.erpCheckAuth = function () { return false; };
  window.erpLogout = function () {
    var sair = window.api && window.api.logout ? window.api.logout() : Promise.resolve();
    sair.finally(function () { window.location.href = "../auth/login.html"; });
  };

  // Páginas restritas ao admin marcam <body data-requer-admin="1">. Páginas
  // liberáveis por toggle marcam <body data-requer-modulo="produtos">, etc.
  // O bloqueio de verdade é sempre no backend (exigirSessao/exigirPermissao
  // no main.js) — isto aqui só evita deixar a tela em branco/quebrada.
  function bloqueadoParaPerfil(perfil, permissoes) {
    var requerAdmin = document.body && document.body.getAttribute("data-requer-admin") === "1";
    if (requerAdmin && perfil !== "admin") {
      window.location.href = "../dashboard/index.html?acesso=negado";
      return true;
    }
    var modulo = document.body && document.body.getAttribute("data-requer-modulo");
    if (modulo && perfil !== "admin" && !(permissoes && permissoes[modulo] === true)) {
      window.location.href = "../dashboard/index.html?acesso=negado";
      return true;
    }
    return false;
  }

  // Painéis embutidos no Dashboard reutilizam a sessão do documento pai.
  var embutido = new URLSearchParams(window.location.search).get("embedded") === "1";
  if (embutido && window.parent !== window && window.parent.erpCheckAuth && window.parent.erpCheckAuth()) {
    window.erpPerfil = window.parent.erpPerfil || "admin";
    window.erpUsuario = window.parent.erpUsuario || null;
    window.erpPermissoes = window.parent.erpPermissoes || {};
    window.erpCheckAuth = function () { return true; };
    if (window.parent.erpLogout) window.erpLogout = window.parent.erpLogout;
    if (bloqueadoParaPerfil(window.erpPerfil, window.erpPermissoes)) return;
    window.erpResolveAuth({ autenticado: true, perfil: window.erpPerfil, permissoes: window.erpPermissoes });
    return;
  }

  if (!window.api || !window.api.getAuthSession) {
    window.erpRejectAuth(new Error("API de autenticação indisponível."));
    window.location.href = "../auth/login.html";
    return;
  }

  window.api.getAuthSession().then(function (sessao) {
    if (!sessao || !sessao.autenticado) {
      window.erpRejectAuth(new Error("Sessão não iniciada."));
      window.location.href = "../auth/login.html";
      return;
    }
    window.erpPerfil = sessao.perfil;
    window.erpPermissoes = sessao.permissoes || {};
    window.erpUsuario = sessao.usuario || { login: window.erpPerfil, nome: window.erpPerfil };
    window.erpCheckAuth = function () { return true; };
    if (bloqueadoParaPerfil(sessao.perfil, window.erpPermissoes)) return;
    window.erpResolveAuth(sessao);
  }).catch(function (erro) {
    window.erpRejectAuth(erro);
    window.location.href = "../auth/login.html";
  });
})();
