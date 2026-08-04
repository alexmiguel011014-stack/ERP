(function () {
  var fornecedorSelect = document.getElementById("fornecedorSelect");
  var skuInput = document.getElementById("skuInput");
  var qtdInput = document.getElementById("qtdInput");
  var custoInput = document.getElementById("custoInput");
  var obsInput = document.getElementById("obsInput");
  var produtoPreview = document.getElementById("produtoPreview");
  var btnAdicionar = document.getElementById("btnAdicionar");
  var btnCriar = document.getElementById("btnCriar");
  var btnLimpar = document.getElementById("btnLimpar");
  var listaItens = document.getElementById("listaItens");
  var totalPedido = document.getElementById("totalPedido");
  var listaPedidos = document.getElementById("listaPedidos");
  var mensagem = document.getElementById("mensagem");

  var itens = [];
  var produtoAtual = null;

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

  /* ---------- Fornecedores ---------- */

  function carregarFornecedores() {
    if (!window.api || !window.api.getFornecedores) return;
    window.api.getFornecedores().then(function (rows) {
      (rows || []).forEach(function (f) {
        var opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = f.nome;
        fornecedorSelect.appendChild(opt);
      });
    }).catch(function () {});
  }

  /* ---------- Itens do pedido ---------- */

  function buscarProduto() {
    var sku = skuInput.value.trim().toUpperCase();
    produtoAtual = null;
    produtoPreview.textContent = "";
    if (!sku) return;
    window.api.buscarSKU(sku).then(function (p) {
      if (!p) {
        mostrarMensagem("SKU não encontrado: " + sku, "erro");
        return;
      }
      produtoAtual = p;
      if (p.preco_custo) custoInput.value = Number(p.preco_custo).toFixed(2);
      produtoPreview.textContent =
        p.nome + " (" + detalhesDe(p) + ") — estoque atual: " + p.quantidade_estoque;
      qtdInput.focus();
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

  btnAdicionar.addEventListener("click", function () {
    if (!produtoAtual) {
      mostrarMensagem("Busque um SKU válido antes de adicionar.", "erro");
      return;
    }
    var qtd = parseInt(qtdInput.value, 10);
    var custo = Number(custoInput.value);
    if (!Number.isInteger(qtd) || qtd <= 0) {
      mostrarMensagem("Quantidade inválida.", "erro");
      return;
    }
    if (!Number.isFinite(custo) || custo < 0) {
      mostrarMensagem("Custo inválido.", "erro");
      return;
    }

    var existente = null;
    for (var i = 0; i < itens.length; i++) {
      if (itens[i].variacao_id === produtoAtual.variacao_id) { existente = itens[i]; break; }
    }
    if (existente) {
      existente.quantidade += qtd;
      existente.custo_unitario = custo;
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
    custoInput.value = "0";
    skuInput.focus();
    renderizarItens();
  });

  function renderizarItens() {
    listaItens.innerHTML = "";
    if (itens.length === 0) {
      listaItens.innerHTML = '<div class="empty-state">Nenhum item no pedido.</div>';
      btnCriar.disabled = true;
      totalPedido.value = "R$ 0,00";
      return;
    }
    btnCriar.disabled = false;

    var total = 0;
    itens.forEach(function (item, index) {
      total += item.quantidade * item.custo_unitario;
      var div = document.createElement("div");
      div.className = "item-lista";
      div.innerHTML =
        '<div class="info"><div class="titulo"></div><div class="detalhe"></div></div>' +
        '<div class="acoes"><button type="button" class="btn btn-small btn-danger">Remover</button></div>';
      div.querySelector(".titulo").textContent = item.nome + " (" + item.detalhes + ")";
      div.querySelector(".detalhe").textContent =
        "SKU: " + item.sku + " | " + item.quantidade + " x " + formatarMoeda(item.custo_unitario) +
        " = " + formatarMoeda(item.quantidade * item.custo_unitario);
      div.querySelector("button").addEventListener("click", function () {
        itens.splice(index, 1);
        renderizarItens();
      });
      listaItens.appendChild(div);
    });
    totalPedido.value = formatarMoeda(total);
  }

  btnLimpar.addEventListener("click", function () {
    itens = [];
    obsInput.value = "";
    fornecedorSelect.value = "";
    renderizarItens();
    skuInput.focus();
  });

  btnCriar.addEventListener("click", function () {
    if (itens.length === 0) return;
    if (!confirm("Criar pedido de compra com " + itens.length + " item(ns)?")) return;

    btnCriar.disabled = true;
    btnCriar.textContent = "Criando...";

    window.api.criarPedidoCompra({
      fornecedor_id: fornecedorSelect.value ? Number(fornecedorSelect.value) : null,
      observacao: obsInput.value.trim() || null,
      itens: itens.map(function (i) {
        return { variacao_id: i.variacao_id, quantidade: i.quantidade, custo_unitario: i.custo_unitario };
      }),
    }).then(function (r) {
      mostrarMensagem("Pedido #" + r.pedidoId + " criado com sucesso!", "sucesso");
      itens = [];
      obsInput.value = "";
      renderizarItens();
      carregarPedidos();
      btnCriar.textContent = "Criar Pedido";
    }).catch(function (err) {
      mostrarMensagem("Erro: " + err, "erro");
      btnCriar.disabled = false;
      btnCriar.textContent = "Criar Pedido";
    });
  });

  /* ---------- Lista de pedidos ---------- */

  function badgeStatus(status) {
    if (status === "aberto") return '<span class="badge badge-amarela">Aberto</span>';
    if (status === "recebido") return '<span class="badge badge-verde">Recebido</span>';
    return '<span class="badge badge-cinza">Cancelado</span>';
  }

  function carregarPedidos() {
    if (!window.api || !window.api.getPedidosCompra) {
      listaPedidos.innerHTML = '<div class="empty-state">API indisponível.</div>';
      return;
    }
    window.api.getPedidosCompra().then(function (rows) {
      listaPedidos.innerHTML = "";
      if (!rows || rows.length === 0) {
        listaPedidos.innerHTML = '<div class="empty-state">Nenhum pedido de compra.</div>';
        return;
      }
      rows.forEach(function (p) {
        var div = document.createElement("div");
        div.className = "item-lista";
        var data = p.data_pedido ? new Date(p.data_pedido).toLocaleDateString("pt-BR") : "---";
        div.innerHTML =
          '<div class="info"><div class="titulo"></div><div class="detalhe"></div></div>' +
          '<div class="acoes">' + badgeStatus(p.status) + "</div>";

        div.querySelector(".titulo").textContent =
          "Pedido #" + p.id + " — " + formatarMoeda(p.total);
        div.querySelector(".detalhe").textContent =
          data + " | Fornecedor: " + (p.fornecedor_nome || "não informado") +
          (p.observacao ? " | " + p.observacao : "");

        var acoes = div.querySelector(".acoes");

        var btnDetalhes = document.createElement("button");
        btnDetalhes.type = "button";
        btnDetalhes.className = "btn btn-small";
        btnDetalhes.textContent = "Itens";
        btnDetalhes.addEventListener("click", function () { toggleItens(div, p.id); });
        acoes.appendChild(btnDetalhes);

        if (p.status === "aberto") {
          var btnReceber = document.createElement("button");
          btnReceber.type = "button";
          btnReceber.className = "btn btn-small";
          btnReceber.style.background = "#DCFCE7";
          btnReceber.style.color = "#15803D";
          btnReceber.style.borderColor = "#86EFAC";
          btnReceber.textContent = "Receber";
          btnReceber.addEventListener("click", function () {
            if (!confirm("Confirmar recebimento do pedido #" + p.id + "?\n\nO estoque será atualizado e uma conta a pagar de " + formatarMoeda(p.total) + " será gerada.")) return;
            window.api.receberPedidoCompra(p.id).then(function () {
              mostrarMensagem("Pedido #" + p.id + " recebido! Estoque e conta a pagar atualizados.", "sucesso");
              carregarPedidos();
            }).catch(function (err) {
              mostrarMensagem("Erro: " + err, "erro");
            });
          });
          acoes.appendChild(btnReceber);

          var btnCancelar = document.createElement("button");
          btnCancelar.type = "button";
          btnCancelar.className = "btn btn-small btn-danger";
          btnCancelar.textContent = "Cancelar";
          btnCancelar.addEventListener("click", function () {
            if (!confirm("Cancelar o pedido #" + p.id + "?")) return;
            window.api.cancelarPedidoCompra(p.id).then(function () {
              mostrarMensagem("Pedido cancelado.", "sucesso");
              carregarPedidos();
            }).catch(function (err) {
              mostrarMensagem("Erro: " + err, "erro");
            });
          });
          acoes.appendChild(btnCancelar);
        }

        listaPedidos.appendChild(div);
      });
    }).catch(function (err) {
      listaPedidos.innerHTML = '<div class="empty-state">Erro: ' + err + "</div>";
    });
  }

  function toggleItens(container, pedidoId) {
    var existente = container.querySelector(".itens-pedido");
    if (existente) {
      existente.parentNode.removeChild(existente);
      return;
    }
    window.api.getItensPedidoCompra(pedidoId).then(function (itensPedido) {
      var box = document.createElement("div");
      box.className = "itens-pedido";
      box.style.cssText = "width:100%; margin-top:8px; padding:10px 12px; background:#F8FAFC; border-radius:8px; font-size:0.8rem; color:#475569;";
      if (!itensPedido || itensPedido.length === 0) {
        box.textContent = "Sem itens.";
      } else {
        box.innerHTML = itensPedido.map(function (i) {
          return "<div>" + i.quantidade + "x " + i.produto_nome + " (" + detalhesDe(i) + ") — " +
            formatarMoeda(i.custo_unitario) + " un.</div>";
        }).join("");
      }
      container.querySelector(".info").appendChild(box);
    }).catch(function (err) {
      mostrarMensagem("Erro: " + err, "erro");
    });
  }

  carregarFornecedores();
  carregarPedidos();
})();
