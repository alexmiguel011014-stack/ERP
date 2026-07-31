(function () {
  var filterDate = document.getElementById("filterDate");
  var btnFilter = document.getElementById("btnFilter");
  var btnClear = document.getElementById("btnClear");
  var listaVendas = document.getElementById("listaVendas");
  var statsVendas = document.getElementById("statsVendas");
  var mensagem = document.getElementById("mensagem");

  function formatarData(dataISO) {
    if (!dataISO) return "---";
    var partes = dataISO.split("T")[0].split("-");
    return partes[2] + "/" + partes[1] + "/" + partes[0];
  }

  function carregarVendas(filtro) {
    if (!window.api || !window.api.getVendas) {
      listaVendas.innerHTML = '<div class="empty-state">API indisponvel.</div>';
      return;
    }

    listaVendas.innerHTML = '<div class="empty-state">Carregando...</div>';

    window.api
      .getVendas(filtro || null)
      .then(function (vendas) {
        listaVendas.innerHTML = "";
        statsVendas.innerHTML = "";

        if (!vendas || vendas.length === 0) {
          listaVendas.innerHTML =
            '<div class="empty-state">Nenhuma venda encontrada.</div>';
          return;
        }

        var totalVendas = vendas.length;
        var totalFaturado = vendas.reduce(function (acc, v) {
          return acc + (v.total || 0);
        }, 0);

        statsVendas.innerHTML =
          '<div class="stat-card"><div class="stat-value">' +
          totalVendas +
          '</div><div class="stat-label">Vendas</div></div>' +
          '<div class="stat-card"><div class="stat-value">R$ ' +
          totalFaturado.toFixed(2) +
          '</div><div class="stat-label">Faturado</div></div>';

        vendas.forEach(function (v) {
          var div = document.createElement("div");
          div.className = "venda-item";

          var info = document.createElement("div");
          info.className = "venda-info";

          var top = document.createElement("div");
          top.className = "venda-top";
          top.innerHTML =
            '<span class="venda-id">#' +
            v.id +
            '</span>' +
            '<span class="venda-total">R$ ' +
            (v.total || 0).toFixed(2) +
            '</span>';

          var bottom = document.createElement("div");
          bottom.className = "venda-bottom";
          bottom.innerHTML =
            '<span>' +
            formatarData(v.data_venda) +
            '</span>' +
            '<span>' +
            (v.forma_pagamento || "---") +
            '</span>' +
            '<span>' +
            (v.cliente_nome || "Cliente nao informado") +
            '</span>';

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

  btnFilter.addEventListener("click", function () {
    var filtro = filterDate.value;
    if (!filtro) {
      mostrarMensagem("Selecione uma data para filtrar.", "erro");
      return;
    }
    carregarVendas(filtro);
  });

  btnClear.addEventListener("click", function () {
    filterDate.value = "";
    statsVendas.innerHTML = "";
    carregarVendas();
  });

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