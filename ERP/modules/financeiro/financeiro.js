(function () {
  var abaAtual = "receber";
  var tabBtns = document.querySelectorAll(".tab-btn");
  var abaLancamentos = document.getElementById("abaLancamentos");
  var abaFluxo = document.getElementById("abaFluxo");
  var tituloLista = document.getElementById("tituloLista");
  var listaLancamentos = document.getElementById("listaLancamentos");
  var statsLancamentos = document.getElementById("statsLancamentos");
  var mensagem = document.getElementById("mensagem");

  var lancTipo = document.getElementById("lancTipo");
  var lancDescricao = document.getElementById("lancDescricao");
  var lancValor = document.getElementById("lancValor");
  var lancVencimento = document.getElementById("lancVencimento");
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
    setTimeout(function () { mensagem.style.display = "none"; }, 4500);
  }

  function formatarMoeda(v) {
    return "R$ " + (Number(v) || 0).toFixed(2);
  }

  function formatarData(iso) {
    if (!iso) return "---";
    var p = iso.split("T")[0].split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  /* ---------- Abas ---------- */

  tabBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      tabBtns.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      abaAtual = btn.getAttribute("data-aba");
      if (abaAtual === "fluxo") {
        abaLancamentos.style.display = "none";
        abaFluxo.style.display = "block";
        carregarFluxo();
      } else {
        abaLancamentos.style.display = "block";
        abaFluxo.style.display = "none";
        tituloLista.textContent = abaAtual === "receber" ? "Contas a receber" : "Contas a pagar";
        carregarLancamentos();
      }
    });
  });

  /* ---------- Lançamentos ---------- */

  function carregarLancamentos() {
    if (!window.api || !window.api.getLancamentos) {
      listaLancamentos.innerHTML = '<div class="empty-state">API indisponível.</div>';
      return;
    }
    window.api.getLancamentos({ tipo: abaAtual }).then(function (rows) {
      listaLancamentos.innerHTML = "";
      rows = rows || [];

      var hoje = new Date().toISOString().slice(0, 10);
      var aberto = 0;
      var vencido = 0;
      rows.forEach(function (l) {
        if (l.status === "aberto") {
          aberto += Number(l.valor) || 0;
          if ((l.data_vencimento || "").slice(0, 10) < hoje) vencido += Number(l.valor) || 0;
        }
      });

      statsLancamentos.innerHTML =
        '<div class="stat-card"><div class="stat-value ' + (abaAtual === "receber" ? "verde" : "vermelho") + '">' +
        formatarMoeda(aberto) + '</div><div class="stat-label">Em aberto</div></div>' +
        '<div class="stat-card"><div class="stat-value amarelo">' + formatarMoeda(vencido) +
        '</div><div class="stat-label">Vencido</div></div>';

      if (rows.length === 0) {
        listaLancamentos.innerHTML = '<div class="empty-state">Nenhum lançamento encontrado.</div>';
        return;
      }

      rows.forEach(function (l) {
        var div = document.createElement("div");
        div.className = "item-lista";

        var atrasado = l.status === "aberto" && (l.data_vencimento || "").slice(0, 10) < hoje;
        var badge = l.status === "pago"
          ? '<span class="badge badge-verde">Pago</span>'
          : atrasado
            ? '<span class="badge badge-vermelha">Vencido</span>'
            : '<span class="badge badge-amarela">Em aberto</span>';

        div.innerHTML =
          '<div class="info"><div class="titulo"></div><div class="detalhe"></div></div>' +
          '<div class="acoes">' + badge + "</div>";

        div.querySelector(".titulo").textContent = l.descricao + " — " + formatarMoeda(l.valor);
        var origemTxt = l.origem === "venda" ? "venda" : l.origem === "compra" ? "compra" : "manual";
        div.querySelector(".detalhe").textContent =
          "Vencimento: " + formatarData(l.data_vencimento) +
          (l.status === "pago" ? " | Pago em: " + formatarData(l.data_pagamento) : "") +
          " | Origem: " + origemTxt;

        var acoes = div.querySelector(".acoes");

        if (l.status === "aberto") {
          var btnBaixar = document.createElement("button");
          btnBaixar.type = "button";
          btnBaixar.className = "btn btn-small";
          btnBaixar.style.background = "#DCFCE7";
          btnBaixar.style.color = "#15803D";
          btnBaixar.style.borderColor = "#86EFAC";
          btnBaixar.textContent = abaAtual === "receber" ? "Receber" : "Pagar";
          btnBaixar.addEventListener("click", function () {
            var verbo = abaAtual === "receber" ? "recebimento" : "pagamento";
            if (!confirm("Confirmar " + verbo + " de " + formatarMoeda(l.valor) + "?")) return;
            window.api.baixarLancamento(l.id).then(function () {
              mostrarMensagem("Lançamento baixado.", "sucesso");
              carregarLancamentos();
            }).catch(function (err) {
              mostrarMensagem("Erro: " + err, "erro");
            });
          });
          acoes.appendChild(btnBaixar);

          if (l.origem === "manual") {
            var btnExcluir = document.createElement("button");
            btnExcluir.type = "button";
            btnExcluir.className = "btn btn-small btn-danger";
            btnExcluir.textContent = "Excluir";
            btnExcluir.addEventListener("click", function () {
              if (!confirm("Excluir este lançamento?")) return;
              window.api.excluirLancamento(l.id).then(function () {
                mostrarMensagem("Lançamento excluído.", "sucesso");
                carregarLancamentos();
              }).catch(function (err) {
                mostrarMensagem("Erro: " + err, "erro");
              });
            });
            acoes.appendChild(btnExcluir);
          }
        }

        listaLancamentos.appendChild(div);
      });
    }).catch(function (err) {
      listaLancamentos.innerHTML = '<div class="empty-state">Erro: ' + err + "</div>";
    });
  }

  btnNovoLancamento.addEventListener("click", function () {
    var dados = {
      tipo: lancTipo.value,
      descricao: lancDescricao.value.trim(),
      valor: Number(lancValor.value),
      data_vencimento: lancVencimento.value || null,
    };
    if (!dados.descricao) {
      mostrarMensagem("Informe a descrição.", "erro");
      return;
    }
    if (!Number.isFinite(dados.valor) || dados.valor <= 0) {
      mostrarMensagem("Valor inválido.", "erro");
      return;
    }

    window.api.criarLancamento(dados).then(function () {
      mostrarMensagem("Lançamento adicionado.", "sucesso");
      lancDescricao.value = "";
      lancValor.value = "";
      lancVencimento.value = "";
      if (abaAtual === dados.tipo) carregarLancamentos();
    }).catch(function (err) {
      mostrarMensagem("Erro: " + err, "erro");
    });
  });

  /* ---------- Fluxo de caixa ---------- */

  function carregarFluxo() {
    if (!window.api || !window.api.getFluxoCaixa) {
      listaFluxo.innerHTML = '<div class="empty-state">API indisponível.</div>';
      return;
    }
    window.api.getFluxoCaixa(fluxoInicio.value || null, fluxoFim.value || null).then(function (r) {
      statsFluxo.innerHTML =
        '<div class="stat-card"><div class="stat-value verde">' + formatarMoeda(r.totalEntradas) + '</div><div class="stat-label">Entradas</div></div>' +
        '<div class="stat-card"><div class="stat-value vermelho">' + formatarMoeda(r.totalSaidas) + '</div><div class="stat-label">Saídas</div></div>' +
        '<div class="stat-card"><div class="stat-value ' + (r.saldo >= 0 ? "" : "vermelho") + '">' + formatarMoeda(r.saldo) + '</div><div class="stat-label">Saldo do período</div></div>';

      listaFluxo.innerHTML = "";
      if (!r.dias || r.dias.length === 0) {
        listaFluxo.innerHTML = '<div class="empty-state">Nenhuma movimentação no período.</div>';
        return;
      }

      var table = document.createElement("table");
      table.innerHTML =
        "<thead><tr><th>Data</th><th style='text-align:right;'>Entradas</th><th style='text-align:right;'>Saídas</th><th style='text-align:right;'>Saldo do dia</th><th style='text-align:right;'>Acumulado</th></tr></thead><tbody></tbody>";
      var tbody = table.querySelector("tbody");
      r.dias.forEach(function (d) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + formatarData(d.dia) + "</td>" +
          "<td style='text-align:right; color:#16A34A;'>" + formatarMoeda(d.entradas) + "</td>" +
          "<td style='text-align:right; color:#DC2626;'>" + formatarMoeda(d.saidas) + "</td>" +
          "<td style='text-align:right;'>" + formatarMoeda(d.saldo) + "</td>" +
          "<td style='text-align:right; font-weight:600;'>" + formatarMoeda(d.saldoAcumulado) + "</td>";
        tbody.appendChild(tr);
      });
      listaFluxo.appendChild(table);
    }).catch(function (err) {
      listaFluxo.innerHTML = '<div class="empty-state">Erro: ' + err + "</div>";
    });
  }

  btnFiltrarFluxo.addEventListener("click", carregarFluxo);

  lancVencimento.value = new Date().toISOString().slice(0, 10);
  carregarLancamentos();
})();
