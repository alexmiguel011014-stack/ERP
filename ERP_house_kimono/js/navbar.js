(function () {
  var currentPage = window.location.pathname.split("/").pop() || "index.html";

  function aplicarTema(tema) {
    if (tema === "dark") {
      document.documentElement.classList.add("dark-theme");
      localStorage.setItem("tema", "dark");
    } else {
      document.documentElement.classList.remove("dark-theme");
      localStorage.setItem("tema", "light");
    }
  }

  function detectarTema() {
    var tema = localStorage.getItem("tema");
    if (tema === "dark" || tema === "light") {
      aplicarTema(tema);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      aplicarTema("dark");
    }
  }

  detectarTema();

  var style = document.createElement("style");
  style.textContent =
    ".navbar { position: sticky; top: 0; z-index: 1000; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; width: 100%; padding: 12px 24px; background-color: #FFFFFF; border-bottom: 1px solid #E2E8F0; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }\n" +
    ".navbar-brand { color: #2563EB; font-weight: 700; font-size: 1.05rem; white-space: nowrap; }\n" +
    ".navbar-links { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }\n" +
    ".navbar-links a { color: #475569; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; background-color: #F8FAFC; border: 1px solid #E2E8F0; transition: background-color 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s; }\n" +
    ".navbar-links a:hover { background-color: #EFF6FF; color: #1E293B; border-color: #BFDBFE; box-shadow: 0 2px 6px rgba(37,99,235,0.12); }\n" +
    ".navbar-links a.active { background-color: #2563EB; color: #FFFFFF; border-color: #2563EB; }\n" +
    ".theme-toggle { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 6px; background-color: #F1F5F9; color: #64748B; border: 1px solid #E2E8F0; cursor: pointer; transition: all 0.15s; font-size: 0.85rem; }\n" +
    ".theme-toggle:hover { background-color: #2563EB; color: #FFFFFF; border-color: #2563EB; }\n" +
    ".theme-toggle.active { background-color: #1E293B; color: #FFFFFF; }\n" +
    ".btn-voltar-menu { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; margin: 12px 0; color: #64748B; text-decoration: none; font-size: 0.85rem; font-weight: 500; border-radius: 6px; border: 1px solid #E2E8F0; background-color: #FFFFFF; transition: all 0.15s; }\n" +
    ".btn-voltar-menu:hover { color: #2563EB; background-color: #EFF6FF; border-color: #BFDBFE; }\n" +
    ".loading-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(248,250,252,0.9); display: none; flex-direction: column; justify-content: center; align-items: center; z-index: 9999; gap: 12px; }\n" +
    ".spinner { width: 32px; height: 32px; border: 3px solid #E2E8F0; border-top: 3px solid #2563EB; border-radius: 50%; animation: spin 0.7s linear infinite; }\n" +
    "@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }\n" +
    "/* Dark Theme */\n" +
    ".dark-theme { background-color: #0F172A; color: #E2E8F0; }\n" +
    ".dark-theme body { background-color: #0F172A; color: #E2E8F0; }\n" +
    ".dark-theme .navbar { background-color: #1E293B; border-bottom-color: #334159; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }\n" +
    ".dark-theme .navbar-brand { color: #3B82F6; }\n" +
    ".dark-theme .navbar-links a { color: #94A3B8; background-color: #0F172A; border-color: #334159; }\n" +
    ".dark-theme .navbar-links a:hover { background-color: #334159; color: #F1F5F9; border-color: #3B82F6; box-shadow: 0 2px 6px rgba(59,130,246,0.2); }\n" +
    ".dark-theme .navbar-links a.active { background-color: #3B82F6; color: #FFFFFF; border-color: #3B82F6; }\n" +
    ".dark-theme .container { background-color: #1E293B; border-color: #334159; color: #E2E8F0; }\n" +
    ".dark-theme h1, .dark-theme h2 { color: #F1F5F9; }\n" +
    ".dark-theme .subtitle { color: #64748B; }\n" +
    ".dark-theme .form-group label { color: #94A3B8; }\n" +
    ".dark-theme .form-group input, .dark-theme .form-group select { background-color: #0F172A; border-color: #334159; color: #F1F5F9; }\n" +
    ".dark-theme hr { border-top-color: #334159; }\n" +
    ".dark-theme table, .dark-theme #carrinhoTable { border-color: #334159; }\n" +
    ".dark-theme th { background-color: #0F172A; color: #94A3B8; border-bottom-color: #334159; }\n" +
    ".dark-theme td { border-bottom-color: #1E293B; color: #E2E8F0; }\n" +
    ".dark-theme td input { background-color: #0F172A; border-color: #334159; color: #F1F5F9; }\n" +
    ".dark-theme .stat-card { background-color: #1E293B; border-color: #334159; }\n" +
    ".dark-theme .stat-value { color: #3B82F6; }\n" +
    ".dark-theme .stat-card.alert { border-color: #42271B; }\n" +
    ".dark-theme .stat-card.alert .stat-value { color: #FBBF24; }\n" +
    ".dark-theme .stat-label { color: #64748B; }\n" +
    ".dark-theme .card { background-color: #1E293B; border-color: #334159; color: #E2E8F0; }\n" +
    ".dark-theme .card:hover { border-color: #3B82F6; box-shadow: 0 4px 16px rgba(59,130,246,0.15); }\n" +
    ".dark-theme .card p { color: #94A3B8; }\n" +
    ".dark-theme .btn-primary { background-color: #3B82F6; color: #FFFFFF; }\n" +
    ".dark-theme .btn-primary:hover { background-color: #2563EB; }\n" +
    ".dark-theme .btn-secondary { background-color: #334159; color: #CBD5E1; }\n" +
    ".dark-theme .btn-secondary:hover { background-color: #475569; color: #F1F5F9; }\n" +
    ".dark-theme .btn-small { background-color: #334159; color: #3B82F6; border-color: #334159; }\n" +
    ".dark-theme .btn-small:hover { background-color: #3B82F6; color: #FFFFFF; border-color: #3B82F6; }\n" +
    ".dark-theme .aviso { background-color: #1E293B; border-color: #42271B; color: #FCD34D; }\n" +
    ".dark-theme .sku-display { background-color: #0F172A; color: #60A5FA; }\n" +
    ".dark-theme .mensagem.success { background-color: #064E35; color: #6EE7B7; border-color: #10B981; }\n" +
    ".dark-theme .mensagem.error { background-color: #450A0A; color: #FCA5A5; border-color: #EF4444; }\n" +
    ".dark-theme .empty-state { color: #64748B; }\n" +
    ".dark-theme .lista-item { border-bottom-color: #1E293B; }\n" +
    ".dark-theme .lista-item:hover { background-color: #0F172A; }\n" +
    ".dark-theme .cliente-info .cliente-nome { color: #F1F5F9; }\n" +
    ".dark-theme .cliente-info .cliente-detail { color: #64748B; }\n" +
    ".dark-theme .btn-remover { border-color: #7F1D1D; color: #FCA5A5; }\n" +
    ".dark-theme .btn-remover:hover { background-color: #7F1D1D; border-color: #EF4444; color: #FFFFFF; }\n" +
    ".dark-theme .venda-item { border-bottom-color: #1E293B; }\n" +
    ".dark-theme .venda-item:hover { background-color: #0F172A; }\n" +
    ".dark-theme .venda-id { color: #60A5FA; }\n" +
    ".dark-theme .venda-bottom { color: #64748B; }\n" +
    ".dark-theme .stats-bar .stat-card { background-color: #0F172A; border-color: #334159; }\n" +
    ".dark-theme .stats-bar .stat-value { color: #3B82F6; }\n" +
    ".dark-theme .panel { background-color: #1E293B; border-color: #334159; }\n" +
    ".dark-theme .panel h2 { color: #E2E8F0; }\n" +
    ".dark-theme .info-label { color: #94A3B8; }\n" +
    ".dark-theme .info-value { color: #F1F5F9; }\n" +
    ".dark-theme .version-badge.current { background-color: #064E35; color: #6EE7B7; }\n" +
    ".dark-theme .version-badge.latest { background-color: #0F172A; color: #60A5FA; }\n" +
    ".dark-theme .version-badge.outdated { background-color: #450A0A; color: #FCA5A5; }\n" +
    ".dark-theme .loading-overlay { background-color: rgba(15,23,42,0.9); }\n" +
    ".dark-theme .spinner { border-color: #334159; border-top-color: #3B82F6; }\n" +
    ".dark-theme .pdv-header { background-color: #1E293B; border-bottom-color: #334159; }\n" +
    ".dark-theme .pdv-header h1 { color: #F1F5F9; }\n" +
    ".dark-theme .pdv-header .pdv-date { color: #64748B; }\n" +
    ".dark-theme .pdv-left { background-color: #1E293B; border-right-color: #334159; }\n" +
    ".dark-theme .scan-area input { background-color: #0F172A; border-color: #334159; color: #F1F5F9; }\n" +
    ".dark-theme .scan-hint { color: #475569; }\n" +
    ".dark-theme .cart-area h2, .dark-theme .resumo h2 { color: #E2E8F0; }\n" +
    ".dark-theme .forma-pagamento label { color: #94A3B8; }\n" +
    ".dark-theme .forma-pagamento select { background-color: #0F172A; border-color: #334159; color: #F1F5F9; }\n" +
    ".dark-theme .total-area { background-color: #0F172A; border-color: #334159; }\n" +
    ".dark-theme .total-label { color: #94A3B8; }\n" +
    ".dark-theme .total-value { color: #4ADE80; }\n" +
    ".dark-theme .btn-cancelar { background-color: #1E293B; border-color: #7F1D1D; color: #FCA5A5; }\n" +
    ".dark-theme .btn-cancelar:hover { background-color: #7F1D1D; border-color: #EF4444; color: #FFFFFF; }\n" +
    ".dark-theme .btn-finalizar:disabled { background-color: #334159; color: #64748B; }\n" +
    ".dark-theme .btn-qtd { background-color: #334159; color: #CBD5E1; border-color: #334159; }\n" +
    ".dark-theme .btn-qtd:hover { background-color: #3B82F6; color: #FFFFFF; border-color: #3B82F6; }\n" +
    ".dark-theme #carrinhoTable tr:hover td { background-color: #0F172A; }\n" +
    ".dark-theme .mensagem-pdv.sucesso { background-color: #064E35; color: #6EE7B7; border-color: #10B981; }\n" +
    ".dark-theme .mensagem-pdv.erro { background-color: #450A0A; color: #FCA5A5; border-color: #EF4444; }\n" +
    ".dark-theme .mensagem-pdv.info { background-color: #0F172A; color: #CBD5E1; border-color: #334159; }\n" +
    ".dark-theme .venda-total { color: #4ADE80; }\n" +
    ".dark-theme .filters label { color: #94A3B8; }\n" +
    ".dark-theme .filters input[type='date'] { background-color: #0F172A; border-color: #334159; color: #F1F5F9; }\n" +
    ".dark-theme #modalDetalhes { background: rgba(15,23,42,0.6) !important; }\n" +
    ".dark-theme #modalDetalhesContent { background-color: #1E293B !important; color: #E2E8F0 !important; }\n" +
    ".dark-theme #modalSenha { background: rgba(15,23,42,0.6) !important; }\n" +
    ".dark-theme .panel h2 { color: #E2E8F0; }\n" +
    ".dark-theme .btn-success { background-color: #16A34A; opacity: 0.9; }\n" +
    ".dark-theme .btn-success:hover { opacity: 1; }\n" +
    ".dark-theme .btn-warning { background-color: #F59E0B; color: #1E293B; }\n" +
    ".dark-theme .stat-card:hover { box-shadow: 0 4px 12px rgba(59,130,246,0.15); }\n" +
    ".nav-logout { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; margin-left: 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 500; color: #64748B; text-decoration: none; border: 1px solid #E2E8F0; background-color: transparent; cursor: pointer; transition: all 0.15s; }\n" +
    ".nav-logout:hover { background-color: #FEE2E2; color: #DC2626; border-color: #DC2626; }\n" +
    ".dark-theme .nav-logout { color: #94A3B8; border-color: #334159; }\n" +
    ".dark-theme .nav-logout:hover { background-color: #450A0A; color: #FCA5A5; border-color: #EF4444; }\n" +
    ".dark-theme .venda-item { border-bottom-color: #1E293B; }\n" +
    ".dark-theme .venda-item:hover { background-color: #0F172A; }\n" +
    ".dark-theme .stats-bar .stat-card { background-color: #0F172A; border-color: #334159; }\n";
  document.head.appendChild(style);

  var nav = document.createElement("nav");
  nav.className = "navbar";

  var isDark = document.documentElement.classList.contains("dark-theme");
  var themeIcon = isDark ? "&#9728;" : "&#9790;";

  var linksHTML =
    '<a href="index.html" class="' + (currentPage === "index.html" ? "active" : "") + '">Dashboard</a>' +
    '<a href="pdv.html" class="' + (currentPage === "pdv.html" ? "active" : "") + '">Frente de Caixa</a>' +
    '<a href="cadastro.html" class="' + (currentPage === "cadastro.html" ? "active" : "") + '">Cadastro</a>' +
    '<a href="clientes.html" class="' + (currentPage === "clientes.html" ? "active" : "") + '">Clientes</a>' +
    '<a href="vendas.html" class="' + (currentPage === "vendas.html" ? "active" : "") + '">Histórico</a>' +
    '<a href="estoquenegativo.html" class="' + (currentPage === "estoquenegativo.html" ? "active" : "") + '">Estoque Negativo</a>' +
    '<a href="atualizacao.html" class="' + (currentPage === "atualizacao.html" ? "active" : "") + '">Atualizações</a>' +
    '<button type="button" id="themeToggle" class="theme-toggle" title="Alternar tema escuro">' + themeIcon + "</button>";

  var logoutBtn = "";
  if (currentPage !== "login.html") {
    logoutBtn = '<button type="button" id="navLogout" class="nav-logout" title="Sair">&#8617; Sair</button>';
  }

  nav.innerHTML =
    '<div class="navbar-brand">JiuJitsu ERP</div>' +
    '<div class="navbar-links">' + linksHTML + logoutBtn + "</div>";

  document.body.insertBefore(nav, document.body.firstChild);

  var toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var temaAtual = localStorage.getItem("tema") || "light";
      aplicarTema(temaAtual === "dark" ? "light" : "dark");
      var nowDark = document.documentElement.classList.contains("dark-theme");
      toggle.innerHTML = nowDark ? "&#9728;" : "&#9790;";
    });
  }

  var logoutBtnEl = document.getElementById("navLogout");
  if (logoutBtnEl) {
    logoutBtnEl.addEventListener("click", function () {
      if (window.erpLogout) {
        window.erpLogout();
      } else {
        localStorage.removeItem("erp_auth");
        window.location.href = "login.html";
      }
    });
  }
})();
