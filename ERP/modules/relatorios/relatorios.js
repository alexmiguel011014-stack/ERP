(() => {
	var dataInicio = document.getElementById("dataInicio");
	var dataFim = document.getElementById("dataFim");
	var btnGerar = document.getElementById("btnGerar");
	var btnCsvAbc = document.getElementById("btnCsvAbc");
	var statsResumo = document.getElementById("statsResumo");
	var listaPorDia = document.getElementById("listaPorDia");
	var listaPorPagamento = document.getElementById("listaPorPagamento");
	var listaAbc = document.getElementById("listaAbc");
	var mensagem = document.getElementById("mensagem");

	var abcCache = [];

	function mostrarMensagem(texto, tipo) {
		mensagem.textContent = texto;
		mensagem.className = "mensagem " + tipo;
		mensagem.style.display = "block";
		setTimeout(() => {
			mensagem.style.display = "none";
		}, 4000);
	}

	function formatarMoeda(v) {
		return "R$ " + (Number(v) || 0).toFixed(2);
	}

	function formatarData(iso) {
		if (!iso) return "---";
		var p = iso.split("T")[0].split("-");
		return p[2] + "/" + p[1] + "/" + p[0];
	}

	function gerar() {
		var inicio = dataInicio.value || null;
		var fim = dataFim.value || null;

		if (window.api && window.erpBanco.relatorios.vendasPeriodo) {
			window.erpBanco.relatorios
				.vendasPeriodo(inicio, fim)
				.then((r) => {
					statsResumo.innerHTML =
						'<div class="stat-card"><div class="stat-value">' +
						r.resumo.vendas +
						'</div><div class="stat-label">Vendas</div></div>' +
						'<div class="stat-card"><div class="stat-value verde">' +
						formatarMoeda(r.resumo.faturamento) +
						'</div><div class="stat-label">Faturamento</div></div>' +
						'<div class="stat-card"><div class="stat-value">' +
						formatarMoeda(r.resumo.ticketMedio) +
						'</div><div class="stat-label">Ticket médio</div></div>' +
						'<div class="stat-card"><div class="stat-value vermelho">' +
						formatarMoeda(r.resumo.descontos) +
						'</div><div class="stat-label">Descontos dados</div></div>';

					listaPorDia.innerHTML = "";
					if (!r.porDia || r.porDia.length === 0) {
						listaPorDia.innerHTML =
							'<div class="empty-state">Sem vendas no período.</div>';
					} else {
						var t1 = document.createElement("table");
						t1.innerHTML =
							"<thead><tr><th>Data</th><th style='text-align:center;'>Vendas</th><th style='text-align:right;'>Faturamento</th><th style='text-align:right;'>Descontos</th></tr></thead><tbody></tbody>";
						var tb1 = t1.querySelector("tbody");
						r.porDia.forEach((d) => {
							var tr = document.createElement("tr");
							tr.innerHTML =
								"<td>" +
								formatarData(d.dia) +
								"</td>" +
								"<td style='text-align:center;'>" +
								d.vendas +
								"</td>" +
								"<td style='text-align:right; color:#16A34A; font-weight:600;'>" +
								formatarMoeda(d.faturamento) +
								"</td>" +
								"<td style='text-align:right;'>" +
								formatarMoeda(d.descontos) +
								"</td>";
							tb1.appendChild(tr);
						});
						listaPorDia.appendChild(t1);
					}

					listaPorPagamento.innerHTML = "";
					if (!r.porPagamento || r.porPagamento.length === 0) {
						listaPorPagamento.innerHTML =
							'<div class="empty-state">Sem dados no período.</div>';
					} else {
						var t2 = document.createElement("table");
						t2.innerHTML =
							"<thead><tr><th>Forma de pagamento</th><th style='text-align:center;'>Vendas</th><th style='text-align:right;'>Faturamento</th></tr></thead><tbody></tbody>";
						var tb2 = t2.querySelector("tbody");
						r.porPagamento.forEach((p) => {
							var tr = document.createElement("tr");
							tr.innerHTML =
								"<td>" +
								p.forma_pagamento +
								"</td>" +
								"<td style='text-align:center;'>" +
								p.vendas +
								"</td>" +
								"<td style='text-align:right; color:#16A34A; font-weight:600;'>" +
								formatarMoeda(p.faturamento) +
								"</td>";
							tb2.appendChild(tr);
						});
						listaPorPagamento.appendChild(t2);
					}
				})
				.catch((err) => {
					mostrarMensagem("Erro no relatório de vendas: " + err, "erro");
				});
		}

		if (window.api && window.erpBanco.relatorios.curvaABC) {
			window.erpBanco.relatorios
				.curvaABC(inicio, fim)
				.then((rows) => {
					abcCache = rows || [];
					listaAbc.innerHTML = "";
					if (abcCache.length === 0) {
						listaAbc.innerHTML =
							'<div class="empty-state">Sem produtos vendidos no período.</div>';
						return;
					}
					var t = document.createElement("table");
					t.innerHTML =
						"<thead><tr><th>#</th><th>Produto</th><th style='text-align:center;'>Qtd</th><th style='text-align:right;'>Receita</th><th style='text-align:right;'>%</th><th style='min-width:120px;'>Acumulado</th><th style='text-align:center;'>Classe</th></tr></thead><tbody></tbody>";
					var tb = t.querySelector("tbody");
					abcCache.forEach((l, i) => {
						var badge =
							l.classe === "A"
								? "badge-verde"
								: l.classe === "B"
									? "badge-amarela"
									: "badge-cinza";
						var tr = document.createElement("tr");
						tr.innerHTML =
							"<td>" +
							(i + 1) +
							"</td>" +
							"<td></td>" +
							"<td style='text-align:center;'>" +
							l.quantidade +
							"</td>" +
							"<td style='text-align:right; color:#16A34A; font-weight:600;'>" +
							formatarMoeda(l.receita) +
							"</td>" +
							"<td style='text-align:right;'>" +
							l.percentual.toFixed(1) +
							"%</td>" +
							"<td><div class='barra-abc'><div style='width:" +
							Math.min(100, l.acumulado).toFixed(1) +
							"%'></div></div></td>" +
							"<td style='text-align:center;'><span class='badge " +
							badge +
							"'>" +
							l.classe +
							"</span></td>";
						tr.children[1].textContent = l.produto_nome;
						tb.appendChild(tr);
					});
					listaAbc.appendChild(t);
				})
				.catch((err) => {
					mostrarMensagem("Erro na Curva ABC: " + err, "erro");
				});
		}
	}

	btnGerar.addEventListener("click", gerar);

	btnCsvAbc.addEventListener("click", () => {
		if (abcCache.length === 0) {
			mostrarMensagem("Gere a Curva ABC antes de exportar.", "erro");
			return;
		}
		var cabecalho =
			"Posicao,Produto,Quantidade,Receita,Percentual,Acumulado,Classe";
		var linhas = abcCache.map(
			(l, i) =>
				i +
				1 +
				',"' +
				String(l.produto_nome).replace(/"/g, '""') +
				'",' +
				l.quantidade +
				"," +
				l.receita.toFixed(2) +
				"," +
				l.percentual.toFixed(2) +
				"," +
				l.acumulado.toFixed(2) +
				"," +
				l.classe,
		);
		var csv = cabecalho + "\n" + linhas.join("\n");
		var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
		var url = URL.createObjectURL(blob);
		var a = document.createElement("a");
		a.href = url;
		a.download = "curva_abc_" + new Date().toISOString().slice(0, 10) + ".csv";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		mostrarMensagem("CSV da Curva ABC exportado!", "sucesso");
	});

	gerar();
})();
