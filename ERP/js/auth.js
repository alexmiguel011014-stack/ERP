(function () {
  if (window.location.pathname.split("/").pop() === "login.html") {
    return;
  }

  function estaAutenticado() {
    return localStorage.getItem("erp_auth") === "true";
  }

  if (estaAutenticado()) {
    window.erpCheckAuth = function () { return true; };
    window.erpLogout = function () {
      localStorage.removeItem("erp_auth");
      window.location.href = "login.html";
    };
    if (window.api && window.api.unlockDB) {
      window.api.unlockDB(localStorage.getItem("erp_senha") || "123456").catch(function () {});
    }
    return;
  }

  window.location.href = "login.html";
})();
