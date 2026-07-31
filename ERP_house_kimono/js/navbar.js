(function () {
  var currentPage = window.location.pathname.split("/").pop() || "index.html";

  var nav = document.createElement("nav");
  nav.className = "navbar";
  nav.innerHTML =
    '<div class="navbar-brand">JiuJitsu ERP</div>' +
    '<div class="navbar-links">' +
    '<a href="index.html" class="' + (currentPage === "index.html" ? "active" : "") + '">Dashboard</a>' +
    '<a href="pdv.html" class="' + (currentPage === "pdv.html" ? "active" : "") + '">Frente de Caixa</a>' +
    '<a href="cadastro.html" class="' + (currentPage === "cadastro.html" ? "active" : "") + '">Cadastro</a>' +
    '<a href="clientes.html" class="' + (currentPage === "clientes.html" ? "active" : "") + '">Clientes</a>' +
    '<a href="vendas.html" class="' + (currentPage === "vendas.html" ? "active" : "") + '">Historico</a>' +
    '<a href="atualizacao.html" class="' + (currentPage === "atualizacao.html" ? "active" : "") + '">Atualizacoes</a>' +
    "</div>";

  var container = document.querySelector(".container") || document.body;
  container.insertBefore(nav, container.firstChild);
})();