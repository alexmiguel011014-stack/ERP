(function () {
  // Gerenciador de abas estilo navegador, restrito ao Dashboard (não roda em
  // outras telas). Duas categorias de aba:
  //  - "iframe": carrega um módulo comum (PDV, Clientes, etc.) num <iframe>
  //    criado dinamicamente com ?embedded=1, dentro de #dashPanelIframes.
  //  - "nativa": revela uma seção que já existe no próprio HTML do Dashboard
  //    (hoje só "Produtos", que por dentro tem seu próprio sistema de
  //    sub-abas com iframe — ver gerenciamento-produtos.js). Não cria iframe
  //    aqui; só alterna visibilidade do painel nativo correspondente.
  //
  // A barra de abas vive DENTRO da .navbar já existente, no lugar exato onde
  // ficava a busca (.navbar-busca) — não é uma barra nova abaixo da navbar.
  // navbar.js monta a navbar de forma assíncrona (após checar sessão), então
  // aguardamos o elemento aparecer antes de montar a barra de abas.
  var painelInicio = document.getElementById("dashPanelInicio");
  var painelIframes = document.getElementById("dashPanelIframes");
  if (!painelInicio || !painelIframes) return;

  var barra = null;
  var tabInicio = null;

  // id -> { tipo, tituloEl (botão da barra), painelEl (conteúdo) }
  var abas = {};
  var abaAtiva = "inicio";

  function normalizarSvg(icone) {
    return icone || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>';
  }

  function montarBarra(buscaEl) {
    barra = document.createElement("div");
    barra.className = "navbar-abas";
    barra.id = "dashTabsBar";

    tabInicio = document.createElement("button");
    tabInicio.type = "button";
    tabInicio.className = "dash-tab active";
    tabInicio.id = "dashTabInicio";
    tabInicio.dataset.tab = "inicio";
    tabInicio.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>' +
      "<span>Início</span>";
    tabInicio.addEventListener("click", function () { focar("inicio"); });
    barra.appendChild(tabInicio);

    buscaEl.replaceWith(barra);
  }

  function iniciarQuandoNavbarExistir() {
    var busca = document.querySelector(".navbar-busca");
    if (busca) {
      montarBarra(busca);
      return;
    }
    // navbar.js ainda não inseriu a navbar (aguardando sessão) — tenta de
    // novo no próximo frame, sem polling agressivo.
    requestAnimationFrame(iniciarQuandoNavbarExistir);
  }
  iniciarQuandoNavbarExistir();

  function focar(id) {
    if (!abas[id] && id !== "inicio") return;
    abaAtiva = id;

    tabInicio.classList.toggle("active", id === "inicio");
    painelInicio.classList.toggle("active", id === "inicio");

    Object.keys(abas).forEach(function (outroId) {
      var aba = abas[outroId];
      var ativa = outroId === id;
      aba.tituloEl.classList.toggle("active", ativa);
      aba.painelEl.classList.toggle("active", ativa);
    });
  }

  function fechar(id) {
    var aba = abas[id];
    if (!aba) return;
    aba.tituloEl.remove();
    if (aba.tipo === "iframe") {
      aba.painelEl.remove();
    } else {
      aba.painelEl.classList.remove("active");
    }
    delete abas[id];
    if (abaAtiva === id) focar("inicio");
  }

  function criarBotaoAba(id, titulo, icone) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dash-tab";
    btn.dataset.tab = id;
    btn.innerHTML =
      normalizarSvg(icone) +
      "<span>" + titulo + "</span>" +
      '<span class="dash-tab-fechar" title="Fechar">&times;</span>';
    btn.addEventListener("click", function (e) {
      if (e.target.closest(".dash-tab-fechar")) {
        fechar(id);
        return;
      }
      focar(id);
    });
    return btn;
  }

  // Abre uma aba do tipo iframe (módulo comum), ou só foca se já existir.
  function abrirIframe(id, titulo, src, icone) {
    if (!barra) { requestAnimationFrame(function () { abrirIframe(id, titulo, src, icone); }); return; }
    if (abas[id]) {
      focar(id);
      return;
    }
    var btn = criarBotaoAba(id, titulo, icone);
    barra.appendChild(btn);

    var painel = document.createElement("div");
    painel.className = "dash-tab-panel dash-tab-panel-iframe";
    var iframe = document.createElement("iframe");
    iframe.className = "dash-tab-iframe";
    iframe.src = src;
    iframe.title = titulo;
    painel.appendChild(iframe);
    painelIframes.appendChild(painel);

    abas[id] = { tipo: "iframe", tituloEl: btn, painelEl: painel };
    focar(id);
  }

  // Revela uma aba "nativa" (painel já existente no HTML do Dashboard, ex.
  // Produtos) — cria só o botão da barra na primeira vez.
  function abrirNativa(id, titulo, painelEl, icone) {
    if (!barra) { requestAnimationFrame(function () { abrirNativa(id, titulo, painelEl, icone); }); return; }
    if (!abas[id]) {
      var btn = criarBotaoAba(id, titulo, icone);
      barra.appendChild(btn);
      abas[id] = { tipo: "nativa", tituloEl: btn, painelEl: painelEl };
    }
    focar(id);
  }

  window.erpDashboardAbas = {
    abrirIframe: abrirIframe,
    abrirNativa: abrirNativa,
    focar: focar,
    fechar: fechar,
  };

  // Mapa id -> {titulo, arquivo} dos itens do sidebar que devem abrir como
  // aba em vez de navegar a janela inteira. Mapa explícito (em vez de
  // extrair do href clicado) para não depender da estrutura interna que
  // navbar.js gera, e ficar robusto a mudanças de rótulo/ordem no menu.
  var MODULOS_ABA = {
    "pdv.html": { id: "pdv", titulo: "Frente de Caixa", arquivo: "../pdv/pdv.html" },
    "clientes.html": { id: "clientes", titulo: "Clientes", arquivo: "../clientes/clientes.html" },
    "compras.html": { id: "compras", titulo: "Compras", arquivo: "../compras/compras.html" },
    "fornecedores.html": { id: "fornecedores", titulo: "Fornecedores", arquivo: "../fornecedores/fornecedores.html" },
    "financeiro.html": { id: "financeiro", titulo: "Financeiro", arquivo: "../financeiro/financeiro.html" },
    "relatorios.html": { id: "relatorios", titulo: "Relatórios", arquivo: "../relatorios/relatorios.html" },
    "acessos.html": { id: "acessos", titulo: "Gerenciar Acessos", arquivo: "../acessos/acessos.html" },
    "banco.html": { id: "banco", titulo: "Banco de Dados", arquivo: "../banco/banco.html" },
    "importacao.html": { id: "importacao", titulo: "Importação", arquivo: "../importacao/importacao.html" },
    "atualizacao.html": { id: "atualizacao", titulo: "Atualizações", arquivo: "../atualizacao/atualizacao.html" },
  };

  // navbar.js monta a sidebar de forma assíncrona (após checar sessão), então
  // a interceptação de clique usa delegação no document em vez de bind direto
  // nos <a> — funciona mesmo que a sidebar ainda não exista neste momento.
  document.addEventListener("click", function (e) {
    var link = e.target.closest(".sidebar-item");
    if (!link) return;
    var href = link.getAttribute("href") || "";

    if (href.indexOf("workspace=gerenciamento-produtos") !== -1) {
      e.preventDefault();
      // Precisa ser a função de gerenciamento-produtos.js (não abrirNativa
      // isolado) porque ela é quem seta frame.src do iframe interno — sem
      // isso a aba "Produtos" abre com o conteúdo em branco na primeira vez.
      if (window.erpAbrirGerenciamentoProdutos) {
        window.erpAbrirGerenciamentoProdutos();
      } else {
        abrirNativa(
          "produtos",
          "Produtos",
          document.getElementById("dashPanelProdutos"),
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>'
        );
      }
      return;
    }

    // O item "Dashboard" do sidebar aponta pra própria index.html — sem essa
    // checagem, o clique navegava a janela inteira e recarregava o Dashboard
    // do zero, destruindo todas as abas abertas em memória (bug relatado).
    // Como já estamos na home, só focamos "Início" em vez de recarregar.
    var arquivo = href.split("/").pop().split("?")[0];
    if (arquivo === "index.html") {
      e.preventDefault();
      focar("inicio");
      return;
    }

    var modulo = MODULOS_ABA[arquivo];
    if (!modulo) return; // Itens não mapeados navegam normalmente.

    e.preventDefault();
    abrirIframe(modulo.id, modulo.titulo, modulo.arquivo + "?embedded=1");
  });
})();
