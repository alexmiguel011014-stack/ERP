(function () {
  var filterDate = document.getElementById("filterDate");
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

  function carregarVendas(filtro) {
    if (!window.api || !window.api.getVendas) {
      listaVendas.innerHTML = '<div class="empty-state">API indisponvel.</div>';
      return;
    }

    listaVendas.innerHTML = '<div class="empty-state">Carregando...</div>';

    window.api
      .getVendas(filtro || null)
      .then(function (vendas) {
        vendasCache = vendas || [];
        listaVendas.innerHTML = "";
        statsVendas.innerHTML = "";

        if (!vendas || vendas.length === 0) {
          listaVendas.innerHTML =
            '<div class="empty-state">Nenhuma venda encontrada.</div>';
          if (btnExportCsv) btnExportCsv.disabled = true;
          return;
        }

        if (btnExportCsv) btnExportCsv.disabled = false;

        var totalVendas = vendas.length;
        var totalFaturado = vendas.reduce(function (acc, v) {
          return acc + (v.total || 0);
        }, 0);

        statsVendas.innerHTML =
          '<div class="stat-card"><div class="stat-value">' +
          totalVendas +
          '</div><div class="stat-label">Vendas</div></div>' +
          '<div class="stat-card"><div class="stat-value">' +
          formatarMoeda(totalFaturado) +
          '</div><div class="stat-label">Faturado</div></div>';

        vendas.forEach(function (v) {
          var div = document.createElement("div");
          div.className = "venda-item";
          div.style.cursor = "pointer";
          div.setAttribute("data-venda-id", v.id);

          div.addEventListener("click", function () {
            mostrarDetalhesVenda(v.id);
          });

          var info = document.createElement("div");
          info.className = "venda-info";

          var top = document.createElement("div");
          top.className = "venda-top";
          top.innerHTML =
            '<span class="venda-id">#' +
            v.id +
            "</span>" +
            '<span class="venda-total">' +
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
      .catch(function (err) {
        listaVendas.innerHTML =
          '<div class="empty-state">Erro ao carregar vendas: ' +
          err +
          "</div>";
      });
  }

  function mostrarDetalhesVenda(vendaId) {
    if (!window.api || !window.api.getItensVenda) {
      mostrarMensagem("API indisponvel.", "erro");
      return;
    }

    var venda = vendasCache.find(function (v) {
      return v.id == vendaId;
    });

    window.api
      .getItensVenda(vendaId)
      .then(function (itens) {
        var html = "";
        html += '<div style="max-width:600px;">';
        html += "<h3 style=\"color:#1E293B; margin-bottom:12px;\">Detalhes da Venda #" + vendaId + "</h3>";
        if (venda) {
          html += "<div style='display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #E2E8F0;'>";
          html += "<span style='color:#64748B; font-size:0.8rem;'>Data</span><span style='color:#1E293B; font-weight:600;'>" + formatarData(venda.data_venda) + "</span>";
          html += "</div>";
          html += "<div style='display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #E2E8F0;'>";
          html += "<span style='color:#64748B; font-size:0.8rem;'>Pagamento</span><span style='color:#1E293B; font-weight:600;'>" + (venda.forma_pagamento || "---") + "</span>";
          html += "</div>";
          html += "<div style='display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #E2E8F0;'>";
          html += "<span style='color:#64748B; font-size:0.8rem;'>Cliente</span><span style='color:#1E293B; font-weight:600;'>" + (venda.cliente_nome || "Não informado") + "</span>";
          html += "</div>";
          html += "<div style='display:flex; justify-content:space-between; padding:6px 0 12px; border-bottom:1px solid #E2E8F0;'>";
          html += "<span style='color:#64748B; font-size:0.8rem;'>Total</span><span style='color:#16A34A; font-weight:700; font-size:1rem;'>" + formatarMoeda(venda.total) + "</span>";
          html += "</div>";
        }
        html += "<table style='width:100%; border-collapse:collapse; margin-bottom:12px;'>";
        html += "<thead><tr><th style='text-align:left; padding:6px; color:#64748B; font-size:0.7rem; text-transform:uppercase;'>Produto</th><th style='text-align:left; padding:6px; color:#64748B; font-size:0.7rem; text-transform:uppercase;'>SKU</th><th style='text-align:center; padding:6px; color:#64748B; font-size:0.7rem; text-transform:uppercase;'>Qtd</th><th style='text-align:right; padding:6px; color:#64748B; font-size:0.7rem; text-transform:uppercase;'>Unit.</th><th style='text-align:right; padding:6px; color:#64748B; font-size:0.7rem; text-transform:uppercase;'>Total</th></tr></thead>";
        html += "<tbody>";
        if (itens && itens.length > 0) {
          itens.forEach(function (item) {
            var subtotal = (item.preco_unitario || 0) * (item.quantidade || 1);
            html += "<tr style='border-bottom:1px solid #F1F5F9;'><td style='padding:6px; color:#1E293B;'>" + (item.produto_nome || "---") + " (" + (item.tamanho || "") + " / " + (item.cor || "") + ")</td><td style='padding:6px; color:#64748B; font-size:0.8rem;'>" + (item.sku || "---") + "</td><td style='padding:6px; text-align:center; color:#1E293B;'>" + (item.quantidade || 1) + "</td><td style='padding:6px; text-align:right; color:#1E293B;'>" + formatarMoeda(item.preco_unitario) + "</td><td style='padding:6px; text-align:right; color:#16A34A; font-weight:600;'>" + formatarMoeda(subtotal) + "</td></tr>";
          });
        } else {
          html += "<tr><td colspan='5' style='padding:12px; text-align:center; color:#94A3B8; font-size:0.85rem;'>Nenhum item encontrado.</td></tr>";
        }
        html += "</tbody></table>";
        html += '<button onclick="fecharDetalhes()" style="padding:8px 16px; background:#2563EB; color:#fff; border:none; border-radius:6px; font-size:0.85rem; font-weight:600; cursor:pointer;">Fechar</button>';
        html += "</div>";

        var modal = document.getElementById("modalDetalhes");
        var modalContent = document.getElementById("modalDetalhesContent");
        modalContent.innerHTML = html;
        modal.style.display = "flex";
      })
      .catch(function (err) {
        mostrarMensagem("Erro ao carregar detalhes: " + err, "erro");
      });
  }

  function exportarCSV() {
    if (vendasCache.length === 0) {
      mostrarMensagem("Nenhuma venda para exportar.", "erro");
      return;
    }

    var cabecalho = "ID,Data,Total,Forma de Pagamento,Cliente";
    var linhas = vendasCache.map(function (v) {
      return v.id + "," + (v.data_venda || "").replace(/,/g, "") + "," + (v.total || 0).toFixed(2) + "," + (v.forma_pagamento || "") + "," + (v.cliente_nome || "Não informado");
    });

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

  window.fecharDetalhes = function () {
    var modal = document.getElementById("modalDetalhes");
    if (modal) modal.style.display = "none";
  };

  if (btnFilter) {
    btnFilter.addEventListener("click", function () {
      var filtro = filterDate.value;
      if (!filtro) {
        mostrarMensagem("Selecione uma data para filtrar.", "erro");
        return;
      }
      carregarVendas(filtro);
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", function () {
      filterDate.value = "";
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
    setTimeout(function () {
      mensagem.style.display = "none";
    }, 4000);
  }

  carregarVendas();
})();
