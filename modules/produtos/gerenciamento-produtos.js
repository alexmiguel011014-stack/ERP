(function () {
  var workspace = document.getElementById("gerenciamentoProdutosWorkspace");
  var frame = document.getElementById("gerenciamentoProdutosFrame");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".gerenciamento-tab"));
  var params = new URLSearchParams(window.location.search);

  if (!workspace || !frame) return;

  function abrir() {
    if (!frame.getAttribute("src")) frame.src = tabs[0].dataset.src;
    // A aba "Produtos" em si (posição na barra, foco) é gerenciada pelo
    // sistema de abas do Dashboard — ver modules/dashboard/abas.js.
    if (window.erpDashboardAbas) {
      window.erpDashboardAbas.abrirNativa(
        "produtos",
        "Produtos",
        document.getElementById("dashPanelProdutos"),
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>'
      );
    }
  }

  // Exposta para abas.js chamar diretamente ao interceptar o clique no
  // sidebar — precisa ser essa função (não abrirNativa isolado) porque só
  // ela seta frame.src na primeira abertura; sem isso a aba aparece com o
  // iframe interno em branco até o usuário clicar numa sub-aba manualmente.
  window.erpAbrirGerenciamentoProdutos = abrir;

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (item) { item.classList.remove("active"); });
      tab.classList.add("active");
      frame.src = tab.dataset.src;
    });
  });

  function iniciar(sessao) {
    if (params.get("workspace") === "gerenciamento-produtos" && sessao && sessao.perfil === "admin") abrir();
  }

  if (window.erpAuthPromise) window.erpAuthPromise.then(iniciar).catch(function () {});
})();
