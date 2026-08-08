(() => {
	var filterDate = document.getElementById("filterDate");
	var filterStatus = document.getElementById("filterStatus");
	var btnFilter = document.getElementById("btnFilter");
	var btnClear = document.getElementById("btnClear");
	var listaVendas = document.getElementById("listaVendas");
	var statsVendas = document.getElementById("statsVendas");
	var mensagem = document.getElementById("mensagem");
	var btnExportCsv = document.getElementById("btnExportCsv");

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

	function carregarVendas(filtro) {
		if (!window.api || !window.erpBanco.vendas.listar) {
			listaVendas.innerHTML = '<div class="empty-state">API indisponvel.</div>';
			return;
		}

		listaVendas.innerHTML = '<div class="empty-state">Carregando...</div>';

		window.api
			.getVendas(filtro || {})
			.then((vendas) => {
				vendasCache = vendas || [];
				listaVendas.innerHTML = "";
				statsVendas.innerHTML = "";

				abrirVendaDaURL();

				if (!vendas || vendas.length === 0) {
					listaVendas.innerHTML =
						'<div class="empty-state">Nenhuma venda encontrada.</div>';
					if (btnExportCsv) btnExportCsv.disabled = true;
					return;
				}

				if (btnExportCsv) btnExportCsv.disabled = false;

				var totalVendas = vendas.length;
				var totalFaturado = vendas.reduce((acc, v) => acc + (v.total || 0), 0);

				statsVendas.innerHTML =
					'<div class="stat-card"><div class="stat-value">' +
					totalVendas +
					'</div><div class="stat-label">Registros</div></div>' +
					'<div class="stat-card"><div class="stat-value">' +
					formatarMoeda(totalFaturado) +
					'</div><div class="stat-label">Total</div></div>';

				vendas.forEach((v) => {
					var div = document.createElement("div");
					div.className = "venda-item";
					div.style.cursor = "pointer";
					div.setAttribute("data-venda-id", v.id);

					div.addEventListener("click", () => {
						mostrarDetalhesVenda(v.id);
					});

					var info = document.createElement("div");
					info.className = "venda-info";

					var ehOrcamento = v.status === "orcamento";
					var badge = ehOrcamento
						? '<span style="background:#FEF9C3; color:#A16207; font-size:0.68rem; font-weight:700; padding:2px 8px; border-radius:999px; margin-left:6px;">ORÇAMENTO</span>'
						: "";

					var top = document.createElement("div");
					top.className = "venda-top";
					top.innerHTML =
						'<span class="venda-id">#' +
						v.id +
						badge +
						"</span>" +
						'<span class="venda-total"' +
						(ehOrcamento ? ' style="color:#D97706;"' : "") +
						">" +
						formatarMoeda(v.total) +
						"</span>";

					var bottom = document.createElement("div");
					bottom.className = "venda-bottom";
					bottom.innerHTML =
						"<span>" +
						formatarData(v.data_venda) +
						"</span>" +
						"<span>" +
						(v.forma_pagamento || "---") +
						"</span>" +
						"<span>" +
						(v.cliente_nome || "Cliente não informado") +
						"</span>";

					info.appendChild(top);
					info.appendChild(bottom);

					div.appendChild(info);
					listaVendas.appendChild(div);
				});
			})
			.catch((err) => {
				listaVendas.innerHTML =
					'<div class="empty-state">Erro ao carregar vendas: ' + err + "</div>";
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
							"<span style='color:#64748B; font-size:0.8rem;'>Desconto</span><span style='color:#DC2626; font-weight:600;'>- " +
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
						"<span style='color:#64748B; font-size:0.8rem;'>Total</span><span style='color:#16A34A; font-weight:700; font-size:1rem;'>" +
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
							"</td><td style='padding:6px; text-align:right; color:#16A34A; font-weight:600;'>" +
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
					'<button onclick="window.exportarDetalhePdf()" style="padding:8px 16px; background:#B91C1C; color:#fff; border:none; border-radius:6px; font-size:0.85rem; font-weight:600; cursor:pointer;">PDF</button>';
				html +=
					'<button onclick="fecharDetalhes()" style="padding:8px 16px; background:#2563EB; color:#fff; border:none; border-radius:6px; font-size:0.85rem; font-weight:600; cursor:pointer;">Fechar</button>';
				if (venda && venda.status === "orcamento") {
					html +=
						'<button id="btnConverterOrcamento" style="padding:8px 16px; background:#16A34A; color:#fff; border:none; border-radius:6px; font-size:0.85rem; font-weight:600; cursor:pointer;">Converter em Venda</button>';
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

	function filtroAtual() {
		return {
			data: filterDate.value || null,
			status: filterStatus ? filterStatus.value || null : null,
		};
	}

	if (btnFilter) {
		btnFilter.addEventListener("click", () => {
			if (!filterDate.value && (!filterStatus || !filterStatus.value)) {
				mostrarMensagem(
					"Selecione uma data ou um status para filtrar.",
					"erro",
				);
				return;
			}
			carregarVendas(filtroAtual());
		});
	}

	if (filterStatus) {
		filterStatus.addEventListener("change", () => {
			carregarVendas(filtroAtual());
		});
	}

	if (btnClear) {
		btnClear.addEventListener("click", () => {
			filterDate.value = "";
			if (filterStatus) filterStatus.value = "";
			statsVendas.innerHTML = "";
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
