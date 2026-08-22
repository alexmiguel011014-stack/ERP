(function () {
	if (new URLSearchParams(window.location.search).get("embedded") === "1")
		return;

	function iniciarNavbar(sessao, modulosCarregados) {
		// Disponibiliza pro dashboard/abas.js ler (não precisa buscar de novo
		// via IPC) — ver docs/MODULE_MANIFEST.md.
		window.erpModulosCarregados = modulosCarregados || [];
		var currentPage = window.location.pathname.split("/").pop() || "index.html";
		var perfil = sessao && sessao.perfil ? sessao.perfil : "admin";
		var isAdmin = perfil === "admin";
		var permissoes = (sessao && sessao.permissoes) || {};
		function podeModulo(modulo) {
			return isAdmin || permissoes[modulo] === true;
		}
		var autenticado = !!(sessao && sessao.autenticado);

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
			} else if (
				window.matchMedia &&
				window.matchMedia("(prefers-color-scheme: dark)").matches
			) {
				aplicarTema("dark");
			}
		}

		detectarTema();

		var style = document.createElement("style");
		style.textContent =
			"/* === Navbar (top bar, estilo Beron) === */\n" +
			".navbar { position: sticky; top: 0; z-index: 1500; display: flex; align-items: center; gap: 14px; width: 100%; padding: 12px 24px; background-color: #FFFFFF; border-bottom: 1px solid #E2E8F0; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }\n" +
			".hamburger { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 6px; display: none; flex-direction: column; gap: 4px; transition: background 0.15s; }\n" +
			"@media (max-width: 880px) { .hamburger { display: flex; } }\n" +
			".hamburger:hover { background: #F1F5F9; }\n" +
			".hamburger span { display: block; width: 20px; height: 2px; background: #475569; border-radius: 1px; transition: background 0.15s; }\n" +
			".navbar-brand { display: none; color: var(--cor-primaria); font-weight: 700; font-size: 1rem; white-space: nowrap; }\n" +
			"@media (max-width: 880px) { .navbar-brand { display: block; margin-right: auto; } }\n" +
			".navbar-links { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-left: auto; }\n" +
			".navbar-links a { color: #475569; text-decoration: none; padding: 8px 14px; border-radius: var(--raio-sm); font-size: 0.82rem; font-weight: 600; background-color: #F8FAFC; border: 1px solid #E2E8F0; transition: background-color 0.15s, color 0.15s, border-color 0.15s; }\n" +
			".navbar-links a:hover { background-color: var(--cor-primaria-fraca); color: #1E293B; border-color: var(--cor-primaria-fraca-borda); }\n" +
			".navbar-links a.active { background-color: var(--cor-primaria); color: #FFFFFF; border-color: var(--cor-primaria); }\n" +
			".theme-toggle-pill { display: inline-flex; align-items: center; width: 46px; height: 24px; padding: 3px; border-radius: 999px; background: #E0F2FE; border: 1px solid #BAE6FD; cursor: pointer; transition: background-color 0.4s, border-color 0.4s; flex-shrink: 0; }\n" +
			".theme-toggle-pill:hover { border-color: #7DD3FC; }\n" +
			".theme-toggle-knob { width: 18px; height: 18px; border-radius: 50%; background: #FBBF24; box-shadow: 0 0 10px 2px rgba(251,191,36,0.6); transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1), background-color 0.4s, box-shadow 0.4s; transform: translateX(0); }\n" +
			".dark-theme .theme-toggle-pill { background: #1E293B; border-color: #334159; }\n" +
			".dark-theme .theme-toggle-pill:hover { border-color: #475569; }\n" +
			".dark-theme .theme-toggle-knob { background: #E2E8F0; box-shadow: 0 0 10px 2px rgba(226,232,240,0.35); transform: translateX(22px); }\n" +
			".navbar-busca { position: relative; width: 320px; max-width: 40vw; }\n" +
			".navbar-busca input { width: 100%; padding: 9px 12px 9px 34px; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 0.82rem; outline: none; background: #F8FAFC url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2394A3B8%22 stroke-width=%222%22%3E%3Ccircle cx=%2211%22 cy=%2211%22 r=%228%22/%3E%3Cpath d=%22m21 21-4.3-4.3%22/%3E%3C/svg%3E') no-repeat 10px center / 15px; }\n" +
			".navbar-busca input:focus { border-color: var(--cor-primaria); background-color: #FFFFFF; }\n" +
			".navbar-busca-resultados { position: absolute; top: calc(100% + 4px); left: 0; width: 320px; max-height: 380px; overflow-y: auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); z-index: 3000; display: none; }\n" +
			".navbar-busca-resultados.open { display: block; }\n" +
			".navbar-busca-grupo-titulo { padding: 6px 12px; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; background: #F8FAFC; }\n" +
			".navbar-busca-item { display: block; padding: 8px 12px; font-size: 0.82rem; color: #1E293B; text-decoration: none; border-bottom: 1px solid #F1F5F9; cursor: pointer; }\n" +
			".navbar-busca-item:hover { background: var(--cor-primaria-fraca); }\n" +
			".navbar-busca-item .detalhe { display: block; font-size: 0.72rem; color: #94A3B8; }\n" +
			".navbar-busca-vazio { padding: 14px 12px; font-size: 0.8rem; color: #94A3B8; text-align: center; }\n" +
			".dark-theme .navbar-busca input { background: #0F172A; border-color: #334159; color: #F1F5F9; }\n" +
			".dark-theme .navbar-busca-resultados { background: #1E293B; border-color: #334159; }\n" +
			".dark-theme .navbar-busca-grupo-titulo { background: #0F172A; color: #64748B; }\n" +
			".dark-theme .navbar-busca-item { color: #E2E8F0; border-bottom-color: #0F172A; }\n" +
			".dark-theme .navbar-busca-item:hover { background: #0F172A; }\n" +
			"/* === Sidebar (fixa, estilo Beron) === */\n" +
			":root { --sidebar-w: 264px; --sidebar-w-collapsed: 68px; }\n" +
			"body { padding-left: var(--sidebar-w); transition: padding-left 0.2s ease; }\n" +
			"body.sidebar-collapsed { padding-left: var(--sidebar-w-collapsed); }\n" +
			"@media (max-width: 880px) { body { padding-left: 0 !important; } }\n" +
			".sidebar-backdrop { position: fixed; inset: 0; background: rgba(2,6,23,0.55); z-index: 1999; display: none; }\n" +
			"@media (max-width: 880px) { .sidebar-backdrop.open { display: block; } }\n" +
			".sidebar { position: fixed; top: 0; left: 0; width: var(--sidebar-w); height: 100%; z-index: 2000; background: #110082; border-right: 1px solid rgba(255,255,255,0.12); transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), width 0.2s ease; display: flex; flex-direction: column; overflow: hidden; }\n" +
			"body.sidebar-collapsed .sidebar { width: var(--sidebar-w-collapsed); }\n" +
			// left:-300px→0 animava `left` (propriedade de layout, força reflow);
			// troquei por transform:translateX, que só compõe (GPU), sem reflow.
			"@media (max-width: 880px) { .sidebar { transform: translateX(-100%); width: 280px !important; box-shadow: 4px 0 24px rgba(0,0,0,0.35); } .sidebar.open { transform: translateX(0); } }\n" +
			".sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 16px; border-bottom: 1px solid rgba(255,255,255,0.12); flex-shrink: 0; }\n" +
			"body.sidebar-collapsed .sidebar-header { padding: 18px 8px 16px; flex-direction: column; gap: 10px; }\n" +
			".sidebar-brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 1.05rem; color: #F8FAFC; white-space: nowrap; overflow: hidden; }\n" +
			".sidebar-brand-mark { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; background: linear-gradient(135deg,var(--cor-primaria),#8B5CF6); color: #FFF; font-weight: 800; font-size: 0.85rem; flex-shrink: 0; }\n" +
			"body.sidebar-collapsed .sidebar-brand span.brand-text { display: none; }\n" +
			".sidebar-collapse-btn { background: none; border: none; color: #64748B; cursor: pointer; padding: 4px 6px; border-radius: 6px; display: flex; transition: transform 0.2s; }\n" +
			".sidebar-collapse-btn:hover { background: rgba(255,255,255,0.12); color: #E2E8F0; }\n" +
			"body.sidebar-collapsed .sidebar-collapse-btn { transform: rotate(180deg); }\n" +
			"@media (max-width: 880px) { .sidebar-collapse-btn { display: none; } }\n" +
			".sidebar-close { display: none; background: none; border: none; font-size: 1.3rem; color: #64748B; cursor: pointer; padding: 2px 6px; border-radius: 4px; line-height: 1; }\n" +
			"@media (max-width: 880px) { .sidebar-close { display: inline-flex; } }\n" +
			".sidebar-close:hover { color: #F87171; background: #450A0A; }\n" +
			".sidebar-user { display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.12); flex-shrink: 0; }\n" +
			".sidebar-user-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg,var(--cor-primaria),#EC4899); color: #FFF; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; flex-shrink: 0; }\n" +
			".sidebar-user-info { min-width: 0; overflow: hidden; }\n" +
			".sidebar-user-name { color: #F1F5F9; font-size: 0.8rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n" +
			".sidebar-user-role { color: #64748B; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; }\n" +
			"body.sidebar-collapsed .sidebar-user-info { display: none; }\n" +
			".sidebar-nav { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 10px 0; }\n" +
			".sidebar-nav::-webkit-scrollbar { width: 5px; }\n" +
			".sidebar-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 3px; }\n" +
			".sidebar-section-label { padding: 14px 20px 6px; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; white-space: nowrap; overflow: hidden; }\n" +
			"body.sidebar-collapsed .sidebar-section-label { text-align: center; padding: 14px 4px 6px; }\n" +
			"body.sidebar-collapsed .sidebar-section-label span.label-text { display: none; }\n" +
			".sidebar-item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 20px; margin: 1px 10px; border-radius: 8px; border: none; background: none; color: #CBD5E1; font-size: 0.85rem; font-weight: 500; cursor: pointer; text-align: left; text-decoration: none; transition: background 0.12s, color 0.12s; white-space: nowrap; width: calc(100% - 20px); }\n" +
			".sidebar-item:hover { background: rgba(255,255,255,0.12); color: #F8FAFC; }\n" +
			// Trocado o border-left sólido (o "tell" nº1 de UI gerada por IA,
			// segundo a pesquisa em DESIGN.md) por uma marca de contagem — o
			// mesmo risco usado em qualquer planilha de estoque física — como
			// indicador do item ativo, sobreposta sem empurrar ícone/texto.
			".sidebar-item.current { background: rgba(54,153,41,0.14); color: #D9EEDC; position: relative; }\n" +
			".sidebar-item.current::before { content: \"\"; position: absolute; left: 7px; top: 50%; width: 12px; height: 11px; transform: translateY(-50%); background-repeat: no-repeat; background-size: contain; background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 16' fill='none' stroke='%23369929' stroke-width='2' stroke-linecap='round'%3E%3Cline x1='2' y1='1' x2='2' y2='15'/%3E%3Cline x1='6' y1='1' x2='6' y2='15'/%3E%3Cline x1='10' y1='1' x2='10' y2='15'/%3E%3Cline x1='14' y1='1' x2='14' y2='15'/%3E%3Cline x1='0.5' y1='14' x2='16' y2='2'/%3E%3C/svg%3E\"); }\n" +
			".sidebar-item svg, .sidebar-icon { width: 18px; height: 18px; flex-shrink: 0; }\n" +
			".sidebar-badge { display: inline-flex; align-items: center; justify-content: center; padding: 1px 6px; border-radius: 4px; background: #3B2A5E; color: #E4D6FA; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.03em; line-height: 1.6; flex-shrink: 0; min-width: 26px; text-align: center; }\n" +
			".sidebar-item .item-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n" +
			"body.sidebar-collapsed .sidebar-item .item-label, body.sidebar-collapsed .sidebar-item .sidebar-badge { display: none; }\n" +
			"body.sidebar-collapsed .sidebar-item { justify-content: center; padding: 10px; margin: 1px 12px; width: calc(100% - 24px); }\n" +
			"body.sidebar-collapsed .sidebar-item.current::before { display: none; }\n" +
			".sidebar-item.disabled { color: #475569; cursor: default; }\n" +
			".sidebar-item.disabled:hover { background: none; }\n" +
			".sidebar-divider { height: 1px; background: rgba(255,255,255,0.12); margin: 8px 16px; }\n" +
			".sidebar-item.danger { color: #FCA5A5; }\n" +
			".sidebar-item.danger:hover { background: #450A0A; color: #FECACA; }\n" +
			".sidebar-group-chevron { margin-left: auto; width: 14px; height: 14px; flex-shrink: 0; transition: transform 0.15s; }\n" +
			".sidebar-group-toggle.expanded .sidebar-group-chevron { transform: rotate(90deg); }\n" +
			// max-height:0→300px animava layout (força reflow a cada frame);
			// grid-template-rows:0fr→1fr anima só o track do grid, sem reflow —
			// precisa do wrapper .sidebar-group-inner (overflow:hidden) por dentro.
			".sidebar-group { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.2s ease; }\n" +
			".sidebar-group.expanded { grid-template-rows: 1fr; }\n" +
			".sidebar-group-inner { overflow: hidden; min-height: 0; }\n" +
			"body.sidebar-collapsed .sidebar-group-toggle .sidebar-group-chevron { display: none; }\n" +
			".sidebar-tooltip { position: fixed; left: calc(var(--sidebar-w-collapsed) + 10px); background: #FFFFFF; color: #1E293B; font-size: 0.78rem; font-weight: 600; padding: 7px 12px; border-radius: 7px; white-space: nowrap; box-shadow: 0 4px 16px rgba(15,23,42,0.18); z-index: 2100; pointer-events: none; display: none; }\n" +
			".sidebar-tooltip.show { display: block; }\n" +
			"/* === Dark theme overrides === */\n" +
			".dark-theme { background-color: #0F172A; color: #E2E8F0; }\n" +
			".dark-theme body { background-color: #0F172A; color: #E2E8F0; }\n" +
			".dark-theme .navbar { background-color: #1E293B; border-bottom-color: #334159; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }\n" +
			".dark-theme .hamburger:hover { background: #334159; }\n" +
			".dark-theme .hamburger span { background: #CBD5E1; }\n" +
			".dark-theme .navbar-brand { color: var(--cor-primaria); }\n" +
			".dark-theme .navbar-links a { color: #94A3B8; background-color: #0F172A; border-color: #334159; }\n" +
			".dark-theme .navbar-links a:hover { background-color: #334159; color: #F1F5F9; border-color: var(--cor-primaria); }\n" +
			".dark-theme .navbar-links a.active { background-color: var(--cor-primaria); color: #FFFFFF; border-color: var(--cor-primaria); }\n" +
			".dark-theme .theme-toggle { background: #334159; color: #94A3B8; border-color: #334159; }\n" +
			".dark-theme .theme-toggle:hover { background: var(--cor-primaria); color: #FFF; border-color: var(--cor-primaria); }\n" +
			".dark-theme .container { background-color: #1E293B; border-color: #334159; color: #E2E8F0; }\n" +
			".dark-theme h1, .dark-theme h2 { color: #F1F5F9; }\n" +
			".dark-theme .subtitle { color: #64748B; }\n" +
			".dark-theme .form-group label { color: #94A3B8; }\n" +
			".dark-theme .form-group input, .dark-theme .form-group select { background-color: #0F172A; border-color: #334159; color: #F1F5F9; }\n" +
			".dark-theme hr { border-top-color: #334159; }\n" +
			".dark-theme table { border-color: #334159; }\n" +
			".dark-theme th { background-color: #0F172A; color: #94A3B8; border-bottom-color: #334159; }\n" +
			".dark-theme td { border-bottom-color: #1E293B; color: #E2E8F0; }\n" +
			".dark-theme td input { background-color: #0F172A; border-color: #334159; color: #F1F5F9; }\n" +
			".dark-theme .stat-card { background-color: #1E293B; border-color: #334159; }\n" +
			".dark-theme .stat-value { color: var(--cor-primaria); }\n" +
			".dark-theme .stat-card.alert { border-color: #42271B; }\n" +
			".dark-theme .stat-card.alert .stat-value { color: #FBBF24; }\n" +
			".dark-theme .stat-label { color: #64748B; }\n" +
			".dark-theme .card { background-color: #1E293B; border-color: #334159; color: #E2E8F0; }\n" +
			".dark-theme .card:hover { border-color: var(--cor-primaria); box-shadow: 0 4px 16px rgba(163,116,242,0.15); }\n" +
			".dark-theme .card p { color: #94A3B8; }\n" +
			".dark-theme .btn-primary { background-color: var(--cor-primaria); color: #FFFFFF; }\n" +
			".dark-theme .btn-primary:hover { background-color: var(--cor-primaria-forte); }\n" +
			".dark-theme .btn-secondary { background-color: #334159; color: #CBD5E1; }\n" +
			".dark-theme .btn-secondary:hover { background-color: #475569; color: #F1F5F9; }\n" +
			".dark-theme .btn-small { background-color: #334159; color: var(--cor-primaria); border-color: #334159; }\n" +
			".dark-theme .btn-small:hover { background-color: var(--cor-primaria); color: #FFFFFF; border-color: var(--cor-primaria); }\n" +
			".dark-theme .aviso { background-color: #1E293B; border-color: #42271B; color: #FCD34D; }\n" +
			".dark-theme .sku-display { background-color: #0F172A; color: var(--cor-primaria); }\n" +
			".dark-theme .mensagem.success { background-color: #143015; color: #B9E6B3; border-color: #369929; }\n" +
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
			".dark-theme .venda-id { color: var(--cor-primaria); }\n" +
			".dark-theme .venda-bottom { color: #64748B; }\n" +
			".dark-theme .stats-bar .stat-card { background-color: #0F172A; border-color: #334159; }\n" +
			".dark-theme .stats-bar .stat-value { color: var(--cor-primaria); }\n" +
			".dark-theme .stat-card-v2 { background-color: #1E293B; border-color: #334159; }\n" +
			".dark-theme .stat-card-v2 .stat-v2-label { color: #94A3B8; }\n" +
			".dark-theme .stat-card-v2 .stat-v2-progress { background: #0F172A; }\n" +
			".dark-theme .filtros-sidebar { background: #1E293B; border-color: #334159; }\n" +
			".dark-theme .filtros-sidebar-titulo { color: #F1F5F9; }\n" +
			".dark-theme .filtro-grupo-label { color: #94A3B8; }\n" +
			".dark-theme .filtro-check { color: #CBD5E1; }\n" +
			".dark-theme .filtro-data-campo label { color: #94A3B8; }\n" +
			".dark-theme .filtro-data-campo input { background: #0F172A; border-color: #334159; color: #F1F5F9; }\n" +
			".dark-theme .filtros-resultado-header { color: #F1F5F9; }\n" +
			".dark-theme .btn-limpar-filtros { background: #0F172A; border-color: #334159; color: #94A3B8; }\n" +
			".dark-theme .btn-limpar-filtros:hover { background: #1F2937; color: #F1F5F9; }\n" +
			".dark-theme .skeleton-box { background-color: #334159; }\n" +
			".dark-theme .skeleton-box::after { background-image: linear-gradient(90deg, rgba(255,255,255,0) 0, rgba(255,255,255,0.08) 20%, rgba(255,255,255,0.16) 60%, rgba(255,255,255,0)); }\n" +
			".dark-theme .panel { background-color: #1E293B; border-color: #334159; }\n" +
			".dark-theme .panel h2 { color: #E2E8F0; }\n" +
			".dark-theme .info-label { color: #94A3B8; }\n" +
			".dark-theme .info-value { color: #F1F5F9; }\n" +
			".dark-theme .version-badge.current { background-color: #143015; color: #B9E6B3; }\n" +
			".dark-theme .version-badge.latest { background-color: #0F172A; color: var(--cor-primaria); }\n" +
			".dark-theme .version-badge.outdated { background-color: #450A0A; color: #FCA5A5; }\n" +
			".dark-theme .loading-overlay { background-color: rgba(15,23,42,0.9); }\n" +
			".dark-theme .spinner { border-color: #334159; border-top-color: var(--cor-primaria); }\n" +
			".dark-theme .pdv-header { background-color: #1E293B; border-bottom-color: #334159; }\n" +
			".dark-theme .pdv-header h1 { color: #F1F5F9; }\n" +
			".dark-theme .pdv-header .pdv-date { color: #64748B; }\n" +
			".dark-theme .pdv-left { background-color: #1E293B; border-right-color: #334159; }\n" +
			".dark-theme .pdv-right { background-color: #1E293B; }\n" +
			".dark-theme .forma-pagamento label { color: #94A3B8; }\n" +
			".dark-theme .forma-pagamento select, .dark-theme .forma-pagamento input { background-color: #0F172A; border-color: #334159; color: #F1F5F9; }\n" +
			".dark-theme .btn-orcamento { background-color: #332507; border-color: #5C4712; color: #FCE1A8; }\n" +
			".dark-theme .btn-orcamento:hover { background-color: var(--cor-destaque-solido); color: #1E293B; }\n" +
			".dark-theme .btn-orcamento:disabled { background-color: #334159; color: #64748B; border-color: #334159; }\n" +
			".dark-theme .produtos-encontrados-box { border-color: #334159; }\n" +
			".dark-theme .produtos-encontrados-thead { background: #0F172A; color: #E2E8F0; }\n" +
			".dark-theme .cliente-resultados-box { background: #1E293B; border-color: #334159; }\n" +
			".dark-theme .cliente-escolhido-box { background: #1E3A5F; border-color: #2C5282; color: #E2E8F0; }\n" +
			".dark-theme .pdv-modal-box { background-color: #1E293B; color: #E2E8F0; }\n" +
			".dark-theme .pdv-modal-box p { color: #94A3B8; }\n" +
			".dark-theme .pdv-modal-label { color: #94A3B8; }\n" +
			".dark-theme .pdv-modal-info-box { background: #0F172A; border-color: #334159; color: #CBD5E1; }\n" +
			".dark-theme .pdv-modal-input { background: #0F172A; border-color: #334159; color: #F1F5F9; }\n" +
			".dark-theme .scan-area input { background-color: #0F172A; border-color: #334159; color: #F1F5F9; }\n" +
			".dark-theme .scan-hint { color: #475569; }\n" +
			".dark-theme .cart-area h2, .dark-theme .resumo h2 { color: #E2E8F0; }\n" +
			".dark-theme .total-area { background-color: #0F172A; border-color: #334159; }\n" +
			".dark-theme .total-label { color: #94A3B8; }\n" +
			".dark-theme .total-value { color: var(--cor-sucesso); }\n" +
			".dark-theme .btn-cancelar { background-color: #1E293B; border-color: #7F1D1D; color: #FCA5A5; }\n" +
			".dark-theme .btn-cancelar:hover { background-color: #7F1D1D; border-color: #EF4444; color: #FFFFFF; }\n" +
			".dark-theme .btn-finalizar:disabled { background-color: #334159; color: #64748B; }\n" +
			".dark-theme .btn-qtd { background-color: #334159; color: #CBD5E1; border-color: #334159; }\n" +
			".dark-theme .btn-qtd:hover { background-color: var(--cor-primaria); color: #FFFFFF; border-color: var(--cor-primaria); }\n" +
			".dark-theme .carrinho-item { background-color: #1E293B; border-color: #F1F5F9; }\n" +
			".dark-theme .carrinho-item-header { color: #F1F5F9; }\n" +
			".dark-theme .carrinho-item.open .carrinho-item-header { background-color: #0F172A; }\n" +
			".dark-theme .carrinho-item-numero { color: #64748B; }\n" +
			".dark-theme .carrinho-item.open .carrinho-item-numero { color: var(--cor-primaria); }\n" +
			".dark-theme .carrinho-item-thumb { background-color: #334159; }\n" +
			".dark-theme .carrinho-item-sub { color: #94A3B8; }\n" +
			".dark-theme .carrinho-item-subtotal { color: #F1F5F9; }\n" +
			".dark-theme .carrinho-item-seta { background: #1E293B; border-color: #F1F5F9; color: #F1F5F9; }\n" +
			".dark-theme .carrinho-item-body { background-color: #0F172A; border-top-color: #334159; }\n" +
			".dark-theme .carrinho-item-preco { color: #94A3B8; }\n" +
			".dark-theme #carrinhoVazio.carrinho-vazio { color: #64748B; border-color: #334159; }\n" +
			".dark-theme .mensagem-pdv.sucesso { background-color: #143015; color: #B9E6B3; border-color: #369929; }\n" +
			".dark-theme .mensagem-pdv.erro { background-color: #450A0A; color: #FCA5A5; border-color: #EF4444; }\n" +
			".dark-theme .venda-total { color: var(--cor-sucesso); }\n" +
			".dark-theme .filters label { color: #94A3B8; }\n" +
			".dark-theme .filters input[type='date'] { background-color: #0F172A; border-color: #334159; color: #F1F5F9; }\n" +
			".dark-theme #modalDetalhes { background: rgba(15,23,42,0.6) !important; }\n" +
			".dark-theme #modalDetalhesContent { background-color: #1E293B !important; color: #E2E8F0 !important; }\n" +
			".dark-theme #modalSenha { background: rgba(15,23,42,0.6) !important; }\n" +
			".dark-theme .btn-success { background-color: var(--cor-sucesso); opacity: 0.9; }\n" +
			".dark-theme .btn-success:hover { opacity: 1; }\n" +
			".dark-theme .stat-card:hover { box-shadow: 0 4px 12px rgba(163,116,242,0.15); }\n" +
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

		function iniciais(nome) {
			var partes = String(nome || "?")
				.trim()
				.split(/\s+/);
			var a = partes[0] ? partes[0][0] : "?";
			var b = partes.length > 1 ? partes[partes.length - 1][0] : "";
			return (a + b).toUpperCase();
		}

		function itemAtivo(arquivo) {
			return currentPage === arquivo ? " current" : "";
		}

		// Renderiza um item de sidebar a partir do manifesto do módulo (ver
		// docs/MODULE_MANIFEST.md) — usado pelas seções "Gestão" e
		// "Administração", que têm permissão por módulo. "Principal"
		// (Dashboard/PDV) fica hardcoded abaixo de propósito: são os 2 links
		// sempre alcançáveis, sem gate nenhum — não dependem do manifesto
		// carregar com sucesso, pra sobrar sempre uma forma de navegar mesmo
		// se um modulo.json tiver problema.
		function permissaoLiberada(modulo) {
			var p = modulo.permissao;
			if (p.tipo === "sempre") return true;
			if (p.tipo === "admin") return isAdmin;
			if (p.tipo === "modulo") return podeModulo(p.nomeModulo);
			return false;
		}

		function renderizarItemSidebar(modulo) {
			if (!permissaoLiberada(modulo)) return "";
			var nav = modulo.navbar;
			var href =
				modulo.tipo === "workspace-dashboard"
					? "../dashboard/index.html?workspace=" + nav.workspaceParam
					: "../" + modulo.id + "/" + modulo.entrada;
			var classeAtivo =
				modulo.tipo === "pagina" ? itemAtivo(modulo.entrada) : "";
			var dica = nav.dica || nav.label;
			return (
				'<a href="' +
				href +
				'" class="sidebar-item' +
				classeAtivo +
				'" data-tip="' +
				dica +
				'">' +
				nav.icone +
				'<span class="item-label">' +
				nav.label +
				"</span></a>"
			);
		}

		function itensDaSecao(secao) {
			return modulosCarregados
				.filter(function (m) {
					return m.navbar && m.navbar.secao === secao;
				})
				.sort(function (a, b) {
					return a.navbar.ordem - b.navbar.ordem;
				});
		}

		var itensGestao = itensDaSecao("gestao");
		var itensAdministracao = itensDaSecao("administracao");
		var htmlGestao = itensGestao.map(renderizarItemSidebar).join("");
		var htmlAdministracao = itensAdministracao
			.map(renderizarItemSidebar)
			.join("");

		// O grupo "Administração" começa recolhido, exceto se a página atual for
		// uma das que moram dentro dele — senão o item ativo ficaria escondido.
		var PAGINAS_GRUPO_ADMIN = itensAdministracao.map(function (m) {
			return m.entrada;
		});
		var grupoAdminAberto =
			PAGINAS_GRUPO_ADMIN.indexOf(currentPage) !== -1 ||
			localStorage.getItem("sidebarAdminAberta") === "1";

		var nomeUsuario = autenticado
			? (sessao.usuario && sessao.usuario.nome) ||
				(sessao.usuario && sessao.usuario.login) ||
				"Usuário"
			: "";

		sidebar.innerHTML =
			'<div class="sidebar-header">' +
			'<span class="sidebar-brand"><span class="sidebar-brand-mark">AE</span><span class="brand-text">ALLU ERP</span></span>' +
			'<button class="sidebar-collapse-btn" id="sidebarCollapseBtn" title="Recolher menu"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>' +
			'<button class="sidebar-close" title="Fechar">&times;</button>' +
			"</div>" +
			(autenticado
				? '<div class="sidebar-user"><span class="sidebar-user-avatar">' +
					iniciais(nomeUsuario) +
					'</span><span class="sidebar-user-info"><span class="sidebar-user-name">' +
					nomeUsuario +
					'</span><span class="sidebar-user-role">' +
					String(perfil).toUpperCase() +
					"</span></span></div>"
				: "") +
			'<nav class="sidebar-nav">' +
			(!autenticado
				? '<a href="#" class="sidebar-item sidebar-login" id="sidebarLoginItem" data-tip="Login"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-3a4 4 0 0 0-3-3.87"/><path d="M16 3.13v3a4 4 0 0 1 0 7.75"/><circle cx="12" cy="12" r="4"/><path d="M2 12h3m13-8v3M5 6v12"/></svg><span class="item-label">Login</span></a>'
				: "") +
			'<div class="sidebar-section-label"><span class="label-text">Principal</span></div>' +
			'<a href="../dashboard/index.html" class="sidebar-item' +
			itemAtivo("index.html") +
			'" data-tip="Dashboard"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg><span class="item-label">Dashboard</span></a>' +
			'<a href="../pdv/pdv.html" class="sidebar-item' +
			itemAtivo("pdv.html") +
			'" data-tip="Frente de Caixa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M7 15h4"/></svg><span class="item-label">Frente de Caixa</span></a>' +
			(podeModulo("produtos") ||
			podeModulo("compras") ||
			podeModulo("financeiro") ||
			podeModulo("fornecedores") ||
			podeModulo("relatorios") ||
			isAdmin ||
			autenticado
				? '<div class="sidebar-section-label"><span class="label-text">Gestão</span></div>'
				: "") +
			htmlGestao +
			(autenticado
				? '<button type="button" class="sidebar-item sidebar-group-toggle' +
					(grupoAdminAberto ? " expanded" : "") +
					'" id="sidebarAdminToggle" data-tip="Administração"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg><span class="item-label">Administração</span><svg class="sidebar-group-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>' +
					'<div class="sidebar-group' +
					(grupoAdminAberto ? " expanded" : "") +
					'" id="sidebarGroupAdmin"><div class="sidebar-group-inner">' +
					htmlAdministracao +
					"</div></div>"
				: "") +
			(autenticado
				? '<a href="#" class="sidebar-item sidebar-logout danger" id="sidebarLogoutItem" data-tip="Sair"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg><span class="item-label">Logout</span></a>'
				: "") +
			"</nav>";

		document.body.appendChild(sidebar);

		var tooltip = document.createElement("div");
		tooltip.className = "sidebar-tooltip";
		document.body.appendChild(tooltip);

		Array.prototype.forEach.call(
			sidebar.querySelectorAll("[data-tip]"),
			function (el) {
				el.addEventListener("mouseenter", function () {
					if (!document.body.classList.contains("sidebar-collapsed")) return;
					tooltip.textContent = el.getAttribute("data-tip");
					var rect = el.getBoundingClientRect();
					tooltip.style.top = rect.top + rect.height / 2 - 12 + "px";
					tooltip.classList.add("show");
				});
				el.addEventListener("mouseleave", function () {
					tooltip.classList.remove("show");
				});
			},
		);

		var collapseBtn = document.getElementById("sidebarCollapseBtn");
		if (collapseBtn) {
			// Começa recolhida (modo mini) por padrão; só fica expandida se o
			// usuário já escolheu isso explicitamente antes.
			if (localStorage.getItem("sidebarColapsada") !== "0") {
				document.body.classList.add("sidebar-collapsed");
			}
			collapseBtn.addEventListener("click", function () {
				var colapsada = document.body.classList.toggle("sidebar-collapsed");
				localStorage.setItem("sidebarColapsada", colapsada ? "1" : "0");
				tooltip.classList.remove("show");
			});
		}

		var adminToggle = document.getElementById("sidebarAdminToggle");
		var adminGroup = document.getElementById("sidebarGroupAdmin");
		if (adminToggle && adminGroup) {
			adminToggle.addEventListener("click", function () {
				var aberto = adminToggle.classList.toggle("expanded");
				adminGroup.classList.toggle("expanded", aberto);
				localStorage.setItem("sidebarAdminAberta", aberto ? "1" : "0");
			});
		}

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
			if (e.key === "Escape" && sidebar.classList.contains("open"))
				fecharSidebar();
		});

		/* ---------- Navbar ---------- */
		var nav = document.createElement("nav");
		nav.className = "navbar";

		var linksHTML =
			'<button type="button" id="themeToggle" class="theme-toggle-pill" title="Alternar tema escuro" aria-label="Alternar tema escuro"><span class="theme-toggle-knob"></span></button>';

		var buscaHTML = autenticado
			? '<div class="navbar-busca">' +
				'<input type="text" id="navbarBuscaInput" placeholder="Buscar cliente, produto ou venda #..." autocomplete="off" />' +
				'<div class="navbar-busca-resultados" id="navbarBuscaResultados"></div>' +
				"</div>"
			: "";

		nav.innerHTML =
			'<button class="hamburger" id="hamburgerBtn" title="Menu"><span></span><span></span><span></span></button>' +
			'<div class="navbar-brand">ALLU ERP</div>' +
			buscaHTML +
			'<div class="navbar-links">' +
			linksHTML +
			"</div>";

		document.body.insertBefore(nav, document.body.firstChild);

		/* ---------- Eventos ---------- */
		document
			.getElementById("hamburgerBtn")
			.addEventListener("click", abrirSidebar);

		var sidebarClose = sidebar.querySelector(".sidebar-close");
		if (sidebarClose) sidebarClose.addEventListener("click", fecharSidebar);

		var toggle = document.getElementById("themeToggle");
		if (toggle) {
			toggle.addEventListener("click", function () {
				var temaAtual = localStorage.getItem("tema") || "light";
				aplicarTema(temaAtual === "dark" ? "light" : "dark");
			});
		}

		var loginBtn = document.getElementById("sidebarLoginItem");
		if (loginBtn) {
			loginBtn.addEventListener("click", function (e) {
				e.preventDefault();
				fecharSidebar();
				window.location.href = "../auth/login.html";
			});
		}

		var logoutBtn = document.getElementById("sidebarLogoutItem");
		if (logoutBtn) {
			logoutBtn.addEventListener("click", function (e) {
				e.preventDefault();
				fecharSidebar();
				if (window.erpLogout) {
					window.erpLogout();
				} else {
					window.location.href = "../auth/login.html";
				}
			});
		}

		/* ---------- Busca global ---------- */
		var buscaInput = document.getElementById("navbarBuscaInput");
		var buscaResultados = document.getElementById("navbarBuscaResultados");
		var buscaTimer = null;

		function escBusca(t) {
			return String(t == null ? "" : t)
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;")
				.replace(/"/g, "&quot;");
		}

		function formatarMoedaBusca(v) {
			return "R$ " + (Number(v) || 0).toFixed(2);
		}

		function fecharResultadosBusca() {
			buscaResultados.classList.remove("open");
			buscaResultados.innerHTML = "";
		}

		function renderizarResultadosBusca(r) {
			var partes = [];
			if (r.clientes && r.clientes.length) {
				partes.push('<div class="navbar-busca-grupo-titulo">Clientes</div>');
				r.clientes.forEach(function (c) {
					partes.push(
						'<a class="navbar-busca-item" href="../clientes/clientes.html?id=' +
							c.id +
							'">' +
							escBusca((c.codigo ? c.codigo + " - " : "") + c.nome) +
							(c.telefone
								? '<span class="detalhe">' + escBusca(c.telefone) + "</span>"
								: "") +
							"</a>",
					);
				});
			}
			if (r.produtos && r.produtos.length) {
				partes.push('<div class="navbar-busca-grupo-titulo">Produtos</div>');
				r.produtos.forEach(function (p) {
					partes.push(
						'<a class="navbar-busca-item" href="../produtos/cadastro.html?sku=' +
							encodeURIComponent(p.sku || "") +
							'">' +
							escBusca(p.nome) +
							'<span class="detalhe">SKU: ' +
							escBusca(p.sku || "") +
							" — " +
							formatarMoedaBusca(p.preco) +
							"</span>" +
							"</a>",
					);
				});
			}
			if (r.vendas && r.vendas.length) {
				partes.push('<div class="navbar-busca-grupo-titulo">Vendas</div>');
				r.vendas.forEach(function (v) {
					partes.push(
						'<a class="navbar-busca-item" href="../vendas/vendas.html?venda=' +
							v.id +
							'">' +
							"Venda #" +
							v.id +
							" — " +
							formatarMoedaBusca(v.total) +
							'<span class="detalhe">' +
							escBusca(v.cliente_nome || "sem cliente") +
							" · " +
							escBusca(v.status) +
							"</span>" +
							"</a>",
					);
				});
			}
			if (partes.length === 0) {
				buscaResultados.innerHTML =
					'<div class="navbar-busca-vazio">Nenhum resultado encontrado.</div>';
			} else {
				buscaResultados.innerHTML = partes.join("");
			}
			buscaResultados.classList.add("open");
		}

		if (buscaInput) {
			buscaInput.addEventListener("input", function () {
				var termo = buscaInput.value.trim();
				clearTimeout(buscaTimer);
				if (!termo) {
					fecharResultadosBusca();
					return;
				}
				buscaTimer = setTimeout(function () {
					if (!window.erpBanco || !window.erpBanco.busca) return;
					window.erpBanco.busca
						.global(termo)
						.then(renderizarResultadosBusca)
						.catch(function () {
							fecharResultadosBusca();
						});
				}, 250);
			});
			buscaInput.addEventListener("keydown", function (e) {
				if (e.key === "Escape") {
					buscaInput.value = "";
					fecharResultadosBusca();
					buscaInput.blur();
				}
			});
			document.addEventListener("click", function (e) {
				if (!nav.contains(e.target)) fecharResultadosBusca();
			});
		}
	}

	// Sidebar agora depende de dois dados assíncronos: a sessão (já existia)
	// e a lista de módulos vinda de main.js via IPC (ver
	// docs/MODULE_MANIFEST.md e ipc/sistema.js). Se a busca de módulos
	// falhar (ex.: um modulo.json malformado), loga o erro pra não
	// desaparecer sem rastro e segue com lista vazia — Dashboard/PDV/Login/
	// Logout continuam hardcoded acima e alcançáveis mesmo assim; só as
	// seções Gestão/Administração ficam vazias nesse cenário.
	function buscarModulosCarregados() {
		if (!window.api || !window.api.getModulosCarregados) {
			return Promise.resolve([]);
		}
		return window.api.getModulosCarregados().catch(function (erro) {
			console.error("[navbar] falha ao carregar modulo.json:", erro);
			return [];
		});
	}

	if (window.erpAuthPromise) {
		window.erpAuthPromise
			.then(function (sessao) {
				return buscarModulosCarregados().then(function (modulos) {
					iniciarNavbar(sessao, modulos);
				});
			})
			.catch(function () {});
	} else {
		buscarModulosCarregados().then(function (modulos) {
			iniciarNavbar({ autenticado: false, perfil: "admin" }, modulos);
		});
	}
})();
