(function () {
	// Design tokens (ver DESIGN.md na raiz — paleta "livro-razão", genérica,
	// sem tema de vertical de cliente) injetados aqui, não em navbar.js: toda
	// página do app carrega head.js (inclusive login.html e qualquer módulo
	// aberto como aba com ?embedded=1), mas navbar.js sai fora logo na
	// primeira linha quando embedded=1 — então botões/cards dentro de abas
	// ficavam com var(--cor-primaria) etc. nunca definida, resultando em
	// fundo transparente e texto branco invisível sobre fundo branco.
	//
	// --cor-primaria usa o verde "razão" (livro-razão contábil), não o
	// carimbo vermelho do DESIGN.md — vermelho já é --cor-erro neste app;
	// usar vermelho pra "botão normal" E "erro" ao mesmo tempo confundiria o
	// usuário (um botão principal não deveria parecer um estado de perigo).
	// --cor-erro passa a usar o próprio tom de carimbo — combina bem com o
	// significado (carimbo de atenção), sem colidir com a cor de marca.
	var estiloTokens = document.createElement("style");
	estiloTokens.textContent =
		":root {\n" +
		"  --cor-primaria: #00006b; --cor-primaria-forte: #00004d; --cor-primaria-fraca: #E6E6F0; --cor-primaria-fraca-borda: #B8B8D4;\n" +
		"  --cor-sucesso: #0c8006; --cor-sucesso-fraca: #E6F2E6; --cor-sucesso-borda: #B8DCB5;\n" +
		"  --cor-destaque: #00006b; --cor-destaque-ink: #00004d; --cor-destaque-fraca: #E6E6F0; --cor-destaque-borda: #B8B8D4; --cor-destaque-solido: #00006b;\n" +
		"  --cor-erro: #e02815; --cor-erro-fraca: #FDECEC; --cor-erro-borda: #F5C2BD;\n" +
		"  --raio: 6px; --raio-sm: 4px;\n" +
		"  --sombra-card: 0 1px 2px rgba(0,0,0,0.05), 0 8px 20px -12px rgba(0,0,0,0.1);\n" +
		"}\n" +
		"html.dark-theme {\n" +
		"  color-scheme: dark;\n" +
		"  --cor-primaria: #4F4FFF; --cor-primaria-forte: #6B6BFF; --cor-primaria-fraca: #14144A; --cor-primaria-fraca-borda: #2D2D7A;\n" +
		"  --cor-sucesso: #25B31C; --cor-sucesso-fraca: #0F2E0D; --cor-sucesso-borda: #1E4A1C;\n" +
		"  --cor-destaque: #4F4FFF; --cor-destaque-ink: #E6E6F0; --cor-destaque-fraca: #14144A; --cor-destaque-borda: #2D2D7A; --cor-destaque-solido: #4F4FFF;\n" +
		"  --cor-erro: #FF4D3D; --cor-erro-fraca: #3A1A18; --cor-erro-borda: #7A2E2A;\n" +
		"  --sombra-card: 0 1px 2px rgba(0,0,0,0.3), 0 8px 20px -12px rgba(0,0,0,0.5);\n" +
		"}\n";
	(document.head || document.documentElement).appendChild(estiloTokens);

	// Reencaminha exceções não tratadas e promises rejeitadas sem catch para
	// console.error, que main.js grava em userData/erp-crash.log. Sem isso, um
	// erro fora de um try/catch simplesmente desaparecia sem deixar rastro.
	window.addEventListener("error", function (e) {
		console.error(
			"[onerror] " +
				(e.message || "erro desconhecido") +
				" em " +
				(e.filename || "?") +
				":" +
				(e.lineno || "?") +
				":" +
				(e.colno || "?") +
				(e.error && e.error.stack ? "\n" + e.error.stack : ""),
		);
	});
	window.addEventListener("unhandledrejection", function (e) {
		var motivo = e.reason;
		var texto = motivo && motivo.stack ? motivo.stack : String(motivo);
		console.error("[unhandledrejection] " + texto);
	});

	try {
		var tema = localStorage.getItem("tema");
		var isDark = false;
		if (tema === "dark") {
			isDark = true;
		} else if (tema === "light") {
			isDark = false;
		} else if (
			window.matchMedia &&
			window.matchMedia("(prefers-color-scheme: dark)").matches
		) {
			isDark = true;
		}
		if (isDark) {
			document.documentElement.classList.add("dark-theme");
		}
	} catch {
		/* ignora: fallback já assume tema claro */
	}

	// Enriquece qualquer .mensagem existente no app (sucesso/erro/aviso) com
	// título + ícone + botão de fechar, sem precisar editar os ~16 arquivos
	// que só fazem mensagem.className = "mensagem " + tipo e .textContent = texto.
	// Roda via MutationObserver porque cada tela seta o texto/classe depois
	// do carregamento inicial (em resposta a uma ação do usuário).
	var ICONES_MENSAGEM = {
		success:
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
		sucesso:
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
		error:
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
		erro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
		warning:
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
		aviso:
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
		info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
	};
	var TITULOS_MENSAGEM = {
		success: "Sucesso",
		sucesso: "Sucesso",
		error: "Erro",
		erro: "Erro",
		warning: "Atenção",
		aviso: "Atenção",
		info: "Informação",
	};

	// Regra estrutural mínima do ícone/título/botão-fechar injetados abaixo.
	// Necessária porque head.js enriquece .mensagem em TODA página (inclusive
	// telas standalone como login.html, que não linkam modulos.css) — sem isso
	// o <svg> sem width/height explícito renderiza no tamanho intrínseco (gigante).
	var estiloMensagem = document.createElement("style");
	estiloMensagem.textContent =
		".mensagem { position: relative; text-align: left; }" +
		".mensagem .mensagem-titulo { display: flex; align-items: center; gap: 8px; font-weight: 700; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.15); }" +
		".mensagem .mensagem-titulo svg { width: 16px; height: 16px; flex-shrink: 0; }" +
		".mensagem .mensagem-fechar { position: absolute; top: 10px; right: 10px; background: none; border: none; cursor: pointer; font-size: 1.1rem; line-height: 1; padding: 2px 6px; color: inherit; opacity: 0.7; }" +
		".mensagem .mensagem-fechar:hover { opacity: 1; }";
	(document.head || document.documentElement).appendChild(estiloMensagem);

	function tipoDeMensagem(el) {
		for (var i = 0; i < el.classList.length; i++) {
			if (ICONES_MENSAGEM[el.classList[i]]) return el.classList[i];
		}
		return null;
	}

	// Lê o texto "cru" da mensagem: se a estrutura já foi enriquecida, o texto
	// real está em .mensagem-corpo; senão é o textContent inteiro do elemento.
	function textoCruDaMensagem(el) {
		var corpo = el.querySelector(".mensagem-corpo");
		return corpo ? corpo.textContent : el.textContent;
	}

	function enriquecerMensagem(el) {
		var tipo = tipoDeMensagem(el);
		if (!tipo) return;
		var textoNovo = textoCruDaMensagem(el);
		// Não reprocessa se já está na estrutura enriquecida com o mesmo texto —
		// evita loop infinito (reescrever innerHTML dispara childList de novo).
		if (
			el.querySelector(".mensagem-corpo") &&
			el.getAttribute("data-ultimo-texto") === textoNovo
		)
			return;

		el.setAttribute("data-ultimo-texto", textoNovo);
		el.innerHTML =
			'<div class="mensagem-titulo">' +
			(ICONES_MENSAGEM[tipo] || "") +
			"<span>" +
			(TITULOS_MENSAGEM[tipo] || "Aviso") +
			"</span></div>" +
			'<div class="mensagem-corpo"></div>' +
			'<button type="button" class="mensagem-fechar" title="Fechar">&times;</button>';
		el.querySelector(".mensagem-corpo").textContent = textoNovo;
	}

	document.addEventListener("click", function (e) {
		if (
			e.target &&
			e.target.classList &&
			e.target.classList.contains("mensagem-fechar")
		) {
			var box = e.target.closest(".mensagem");
			if (box) box.style.display = "none";
		}
	});

	var observadorMensagens = new MutationObserver(function (mutations) {
		mutations.forEach(function (m) {
			var alvo = m.target;
			if (alvo && alvo.classList && alvo.classList.contains("mensagem")) {
				enriquecerMensagem(alvo);
			}
		});
	});

	function iniciarObservadorMensagens() {
		Array.prototype.forEach.call(
			document.querySelectorAll(".mensagem"),
			enriquecerMensagem,
		);
		observadorMensagens.observe(document.body, {
			attributes: true,
			attributeFilter: ["class"],
			subtree: true,
		});
	}

	if (document.body) {
		iniciarObservadorMensagens();
	} else {
		document.addEventListener("DOMContentLoaded", iniciarObservadorMensagens);
	}
})();
