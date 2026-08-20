(() => {
	var dataInicio = document.getElementById("dataInicio");
	var dataFim = document.getElementById("dataFim");
	var btnGerar = document.getElementById("btnGerar");
	var btnCsvAbc = document.getElementById("btnCsvAbc");
	var btnExportarPdf = document.getElementById("btnExportarPdf");
	var statsResumo = document.getElementById("statsResumo");
	var listaPorDia = document.getElementById("listaPorDia");
	var listaPorPagamento = document.getElementById("listaPorPagamento");
	var listaAbc = document.getElementById("listaAbc");
	var listaComissoes = document.getElementById("listaComissoes");
	var dreResultado = document.getElementById("dreResultado");
	var margemContribuicaoResumo = document.getElementById(
		"margemContribuicaoResumo",
	);
	var listaMargemContribuicao = document.getElementById(
		"listaMargemContribuicao",
	);
	var listaGiroEstoque = document.getElementById("listaGiroEstoque");
	var mensagem = document.getElementById("mensagem");

	var abcCache = [];
	var relatorioCache = {
		resumo: null,
		comissoes: [],
		dre: null,
		periodo: { inicio: null, fim: null },
	};
	var graficos = {};

	var CORES = {
		azul: "#6D28D9",
		verde: "#15803D",
		vermelho: "#B91C1C",
		amarelo: "#B45309",
		cinza: "#64748B",
		paleta: [
			"#6D28D9",
			"#15803D",
			"#F5B301",
			"#B91C1C",
			"#8B5CF6",
			"#0891B2",
			"#DB2777",
		],
	};

	function renderizarGrafico(canvasId, config) {
		var canvas = document.getElementById(canvasId);
		if (!canvas || !window.Chart) return;
		if (graficos[canvasId]) graficos[canvasId].destroy();
		graficos[canvasId] = new window.Chart(canvas.getContext("2d"), config);
	}

	function mostrarMensagem(texto, tipo) {
		mensagem.textContent = texto;
		mensagem.className = "mensagem " + tipo;
		mensagem.style.display = "block";
		setTimeout(() => {
			mensagem.style.display = "none";
		}, 4000);
	}

	var ICONES_STAT = {
		vendas:
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M7 15h4"/></svg>',
		faturamento:
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
		ticket:
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>',
		descontos:
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2.59 12.6A2 2 0 0 1 2 11.17V4a2 2 0 0 1 2-2h7.17a2 2 0 0 1 1.42.59l7.99 7.99a2 2 0 0 1 .01 2.83z"/><line x1="7.5" y1="7.5" x2="7.51" y2="7.5"/></svg>',
	};

	function cardStatV2(cor, icone, valor, label, progresso) {
		var barra =
			progresso == null
				? ""
				: '<div class="stat-v2-progress"><div style="width:' +
					Math.max(0, Math.min(100, progresso)).toFixed(1) +
					'%"></div></div>';
		return (
			'<div class="stat-card-v2 ' +
			cor +
			'">' +
			'<div class="stat-v2-row">' +
			'<div><div class="stat-v2-value">' +
			valor +
			'</div><div class="stat-v2-label">' +
			label +
			"</div></div>" +
			'<div class="stat-v2-icon">' +
			icone +
			"</div>" +
			"</div>" +
			barra +
			"</div>"
		);
	}

	function gerar() {
		var inicio = dataInicio.value || null;
		var fim = dataFim.value || null;
		relatorioCache.periodo = { inicio: inicio, fim: fim };

		if (window.api && window.erpBanco.relatorios.vendasPeriodo) {
			window.erpBanco.relatorios
				.vendasPeriodo(inicio, fim)
				.then((r) => {
					relatorioCache.resumo = r;
					var percentualDesconto =
						r.resumo.faturamento > 0
							? (r.resumo.descontos /
									(r.resumo.faturamento + r.resumo.descontos)) *
								100
							: 0;
					statsResumo.innerHTML =
						cardStatV2("azul", ICONES_STAT.vendas, r.resumo.vendas, "Vendas") +
						cardStatV2(
							"verde",
							ICONES_STAT.faturamento,
							formatarMoeda(r.resumo.faturamento),
							"Faturamento",
						) +
						cardStatV2(
							"azul",
							ICONES_STAT.ticket,
							formatarMoeda(r.resumo.ticketMedio),
							"Ticket médio",
						) +
						cardStatV2(
							"vermelho",
							ICONES_STAT.descontos,
							formatarMoeda(r.resumo.descontos),
							"Descontos dados",
							percentualDesconto,
						);

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
								"<td style='text-align:right; color:var(--cor-sucesso); font-weight:600;'>" +
								formatarMoeda(d.faturamento) +
								"</td>" +
								"<td style='text-align:right;'>" +
								formatarMoeda(d.descontos) +
								"</td>";
							tb1.appendChild(tr);
						});
						listaPorDia.appendChild(t1);
					}

					renderizarGrafico("graficoPorDia", {
						type: "bar",
						data: {
							labels: (r.porDia || []).map((d) => formatarData(d.dia)),
							datasets: [
								{
									label: "Faturamento",
									data: (r.porDia || []).map((d) => d.faturamento),
									backgroundColor: CORES.azul,
									borderRadius: 4,
								},
							],
						},
						options: {
							responsive: true,
							maintainAspectRatio: false,
							plugins: { legend: { display: false } },
							scales: { y: { beginAtZero: true } },
						},
					});

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
								"<td style='text-align:right; color:var(--cor-sucesso); font-weight:600;'>" +
								formatarMoeda(p.faturamento) +
								"</td>";
							tb2.appendChild(tr);
						});
						listaPorPagamento.appendChild(t2);
					}

					renderizarGrafico("graficoPorPagamento", {
						type: "doughnut",
						data: {
							labels: (r.porPagamento || []).map((p) => p.forma_pagamento),
							datasets: [
								{
									data: (r.porPagamento || []).map((p) => p.faturamento),
									backgroundColor: CORES.paleta,
								},
							],
						},
						options: {
							responsive: true,
							maintainAspectRatio: false,
							plugins: {
								legend: {
									position: "bottom",
									labels: { boxWidth: 12, font: { size: 10 } },
								},
							},
						},
					});
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
						if (graficos.graficoAbc) {
							graficos.graficoAbc.destroy();
							delete graficos.graficoAbc;
						}
						return;
					}
					var t = document.createElement("table");
					t.innerHTML =
						"<thead><tr><th>#</th><th>Produto</th><th style='text-align:center;'>Qtd</th><th style='text-align:right;'>Receita</th><th style='text-align:right;'>Custo</th><th style='text-align:right;'>Lucro</th><th style='text-align:right;'>Margem %</th><th style='min-width:120px;'>Acumulado</th><th style='text-align:center;'>Classe</th></tr></thead><tbody></tbody>";
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
							"<td>" +
							l.produto_nome +
							"</td>" +
							"<td style='text-align:center;'>" +
							l.quantidade +
							"</td>" +
							"<td style='text-align:right; color:var(--cor-sucesso); font-weight:600;'>" +
							formatarMoeda(l.receita) +
							"</td>" +
							"<td style='text-align:right;'>" +
							formatarMoeda(l.custo) +
							"</td>" +
							"<td style='text-align:right;'>" +
							formatarMoeda(l.lucro) +
							"</td>" +
							"<td style='text-align:right;'>" +
							l.margem.toFixed(1) +
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

					var receitaPorClasse = { A: 0, B: 0, C: 0 };
					var custoPorClasse = { A: 0, B: 0, C: 0 };
					var lucroPorClasse = { A: 0, B: 0, C: 0 };
					abcCache.forEach((l) => {
						receitaPorClasse[l.classe] += l.receita;
						custoPorClasse[l.classe] += l.custo;
						lucroPorClasse[l.classe] += l.lucro;
					});
					renderizarGrafico("graficoAbc", {
						type: "pie",
						data: {
							labels: ["Classe A", "Classe B", "Classe C"],
							datasets: [
								{
									data: [
										receitaPorClasse.A,
										receitaPorClasse.B,
										receitaPorClasse.C,
									],
									backgroundColor: [CORES.verde, CORES.amarelo, CORES.cinza],
								},
							],
						},
						options: {
							responsive: true,
							maintainAspectRatio: false,
							plugins: {
								legend: {
									position: "bottom",
									labels: { boxWidth: 12, font: { size: 10 } },
								},
							},
						},
					});
				})
				.catch((err) => {
					mostrarMensagem("Erro na Curva ABC: " + err, "erro");
				});
		}

		if (window.api && window.erpBanco.relatorios.comissoes) {
			window.erpBanco.relatorios
				.comissoes(inicio, fim)
				.then((linhas) => {
					relatorioCache.comissoes = linhas || [];
					listaComissoes.innerHTML = "";
					if (!linhas || linhas.length === 0) {
						listaComissoes.innerHTML =
							'<div class="empty-state">Nenhuma venda atribuída a um vendedor no período.</div>';
						return;
					}
					var t = document.createElement("table");
					t.innerHTML =
						"<thead><tr><th>Vendedor</th><th style='text-align:center;'>Vendas</th><th style='text-align:right;'>Total vendido</th><th style='text-align:center;'>Comissão %</th><th style='text-align:right;'>Comissão (R$)</th></tr></thead><tbody></tbody>";
					var tb = t.querySelector("tbody");
					linhas.forEach((l) => {
						var tr = document.createElement("tr");
						tr.innerHTML =
							"<td></td>" +
							"<td style='text-align:center;'>" +
							l.vendas +
							"</td>" +
							"<td style='text-align:right; color:var(--cor-sucesso); font-weight:600;'>" +
							formatarMoeda(l.total_vendido) +
							"</td>" +
							"<td style='text-align:center;'>" +
							l.comissao_percentual.toFixed(1) +
							"%</td>" +
							"<td style='text-align:right; font-weight:600;'>" +
							formatarMoeda(l.comissao_valor) +
							"</td>";
						tr.children[0].textContent = l.nome || l.login;
						tb.appendChild(tr);
					});
					listaComissoes.appendChild(t);
				})
				.catch((err) => {
					mostrarMensagem("Erro nas comissões: " + err, "erro");
				});
		}

		if (window.api && window.erpBanco.relatorios.dre) {
			window.erpBanco.relatorios
				.dre(inicio, fim)
				.then((d) => {
					relatorioCache.dre = d;
					var linha = function (label, valor, opts) {
						opts = opts || {};
						var cor = opts.cor || "#1E293B";
						var peso = opts.destaque ? "700" : "500";
						return (
							"<div style='display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid #F1F5F9; font-size:" +
							(opts.destaque ? "0.95rem" : "0.85rem") +
							";'>" +
							"<span style='color:#475569;'>" +
							label +
							"</span>" +
							"<span style='color:" +
							cor +
							"; font-weight:" +
							peso +
							";'>" +
							formatarMoeda(valor) +
							"</span>" +
							"</div>"
						);
					};
					dreResultado.innerHTML =
						linha("Receita Bruta (" + d.vendas + " venda(s))", d.receitaBruta) +
						linha("(-) Descontos", -d.descontos, { cor: "var(--cor-erro)" }) +
						linha("(=) Receita Líquida", d.receitaLiquida, { destaque: true }) +
						linha("(-) CMV (custo da mercadoria vendida)", -d.cmv, {
							cor: "var(--cor-erro)",
						}) +
						linha(
							"(=) Lucro Bruto (" + d.margemBrutaPercentual.toFixed(1) + "%)",
							d.lucroBruto,
							{
								destaque: true,
								cor:
									d.lucroBruto >= 0 ? "var(--cor-sucesso)" : "var(--cor-erro)",
							},
						) +
						linha("(-) Despesas pagas no período", -d.despesas, {
							cor: "var(--cor-erro)",
						}) +
						linha(
							"(=) Lucro Líquido (" +
								d.margemLiquidaPercentual.toFixed(1) +
								"%)",
							d.lucroLiquido,
							{
								destaque: true,
								cor:
									d.lucroLiquido >= 0
										? "var(--cor-sucesso)"
										: "var(--cor-erro)",
							},
						);

					renderizarGrafico("graficoDre", {
						type: "bar",
						data: {
							labels: ["Receita Líquida", "CMV", "Despesas", "Lucro Líquido"],
							datasets: [
								{
									data: [d.receitaLiquida, -d.cmv, -d.despesas, d.lucroLiquido],
									backgroundColor: [
										CORES.azul,
										CORES.vermelho,
										CORES.vermelho,
										d.lucroLiquido >= 0 ? CORES.verde : CORES.vermelho,
									],
									borderRadius: 4,
								},
							],
						},
						options: {
							indexAxis: "y",
							responsive: true,
							maintainAspectRatio: false,
							plugins: { legend: { display: false } },
						},
					});
				})
				.catch((err) => {
					mostrarMensagem("Erro no DRE: " + err, "erro");
				});
		}

		if (window.api && window.erpBanco.relatorios.pontoDeEquilibrio) {
			window.erpBanco.relatorios
				.pontoDeEquilibrio(inicio, fim)
				.then((pe) => {
					if (!pe.quantidadeNecessaria) {
						margemContribuicaoResumo.textContent =
							"Sem dados suficientes no período pra calcular o ponto de equilíbrio.";
						return;
					}
					margemContribuicaoResumo.textContent =
						"Ponto de equilíbrio: " +
						Math.ceil(pe.quantidadeNecessaria) +
						" unidade(s)/período (" +
						formatarMoeda(pe.faturamentoNecessario) +
						" de faturamento) para cobrir " +
						formatarMoeda(pe.custoFixoMensal) +
						" de custo fixo mensal.";
				})
				.catch((err) => {
					margemContribuicaoResumo.textContent = "Erro: " + err;
				});
		}

		if (window.api && window.erpBanco.relatorios.margemContribuicao) {
			window.erpBanco.relatorios
				.margemContribuicao(inicio, fim)
				.then((m) => {
					listaMargemContribuicao.innerHTML = "";
					if (!m.porProduto || m.porProduto.length === 0) {
						listaMargemContribuicao.innerHTML =
							'<div class="empty-state">Sem vendas no período.</div>';
						return;
					}
					var t = document.createElement("table");
					t.innerHTML =
						"<thead><tr><th>Produto</th><th style='text-align:center;'>Qtd</th><th style='text-align:right;'>Margem contrib.</th><th style='text-align:right;'>Por unidade</th><th style='text-align:right;'>%</th></tr></thead><tbody></tbody>";
					var tb = t.querySelector("tbody");
					m.porProduto
						.slice()
						.sort((a, b) => b.margemContribuicao - a.margemContribuicao)
						.forEach((l) => {
							var tr = document.createElement("tr");
							tr.innerHTML =
								"<td></td>" +
								"<td style='text-align:center;'>" +
								l.quantidade +
								"</td>" +
								"<td style='text-align:right; color:" +
								(l.margemContribuicao >= 0
									? "var(--cor-sucesso)"
									: "var(--cor-erro)") +
								"; font-weight:600;'>" +
								formatarMoeda(l.margemContribuicao) +
								"</td>" +
								"<td style='text-align:right;'>" +
								formatarMoeda(l.margemContribuicaoUnitaria) +
								"</td>" +
								"<td style='text-align:right;'>" +
								l.margemContribuicaoPercentual.toFixed(1) +
								"%</td>";
							tr.children[0].textContent = l.produto_nome;
							tb.appendChild(tr);
						});
					listaMargemContribuicao.appendChild(t);
				})
				.catch((err) => {
					listaMargemContribuicao.innerHTML =
						'<div class="empty-state">Erro: ' + err + "</div>";
				});
		}

		if (window.api && window.erpBanco.relatorios.giroEstoque) {
			window.erpBanco.relatorios
				.giroEstoque(inicio, fim)
				.then((linhas) => {
					listaGiroEstoque.innerHTML = "";
					if (!linhas || linhas.length === 0) {
						listaGiroEstoque.innerHTML =
							'<div class="empty-state">Sem vendas no período.</div>';
						return;
					}
					var t = document.createElement("table");
					t.innerHTML =
						"<thead><tr><th>Produto</th><th style='text-align:center;'>Vendido</th><th style='text-align:center;'>Estoque atual</th><th style='text-align:center;'>Giro</th><th style='text-align:center;'>Dias p/ reposição</th></tr></thead><tbody></tbody>";
					var tb = t.querySelector("tbody");
					linhas
						.slice()
						.sort((a, b) => (b.giro || 0) - (a.giro || 0))
						.forEach((l) => {
							var tr = document.createElement("tr");
							tr.innerHTML =
								"<td></td>" +
								"<td style='text-align:center;'>" +
								l.quantidadeVendida +
								"</td>" +
								"<td style='text-align:center;'>" +
								l.estoqueAtual +
								"</td>" +
								"<td style='text-align:center;'>" +
								(l.giro !== null ? l.giro.toFixed(2) : "—") +
								"</td>" +
								"<td style='text-align:center;'>" +
								(l.diasParaReposicao !== null
									? Math.round(l.diasParaReposicao)
									: "—") +
								"</td>";
							tr.children[0].textContent = l.produto_nome;
							tb.appendChild(tr);
						});
					listaGiroEstoque.appendChild(t);
				})
				.catch((err) => {
					listaGiroEstoque.innerHTML =
						'<div class="empty-state">Erro: ' + err + "</div>";
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

	btnExportarPdf.addEventListener("click", exportarPdf);

	function exportarPdf() {
		if (!window.jspdf || !window.jspdf.jsPDF) {
			mostrarMensagem("Biblioteca de PDF não carregada.", "erro");
			return;
		}
		var doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
		var margem = 40;
		var larguraPagina = doc.internal.pageSize.getWidth();
		var alturaPagina = doc.internal.pageSize.getHeight();
		var y = margem;

		function novaPaginaSeNecessario(espacoNecessario) {
			if (y + espacoNecessario > alturaPagina - margem) {
				doc.addPage();
				y = margem;
			}
		}

		function titulo(texto) {
			novaPaginaSeNecessario(30);
			doc.setFontSize(13);
			doc.setFont(undefined, "bold");
			doc.text(texto, margem, y);
			y += 18;
			doc.setFont(undefined, "normal");
			doc.setFontSize(9);
		}

		function linhaTexto(texto, opts) {
			opts = opts || {};
			novaPaginaSeNecessario(14);
			doc.setFontSize(opts.tamanho || 9);
			doc.setFont(undefined, opts.negrito ? "bold" : "normal");
			doc.text(String(texto), margem + (opts.indent || 0), y);
			y += opts.altura || 13;
		}

		function tabela(colunas, linhas, larguras) {
			novaPaginaSeNecessario(20);
			doc.setFont(undefined, "bold");
			doc.setFontSize(8.5);
			var x = margem;
			colunas.forEach((c, i) => {
				doc.text(c, x, y);
				x += larguras[i];
			});
			y += 12;
			doc.setDrawColor(200);
			doc.line(margem, y - 9, larguraPagina - margem, y - 9);
			doc.setFont(undefined, "normal");
			linhas.forEach((linha) => {
				novaPaginaSeNecessario(14);
				x = margem;
				linha.forEach((valor, i) => {
					doc.text(String(valor), x, y);
					x += larguras[i];
				});
				y += 13;
			});
			y += 6;
		}

		var periodoTxt =
			(relatorioCache.periodo.inicio || "início") +
			" a " +
			(relatorioCache.periodo.fim || "hoje");

		doc.setFontSize(16);
		doc.setFont(undefined, "bold");
		doc.text("Relatório Gerencial — ALLU ERP", margem, y);
		y += 20;
		doc.setFontSize(9);
		doc.setFont(undefined, "normal");
		doc.text(
			"Período: " +
				periodoTxt +
				" | Gerado em: " +
				new Date().toLocaleString("pt-BR"),
			margem,
			y,
		);
		y += 24;

		if (relatorioCache.resumo && relatorioCache.resumo.resumo) {
			var r = relatorioCache.resumo.resumo;
			titulo("Resumo de Vendas");
			linhaTexto("Vendas: " + r.vendas);
			linhaTexto("Faturamento: " + formatarMoeda(r.faturamento));
			linhaTexto("Ticket médio: " + formatarMoeda(r.ticketMedio));
			linhaTexto("Descontos dados: " + formatarMoeda(r.descontos));
			y += 10;
		}

		if (relatorioCache.dre) {
			var d = relatorioCache.dre;
			titulo("DRE — Demonstrativo de Resultado");
			linhaTexto(
				"Receita Bruta (" +
					d.vendas +
					" venda(s)): " +
					formatarMoeda(d.receitaBruta),
			);
			linhaTexto("(-) Descontos: " + formatarMoeda(d.descontos));
			linhaTexto("(=) Receita Líquida: " + formatarMoeda(d.receitaLiquida), {
				negrito: true,
			});
			linhaTexto("(-) CMV: " + formatarMoeda(d.cmv));
			linhaTexto(
				"(=) Lucro Bruto (" +
					d.margemBrutaPercentual.toFixed(1) +
					"%): " +
					formatarMoeda(d.lucroBruto),
				{ negrito: true },
			);
			linhaTexto("(-) Despesas pagas: " + formatarMoeda(d.despesas));
			linhaTexto(
				"(=) Lucro Líquido (" +
					d.margemLiquidaPercentual.toFixed(1) +
					"%): " +
					formatarMoeda(d.lucroLiquido),
				{ negrito: true },
			);
			y += 10;
		}

		if (relatorioCache.comissoes && relatorioCache.comissoes.length > 0) {
			titulo("Comissões por vendedor");
			tabela(
				["Vendedor", "Vendas", "Total vendido", "Comissão %", "Comissão R$"],
				relatorioCache.comissoes.map((l) => [
					l.nome || l.login,
					String(l.vendas),
					formatarMoeda(l.total_vendido),
					l.comissao_percentual.toFixed(1) + "%",
					formatarMoeda(l.comissao_valor),
				]),
				[140, 60, 100, 80, 100],
			);
		}

		if (relatorioCache.comissoes && relatorioCache.comissoes.length > 0) {
			titulo("Comissões por vendedor");
			tabela(
				["Vendedor", "Vendas", "Total vendido", "Comissão %", "Comissão R$"],
				relatorioCache.comissoes.map((l) => [
					l.nome || l.login,
					String(l.vendas),
					formatarMoeda(l.total_vendido),
					l.comissao_percentual.toFixed(1) + "%",
					formatarMoeda(l.comissao_valor),
				]),
				[140, 60, 100, 80, 100],
			);
		}

		if (abcCache.length > 0) {
			titulo("Curva ABC (por lucro)");
			tabela(
				[
					"#",
					"Produto",
					"Qtd",
					"Receita",
					"Custo",
					"Lucro",
					"Margem %",
					"Acumulado",
					"Classe",
				],
				abcCache.map((l, i) => [
					String(i + 1),
					l.produto_nome.length > 32
						? l.produto_nome.slice(0, 32) + "..."
						: l.produto_nome,
					l.quantidade,
					formatarMoeda(l.receita),
					formatarMoeda(l.custo),
					formatarMoeda(l.lucro),
					l.margem.toFixed(1) + "%",
					l.acumulado.toFixed(1) + "%",
					l.classe,
				]),
				[25, 220, 50, 90, 60, 60, 70, 70, 50],
			);
		}

		if (relatorioCache.resumo && relatorioCache.resumo.porDia) {
			titulo("Vendas por Dia");
			tabela(
				["Data", "Vendas", "Faturamento", "Descontos"],
				relatorioCache.resumo.porDia.map((d) => [
					formatarData(d.dia),
					d.vendas,
					formatarMoeda(d.faturamento),
					formatarMoeda(d.descontos),
				]),
				[80, 50, 110, 80],
			);
		}

		if (relatorioCache.resumo && relatorioCache.resumo.porPagamento) {
			titulo("Faturamento por Forma de Pagamento");
			tabela(
				["Forma de Pagamento", "Vendas", "Faturamento"],
				relatorioCache.resumo.porPagamento.map((p) => [
					p.forma_pagamento,
					String(p.vendas),
					formatarMoeda(p.faturamento),
				]),
				[180, 50, 130],
			);
		}

		doc.save("relatorio_" + new Date().toISOString().slice(0, 10) + ".pdf");
		mostrarMensagem("PDF exportado!", "sucesso");
	}

	/* ---------- Aba Vendas (histórico embutido, só admin) ---------- */

	var tabBtns = document.querySelectorAll(".tab-btn");
	var abaAnalises = document.getElementById("abaAnalises");
	var abaVendas = document.getElementById("abaVendas");
	var tabVendas = document.getElementById("tabVendas");
	var frameVendas = document.getElementById("frameVendas");

	tabBtns.forEach((btn) => {
		btn.addEventListener("click", () => {
			tabBtns.forEach((b) => b.classList.remove("active"));
			btn.classList.add("active");
			var aba = btn.getAttribute("data-aba");
			abaAnalises.style.display = aba === "analises" ? "block" : "none";
			abaVendas.style.display = aba === "vendas" ? "block" : "none";
			if (aba === "vendas" && !frameVendas.getAttribute("src")) {
				frameVendas.src = "../vendas/vendas.html?embedded=1";
			}
		});
	});

	// A aba só existe pra admin — Relatórios em si exige só a permissão
	// "relatorios" (um vendedor pode ter), mas Vendas continua mais restrito.
	// Segunda camada de defesa: vendas.html tem data-requer-admin="1" e checa
	// a sessão do documento pai quando embutida — mesmo forçando o botão a
	// aparecer, a página de destino recusa sozinha.
	if (window.erpAuthPromise) {
		window.erpAuthPromise
			.then((sessao) => {
				if (sessao && sessao.perfil === "admin") tabVendas.style.display = "";
			})
			.catch(() => {});
	}

	gerar();
})();
