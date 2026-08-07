(function () {
  var workspace = document.getElementById("gerenciamentoProdutosWorkspace");
  var frame = document.getElementById("gerenciamentoProdutosFrame");
  var fechar = document.getElementById("fecharGerenciamentoProdutos");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".gerenciamento-tab"));
  var params = new URLSearchParams(window.location.search);

  if (!workspace || !frame) return;

  function abrir() {
    workspace.hidden = false;
    if (!frame.getAttribute("src")) frame.src = tabs[0].dataset.src;
  }

  function fecharWorkspace() {
    workspace.hidden = true;
    frame.src = "about:blank";
    window.history.replaceState({}, document.title, "../dashboard/index.html");
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (item) { item.classList.remove("active"); });
      tab.classList.add("active");
      frame.src = tab.dataset.src;
    });
  });

  fechar.addEventListener("click", fecharWorkspace);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !workspace.hidden) fecharWorkspace();
  });

  function iniciar(sessao) {
    if (params.get("workspace") === "gerenciamento-produtos" && sessao && sessao.perfil === "admin") abrir();
  }

  if (window.erpAuthPromise) window.erpAuthPromise.then(iniciar).catch(function () {});
})();
