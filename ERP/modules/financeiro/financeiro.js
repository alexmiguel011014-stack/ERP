(() => {
	var abaAtual = "receber";
	var tabBtns = document.querySelectorAll(".tab-btn");
	var abaLancamentos = document.getElementById("abaLancamentos");
	var abaFluxo = document.getElementById("abaFluxo");
	var abaFechamentos = document.getElementById("abaFechamentos");
	var listaFechamentos = document.getElementById("listaFechamentos");
	var tituloLista = document.getElementById("tituloLista");
	var listaLancamentos = document.getElementById("listaLancamentos");
	var statsLancamentos = document.getElementById("statsLancamentos");
	var mensagem = document.getElementById("mensagem");

	var lancTipo = document.getElementById("lancTipo");
	var lancDescricao = document.getElementById("lancDescricao");
	var lancValor = document.getElementById("lancValor");
	var lancVencimento = document.getElementById("lancVencimento");
	var lancParcelas = document.getElementById("lancParcelas");
	var btnNovoLancamento = document.getElementById("btnNovoLancamento");

	var fluxoInicio = document.getElementById("fluxoInicio");
	var fluxoFim = document.getElementById("fluxoFim");
	var btnFiltrarFluxo = document.getElementById("btnFiltrarFluxo");
	var statsFluxo = document.getElementById("statsFluxo");
	var listaFluxo = document.getElementById("listaFluxo");

	function mostrarMensagem(texto, tipo) {
		mensagem.textContent = texto;
		mensagem.className = "mensagem " + tipo;
		mensagem.style.display = "block";
		setTimeout(() => {
			mensagem.style.display = "none";
		}, 4500);
	}

	/* ---------- Abas ---------- */

	tabBtns.forEach((btn) => {
		btn.addEventListener("click", () => {
			tabBtns.forEach((b) => {
				b.classList.remove("active");
			});
			btn.classList.add("active");
			abaAtual = btn.getAttribute("data-aba");
			abaLancamentos.style.display = "none";
			abaFluxo.style.display = "none";
			abaFechamentos.style.display = "none";
			if (abaAtual === "fluxo") {
				abaFluxo.style.display = "block";
				carregarFluxo();
			} else if (abaAtual === "fechamentos") {
				abaFechamentos.style.display = "block";
				carregarFechamentos();
			} else {
				abaLancamentos.style.display = "block";
				tituloLista.textContent =
					abaAtual === "receber" ? "Contas a receber" : "Contas a pagar";
				carregarLancamentos();
			}
		});
	});

	/* ---------- Fechamentos de caixa ---------- */

	function carregarFechamentos() {
		if (!window.api || !window.erpBanco.caixa || !window.erpBanco.caixa.historico) {
			listaFechamentos.innerHTML =
				'<div class="empty-state">API indisponível.</div>';
			return;
		}
		listaFechamentos.innerHTML = window.erpSkeletonCards ? window.erpSkeletonCards(4) : '<div class="empty-state">Carregando...</div>';
		window.erpBanco.caixa
			.historico(100)
			.then((linhas) => {
				if (!linhas || linhas.length === 0) {
					listaFechamentos.innerHTML =
						'<div class="empty-state">Nenhum fechamento registrado ainda.</div>';
					return;
				}
				var html =
					'<table class="modal-table"><thead><tr><th>Abertura</th><th>Fechamento</th>' +
					"<th>Valor abertura</th><th>Esperado</th><th>Informado</th><th>Diferença</th><th>Obs.</th></tr></thead><tbody>";
				linhas.forEach((f) => {
					var corDiff = Number(f.diferenca) === 0 ? "var(--cor-sucesso)" : "var(--cor-erro)";
					html +=
						"<tr><td>" + formatarData(f.data_abertura) + "</td>" +
						"<td>" + formatarData(f.data_fechamento) + "</td>" +
						"<td>" + formatarMoeda(f.valor_abertura) + "</td>" +
						"<td>" + formatarMoeda(f.valor_esperado) + "</td>" +
						"<td>" + formatarMoeda(f.valor_informado) + "</td>" +
						'<td style="color:' + corDiff + '; font-weight:600;">' + formatarMoeda(f.diferenca) + "</td>" +
						"<td>" + (f.observacao || "---") + "</td></tr>";
				});
				html += "</tbody></table>";
				listaFechamentos.innerHTML = html;
			})
			.catch((err) => {
				listaFechamentos.innerHTML =
					'<div class="empty-state">Erro: ' + err + "</div>";
			});
	}

	/* ---------- Lançamentos ---------- */

	function carregarLancamentos() {
		if (!window.api || !window.erpBanco.financeiro.lancamentos) {
			listaLancamentos.innerHTML =
				'<div class="empty-state">API indisponível.</div>';
			return;
		}
		if (window.erpSkeletonCards) listaLancamentos.innerHTML = window.erpSkeletonCards(4);
		window.erpBanco.financeiro
			.lancamentos({ tipo: abaAtual })
			.then((rows) => {
				listaLancamentos.innerHTML = "";
				rows = rows || [];

				var hoje = new Date().toISOString().slice(0, 10);
				var aberto = 0;
				var vencido = 0;
				rows.forEach((l) => {
					if (l.status === "aberto") {
						aberto += Number(l.valor) || 0;
						if ((l.data_vencimento || "").slice(0, 10) < hoje)
							vencido += Number(l.valor) || 0;
					}
				});

				statsLancamentos.innerHTML =
					'<div class="stat-card"><div class="stat-value ' +
					(abaAtual === "receber" ? "verde" : "vermelho") +
					'">' +
					formatarMoeda(aberto) +
					'</div><div class="stat-label">Em aberto</div></div>' +
					'<div class="stat-card"><div class="stat-value amarelo">' +
					formatarMoeda(vencido) +
					'</div><div class="stat-label">Vencido</div></div>';

				if (rows.length === 0) {
					listaLancamentos.innerHTML =
						'<div class="empty-state">Nenhum lançamento encontrado.</div>';
					return;
				}

				rows.forEach((l) => {
					var div = document.createElement("div");
					div.className = "item-lista";

					var atrasado =
						l.status === "aberto" &&
						(l.data_vencimento || "").slice(0, 10) < hoje;
					var badge =
						l.status === "pago"
							? '<span class="badge badge-verde">Pago</span>'
							: atrasado
								? '<span class="badge badge-vermelha">Vencido</span>'
								: '<span class="badge badge-amarela">Em aberto</span>';

					div.innerHTML =
						'<div class="info"><div class="titulo"></div><div class="detalhe"></div></div>' +
						'<div class="acoes">' +
						badge +
						"</div>";

					div.querySelector(".titulo").textContent =
						l.descricao + " — " + formatarMoeda(l.valor);
					var origemTxt =
						l.origem === "venda"
							? "venda"
							: l.origem === "compra"
								? "compra"
								: "manual";
					div.querySelector(".detalhe").textContent =
						"Vencimento: " +
						formatarData(l.data_vencimento) +
						(l.status === "pago"
							? " | Pago em: " + formatarData(l.data_pagamento)
							: "") +
						" | Origem: " +
						origemTxt +
						(l.parcela_total > 1
							? " | Parcela " + l.parcela_num + "/" + l.parcela_total
							: "");

					var acoes = div.querySelector(".acoes");

					if (l.status === "aberto") {
						var btnBaixar = document.createElement("button");
						btnBaixar.type = "button";
						btnBaixar.className = "btn btn-small";
						btnBaixar.style.background = "#DCFCE7";
						btnBaixar.style.color = "var(--cor-sucesso)";
						btnBaixar.style.borderColor = "#86EFAC";
						btnBaixar.textContent =
							abaAtual === "receber" ? "Receber" : "Pagar";
						btnBaixar.addEventListener("click", () => {
							var verbo = abaAtual === "receber" ? "recebimento" : "pagamento";
							if (
								!confirm(
									"Confirmar " + verbo + " de " + formatarMoeda(l.valor) + "?",
								)
							)
								return;
							window.erpBanco.financeiro
								.baixar(l.id)
								.then(() => {
									mostrarMensagem("Lançamento baixado.", "sucesso");
									carregarLancamentos();
								})
								.catch((err) => {
									mostrarMensagem("Erro: " + err, "erro");
								});
						});
						acoes.appendChild(btnBaixar);

						if (l.origem === "manual") {
							var btnExcluir = document.createElement("button");
							btnExcluir.type = "button";
							btnExcluir.className = "btn btn-small btn-danger";
							btnExcluir.textContent = "Excluir";
							btnExcluir.addEventListener("click", () => {
								if (!confirm("Excluir este lançamento?")) return;
								window.erpBanco.financeiro
									.excluir(l.id)
									.then(() => {
										mostrarMensagem("Lançamento excluído.", "sucesso");
										carregarLancamentos();
									})
									.catch((err) => {
										mostrarMensagem("Erro: " + err, "erro");
									});
							});
							acoes.appendChild(btnExcluir);
						}
					}

					listaLancamentos.appendChild(div);
				});
			})
			.catch((err) => {
				listaLancamentos.innerHTML =
					'<div class="empty-state">Erro: ' + err + "</div>";
			});
	}

	btnNovoLancamento.addEventListener("click", () => {
		var parcelas = Math.max(1, parseInt(lancParcelas.value, 10) || 1);
		var dados = {
			tipo: lancTipo.value,
			descricao: lancDescricao.value.trim(),
			valor: Number(lancValor.value),
			data_vencimento: lancVencimento.value || null,
			parcelas: parcelas,
		};
		if (!dados.descricao) {
			mostrarMensagem("Informe a descrição.", "erro");
			return;
		}
		if (!Number.isFinite(dados.valor) || dados.valor <= 0) {
			mostrarMensagem("Valor inválido.", "erro");
			return;
		}

		window.erpBanco.financeiro
			.criarLancamento(dados)
			.then(() => {
				mostrarMensagem(
					parcelas > 1
						? "Lançamento adicionado em " + parcelas + " parcelas."
						: "Lançamento adicionado.",
					"sucesso",
				);
				lancDescricao.value = "";
				lancValor.value = "";
				lancVencimento.value = "";
				lancParcelas.value = "1";
				if (abaAtual === dados.tipo) carregarLancamentos();
			})
			.catch((err) => {
				mostrarMensagem("Erro: " + err, "erro");
			});
	});

	/* ---------- Fluxo de caixa ---------- */

	function carregarFluxo() {
		if (!window.api || !window.erpBanco.financeiro.fluxoCaixa) {
			listaFluxo.innerHTML = '<div class="empty-state">API indisponível.</div>';
			return;
		}
		if (window.erpSkeletonCards) listaFluxo.innerHTML = window.erpSkeletonCards(4);
		window.erpBanco.financeiro
			.fluxoCaixa(fluxoInicio.value || null, fluxoFim.value || null)
			.then((r) => {
				statsFluxo.innerHTML =
					'<div class="stat-card"><div class="stat-value verde">' +
					formatarMoeda(r.totalEntradas) +
					'</div><div class="stat-label">Entradas</div></div>' +
					'<div class="stat-card"><div class="stat-value vermelho">' +
					formatarMoeda(r.totalSaidas) +
					'</div><div class="stat-label">Saídas</div></div>' +
					'<div class="stat-card"><div class="stat-value ' +
					(r.saldo >= 0 ? "" : "vermelho") +
					'">' +
					formatarMoeda(r.saldo) +
					'</div><div class="stat-label">Saldo do período</div></div>';

				listaFluxo.innerHTML = "";
				if (!r.dias || r.dias.length === 0) {
					listaFluxo.innerHTML =
						'<div class="empty-state">Nenhuma movimentação no período.</div>';
					return;
				}

				var table = document.createElement("table");
				table.innerHTML =
					"<thead><tr><th>Data</th><th style='text-align:right;'>Entradas</th><th style='text-align:right;'>Saídas</th><th style='text-align:right;'>Saldo do dia</th><th style='text-align:right;'>Acumulado</th></tr></thead><tbody></tbody>";
				var tbody = table.querySelector("tbody");
				r.dias.forEach((d) => {
					var tr = document.createElement("tr");
					tr.innerHTML =
						"<td>" +
						formatarData(d.dia) +
						"</td>" +
						"<td style='text-align:right; color:var(--cor-sucesso);'>" +
						formatarMoeda(d.entradas) +
						"</td>" +
						"<td style='text-align:right; color:var(--cor-erro);'>" +
						formatarMoeda(d.saidas) +
						"</td>" +
						"<td style='text-align:right;'>" +
						formatarMoeda(d.saldo) +
						"</td>" +
						"<td style='text-align:right; font-weight:600;'>" +
						formatarMoeda(d.saldoAcumulado) +
						"</td>";
					tbody.appendChild(tr);
				});
				listaFluxo.appendChild(table);
			})
			.catch((err) => {
				listaFluxo.innerHTML =
					'<div class="empty-state">Erro: ' + err + "</div>";
			});
	}

	btnFiltrarFluxo.addEventListener("click", carregarFluxo);

	lancVencimento.value = new Date().toISOString().slice(0, 10);
	carregarLancamentos();
})();
