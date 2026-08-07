(function () {
  var globalMargin = 40;
  var pricingData = [];
  var todasCategorias = [];
  var debounceTimers = {};

  // DOM
  var globalMarginInput = document.getElementById("globalMargin");
  var btnSaveGlobal = document.getElementById("btnSaveGlobal");
  var massBar = document.getElementById("massBar");
  var massCount = document.getElementById("massCount");
  var massMargin = document.getElementById("massMargin");
  var btnMassApply = document.getElementById("btnMassApply");
  var selectAll = document.getElementById("selectAll");
  var tbody = document.getElementById("corpoPrecificacao");
  var aviso = document.getElementById("avisoPrecificacao");
  var mensagem = document.getElementById("mensagem");
  var searchInput = document.getElementById("searchInput");
  var filterCategoria = document.getElementById("filterCategoria");

  function esc(t) {
    return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtCodigo(id) {
    return "#" + String(id).padStart(4, "0");
  }

  function fmtMoeda(v) {
    return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPct(v) {
    return Number(v || 0).toFixed(1);
  }

  /* ==================== Cálculos ==================== */

  function calcPrecoVenda(custo, impostos, margem) {
    var base = Number(custo || 0) + Number(impostos || 0);
    if (base <= 0) return 0;
    return base * (1 + Number(margem || 0) / 100);
  }

  function calcMargem(custo, impostos, precoVenda) {
    var base = Number(custo || 0) + Number(impostos || 0);
    if (base <= 0) return 0;
    return (Number(precoVenda || 0) / base - 1) * 100;
  }

  function calcLucro(custo, impostos, precoVenda) {
    var base = Number(custo || 0) + Number(impostos || 0);
    return Number(precoVenda || 0) - base;
  }

  function margemEfetiva(p) {
    if (p.margem_percentual !== null && p.margem_percentual !== undefined) {
      return Number(p.margem_percentual);
    }
    return globalMargin;
  }

  /* ==================== Filtros ==================== */

  function preencherFiltroCategoria() {
    var catsUnicas = [];
    var visto = {};
    todasCategorias.forEach(function (c) {
      var nome = c.nome;
      if (!visto[nome]) { visto[nome] = true; catsUnicas.push({ id: c.id, nome: nome }); }
    });
    filterCategoria.innerHTML = '<option value="">Todas as categorias</option>';
    catsUnicas.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c.nome;
      opt.textContent = c.nome;
      filterCategoria.appendChild(opt);
    });
  }

  function dadosFiltrados() {
    var q = (searchInput.value || "").trim().toLowerCase();
    var catFiltro = filterCategoria.value;
    return pricingData.filter(function (p) {
      if (catFiltro) {
        var cats = (p.categorias || "").toLowerCase();
        if (cats.indexOf(catFiltro.toLowerCase()) === -1) return false;
      }
      if (!q) return true;
      return ((p.sku_primeiro || "") + " " + p.produto_nome).toLowerCase().indexOf(q) !== -1;
    });
  }

  /* ==================== Carregar dados ==================== */

  function carregar() {
    if (aviso) aviso.style.display = "block";
    aviso.innerHTML = "Carregando...";

    var promises = [
      window.api && window.api.getGlobalMargin ? window.api.getGlobalMargin() : Promise.resolve(40),
      window.api && window.api.getPricingData ? window.api.getPricingData() : Promise.resolve([]),
      erpCategoryStore.getCategoriasFlux()
    ];

    Promise.all(promises).then(function (results) {
      globalMargin = Number(results[0]) || 40;
      globalMarginInput.value = globalMargin;
      pricingData = Array.isArray(results[1]) ? results[1] : [];
      todasCategorias = Array.isArray(results[2]) ? results[2] : [];
      preencherFiltroCategoria();
      renderizar();
      aviso.style.display = "none";
    }).catch(function (err) {
      aviso.innerHTML = "Erro ao carregar: " + esc(err);
    });
  }

  // Reage a mudanças de categorias vindas de outras telas
  erpCategoryStore.onChange(function (lista) {
    todasCategorias = lista;
    preencherFiltroCategoria();
    renderizar();
  });

  /* ==================== Renderizar ==================== */

  function renderizar() {
    tbody.innerHTML = "";
    var filtrados = dadosFiltrados();
    if (filtrados.length === 0) {
      var msg = pricingData.length === 0
        ? "Nenhum produto cadastrado ainda. Cadastre produtos e eles aparecerão aqui automaticamente."
        : "Nenhum produto encontrado para os filtros aplicados.";
      tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state">' + msg + '</div></td></tr>';
      atualizarMassBar();
      return;
    }

    filtrados.forEach(function (p) {

      var margemReal = margemEfetiva(p);
      var precoCalculado = Number(p.preco_venda || 0) > 0
        ? Number(p.preco_venda)
        : calcPrecoVenda(p.preco_custo, p.impostos_extras, margemReal);
      var lucro = calcLucro(p.preco_custo, p.impostos_extras, precoCalculado);

      var tr = document.createElement("tr");

      // 0: Checkbox
      var tdChk = document.createElement("td");
      var chk = document.createElement("input");
      chk.type = "checkbox"; chk.className = "row-check";
      chk.value = p.produto_id;
      chk.addEventListener("change", atualizarMassBar);
      tdChk.appendChild(chk); tr.appendChild(tdChk);

      // 1: Código
      var tdCod = document.createElement("td");
       tdCod.innerHTML = '<span class="prod-codigo">' + esc(p.sku_primeiro || "---") + '</span>';
      tr.appendChild(tdCod);

      // 2: Nome
      var tdNome = document.createElement("td");
      tdNome.innerHTML = '<span class="prod-nome">' + esc(p.produto_nome) + '</span>';
      tr.appendChild(tdNome);

      // 3: Categoria (tags)
      var tdCat = document.createElement("td");
      var catsStr = p.categorias || "";
      if (catsStr) {
        var tags = catsStr.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        var tagsBox = document.createElement("div");
        tagsBox.className = "cat-tags";
        tags.forEach(function (t) {
          var span = document.createElement("span");
          span.className = "cat-mini-tag";
          span.textContent = t;
          tagsBox.appendChild(span);
        });
        tdCat.appendChild(tagsBox);
      } else {
        tdCat.innerHTML = '<span class="cat-tags-empty">&mdash;</span>';
      }
      tr.appendChild(tdCat);

      // 4: Preço de Custo
      var tdCusto = document.createElement("td");
      var inpCusto = criarInputNumero(p.preco_custo, function (val) {
        p.preco_custo = val;
        debounceSalvar("cost", p.produto_id, val);
        renderizar();
      });
      tdCusto.appendChild(inpCusto); tr.appendChild(tdCusto);

      // 5: Impostos / Extras
      var tdImp = document.createElement("td");
      var inpImp = criarInputNumero(p.impostos_extras, function (val) {
        p.impostos_extras = val;
        debounceSalvar("taxes", p.produto_id, val);
        renderizar();
      });
      tdImp.appendChild(inpImp); tr.appendChild(tdImp);

      // 6: Margem (%)
      var tdMarg = document.createElement("td");
      var inpMarg = criarInputNumero(margemReal, function (val) {
        var novoPreco = calcPrecoVenda(p.preco_custo, p.impostos_extras, val);
        p.margem_percentual = val;
        p.preco_venda = novoPreco;
        debounceSalvarMargemPreco(p.produto_id, val, novoPreco);
        renderizar();
      }, { min: 0, max: 999, step: 0.1, isPorcento: true });
      inpMarg.setAttribute("placeholder", "Global " + fmtPct(globalMargin) + "%");
      tdMarg.appendChild(inpMarg); tr.appendChild(tdMarg);

      // 7: Preço de Venda
      var tdPreco = document.createElement("td");
      var inpPreco = criarInputNumero(precoCalculado, function (val) {
        var novaMargem = calcMargem(p.preco_custo, p.impostos_extras, val);
        p.margem_percentual = novaMargem;
        p.preco_venda = val;
        debounceSalvarMargemPreco(p.produto_id, novaMargem, val);
        renderizar();
      }, { min: 0, step: 0.01 });
      tdPreco.appendChild(inpPreco); tr.appendChild(tdPreco);

      // 8: Lucro (R$)
      var tdLucro = document.createElement("td");
      var cl = lucro > 0 ? "lucro-positivo" : (lucro < 0 ? "lucro-negativo" : "lucro-zero");
      tdLucro.innerHTML = '<span class="' + cl + '">R$ ' + esc(fmtMoeda(lucro)) + '</span>';
      tr.appendChild(tdLucro);

      // 9: Status
      var tdStatus = document.createElement("td");
      var usaC = p.margem_percentual !== null && p.margem_percentual !== undefined;
      if (usaC) {
        tdStatus.innerHTML = '<span class="margem-tag margem-custom">Custom (' + esc(fmtPct(p.margem_percentual)) + '%)</span>';
      } else {
        tdStatus.innerHTML = '<span class="margem-tag margem-global">Global (' + esc(fmtPct(globalMargin)) + '%)</span>';
      }
      tr.appendChild(tdStatus);

      tbody.appendChild(tr);
    });

    atualizarMassBar();
  }

  function criarInputNumero(valor, onChange, opts) {
    opts = opts || {};
    var inp = document.createElement("input");
    inp.type = "number";
    inp.min = opts.min !== undefined ? opts.min : 0;
    if (opts.max !== undefined) inp.max = opts.max;
    inp.step = opts.step !== undefined ? opts.step : 0.01;
    inp.value = arredonda(valor, opts.isPorcento ? 1 : 2);
    inp.addEventListener("change", function () {
      var v = parseFloat(inp.value);
      if (isNaN(v)) v = 0;
      if (opts.min !== undefined && v < opts.min) v = opts.min;
      if (opts.max !== undefined && v > opts.max) v = opts.max;
      onChange(v);
    });
    return inp;
  }

  function arredonda(v, casas) {
    return parseFloat(Number(v || 0).toFixed(casas));
  }

  /* ==================== Debounce save ==================== */

  function debounceSalvar(tipo, produtoId, valor) {
    var key = tipo + "_" + produtoId;
    clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(function () {
      var fn = null;
      if (tipo === "cost") fn = window.api.saveProductCost;
      else if (tipo === "taxes") fn = window.api.saveProductTaxes;
      if (fn) fn.call(window.api, produtoId, valor).catch(function (err) {
        mostrarMensagem("Erro ao salvar: " + err, "error");
      });
    }, 400);
  }

  function debounceSalvarMargemPreco(produtoId, margem, preco) {
    var key = "mp_" + produtoId;
    clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(function () {
      var p1 = window.api.saveProductMargin(produtoId, margem);
      var p2 = window.api.saveProductPrice(produtoId, preco);
      Promise.all([p1, p2]).catch(function (err) {
        mostrarMensagem("Erro ao salvar: " + err, "error");
      });
    }, 400);
  }

  /* ==================== Mass update ==================== */

  function getLinhasSelecionadas() {
    var checks = tbody.querySelectorAll(".row-check:checked");
    return Array.prototype.map.call(checks, function (cb) { return parseInt(cb.value, 10); });
  }

  function atualizarMassBar() {
    var ids = getLinhasSelecionadas();
    if (ids.length > 0) {
      massBar.style.display = "flex";
      massCount.textContent = ids.length + " ite" + (ids.length === 1 ? "m" : "ns") + " selecionado" + (ids.length === 1 ? "" : "s");
    } else {
      massBar.style.display = "none";
    }
  }

  selectAll.addEventListener("change", function () {
    var checked = selectAll.checked;
    tbody.querySelectorAll(".row-check").forEach(function (c) { c.checked = checked; });
    atualizarMassBar();
  });

  btnMassApply.addEventListener("click", function () {
    var ids = getLinhasSelecionadas();
    if (ids.length === 0) { mostrarMensagem("Selecione ao menos um produto.", "error"); return; }
    var margem = parseFloat(massMargin.value);
    if (isNaN(margem) || margem < 0) { mostrarMensagem("Informe uma margem válida.", "error"); return; }
    if (!window.api || !window.api.massUpdateMargem) { mostrarMensagem("API indisponível.", "error"); return; }
    btnMassApply.disabled = true;
    window.api.massUpdateMargem(ids, margem).then(function (r) {
      mostrarMensagem("Margem de " + margem + "% aplicada a " + r.count + " produto(s)!", "success");
      carregar();
    }).catch(function (err) {
      mostrarMensagem("Erro: " + err, "error");
    }).then(function () {
      btnMassApply.disabled = false;
      massMargin.value = "";
    });
  });

  /* ==================== Global margin ==================== */

  btnSaveGlobal.addEventListener("click", function () {
    var val = parseFloat(globalMarginInput.value);
    if (isNaN(val) || val < 0) { mostrarMensagem("Informe uma margem válida.", "error"); return; }
    if (!window.api || !window.api.saveGlobalMargin) { mostrarMensagem("API indisponível.", "error"); return; }
    btnSaveGlobal.disabled = true;
    window.api.saveGlobalMargin(val).then(function () {
      globalMargin = val;
      renderizar();
      mostrarMensagem("Margem global atualizada para " + val + "%!", "success");
    }).catch(function (err) {
      mostrarMensagem("Erro: " + err, "error");
    }).then(function () {
      btnSaveGlobal.disabled = false;
    });
  });

  /* ==================== Eventos filtros ==================== */
  searchInput.addEventListener("input", renderizar);
  filterCategoria.addEventListener("change", renderizar);

  /* ==================== Mensagens ==================== */
  function mostrarMensagem(texto, tipo) {
    mensagem.textContent = texto;
    mensagem.className = "mensagem " + (tipo === "success" ? "success" : "error");
    mensagem.style.display = "block";
    setTimeout(function () { mensagem.style.display = "none"; }, 3500);
  }

  if (window.erpAuthPromise) window.erpAuthPromise.then(carregar).catch(function () {});
  else carregar();
})();
