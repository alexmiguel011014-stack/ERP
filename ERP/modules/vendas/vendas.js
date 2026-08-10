(() => {
	var filterDataInicio = document.getElementById("filterDataInicio");
	var filterDataFim = document.getElementById("filterDataFim");
	var btnFilter = document.getElementById("btnFilter");
	var btnClear = document.getElementById("btnClear");
	var tbodyVendas = document.getElementById("tbodyVendas");
	var statsVendas = document.getElementById("statsVendas");
	var mensagem = document.getElementById("mensagem");
	var btnExportCsv = document.getElementById("btnExportCsv");
	var buscaVendas = document.getElementById("buscaVendas");
	var legendStatus = document.getElementById("legendStatus");
	var legendPagamento = document.getElementById("legendPagamento");
	var linhasPorPaginaSelect = document.getElementById("linhasPorPagina");
	var pager = document.getElementById("pager");

	var FORMAS_PAGAMENTO = ["PIX", "Cartão", "Dinheiro", "Fiado"];
	var statusFiltro = "";
	var pagamentoFiltro = "";
	var buscaQuery = "";
	var sortState = { key: "data_venda", dir: -1 };
	var paginaAtual = 1;
	var linhasPorPagina = 10;
	var linhaExpandidaId = null;
	var itensCache = {}; // vendaId -> itens (evita re-buscar ao reabrir a mesma linha)

	function formatarData(dataISO) {
		if (!dataISO) return "---";
		var partes = dataISO.split("T")[0].split("-");
		return partes[2] + "/" + partes[1] + "/" + partes[0];
	}

	function formatarMoeda(valor) {
		return "R$ " + (valor || 0).toFixed(2);
	}

	var vendasCache = [];
	var vendaDaURLAberta = false;
	var detalheAtualCache = null;

	function abrirVendaDaURL() {
		if (vendaDaURLAberta) return;
		var params = new URLSearchParams(window.location.search);
		var vendaId = parseInt(params.get("venda"), 10);
		if (!Number.isInteger(vendaId) || vendaId <= 0) return;
		vendaDaURLAberta = true;
		if (vendasCache.some((v) => v.id === vendaId)) {
			mostrarDetalhesVenda(vendaId);
		} else {
			mostrarMensagem("Venda #" + vendaId + " não encontrada na lista atual.", "erro");
		}
	}

	function montarLegendas() {
		if (legendPagamento) {
			var extras = FORMAS_PAGAMENTO.map((f) =>
				'<button type="button" class="legend-btn" data-pagamento="' + f + '">' + f +
				' <span class="count-badge" id="cntPag' + f.replace(/[^a-zA-Z]/g, "") + '">0</span></button>'
			).join("");
			legendPagamento.querySelectorAll(".legend-btn[data-pagamento]:not([data-pagamento=''])").forEach((b) => b.remove());
			legendPagamento.insertAdjacentHTML("beforeend", extras);
		}
	}
	montarLegendas();

	function matchesBusca(v) {
		if (!buscaQuery) return true;
		var alvo = (String(v.id) + " " + (v.cliente_nome || "") + " " + (v.forma_pagamento || "")).toLowerCase();
		return alvo.indexOf(buscaQuery) !== -1;
	}

	function getFiltradas() {
		return vendasCache.filter((v) => {
			var matchStatus = !statusFiltro || v.status === statusFiltro;
			var matchPagamento = !pagamentoFiltro || v.forma_pagamento === pagamentoFiltro;
			return matchStatus && matchPagamento && matchesBusca(v);
		});
	}

	function aplicarSort(lista) {
		if (!sortState.key) return lista;
		var key = sortState.key;
		var dir = sortState.dir;
		return lista.slice().sort((a, b) => {
			if (key === "total" || key === "id") return ((a[key] || 0) - (b[key] || 0)) * dir;
			if (key === "data_venda") return (new Date(a.data_venda) - new Date(b.data_venda)) * dir;
			var va = String(a[key] || "").toLowerCase();
			var vb = String(b[key] || "").toLowerCase();
			return va.localeCompare(vb) * dir;
		});
	}

	function atualizarIconesSort() {
		["id", "cliente_nome", "status", "data_venda", "forma_pagamento", "total"].forEach((k) => {
			var icon = document.getElementById("sortIcon-" + k);
			if (!icon) return;
			icon.textContent = sortState.key === k ? (sortState.dir > 0 ? "▲" : "▼") : "";
		});
	}

	function atualizarContadores() {
		var semStatus = vendasCache.filter((v) => (!pagamentoFiltro || v.forma_pagamento === pagamentoFiltro) && matchesBusca(v));
		var elTodas = document.getElementById("cntStatusTodas");
		var elFin = document.getElementById("cntStatusFinalizada");
		var elOrc = document.getElementById("cntStatusOrcamento");
		if (elTodas) elTodas.textContent = semStatus.length;
		if (elFin) elFin.textContent = semStatus.filter((v) => v.status === "finalizada").length;
		if (elOrc) elOrc.textContent = semStatus.filter((v) => v.status === "orcamento").length;

		var semPagamento = vendasCache.filter((v) => (!statusFiltro || v.status === statusFiltro) && matchesBusca(v));
		var elPagTodas = document.getElementById("cntPagTodas");
		if (elPagTodas) elPagTodas.textContent = semPagamento.length;
		FORMAS_PAGAMENTO.forEach((f) => {
			var el = document.getElementById("cntPag" + f.replace(/[^a-zA-Z]/g, ""));
			if (el) el.textContent = semPagamento.filter((v) => v.forma_pagamento === f).length;
		});
	}

	function linhaDetalhesHtml(vendaId, itens) {
		if (!itens || itens.length === 0) {
			return '<div class="empty-state" style="padding:12px 0;">Nenhum item encontrado.</div>';
		}
		var linhas = itens.map((item) => {
			var subtotal = (item.preco_unitario || 0) * (item.quantidade || 1);
			var detalhes = formatarAtributos(item.atributos, item.tamanho, item.cor);
			var nomeCell = (item.produto_nome || "---") + (detalhes !== "---" ? " (" + detalhes + ")" : "");
			return (
				"<tr><td>" + nomeCell + "</td><td>" + (item.sku || "---") +
				'</td><td class="col-num">' + (item.quantidade || 1) +
				'</td><td class="col-num">' + formatarMoeda(item.preco_unitario) +
				'</td><td class="col-num" style="font-weight:600; color:var(--cor-sucesso);">' + formatarMoeda(subtotal) + "</td></tr>"
			);
		}).join("");
		return (
			'<table class="row-details-itens"><thead><tr><th>Produto</th><th>SKU</th><th class="col-num">Qtd</th><th class="col-num">Unit.</th><th class="col-num">Subtotal</th></tr></thead><tbody>' +
			linhas +
			"</tbody></table>" +
			'<div class="row-details-acoes"><button type="button" class="btn btn-small btn-ver-detalhes" data-venda-id="' + vendaId + '">Ver detalhes completos</button></div>'
		);
	}

	function popularLinhaDetalhes(vendaId, trDetalhes) {
		var td = trDetalhes.querySelector("td");
		if (itensCache[vendaId]) {
			td.innerHTML = linhaDetalhesHtml(vendaId, itensCache[vendaId]);
			return;
		}
		td.innerHTML = '<div class="empty-state" style="padding:12px 0;">Carregando itens...</div>';
		if (!window.api || !window.erpBanco.vendas.itens) return;
		window.api
			.getItensVenda(vendaId)
			.then((itens) => {
				itensCache[vendaId] = itens || [];
				td.innerHTML = linhaDetalhesHtml(vendaId, itensCache[vendaId]);
			})
			.catch((err) => {
				td.innerHTML = '<div class="empty-state">Erro ao carregar itens: ' + err + "</div>";
			});
	}

	function alternarExpansao(vendaId) {
		linhaExpandidaId = linhaExpandidaId === vendaId ? null : vendaId;
		renderizarTabela();
	}

	function renderizarPager(total, totalPaginas) {
		if (!pager) return;
		function btn(label, pagina, opts) {
			opts = opts || {};
			var cls = "";
			if (opts.ativo) cls = " ativo";
			return (
				'<button type="button"' + (opts.disabled ? " disabled" : "") +
				(pagina != null ? ' data-pagina="' + pagina + '"' : "") +
				' class="' + cls.trim() + '">' + label + "</button>"
			);
		}
		var html = "";
		html += btn("Anterior", paginaAtual - 1, { disabled: paginaAtual === 1 });
		var janela = 5;
		var inicio = Math.max(1, paginaAtual - Math.floor(janela / 2));
		var fim = Math.min(totalPaginas, inicio + janela - 1);
		inicio = Math.max(1, fim - janela + 1);
		for (var p = inicio; p <= fim; p++) html += btn(String(p), p, { ativo: p === paginaAtual });
		html += btn("Próxima", paginaAtual + 1, { disabled: paginaAtual === totalPaginas });
		var comeco = total === 0 ? 0 : (paginaAtual - 1) * linhasPorPagina + 1;
		var fimIntervalo = Math.min(paginaAtual * linhasPorPagina, total);
		html += '<span class="pager-info">' + comeco + "–" + fimIntervalo + " de " + total + "</span>";
		pager.innerHTML = html;
		pager.querySelectorAll("button[data-pagina]").forEach((b) => {
			b.addEventListener("click", () => {
				var p = parseInt(b.getAttribute("data-pagina"), 10);
				if (!isNaN(p) && p >= 1 && p <= totalPaginas) {
					paginaAtual = p;
					renderizarTabela();
				}
			});
		});
	}

	function renderizarTabela() {
		var filtradas = getFiltradas();
		var ordenadas = aplicarSort(filtradas);
		var total = ordenadas.length;
		var totalPaginas = Math.max(1, Math.ceil(total / linhasPorPagina));
		paginaAtual = Math.min(paginaAtual, totalPaginas);
		var inicioSlice = (paginaAtual - 1) * linhasPorPagina;
		var pagina = ordenadas.slice(inicioSlice, inicioSlice + linhasPorPagina);

		atualizarIconesSort();
		atualizarContadores();

		if (pagina.length === 0) {
			tbodyVendas.innerHTML =
				'<tr><td colspan="7"><div class="empty-state">Nenhuma venda encontrada.</div></td></tr>';
			renderizarPager(total, totalPaginas);
			return;
		}

		var html = "";
		pagina.forEach((v, i) => {
			var ehOrcamento = v.status === "orcamento";
			var expandida = linhaExpandidaId === v.id;
			var badgeStatus = ehOrcamento
				? '<span class="badge-status orcamento"><span class="dot"></span>Orçamento</span>'
				: '<span class="badge-status finalizada"><span class="dot"></span>Finalizada</span>';

			html +=
				'<tr class="row-main' + (i % 2 === 1 ? " even" : "") + (expandida ? " expandida" : "") + '" data-venda-id="' + v.id + '">' +
				'<td class="col-expandir"><span class="expandir-toggle">›</span></td>' +
				'<td class="venda-numero">#' + v.id + "</td>" +
				'<td class="venda-cliente">' + (v.cliente_nome || "Cliente não informado") + "</td>" +
				"<td>" + badgeStatus + "</td>" +
				"<td>" + formatarData(v.data_venda) + "</td>" +
				"<td>" + (v.forma_pagamento || "---") + "</td>" +
				'<td class="col-valor"><span class="venda-total' + (ehOrcamento ? " orcamento" : "") + '">' + formatarMoeda(v.total) + "</span></td>" +
				"</tr>";
			html +=
				'<tr class="row-details' + (expandida ? "" : " hidden") + '" data-detalhes-id="' + v.id + '">' +
				'<td colspan="7"></td></tr>';
		});
		tbodyVendas.innerHTML = html;

		if (linhaExpandidaId != null) {
			var trDet = tbodyVendas.querySelector('.row-details[data-detalhes-id="' + linhaExpandidaId + '"]');
			if (trDet) popularLinhaDetalhes(linhaExpandidaId, trDet);
		}

		renderizarPager(total, totalPaginas);
	}

	tbodyVendas.addEventListener("click", (e) => {
		var btnVer = e.target.closest(".btn-ver-detalhes");
		if (btnVer) {
			mostrarDetalhesVenda(parseInt(btnVer.getAttribute("data-venda-id"), 10));
			return;
		}
		var tr = e.target.closest("tr.row-main");
		if (!tr) return;
		alternarExpansao(parseInt(tr.getAttribute("data-venda-id"), 10));
	});

	document.querySelectorAll(".tabela-vendas th.sortable").forEach((th) => {
		th.addEventListener("click", () => {
			var key = th.getAttribute("data-key");
			sortState.dir = sortState.key === key ? -sortState.dir : 1;
			sortState.key = key;
			renderizarTabela();
		});
	});

	if (legendStatus) {
		legendStatus.querySelectorAll(".legend-btn").forEach((btn) => {
			btn.addEventListener("click", () => {
				legendStatus.querySelectorAll(".legend-btn").forEach((b) => b.classList.remove("active"));
				btn.classList.add("active");
				statusFiltro = btn.getAttribute("data-status") || "";
				paginaAtual = 1;
				renderizarTabela();
			});
		});
	}
	if (legendPagamento) {
		legendPagamento.addEventListener("click", (e) => {
			var btn = e.target.closest(".legend-btn");
			if (!btn) return;
			legendPagamento.querySelectorAll(".legend-btn").forEach((b) => b.classList.remove("active"));
			btn.classList.add("active");
			pagamentoFiltro = btn.getAttribute("data-pagamento") || "";
			paginaAtual = 1;
			renderizarTabela();
		});
	}
	if (buscaVendas) {
		buscaVendas.addEventListener("input", () => {
			buscaQuery = buscaVendas.value.trim().toLowerCase();
			paginaAtual = 1;
			renderizarTabela();
		});
	}
	if (linhasPorPaginaSelect) {
		linhasPorPaginaSelect.addEventListener("change", () => {
			linhasPorPagina = parseInt(linhasPorPaginaSelect.value, 10) || 10;
			paginaAtual = 1;
			renderizarTabela();
		});
	}

	function carregarVendas(filtro) {
		if (!window.api || !window.erpBanco.vendas.listar) {
			tbodyVendas.innerHTML = '<tr><td colspan="7"><div class="empty-state">API indisponível.</div></td></tr>';
			return;
		}

		tbodyVendas.innerHTML = '<tr><td colspan="7"><div class="empty-state">Carregando...</div></td></tr>';

		window.api
			.getVendas(filtro || {})
			.then((vendas) => {
				vendasCache = vendas || [];
				itensCache = {};
				linhaExpandidaId = null;
				paginaAtual = 1;
				statsVendas.innerHTML = "";

				abrirVendaDaURL();

				if (!vendasCache.length) {
					if (btnExportCsv) btnExportCsv.disabled = true;
					renderizarTabela();
					return;
				}

				if (btnExportCsv) btnExportCsv.disabled = false;

				var totalVendas = vendasCache.length;
				var totalFaturado = vendasCache.reduce((acc, v) => acc + (v.total || 0), 0);
				statsVendas.innerHTML =
					'<div class="stat-card"><div class="stat-value">' + totalVendas +
					'</div><div class="stat-label">Registros</div></div>' +
					'<div class="stat-card"><div class="stat-value">' + formatarMoeda(totalFaturado) +
					'</div><div class="stat-label">Total</div></div>';

				renderizarTabela();
			})
			.catch((err) => {
				tbodyVendas.innerHTML = '<tr><td colspan="7"><div class="empty-state">Erro ao carregar vendas: ' + err + "</div></td></tr>";
			});
	}

	function mostrarDetalhesVenda(vendaId) {
		if (!window.api || !window.erpBanco.vendas.itens) {
			mostrarMensagem("API indisponvel.", "erro");
			return;
		}

		var venda = vendasCache.find((v) => v.id == vendaId);

		window.api
			.getItensVenda(vendaId)
			.then((itens) => {
				detalheAtualCache = { vendaId: vendaId, venda: venda, itens: itens || [] };
				var html = "";
				html += '<div style="max-width:600px;">';
				html +=
					'<h3 style="color:#1E293B; margin-bottom:12px;">Detalhes da Venda #' +
					vendaId +
					"</h3>";
				if (venda) {
					html +=
						"<div style='display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #E2E8F0;'>";
					html +=
						"<span style='color:#64748B; font-size:0.8rem;'>Data</span><span style='color:#1E293B; font-weight:600;'>" +
						formatarData(venda.data_venda) +
						"</span>";
					html += "</div>";
					html +=
						"<div style='display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #E2E8F0;'>";
					html +=
						"<span style='color:#64748B; font-size:0.8rem;'>Pagamento</span><span style='color:#1E293B; font-weight:600;'>" +
						(venda.forma_pagamento || "---") +
						"</span>";
					html += "</div>";
					html +=
						"<div style='display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #E2E8F0;'>";
					html +=
						"<span style='color:#64748B; font-size:0.8rem;'>Cliente</span><span style='color:#1E293B; font-weight:600;'>" +
						(venda.cliente_nome || "Não informado") +
						"</span>";
					html += "</div>";
					if (venda.status === "orcamento") {
						html +=
							"<div style='display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #E2E8F0;'>";
						html +=
							"<span style='color:#64748B; font-size:0.8rem;'>Status</span><span style='color:#A16207; font-weight:700;'>ORÇAMENTO (não baixou estoque)</span>";
						html += "</div>";
					}
					if (venda.desconto > 0) {
						html +=
							"<div style='display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #E2E8F0;'>";
						html +=
							"<span style='color:#64748B; font-size:0.8rem;'>Desconto</span><span style='color:var(--cor-erro); font-weight:600;'>- " +
							formatarMoeda(venda.desconto) +
							"</span>";
						html += "</div>";
					}
					if (venda.observacao) {
						html +=
							"<div style='display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #E2E8F0;'>";
						html +=
							"<span style='color:#64748B; font-size:0.8rem;'>Observação</span><span style='color:#1E293B; font-weight:600;'>" +
							venda.observacao +
							"</span>";
						html += "</div>";
					}
					html +=
						"<div style='display:flex; justify-content:space-between; padding:6px 0 12px; border-bottom:1px solid #E2E8F0;'>";
					html +=
						"<span style='color:#64748B; font-size:0.8rem;'>Total</span><span style='color:var(--cor-sucesso); font-weight:700; font-size:1rem;'>" +
						formatarMoeda(venda.total) +
						"</span>";
					html += "</div>";
				}
				html +=
					"<table style='width:100%; border-collapse:collapse; margin-bottom:12px;'>";
				html +=
					"<thead><tr><th style='text-align:left; padding:6px; color:#64748B; font-size:0.7rem; text-transform:uppercase;'>Produto</th><th style='text-align:left; padding:6px; color:#64748B; font-size:0.7rem; text-transform:uppercase;'>SKU</th><th style='text-align:center; padding:6px; color:#64748B; font-size:0.7rem; text-transform:uppercase;'>Qtd</th><th style='text-align:right; padding:6px; color:#64748B; font-size:0.7rem; text-transform:uppercase;'>Unit.</th><th style='text-align:right; padding:6px; color:#64748B; font-size:0.7rem; text-transform:uppercase;'>Total</th></tr></thead>";
				html += "<tbody>";
				if (itens && itens.length > 0) {
					itens.forEach((item) => {
						var subtotal = (item.preco_unitario || 0) * (item.quantidade || 1);
						var detalhes = formatarAtributos(
							item.atributos,
							item.tamanho,
							item.cor,
						);
						var nomeCell =
							(item.produto_nome || "---") +
							(detalhes !== "---" ? " (" + detalhes + ")" : "");
						html +=
							"<tr style='border-bottom:1px solid #F1F5F9;'><td style='padding:6px; color:#1E293B;'>" +
							nomeCell +
							"</td><td style='padding:6px; color:#64748B; font-size:0.8rem;'>" +
							(item.sku || "---") +
							"</td><td style='padding:6px; text-align:center; color:#1E293B;'>" +
							(item.quantidade || 1) +
							"</td><td style='padding:6px; text-align:right; color:#1E293B;'>" +
							formatarMoeda(item.preco_unitario) +
							"</td><td style='padding:6px; text-align:right; color:var(--cor-sucesso); font-weight:600;'>" +
							formatarMoeda(subtotal) +
							"</td></tr>";
					});
				} else {
					html +=
						"<tr><td colspan='5' style='padding:12px; text-align:center; color:#94A3B8; font-size:0.85rem;'>Nenhum item encontrado.</td></tr>";
				}
				html += "</tbody></table>";
				html += '<div style="display:flex; gap:10px;" class="no-print">';
				html +=
					'<button onclick="window.print()" style="padding:8px 16px; background:#64748B; color:#fff; border:none; border-radius:6px; font-size:0.85rem; font-weight:600; cursor:pointer;">Imprimir</button>';
				html +=
					'<button onclick="window.exportarDetalhePdf()" style="padding:8px 16px; background:var(--cor-erro); color:#fff; border:none; border-radius:6px; font-size:0.85rem; font-weight:600; cursor:pointer;">PDF</button>';
				html +=
					'<button onclick="fecharDetalhes()" style="padding:8px 16px; background:var(--cor-primaria); color:#fff; border:none; border-radius:6px; font-size:0.85rem; font-weight:600; cursor:pointer;">Fechar</button>';
				if (venda && venda.status === "orcamento") {
					html +=
						'<button id="btnConverterOrcamento" style="padding:8px 16px; background:var(--cor-sucesso); color:#fff; border:none; border-radius:6px; font-size:0.85rem; font-weight:600; cursor:pointer;">Converter em Venda</button>';
				}
				html += "</div>";
				html += "</div>";

				var modal = document.getElementById("modalDetalhes");
				var modalContent = document.getElementById("modalDetalhesContent");
				modalContent.innerHTML = html;
				modal.style.display = "flex";

				var btnConverter = document.getElementById("btnConverterOrcamento");
				if (btnConverter) {
					btnConverter.addEventListener("click", () => {
						if (
							!confirm(
								"Converter o orçamento #" +
									vendaId +
									" em venda?\n\nO estoque será baixado agora.",
							)
						)
							return;
						if (!window.api || !window.erpBanco.vendas.converterOrcamento) {
							mostrarMensagem("API indisponível.", "erro");
							return;
						}
						btnConverter.disabled = true;
						btnConverter.textContent = "Convertendo...";
						window.api
							.converterOrcamento(vendaId)
							.then(() => {
								fecharDetalhes();
								mostrarMensagem(
									"Orçamento #" + vendaId + " convertido em venda!",
									"sucesso",
								);
								carregarVendas(filtroAtual());
							})
							.catch((err) => {
								mostrarMensagem("Erro ao converter: " + err, "erro");
								btnConverter.disabled = false;
								btnConverter.textContent = "Converter em Venda";
							});
					});
				}
			})
			.catch((err) => {
				mostrarMensagem("Erro ao carregar detalhes: " + err, "erro");
			});
	}

	function exportarCSV() {
		if (vendasCache.length === 0) {
			mostrarMensagem("Nenhuma venda para exportar.", "erro");
			return;
		}

		var cabecalho = "ID,Data,Total,Desconto,Forma de Pagamento,Status,Cliente";
		var linhas = vendasCache.map(
			(v) =>
				v.id +
				"," +
				(v.data_venda || "").replace(/,/g, "") +
				"," +
				(v.total || 0).toFixed(2) +
				"," +
				(v.desconto || 0).toFixed(2) +
				"," +
				(v.forma_pagamento || "") +
				"," +
				(v.status === "orcamento" ? "Orçamento" : "Finalizada") +
				"," +
				(v.cliente_nome || "Não informado"),
		);

		var csv = cabecalho + "\n" + linhas.join("\n");
		var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
		var url = URL.createObjectURL(blob);

		var a = document.createElement("a");
		a.href = url;
		a.download = "vendas_" + new Date().toISOString().slice(0, 10) + ".csv";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		mostrarMensagem("Relatorio CSV exportado com sucesso!", "sucesso");
	}

	window.fecharDetalhes = () => {
		var modal = document.getElementById("modalDetalhes");
		if (modal) modal.style.display = "none";
	};

	window.exportarDetalhePdf = () => {
		if (!detalheAtualCache) return;
		if (!window.jspdf || !window.jspdf.jsPDF) {
			mostrarMensagem("Biblioteca de PDF não carregada.", "erro");
			return;
		}
		var venda = detalheAtualCache.venda;
		var itens = detalheAtualCache.itens;
		var doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
		var margem = 40;
		var y = margem;

		doc.setFontSize(15);
		doc.setFont(undefined, "bold");
		doc.text(
			(venda && venda.status === "orcamento" ? "Orçamento" : "Venda") + " #" + detalheAtualCache.vendaId,
			margem,
			y,
		);
		y += 22;
		doc.setFontSize(9);
		doc.setFont(undefined, "normal");
		if (venda) {
			doc.text("Data: " + formatarData(venda.data_venda), margem, y);
			y += 14;
			doc.text("Pagamento: " + (venda.forma_pagamento || "---"), margem, y);
			y += 14;
			doc.text("Cliente: " + (venda.cliente_nome || "Não informado"), margem, y);
			y += 14;
			if (venda.observacao) {
				doc.text("Observação: " + venda.observacao, margem, y);
				y += 14;
			}
		}
		y += 10;

		doc.setFont(undefined, "bold");
		doc.setFontSize(8.5);
		var colunas = ["Produto", "SKU", "Qtd", "Unit.", "Total"];
		var larguras = [220, 90, 50, 80, 80];
		var x = margem;
		colunas.forEach((c, i) => { doc.text(c, x, y); x += larguras[i]; });
		y += 10;
		doc.setDrawColor(200);
		doc.line(margem, y - 7, margem + larguras.reduce((a, b) => a + b, 0), y - 7);
		y += 4;
		doc.setFont(undefined, "normal");

		itens.forEach((item) => {
			if (y > 780) { doc.addPage(); y = margem; }
			var subtotal = (item.preco_unitario || 0) * (item.quantidade || 1);
			var detalhes = formatarAtributos(item.atributos, item.tamanho, item.cor);
			var nomeLinha = item.produto_nome + (detalhes !== "---" ? " (" + detalhes + ")" : "");
			x = margem;
			doc.text(nomeLinha.slice(0, 38), x, y); x += larguras[0];
			doc.text(String(item.sku || "---"), x, y); x += larguras[1];
			doc.text(String(item.quantidade), x, y); x += larguras[2];
			doc.text(formatarMoeda(item.preco_unitario), x, y); x += larguras[3];
			doc.text(formatarMoeda(subtotal), x, y);
			y += 13;
		});

		y += 10;
		if (venda && venda.desconto > 0) {
			doc.text("Subtotal: " + formatarMoeda(venda.total + venda.desconto), margem + 300, y);
			y += 14;
			doc.text("Desconto: -" + formatarMoeda(venda.desconto), margem + 300, y);
			y += 14;
		}
		doc.setFont(undefined, "bold");
		doc.setFontSize(11);
		doc.text("Total: " + formatarMoeda(venda ? venda.total : 0), margem + 300, y);

		doc.save(
			(venda && venda.status === "orcamento" ? "orcamento_" : "venda_") +
				detalheAtualCache.vendaId + ".pdf",
		);
	};

	// Status e forma de pagamento agora são filtros client-side (badges, sobre
	// vendasCache já carregado) — só o intervalo de data continua indo pro
	// servidor via getVendas, igual antes.
	function filtroAtual() {
		return {
			dataInicio: (filterDataInicio && filterDataInicio.value) || null,
			dataFim: (filterDataFim && filterDataFim.value) || null,
		};
	}

	if (btnFilter) {
		btnFilter.addEventListener("click", () => {
			carregarVendas(filtroAtual());
		});
	}

	if (btnClear) {
		btnClear.addEventListener("click", () => {
			if (filterDataInicio) filterDataInicio.value = "";
			if (filterDataFim) filterDataFim.value = "";
			statusFiltro = "";
			pagamentoFiltro = "";
			buscaQuery = "";
			if (buscaVendas) buscaVendas.value = "";
			if (legendStatus) {
				legendStatus.querySelectorAll(".legend-btn").forEach((b) => b.classList.remove("active"));
				var todasStatus = legendStatus.querySelector('.legend-btn[data-status=""]');
				if (todasStatus) todasStatus.classList.add("active");
			}
			if (legendPagamento) {
				legendPagamento.querySelectorAll(".legend-btn").forEach((b) => b.classList.remove("active"));
				var todasPag = legendPagamento.querySelector('.legend-btn[data-pagamento=""]');
				if (todasPag) todasPag.classList.add("active");
			}
			paginaAtual = 1;
			carregarVendas();
		});
	}

	if (btnExportCsv) {
		btnExportCsv.addEventListener("click", exportarCSV);
	}

	function mostrarMensagem(texto, tipo) {
		mensagem.textContent = texto;
		mensagem.className = "mensagem " + tipo;
		mensagem.style.display = "block";
		setTimeout(() => {
			mensagem.style.display = "none";
		}, 4000);
	}

	carregarVendas();
})();
