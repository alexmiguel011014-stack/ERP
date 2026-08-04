(function () {
  var currentPage = window.location.pathname.split("/").pop() || "index.html";

  var perfil = localStorage.getItem("erp_perfil") || "admin";
  var isAdmin = perfil === "admin";

  // Páginas permitidas para o perfil vendedor.
  var paginasVendedor = {
    "pdv.html": true,
    "vendas.html": true,
    "index.html": true,
    "estoquenegativo.html": true,
    "clientes.html": true,
    "entrada.html": true,
  };

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
    "/* === Navbar === */\n" +
    ".navbar { position: sticky; top: 0; z-index: 1000; display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 20px; background-color: #FFFFFF; border-bottom: 1px solid #E2E8F0; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }\n" +
    ".hamburger { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 6px; display: flex; flex-direction: column; gap: 4px; transition: background 0.15s; }\n" +
    ".hamburger:hover { background: #F1F5F9; }\n" +
    ".hamburger span { display: block; width: 20px; height: 2px; background: #475569; border-radius: 1px; transition: background 0.15s; }\n" +
    ".navbar-brand { color: #2563EB; font-weight: 700; font-size: 1rem; white-space: nowrap; margin-right: auto; }\n" +
    ".navbar-links { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }\n" +
    ".navbar-links a { color: #475569; text-decoration: none; padding: 8px 14px; border-radius: 7px; font-size: 0.82rem; font-weight: 600; background-color: #F8FAFC; border: 1px solid #E2E8F0; transition: background-color 0.15s, color 0.15s, border-color 0.15s; }\n" +
    ".navbar-links a:hover { background-color: #EFF6FF; color: #1E293B; border-color: #BFDBFE; }\n" +
    ".navbar-links a.active { background-color: #2563EB; color: #FFFFFF; border-color: #2563EB; }\n" +
    ".theme-toggle { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 6px; background: #F1F5F9; color: #64748B; border: 1px solid #E2E8F0; cursor: pointer; font-size: 0.85rem; transition: all 0.15s; }\n" +
    ".theme-toggle:hover { background: #2563EB; color: #FFF; border-color: #2563EB; }\n" +
    "/* === Sidebar === */\n" +
    ".sidebar-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.45); z-index: 1999; display: none; }\n" +
    ".sidebar-backdrop.open { display: block; }\n" +
    ".sidebar { position: fixed; top: 0; left: -280px; width: 260px; height: 100%; z-index: 2000; background: #FFFFFF; border-right: 1px solid #E2E8F0; box-shadow: 2px 0 16px rgba(0,0,0,0.08); transition: left 0.25s ease; display: flex; flex-direction: column; overflow-y: auto; }\n" +
    ".sidebar.open { left: 0; }\n" +
    ".sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 18px 12px; border-bottom: 1px solid #E2E8F0; }\n" +
    ".sidebar-brand { font-weight: 700; font-size: 1.05rem; color: #2563EB; }\n" +
    ".sidebar-close { background: none; border: none; font-size: 1.3rem; color: #94A3B8; cursor: pointer; padding: 2px 6px; border-radius: 4px; line-height: 1; }\n" +
    ".sidebar-close:hover { color: #DC2626; background: #FEE2E2; }\n" +
    ".sidebar-section { padding: 6px 0; border-bottom: 1px solid #F1F5F9; }\n" +
    ".sidebar-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 11px 18px; border: none; background: none; color: #1E293B; font-size: 0.85rem; font-weight: 500; cursor: pointer; text-align: left; text-decoration: none; transition: background 0.12s; }\n" +
    ".sidebar-item:hover { background: #F1F5F9; }\n" +
    ".sidebar-item svg, .sidebar-icon { width: 18px; height: 18px; flex-shrink: 0; color: #64748B; }\n" +
    ".sidebar-item .item-label { flex: 1; }\n" +
    ".sidebar-item.disabled { color: #94A3B8; cursor: default; }\n" +
    ".sidebar-item.disabled:hover { background: none; }\n" +
    ".sidebar-divider { height: 1px; background: #E2E8F0; margin: 4px 0; }\n" +
    ".sidebar-item.danger { color: #DC2626; }\n" +
    ".sidebar-item.danger:hover { background: #FEE2E2; }\n" +
    "/* === Dark theme overrides === */\n" +
    ".dark-theme { background-color: #0F172A; color: #E2E8F0; }\n" +
    ".dark-theme body { background-color: #0F172A; color: #E2E8F0; }\n" +
    ".dark-theme .navbar { background-color: #1E293B; border-bottom-color: #334159; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }\n" +
    ".dark-theme .hamburger:hover { background: #334159; }\n" +
    ".dark-theme .hamburger span { background: #CBD5E1; }\n" +
    ".dark-theme .navbar-brand { color: #3B82F6; }\n" +
    ".dark-theme .navbar-links a { color: #94A3B8; background-color: #0F172A; border-color: #334159; }\n" +
    ".dark-theme .navbar-links a:hover { background-color: #334159; color: #F1F5F9; border-color: #3B82F6; }\n" +
    ".dark-theme .navbar-links a.active { background-color: #3B82F6; color: #FFFFFF; border-color: #3B82F6; }\n" +
    ".dark-theme .theme-toggle { background: #334159; color: #94A3B8; border-color: #334159; }\n" +
    ".dark-theme .theme-toggle:hover { background: #3B82F6; color: #FFF; border-color: #3B82F6; }\n" +
    ".dark-theme .sidebar { background: #1E293B; border-right-color: #334159; }\n" +
    ".dark-theme .sidebar-backdrop { background: rgba(15,23,42,0.65); }\n" +
    ".dark-theme .sidebar-header { border-bottom-color: #334159; }\n" +
    ".dark-theme .sidebar-brand { color: #3B82F6; }\n" +
    ".dark-theme .sidebar-close { color: #64748B; }\n" +
    ".dark-theme .sidebar-close:hover { color: #FCA5A5; background: #450A0A; }\n" +
    ".dark-theme .sidebar-section { border-bottom-color: #1E293B; }\n" +
    ".dark-theme .sidebar-item { color: #E2E8F0; }\n" +
    ".dark-theme .sidebar-item:hover { background: #0F172A; }\n" +
    ".dark-theme .sidebar-divider { background: #334159; }\n" +
    ".dark-theme .sidebar-item.danger { color: #FCA5A5; }\n" +
    ".dark-theme .sidebar-item.danger:hover { background: #450A0A; }\n" +
    ".dark-theme .sidebar-item.disabled { color: #475569; }\n" +
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
    ".dark-theme .venda-total { color: #4ADE80; }\n" +
    ".dark-theme .filters label { color: #94A3B8; }\n" +
    ".dark-theme .filters input[type='date'] { background-color: #0F172A; border-color: #334159; color: #F1F5F9; }\n" +
    ".dark-theme #modalDetalhes { background: rgba(15,23,42,0.6) !important; }\n" +
    ".dark-theme #modalDetalhesContent { background-color: #1E293B !important; color: #E2E8F0 !important; }\n" +
    ".dark-theme #modalSenha { background: rgba(15,23,42,0.6) !important; }\n" +
    ".dark-theme .btn-success { background-color: #16A34A; opacity: 0.9; }\n" +
    ".dark-theme .btn-success:hover { opacity: 1; }\n" +
    ".dark-theme .stat-card:hover { box-shadow: 0 4px 12px rgba(59,130,246,0.15); }\n" +
    ".dark-theme .venda-item { border-bottom-color: #1E293B; }\n" +
    ".dark-theme .venda-item:hover { background-color: #0F172A; }\n" +
    ".dark-theme .stats-bar .stat-card { background-color: #0F172A; border-color: #334159; }\n";
  document.head.appendChild(style);

  /* ---------- Sidebar + overlay DOM ---------- */
  var backdrop = document.createElement("div");
  backdrop.className = "sidebar-backdrop";
  document.body.appendChild(backdrop);

  var sidebar = document.createElement("aside");
  sidebar.className = "sidebar";

  // Redireciona vendedor das páginas restritas.
  if (perfil === "vendedor" && !paginasVendedor[currentPage]) {
    window.location.href = "pdv.html";
  }

  sidebar.innerHTML =
    '<div class="sidebar-header">' +
    '<span class="sidebar-brand">Alga ERP</span>' +
    '<button class="sidebar-close" title="Fechar">&times;</button>' +
    '</div>' +
    '<a href="clientes.html" class="sidebar-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><span class="item-label">Clientes</span></a>' +
    (isAdmin ? '<a href="fornecedores.html" class="sidebar-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.752 11.168l-2.66-4.29a1 1 0 0 0 0 1.2L14 15l-4 4a1 1 0 0 0 1 1.5l7-7a1 1 0 0 0-.2-1.6z"/></svg><span class="item-label">Fornecedores</span></a>' : "") +
    (isAdmin ? '<a href="compras.html" class="sidebar-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/></svg><span class="item-label">Compras</span></a>' : "") +
    (isAdmin ? '<a href="entrada.html" class="sidebar-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M19 12l-7-7-7 7"/></svg><span class="item-label">Entrada de Estoque</span></a>' : "") +
    (isAdmin ? '<a href="financeiro.html" class="sidebar-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><span class="item-label">Financeiro</span></a>' : "") +
    (isAdmin ? '<a href="relatorios.html" class="sidebar-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5V5a2 2 0 0 1 2-2h8.5a1.5 1.5 0 0 1 1 1v12.5a1.5 1.5 0 0 1-1 1.5H6a2 2 0 0 0-2 2z"/><path d="M9 5V3h6v2M9 9h6v6H9z"/></svg><span class="item-label">Relatórios</span></a>' : "") +
    '<a href="precificacao.html" class="sidebar-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><span class="item-label">Precificação</span></a>' +
    '<a href="atualizacao.html" class="sidebar-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg><span class="item-label">Atualizações</span></a>' +
    '<button class="sidebar-item danger" id="sidebarLogout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg><span class="item-label">Sair</span></button>';

  document.body.appendChild(sidebar);

  function abrirSidebar() {
    sidebar.classList.add("open");
    backdrop.classList.add("open");
  }

  function fecharSidebar() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("open");
  }

  backdrop.addEventListener("click", fecharSidebar);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && sidebar.classList.contains("open")) fecharSidebar();
  });

  /* ---------- Navbar ---------- */
  var nav = document.createElement("nav");
  nav.className = "navbar";

  var isDark = document.documentElement.classList.contains("dark-theme");
  var themeIcon = isDark ? "&#9728;" : "&#9790;";
  var linksHTML =
    '<a href="index.html" class="' + (currentPage === "index.html" ? "active" : "") + '">Dashboard</a>' +
    '<a href="pdv.html" class="' + (currentPage === "pdv.html" ? "active" : "") + '">Frente de Caixa</a>' +
    '<a href="cadastro.html" class="' + (currentPage === "cadastro.html" ? "active" : "") + '">Cadastro dos Produtos</a>' +
    '<a href="vendas.html" class="' + (currentPage === "vendas.html" ? "active" : "") + '">Histórico</a>' +
    '<a href="estoquenegativo.html" class="' + (currentPage === "estoquenegativo.html" ? "active" : "") + '">Estoque Negativo</a>' +
    (isAdmin ? '<a href="entrada.html" class="' + (currentPage === "entrada.html" ? "active" : "") + '">Entrada</a>' : '') +
    '<button type="button" id="themeToggle" class="theme-toggle" title="Alternar tema escuro">' + themeIcon + "</button>";

  nav.innerHTML =
    '<button class="hamburger" id="hamburgerBtn" title="Menu"><span></span><span></span><span></span></button>' +
    '<div class="navbar-brand">Alga ERP</div>' +
    '<div class="navbar-links">' + linksHTML + "</div>";

  document.body.insertBefore(nav, document.body.firstChild);

  /* ---------- Eventos ---------- */
  document.getElementById("hamburgerBtn").addEventListener("click", abrirSidebar);

  var sidebarClose = sidebar.querySelector(".sidebar-close");
  if (sidebarClose) sidebarClose.addEventListener("click", fecharSidebar);

  var toggle = document.getElementById("themeToggle");
  function atualizarIconeTema() {
    var nowDark = document.documentElement.classList.contains("dark-theme");
    if (toggle) toggle.innerHTML = nowDark ? "&#9728;" : "&#9790;";
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      var temaAtual = localStorage.getItem("tema") || "light";
      aplicarTema(temaAtual === "dark" ? "light" : "dark");
      atualizarIconeTema();
    });
  }

  var logoutBtn = document.getElementById("sidebarLogout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      fecharSidebar();
      if (window.erpLogout) {
        window.erpLogout();
      } else {
        localStorage.removeItem("erp_auth");
        window.location.href = "login.html";
      }
    });
  }
})();