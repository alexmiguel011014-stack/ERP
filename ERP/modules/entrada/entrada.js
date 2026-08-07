(function () {
  var skuInput = document.getElementById("skuInput");
  var qtdInput = document.getElementById("qtdInput");
  var custoInput = document.getElementById("custoInput");
  var obsInput = document.getElementById("obsInput");
  var produtoPreview = document.getElementById("produtoPreview");
  var btnAdicionar = document.getElementById("btnAdicionar");
  var btnConfirmar = document.getElementById("btnConfirmar");
  var btnLimpar = document.getElementById("btnLimpar");
  var listaItens = document.getElementById("listaItens");
  var listaBaixo = document.getElementById("listaBaixo");
  var listaMov = document.getElementById("listaMov");
  var mensagem = document.getElementById("mensagem");
  var ajusteSkuInput = document.getElementById("ajusteSkuInput");
  var ajusteQtdInput = document.getElementById("ajusteQtdInput");
  var ajusteObsInput = document.getElementById("ajusteObsInput");
  var ajusteProdutoPreview = document.getElementById("ajusteProdutoPreview");
  var btnAjustarEstoque = document.getElementById("btnAjustarEstoque");

  var itens = [];
  var produtoAtual = null;
  var ajusteProdutoAtual = null;

  function mostrarMensagem(texto, tipo) {
    mensagem.textContent = texto;
    mensagem.className = "mensagem " + tipo;
    mensagem.style.display = "block";
    setTimeout(function () { mensagem.style.display = "none"; }, 4500);
  }

  function formatarMoeda(v) {
    return "R$ " + (Number(v) || 0).toFixed(2);
  }

  function detalhesDe(p) {
    if (window.formatarAtributos) return window.formatarAtributos(p.atributos, p.tamanho, p.cor);
    return [p.tamanho, p.cor].filter(Boolean).join(" / ") || "---";
  }

  /* ---------- Busca de SKU ---------- */

  function buscarProduto() {
    var sku = skuInput.value.trim().toUpperCase();
    produtoAtual = null;
    produtoPreview.textContent = "";
    if (!sku) return;
    if (!window.api || !window.api.buscarSKU) {
      mostrarMensagem("API indisponível.", "erro");
      return;
    }
    window.api.buscarSKU(sku).then(function (p) {
      if (!p) {
        mostrarMensagem("SKU não encontrado: " + sku, "erro");
        return;
      }
      produtoAtual = p;
      if (!custoInput.value && p.preco_custo) custoInput.value = Number(p.preco_custo).toFixed(2);
      produtoPreview.textContent =
        p.nome + " (" + detalhesDe(p) + ") — estoque atual: " + p.quantidade_estoque +
        " | custo médio: " + formatarMoeda(p.preco_custo);
      qtdInput.focus();
    }).catch(function (err) {
      mostrarMensagem("Erro ao buscar SKU: " + err, "erro");
    });
  }

  function buscarProdutoAjuste() {
    var sku = ajusteSkuInput.value.trim().toUpperCase();
    ajusteProdutoAtual = null;
    ajusteProdutoPreview.textContent = "";
    if (!sku) return;
    window.api.buscarSKU(sku).then(function (p) {
      if (!p) {
        mostrarMensagem("SKU não encontrado: " + sku, "erro");
        return;
      }
      ajusteProdutoAtual = p;
      ajusteQtdInput.value = p.quantidade_estoque;
      ajusteProdutoPreview.textContent = p.nome + " — estoque atual: " + p.quantidade_estoque;
      ajusteQtdInput.focus();
    }).catch(function (err) {
      mostrarMensagem("Erro ao buscar SKU: " + err, "erro");
    });
  }

  skuInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      buscarProduto();
    }
  });

  ajusteSkuInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      buscarProdutoAjuste();
    }
  });

  btnAjustarEstoque.addEventListener("click", function () {
    if (!ajusteProdutoAtual) {
      buscarProdutoAjuste();
      mostrarMensagem("Busque um SKU válido antes de ajustar.", "erro");
      return;
    }
    var quantidade = Number(ajusteQtdInput.value);
    if (!Number.isInteger(quantidade) || quantidade < 0) {
      mostrarMensagem("O novo saldo precisa ser um número inteiro maior ou igual a zero.", "erro");
      return;
    }
    btnAjustarEstoque.disabled = true;
    window.api.ajustarEstoqueManual({
      variacao_id: ajusteProdutoAtual.variacao_id,
      quantidade: quantidade,
      observacao: ajusteObsInput.value.trim(),
    }).then(function (resultado) {
      mostrarMensagem(resultado.alterado === false ? "O estoque já estava nesse saldo." : "Ajuste de estoque salvo!", "sucesso");
      ajusteProdutoAtual.quantidade_estoque = quantidade;
      ajusteProdutoPreview.textContent = ajusteProdutoAtual.nome + " — estoque atual: " + quantidade;
      ajusteObsInput.value = "";
      carregarAlertas();
      carregarMovimentacoes();
    }).catch(function (err) {
      mostrarMensagem("Erro ao ajustar estoque: " + err, "erro");
    }).finally(function () {
      btnAjustarEstoque.disabled = false;
    });
  });

  /* ---------- Lista da entrada ---------- */

  btnAdicionar.addEventListener("click", function () {
    if (!produtoAtual) {
      buscarProduto();
      if (!produtoAtual) {
        mostrarMensagem("Busque um SKU válido antes de adicionar.", "erro");
        return;
      }
    }
    var qtd = parseInt(qtdInput.value, 10);
    if (!Number.isInteger(qtd) || qtd <= 0) {
      mostrarMensagem("Quantidade inválida.", "erro");
      return;
    }
    var custo = custoInput.value !== "" ? Number(custoInput.value) : null;
    if (custo !== null && (!Number.isFinite(custo) || custo < 0)) {
      mostrarMensagem("Custo inválido.", "erro");
      return;
    }

    var existente = null;
    for (var i = 0; i < itens.length; i++) {
      if (itens[i].variacao_id === produtoAtual.variacao_id) { existente = itens[i]; break; }
    }
    if (existente) {
      existente.quantidade += qtd;
      if (custo !== null) existente.custo_unitario = custo;
    } else {
      itens.push({
        variacao_id: produtoAtual.variacao_id,
        nome: produtoAtual.nome,
        detalhes: detalhesDe(produtoAtual),
        sku: produtoAtual.sku,
        quantidade: qtd,
        custo_unitario: custo,
      });
    }

    produtoAtual = null;
    produtoPreview.textContent = "";
    skuInput.value = "";
    qtdInput.value = "1";
    custoInput.value = "";
    skuInput.focus();
    renderizarItens();
  });

  function renderizarItens() {
    listaItens.innerHTML = "";
    if (itens.length === 0) {
      listaItens.innerHTML = '<div class="empty-state">Nenhum item adicionado.</div>';
      btnConfirmar.disabled = true;
      return;
    }
    btnConfirmar.disabled = false;

    itens.forEach(function (item, index) {
      var div = document.createElement("div");
      div.className = "item-lista";
      div.innerHTML =
        '<div class="info"><div class="titulo"></div><div class="detalhe"></div></div>' +
        '<div class="acoes"><button type="button" class="btn btn-small btn-danger">Remover</button></div>';
      div.querySelector(".titulo").textContent = item.nome + " (" + item.detalhes + ")";
      div.querySelector(".detalhe").textContent =
        "SKU: " + item.sku + " | Qtd: " + item.quantidade +
        (item.custo_unitario !== null ? " | Custo: " + formatarMoeda(item.custo_unitario) : " | Custo: não informado");
      div.querySelector("button").addEventListener("click", function () {
        itens.splice(index, 1);
        renderizarItens();
      });
      listaItens.appendChild(div);
    });
  }

  btnLimpar.addEventListener("click", function () {
    itens = [];
    obsInput.value = "";
    renderizarItens();
    skuInput.focus();
  });

  btnConfirmar.addEventListener("click", function () {
    if (itens.length === 0) return;
    if (!confirm("Confirmar entrada de " + itens.length + " item(ns) no estoque?")) return;
    if (!window.api || !window.api.registrarEntradaEstoque) {
      mostrarMensagem("API indisponível.", "erro");
      return;
    }

    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Registrando...";

    window.api.registrarEntradaEstoque({
      itens: itens.map(function (i) {
        return { variacao_id: i.variacao_id, quantidade: i.quantidade, custo_unitario: i.custo_unitario };
      }),
      observacao: obsInput.value.trim() || null,
      origem: "manual",
    }).then(function () {
      mostrarMensagem("Entrada registrada com sucesso!", "sucesso");
      itens = [];
      obsInput.value = "";
      renderizarItens();
      carregarAlertas();
      carregarMovimentacoes();
      btnConfirmar.textContent = "Confirmar Entrada";
      skuInput.focus();
    }).catch(function (err) {
      mostrarMensagem("Erro ao registrar entrada: " + err, "erro");
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = "Confirmar Entrada";
    });
  });

  /* ---------- Alertas de estoque mínimo ---------- */

  function carregarAlertas() {
    if (!window.api || !window.api.getEstoqueBaixo) {
      listaBaixo.innerHTML = '<div class="empty-state">API indisponível.</div>';
      return;
    }
    window.api.getEstoqueBaixo().then(function (rows) {
      listaBaixo.innerHTML = "";
      if (!rows || rows.length === 0) {
        listaBaixo.innerHTML = '<div class="empty-state" style="color:#16A34A;">Nenhuma variação abaixo do estoque mínimo.</div>';
        return;
      }
      rows.forEach(function (r) {
        var div = document.createElement("div");
        div.className = "item-lista";
        var negativo = r.quantidade_estoque < 0;
        div.innerHTML =
          '<div class="info"><div class="titulo"></div><div class="detalhe"></div></div>' +
          '<div class="acoes">' +
          '<input type="number" min="0" step="1" style="width:70px; padding:5px 8px; border:1px solid #E2E8F0; border-radius:6px; font-size:0.8rem;" title="Estoque mínimo" />' +
          '<button type="button" class="btn btn-small">Salvar mín.</button>' +
          "</div>";
        div.querySelector(".titulo").textContent = r.produto_nome + " (" + detalhesDe(r) + ")";
        var detalhe = div.querySelector(".detalhe");
        detalhe.textContent =
          "SKU: " + r.sku + " | Estoque: " + r.quantidade_estoque + " | Mínimo: " + r.estoque_minimo;
        if (negativo) detalhe.style.color = "#DC2626";

        var inputMin = div.querySelector("input");
        inputMin.value = r.estoque_minimo;
        div.querySelector("button").addEventListener("click", function () {
          window.api.salvarEstoqueMinimo(r.variacao_id, parseInt(inputMin.value, 10)).then(function () {
            mostrarMensagem("Estoque mínimo atualizado para " + r.sku + ".", "sucesso");
            carregarAlertas();
          }).catch(function (err) {
            mostrarMensagem("Erro: " + err, "erro");
          });
        });
        listaBaixo.appendChild(div);
      });
    }).catch(function (err) {
      listaBaixo.innerHTML = '<div class="empty-state">Erro: ' + err + "</div>";
    });
  }

  /* ---------- Movimentações ---------- */

  function carregarMovimentacoes() {
    if (!window.api || !window.api.getMovimentacoesEstoque) {
      listaMov.innerHTML = '<div class="empty-state">API indisponível.</div>';
      return;
    }
    window.api.getMovimentacoesEstoque(30).then(function (rows) {
      listaMov.innerHTML = "";
      if (!rows || rows.length === 0) {
        listaMov.innerHTML = '<div class="empty-state">Nenhuma movimentação registrada.</div>';
        return;
      }
      rows.forEach(function (m) {
        var div = document.createElement("div");
        div.className = "item-lista";
        var data = m.data ? new Date(m.data).toLocaleString("pt-BR") : "---";
        var sinal = m.tipo === "ajuste" && Number(m.quantidade) < 0 ? "" : "+";
        div.innerHTML =
          '<div class="info"><div class="titulo"></div><div class="detalhe"></div></div>' +
          '<span class="badge badge-verde">' + sinal + m.quantidade + "</span>";
        div.querySelector(".titulo").textContent = m.produto_nome + " (" + detalhesDe(m) + ")";
        div.querySelector(".detalhe").textContent =
          data + " | Origem: " + (m.origem || "manual") +
          (m.custo_unitario !== null && m.custo_unitario !== undefined ? " | Custo: " + formatarMoeda(m.custo_unitario) : "") +
          (m.observacao ? " | " + m.observacao : "");
        listaMov.appendChild(div);
      });
    }).catch(function (err) {
      listaMov.innerHTML = '<div class="empty-state">Erro: ' + err + "</div>";
    });
  }

  function iniciarEstoque() {
    carregarAlertas();
    carregarMovimentacoes();
  }

  if (window.erpAuthPromise) window.erpAuthPromise.then(iniciarEstoque).catch(function () {});
  else iniciarEstoque();
})();
