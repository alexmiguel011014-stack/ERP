(() => {
	var form = document.getElementById("formUsuario");
	var editandoId = document.getElementById("usuarioEditandoId");
	var nome = document.getElementById("nome");
	var login = document.getElementById("login");
	var senha = document.getElementById("senha");
	var confirmar = document.getElementById("senhaConfirmar");
	var ativo = document.getElementById("ativo");
	var perfil = document.getElementById("perfil");
	var grupoComissao = document.getElementById("grupoComissao");
	var comissao = document.getElementById("comissao");
	var grupoPermissoes = document.getElementById("grupoPermissoes");
	var checksPermissoes = Array.prototype.slice.call(document.querySelectorAll(".perm-modulo"));
	var btnSalvar = document.getElementById("btnSalvar");
	var btnLimpar = document.getElementById("btnLimpar");
	var btnCancelarEdicao = document.getElementById("btnCancelarEdicao");
	var lista = document.getElementById("listaUsuarios");
	var mensagem = document.getElementById("mensagem");
	var senhaHint = document.getElementById("senhaHint");

	var usuarios = [];
	var sessaoUsuario = null;

	function mostrarMensagem(texto, tipo) {
		mensagem.textContent = texto;
		mensagem.className = "mensagem " + tipo;
		mensagem.style.display = "block";
		setTimeout(() => {
			mensagem.style.display = "none";
		}, 5000);
	}

	function limparEdicao() {
		editandoId.value = "";
		form.reset();
		ativo.checked = true;
		perfil.value = "admin";
		comissao.value = "0";
		grupoComissao.style.display = "none";
		grupoPermissoes.style.display = "none";
		checksPermissoes.forEach((c) => { c.checked = false; });
		senha.required = true;
		senhaHint.style.display = "none";
		btnSalvar.textContent = "Salvar Usuário";
		btnCancelarEdicao.style.display = "none";
		login.disabled = false;
		login.readOnly = false;
	}

	perfil.addEventListener("change", () => {
		var ehVendedor = perfil.value === "vendedor";
		grupoComissao.style.display = ehVendedor ? "block" : "none";
		grupoPermissoes.style.display = ehVendedor ? "block" : "none";
	});

	function carregar() {
		if (!window.api || !window.erpBanco.usuarios.listar) {
			lista.innerHTML = '<div class="empty-state">API indisponível.</div>';
			return;
		}
		if (window.erpSkeletonCards) lista.innerHTML = window.erpSkeletonCards(4);
		window.api
			.getAuthSession()
			.then((s) => {
				sessaoUsuario = (s && s.usuario) || null;
				return window.erpBanco.usuarios.listar();
			})
			.then((rows) => {
				usuarios = Array.isArray(rows) ? rows : [];
				renderizar();
				preencherFiltrosLog();
			})
			.catch((err) => {
				lista.innerHTML = '<div class="empty-state">Erro: ' + err + "</div>";
			});
	}

	function renderizar() {
		lista.innerHTML = "";
		if (usuarios.length === 0) {
			lista.innerHTML =
				'<div class="empty-state">Nenhum usuário cadastrado.</div>';
			return;
		}
		usuarios.forEach((u) => {
			var eu = sessaoUsuario && sessaoUsuario.id === u.id;
			var status =
				Number(u.ativo) === 1
					? '<span class="badge badge-verde">Ativo</span>'
					: '<span class="badge badge-cinza">Desativado</span>';
			var perfilBadge =
				'<span class="badge badge-azul">' +
				String(u.perfil || "admin").toUpperCase() +
				"</span>";

			var div = document.createElement("div");
			div.className = "item-lista";
			div.innerHTML =
				'<div class="info"><div class="titulo"></div><div class="detalhe"></div></div>' +
				'<div class="acoes">' +
				'<button type="button" class="btn btn-small" data-acao="editar">Editar</button>' +
				(eu
					? ""
					: '<button type="button" class="btn btn-small" data-acao="alternar">' +
						(Number(u.ativo) === 1 ? "Desativar" : "Ativar") +
						"</button>") +
				(eu
					? '<button type="button" class="btn btn-small btn-danger" disabled title="Você está logado com este usuário">Excluir</button>'
					: '<button type="button" class="btn btn-small btn-danger" data-acao="excluir">Excluir</button>') +
				"</div>";

			div.querySelector(".titulo").textContent =
				(u.nome || u.login) + (eu ? " (você)" : "");
			div.querySelector(".detalhe").innerHTML =
				"Login: <b>" + u.login + "</b> · " + perfilBadge + " · " + status;

			var btnEditar = div.querySelector('[data-acao="editar"]');
			if (btnEditar) {
				btnEditar.addEventListener("click", () => {
					editandoId.value = u.id;
					nome.value = u.nome || "";
					login.value = u.login || "";
					ativo.checked = Number(u.ativo) === 1;
					perfil.value = u.perfil === "vendedor" ? "vendedor" : "admin";
					comissao.value = Number(u.comissao_percentual) || 0;
					var ehVendedor = perfil.value === "vendedor";
					grupoComissao.style.display = ehVendedor ? "block" : "none";
					grupoPermissoes.style.display = ehVendedor ? "block" : "none";
					var permissoesUsuario = {};
					try { permissoesUsuario = JSON.parse(u.permissoes || "{}") || {}; } catch (e) { permissoesUsuario = {}; }
					checksPermissoes.forEach((c) => { c.checked = permissoesUsuario[c.value] === true; });
					senha.value = "";
					confirmar.value = "";
					senha.required = false;
					senhaHint.style.display = "block";
					btnSalvar.textContent = "Salvar Alterações";
					btnCancelarEdicao.style.display = "inline-block";
					login.disabled = true;
					login.readOnly = true;
					window.scrollTo({ top: 0, behavior: "smooth" });
					nome.focus();
				});
			}

			var btnAlternar = div.querySelector('[data-acao="alternar"]');
			if (btnAlternar) {
				btnAlternar.addEventListener("click", () => {
					var novoEstado = Number(u.ativo) === 1 ? 0 : 1;
					var permissoesAtuais = {};
					try { permissoesAtuais = JSON.parse(u.permissoes || "{}") || {}; } catch (e) { permissoesAtuais = {}; }
					window.erpBanco.usuarios
						.salvar({
							id: u.id,
							login: u.login,
							nome: u.nome,
							perfil: u.perfil,
							comissao_percentual: u.comissao_percentual,
							permissoes: permissoesAtuais,
							ativo: novoEstado === 1,
							senha: "",
						})
						.then(() => {
							mostrarMensagem(
								novoEstado ? "Usuário ativado." : "Usuário desativado.",
								"sucesso",
							);
							carregar();
						})
						.catch((err) => {
							mostrarMensagem("Erro: " + err, "erro");
						});
				});
			}

			var btnExcluir = div.querySelector('[data-acao="excluir"]');
			if (btnExcluir) {
				btnExcluir.addEventListener("click", () => {
					if (
						!confirm(
							'Excluir o usuário "' +
								(u.nome || u.login) +
								'" (' +
								u.login +
								")? Esta ação não pode ser desfeita.",
						)
					)
						return;
					window.erpBanco.usuarios
						.remover(u.id)
						.then(() => {
							mostrarMensagem("Usuário removido.", "sucesso");
							carregar();
						})
						.catch((err) => {
							mostrarMensagem("Erro: " + err, "erro");
						});
				});
			}

			lista.appendChild(div);
		});
	}

	form.addEventListener("submit", (e) => {
		e.preventDefault();
		var editando = !!editandoId.value;
		var senhaVal = senha.value;
		var loginVal = login.value.trim().toLowerCase();

		if (!nome.value.trim()) {
			mostrarMensagem("Informe o nome do usuário.", "erro");
			return;
		}
		if (!loginVal) {
			mostrarMensagem("Informe o login do usuário.", "erro");
			return;
		}
		if (!editando && senhaVal.length < 4) {
			mostrarMensagem("Defina uma senha com pelo menos 4 caracteres.", "erro");
			return;
		}
		if (!editando && senhaVal !== confirmar.value) {
			mostrarMensagem("As senhas não coincidem.", "erro");
			return;
		}
		if (editando && senhaVal.length > 0 && senhaVal.length < 4) {
			mostrarMensagem("A nova senha deve ter pelo menos 4 caracteres.", "erro");
			return;
		}

		var permissoesSelecionadas = {};
		checksPermissoes.forEach((c) => { if (c.checked) permissoesSelecionadas[c.value] = true; });

		var dados = {
			login: loginVal,
			nome: nome.value.trim(),
			perfil: perfil.value === "vendedor" ? "vendedor" : "admin",
			comissao_percentual: parseFloat(comissao.value) || 0,
			ativo: ativo.checked,
			senha: senhaVal,
			permissoes: permissoesSelecionadas,
		};
		if (editando) dados.id = Number(editandoId.value);

		// Não permite desativar/excluir a si mesmo, nem tirar o próprio acesso admin.
		if (
			editando &&
			sessaoUsuario &&
			sessaoUsuario.id === dados.id &&
			!dados.ativo
		) {
			mostrarMensagem("Você não pode desativar o próprio usuário.", "erro");
			return;
		}
		if (
			editando &&
			sessaoUsuario &&
			sessaoUsuario.id === dados.id &&
			dados.perfil !== "admin"
		) {
			mostrarMensagem("Você não pode remover o próprio acesso de admin.", "erro");
			return;
		}

		btnSalvar.disabled = true;
		window.erpBanco.usuarios
			.salvar(dados)
			.then(() => {
				mostrarMensagem(
					editando ? "Usuário atualizado!" : "Usuário criado!",
					"sucesso",
				);
				btnSalvar.disabled = false;
				limparEdicao();
				carregar();
			})
			.catch((err) => {
				mostrarMensagem("Erro: " + err, "erro");
				btnSalvar.disabled = false;
			});
	});

	btnLimpar.addEventListener("click", limparEdicao);
	btnCancelarEdicao.addEventListener("click", limparEdicao);

	/* ==================== Log de atividades ==================== */

	var filtroLogUsuario = document.getElementById("filtroLogUsuario");
	var filtroLogAcao = document.getElementById("filtroLogAcao");
	var btnAtualizarLog = document.getElementById("btnAtualizarLog");
	var listaLog = document.getElementById("listaLog");

	var ACOES_LOG = [
		"login", "criar-produto", "editar-produto", "excluir-produto",
		"restaurar-produto", "excluir-produto-permanente",
		"alterar-preco", "finalizar-venda", "criar-orcamento",
		"excluir-cliente", "restaurar-cliente", "excluir-cliente-permanente",
		"criar-pedido-compra", "receber-pedido-compra", "cancelar-pedido-compra",
		"criar-lancamento", "baixar-lancamento", "excluir-lancamento",
		"abrir-caixa", "fechar-caixa",
		"criar-usuario", "editar-usuario", "excluir-usuario",
	];

	function preencherFiltrosLog() {
		filtroLogUsuario.innerHTML = '<option value="">Todos os usuários</option>';
		usuarios.forEach((u) => {
			var opt = document.createElement("option");
			opt.value = u.id;
			opt.textContent = u.nome || u.login;
			filtroLogUsuario.appendChild(opt);
		});
		filtroLogAcao.innerHTML = '<option value="">Todas as ações</option>';
		ACOES_LOG.forEach((a) => {
			var opt = document.createElement("option");
			opt.value = a;
			opt.textContent = a;
			filtroLogAcao.appendChild(opt);
		});
	}

	function formatarDataHora(iso) {
		if (!iso) return "---";
		try {
			return new Date(iso).toLocaleString("pt-BR");
		} catch (e) {
			return iso;
		}
	}

	function carregarLog() {
		if (!window.api || !window.erpBanco.banco.logAtividades) {
			listaLog.innerHTML = '<div class="empty-state">API indisponível.</div>';
			return;
		}
		var filtro = {
			usuarioId: filtroLogUsuario.value ? Number(filtroLogUsuario.value) : undefined,
			acao: filtroLogAcao.value || undefined,
		};
		listaLog.innerHTML = window.erpSkeletonCards ? window.erpSkeletonCards(4) : '<div class="empty-state">Carregando...</div>';
		window.erpBanco.banco
			.logAtividades(filtro)
			.then((linhas) => {
				listaLog.innerHTML = "";
				if (!linhas || linhas.length === 0) {
					listaLog.innerHTML = '<div class="empty-state">Nenhuma atividade registrada.</div>';
					return;
				}
				linhas.forEach((l) => {
					var div = document.createElement("div");
					div.className = "item-lista";
					div.innerHTML = '<div class="info"><div class="titulo"></div><div class="detalhe"></div></div>';
					div.querySelector(".titulo").textContent =
						(l.usuario_login || "sistema") + " — " + l.acao;
					var partes = [formatarDataHora(l.data)];
					if (l.entidade) partes.push(l.entidade + (l.entidade_id ? " #" + l.entidade_id : ""));
					if (l.detalhes) partes.push(l.detalhes);
					div.querySelector(".detalhe").textContent = partes.join(" | ");
					listaLog.appendChild(div);
				});
			})
			.catch((err) => {
				listaLog.innerHTML = '<div class="empty-state">Erro: ' + err + "</div>";
			});
	}

	btnAtualizarLog.addEventListener("click", carregarLog);
	filtroLogUsuario.addEventListener("change", carregarLog);
	filtroLogAcao.addEventListener("change", carregarLog);

	carregar();
	carregarLog();
})();
