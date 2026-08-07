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

  // Painéis embutidos no Dashboard reutilizam a sessão do documento pai.
  var embutido = new URLSearchParams(window.location.search).get("embedded") === "1";
  if (embutido && window.parent !== window && window.parent.erpCheckAuth && window.parent.erpCheckAuth()) {
    window.erpPerfil = window.parent.erpPerfil || "admin";
    window.erpUsuario = window.parent.erpUsuario || null;
    window.erpCheckAuth = function () { return true; };
    if (window.parent.erpLogout) window.erpLogout = window.parent.erpLogout;
    window.erpResolveAuth({ autenticado: true, perfil: window.erpPerfil });
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
    window.erpUsuario = sessao.usuario || { login: window.erpPerfil, nome: window.erpPerfil };
    window.erpCheckAuth = function () { return true; };
    window.erpResolveAuth(sessao);
  }).catch(function (erro) {
    window.erpRejectAuth(erro);
    window.location.href = "../auth/login.html";
  });
})();
