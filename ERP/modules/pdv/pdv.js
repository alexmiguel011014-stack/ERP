(function () {
  "use strict";
  var skuInput = document.getElementById("skuInput");
  var carrinhoBody = document.getElementById("carrinhoBody");
  var carrinhoVazio = document.getElementById("carrinhoVazio");
  var totalValue = document.getElementById("totalValue");
  var formaPagamento = document.getElementById("formaPagamento");
  var clienteSelect = document.getElementById("clienteSelect");
  var descontoInput = document.getElementById("descontoInput");
  var observacaoInput = document.getElementById("observacaoInput");
  var btnFinalizar = document.getElementById("btnFinalizar");
  var btnOrcamento = document.getElementById("btnOrcamento");
  var btnCancelar = document.getElementById("btnCancelarVenda");
  var mensagemPDV = document.getElementById("mensagemPDV");
  var loadingOverlay = document.getElementById("loadingOverlay");
  var pdvDate = document.getElementById("pdvDate");
  var btnBuscarProduto = document.getElementById("btnBuscarProduto");

  var carrinho = [];
  var buscando = false;

  function esc(t) {
    return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  pdvDate.textContent = new Date().toLocaleDateString("pt-BR");

  /* ---------- Clientes ---------- */

  function carregarClientes() {
    if (!window.api || !window.api.getClientes) return;
    window.api.getClientes().then(function (rows) {
      (rows || []).forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = (c.codigo ? c.codigo + " - " : "") + c.nome;
        clienteSelect.appendChild(opt);
      });
    }).catch(function (erro) {
      console.error("Erro ao carregar clientes:", erro);
      mostrarMensagem("Não foi possível carregar os clientes: " + erro, "erro");
    });
  }

  if (window.erpAuthPromise) {
    window.erpAuthPromise.then(function () {
      carregarClientes();
      carregarCarrinho();
    }).catch(function (erro) {
      console.error("Autenticação do PDV falhou:", erro);
    });
  } else {
    carregarClientes();
    carregarCarrinho();
  }

  /* ---------- Totais ---------- */

  function subtotalCarrinho() {
    return carrinho.reduce(function (acc, item) {
      return acc + item.preco_unitario * item.quantidade;
    }, 0);
  }

  function descontoAtual() {
    var d = Number(descontoInput.value);
    if (!Number.isFinite(d) || d < 0) return 0;
    return d;
  }

  function totalCarrinho() {
    return Math.max(0, subtotalCarrinho() - descontoAtual());
  }

  function atualizarTotal() {
    totalValue.textContent = "R$ " + totalCarrinho().toFixed(2);
  }

  descontoInput.addEventListener("input", atualizarTotal);

  function salvarCarrinho() {
    try {
      localStorage.setItem("pdv_carrinho", JSON.stringify(carrinho));
    } catch (e) {
      console.error("Erro ao salvar carrinho:", e);
    }
  }

  function carregarCarrinho() {
    try {
      var dados = localStorage.getItem("pdv_carrinho");
      if (dados) {
        carrinho = JSON.parse(dados);
        if (Array.isArray(carrinho)) {
          renderizarCarrinho();
          mostrarMensagem("Carrinho restaurado de uma sessão anterior.", "info");
        }
      }
    } catch (e) {
      console.error("Erro ao carregar carrinho:", e);
      carrinho = [];
    }
  }

  function limparCarrinhoPersistente() {
    localStorage.removeItem("pdv_carrinho");
  }

  function mostrarLoading(mostrar) {
    if (loadingOverlay) {
      loadingOverlay.style.display = mostrar ? "flex" : "none";
    }
  }

  var produtosEncontrados = [];
  var produtosLista = document.getElementById("produtosEncontrados");
  var produtosTbody = produtosLista ? produtosLista.querySelector("tbody") : null;
  var produtoSelecionadoIndex = -1;

  function renderizarProdutosEncontrados() {
    if (!produtosTbody) return;
    produtosTbody.innerHTML = "";
    if (!produtosEncontrados.length) {
      produtosEncontrados = [];
      produtosLista.style.display = "none";
      produtoSelecionadoIndex = -1;
      return;
    }
    produtosEncontrados.forEach(function (p, i) {
      var tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.style.background = i === produtoSelecionadoIndex ? "#E0F2FE" : "";
      tr.addEventListener("click", function () {
        selecionarProdutoLista(i);
      });
      tr.innerHTML =
         '<td>' + esc(p.sku || "") + '</td>' +
        '<td>' + esc(p.nome) + '</td>' +
        '<td style="text-align:right;">' + Number(p.preco || 0).toFixed(2) + '</td>' +
        '<td style="text-align:right;">' + (p.quantidade_estoque || 0) + '</td>';
      produtosTbody.appendChild(tr);
    });
    produtosLista.style.display = "block";
  }

  function selecionarProdutoLista(index) {
    if (index < 0 || index >= produtosEncontrados.length) return;
    var p = produtosEncontrados[index];
    produtosLista.style.display = "none";
    produtosEncontrados = [];
    produtoSelecionadoIndex = -1;
    if (produtosTbody) produtosTbody.innerHTML = "";
    adicionarProdutoCarrinho(p);
  }

  function adicionarProdutoCarrinho(produto) {
    if (produto.quantidade_estoque <= 0) {
      mostrarAlertaEstoque(produto, "Sem estoque");
      skuInput.value = "";
      skuInput.focus();
      return;
    }
    var minimo = Number.isFinite(Number(produto.estoque_minimo))
      ? Number(produto.estoque_minimo)
      : 5;
    if (produto.quantidade_estoque <= minimo) mostrarAlertaEstoque(produto, "Estoque Baixo");

    var existente = carrinho.find(function (item) {
      return item.variacao_id === produto.id;
    });

    if (existente) {
      if (existente.quantidade >= produto.quantidade_estoque) {
        mostrarMensagem("Estoque insuficiente para " + produto.nome, "erro");
        return;
      }
      existente.quantidade += 1;
    } else {
      carrinho.push({
        variacao_id: produto.id,
        nome: produto.nome,
        detalhes: formatarAtributos(produto.atributos, produto.tamanho, produto.cor),
        tamanho: produto.tamanho,
        cor: produto.cor,
        preco_unitario: produto.preco,
        quantidade: 1,
        estoque: produto.quantidade_estoque,
      });
    }

    salvarCarrinho();
    renderizarCarrinho();
    skuInput.value = "";
    skuInput.focus();
  }

  function buscarPorTermo(termo) {
    if (!window.api || !window.api.buscarProdutosTermo) {
      mostrarMensagem("API de pesquisa indisponível.", "erro");
      return;
    }
    mostrarLoading(true);
    window.api.buscarProdutosTermo(termo).then(function (lista) {
      produtosEncontrados = Array.isArray(lista) ? lista : [];
      produtoSelecionadoIndex = produtosEncontrados.length ? 0 : -1;
      renderizarProdutosEncontrados();
      if (!produtosEncontrados.length) {
        mostrarMensagem("Produto não encontrado: " + termo, "erro");
      }
    }).catch(function (err) {
      mostrarMensagem("Erro na busca: " + err, "erro");
      console.error("Erro ao pesquisar produtos:", err);
    }).finally(function () {
      mostrarLoading(false);
    });
  }

  // Tecla Enter: código do produto exato ou busca por nome.
  skuInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      var termo = skuInput.value.trim();
      if (!termo) return;
      if (produtosLista && produtosLista.style.display === "block" && produtosEncontrados.length) {
        selecionarProdutoLista(produtoSelecionadoIndex);
        return;
      }
       buscarPorTermo(termo);
    }
    if (e.key === "ArrowDown") {
      if (produtosEncontrados.length && produtosLista.style.display === "block") {
        e.preventDefault();
        produtoSelecionadoIndex = (produtoSelecionadoIndex + 1) % produtosEncontrados.length;
        renderizarProdutosEncontrados();
      }
    }
    if (e.key === "ArrowUp") {
      if (produtosEncontrados.length && produtosLista.style.display === "block") {
        e.preventDefault();
        produtoSelecionadoIndex = (produtoSelecionadoIndex - 1 + produtosEncontrados.length) % produtosEncontrados.length;
        renderizarProdutosEncontrados();
      }
    }
  });

  if (btnBuscarProduto) {
    btnBuscarProduto.addEventListener("click", function (e) {
      e.preventDefault();
       var termo = skuInput.value.trim();
       if (produtosLista && produtosLista.style.display === "block" && produtosEncontrados.length) {
         selecionarProdutoLista(produtoSelecionadoIndex);
       } else {
         buscarPorTermo(termo);
       }
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (produtosLista && produtosLista.style.display === "block") {
        produtosLista.style.display = "none";
        produtosEncontrados = [];
        produtoSelecionadoIndex = -1;
        skuInput.value = "";
        skuInput.focus();
        return;
      }
      if (carrinho.length > 0) {
        confirmarCancelamento();
      } else {
        window.location.href = "../dashboard/index.html";
      }
    }
    if (e.key === "F2") {
      e.preventDefault();
      window.location.href = "../produtos/cadastro.html";
    }
  });

  if (btnCancelar) {
    btnCancelar.addEventListener("click", function () {
      confirmarCancelamento();
    });
  }

  function confirmarCancelamento() {
    if (carrinho.length === 0) {
      window.location.href = "../dashboard/index.html";
      return;
    }

    var total = carrinho.reduce(function (acc, item) {
      return acc + item.preco_unitario * item.quantidade;
    }, 0);

    var msg =
      "Cancelar venda?\n\n" +
      "Itens no carrinho: " +
      carrinho.length +
      "\n" +
      "Total: R$ " +
      total.toFixed(2) +
      "\n\n" +
      "Esta ação não pode ser desfeita.";

    if (confirm(msg)) {
      limparCarrinho();
      window.location.href = "../dashboard/index.html";
    }
  }

  function buscarESku(sku) {
    if (buscando) return;
    if (typeof window.api === "undefined") {
      alert("DEBUG: window.api é undefined. preload.js não carregou?");
      return;
    }
    if (!window.api.buscarSKU) {
      alert("DEBUG: window.api.buscarSKU é undefined. preload.js desatualizado?");
      return;
    }

    buscando = true;
    mostrarLoading(true);
    skuInput.disabled = true;

    window.api
      .buscarSKU(sku)
      .then(function (produto) {
        buscando = false;
        mostrarLoading(false);
        skuInput.disabled = false;

        if (!produto) {
          mostrarMensagem("SKU não encontrado: " + sku, "erro");
          skuInput.value = "";
          skuInput.focus();
          return;
        }

        if (produto.quantidade_estoque <= 0) {
          mostrarAlertaEstoque(produto, "Sem estoque");
          skuInput.value = "";
          skuInput.focus();
          return;
        }

        var minimo = Number.isFinite(Number(produto.estoque_minimo)) ? Number(produto.estoque_minimo) : 5;
        if (produto.quantidade_estoque <= minimo) {
          mostrarAlertaEstoque(produto, "Estoque Baixo");
        }

        var existente = carrinho.find(function (item) {
          return item.variacao_id === produto.id;
        });

        if (existente) {
          if (existente.quantidade >= produto.quantidade_estoque) {
            mostrarMensagem(
              "Estoque insuficiente para " + produto.nome,
              "erro"
            );
            skuInput.value = "";
            skuInput.focus();
            return;
          }
          existente.quantidade += 1;
        } else {
          carrinho.push({
            variacao_id: produto.id,
            nome: produto.nome,
            detalhes: formatarAtributos(produto.atributos, produto.tamanho, produto.cor),
            tamanho: produto.tamanho,
            cor: produto.cor,
            preco_unitario: produto.preco,
            quantidade: 1,
            estoque: produto.quantidade_estoque,
          });
        }

        salvarCarrinho();
        renderizarCarrinho();
        skuInput.value = "";
        skuInput.focus();
      })
      .catch(function (err) {
        buscando = false;
        mostrarLoading(false);
        skuInput.disabled = false;
        skuInput.value = "";
        mostrarMensagem("Erro ao buscar SKU: " + err, "erro");
        console.error("buscarSKU error:", err);
        skuInput.focus();
      });
  }

  function mostrarAlertaEstoque(produto, tipo) {
    var cor = tipo === "Sem estoque" ? "#DC2626" : "#F59E0B";
    var mensagemTexto =
      tipo === "Sem estoque"
        ? "Sem estoque para: " + produto.nome
        : "Estoque baixo: " + produto.nome + " (" + produto.quantidade_estoque + " unidades)";

    mostrarMensagem(mensagemTexto, "erro");

    var alerta = document.createElement("div");
    alerta.style.cssText =
      "position: fixed; top: 60px; right: 20px; background: " +
      cor +
      "; color: white; padding: 12px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000; font-size: 14px; max-width: 300px;";
    alerta.innerHTML =
      '<div style="font-weight: 600; margin-bottom: 4px;">' +
      tipo +
      "</div>" +
      "<div>" + produto.nome + "</div>" +
      "<div>SKU: " + produto.sku + "</div>" +
      "<div>Detalhes: " + formatarAtributos(produto.atributos, produto.tamanho, produto.cor) + "</div>" +
      "<div>Estoque: " + produto.quantidade_estoque + " unidades</div>";
    document.body.appendChild(alerta);

    setTimeout(function () {
      alerta.style.transition = "opacity 0.3s";
      alerta.style.opacity = "0";
      setTimeout(function () {
        if (alerta.parentNode) {
          alerta.parentNode.removeChild(alerta);
        }
      }, 300);
    }, 4000);
  }

  function renderizarCarrinho() {
    carrinhoBody.innerHTML = "";

    if (carrinho.length === 0) {
      carrinhoVazio.style.display = "";
      totalValue.textContent = "R$ 0,00";
      btnFinalizar.disabled = true;
      btnOrcamento.disabled = true;
      return;
    }

    carrinhoVazio.style.display = "none";
    var total = 0;

    carrinho.forEach(function (item, index) {
      var subtotal = item.preco_unitario * item.quantidade;
      total += subtotal;
      var minimoItem = Number.isFinite(Number(item.estoque_minimo)) ? Number(item.estoque_minimo) : 5;
      var estoqueBaixo = item.estoque !== undefined && item.estoque <= minimoItem;

      var tr = document.createElement("tr");

      var tdNome = document.createElement("td");
      tdNome.textContent = item.nome;
      if (estoqueBaixo) {
        tdNome.style.color = "#f59e0b";
        tdNome.title = "Estoque baixo: " + item.estoque + " unidades";
      }

      var tdDetalhes = document.createElement("td");
      tdDetalhes.textContent =
        item.detalhes || formatarAtributos(item.atributos, item.tamanho, item.cor);

      var tdQtd = document.createElement("td");
      tdQtd.style.textAlign = "center";

      var btnMenos = document.createElement("button");
      btnMenos.type = "button";
      btnMenos.className = "btn-qtd";
      btnMenos.textContent = "\u2212";
      btnMenos.title = "Diminuir 1";
      btnMenos.addEventListener("click", function () {
        diminuirQtd(index);
      });

      var spanQtd = document.createElement("span");
      spanQtd.textContent = " " + item.quantidade + " ";

      var btnMais = document.createElement("button");
      btnMais.type = "button";
      btnMais.className = "btn-qtd";
      btnMais.textContent = "+";
      btnMais.title = "Adicionar 1";
      btnMais.addEventListener("click", function () {
        aumentarQtd(index);
      });

      tdQtd.appendChild(btnMenos);
      tdQtd.appendChild(spanQtd);
      tdQtd.appendChild(btnMais);

      var tdPreco = document.createElement("td");
      tdPreco.textContent = "R$ " + item.preco_unitario.toFixed(2);

      var tdSubtotal = document.createElement("td");
      tdSubtotal.textContent = "R$ " + subtotal.toFixed(2);

      var tdRemover = document.createElement("td");
      var btnRemover = document.createElement("button");
      btnRemover.type = "button";
      btnRemover.className = "btn-remover";
      btnRemover.textContent = "x";
      btnRemover.title = "Remover item";
      btnRemover.addEventListener("click", function () {
        removerItem(index);
      });
      tdRemover.appendChild(btnRemover);

      tr.appendChild(tdNome);
      tr.appendChild(tdDetalhes);
      tr.appendChild(tdQtd);
      tr.appendChild(tdPreco);
      tr.appendChild(tdSubtotal);
      tr.appendChild(tdRemover);

      carrinhoBody.appendChild(tr);
    });

    atualizarTotal();
    btnFinalizar.disabled = false;
    btnOrcamento.disabled = false;
  }

  function diminuirQtd(index) {
    if (carrinho[index].quantidade > 1) {
      carrinho[index].quantidade -= 1;
    } else {
      carrinho.splice(index, 1);
    }
    salvarCarrinho();
    renderizarCarrinho();
  }

  function aumentarQtd(index) {
    if (carrinho[index].quantidade < carrinho[index].estoque) {
      carrinho[index].quantidade += 1;
      salvarCarrinho();
      renderizarCarrinho();
    } else {
      mostrarMensagem("Estoque insuficiente para " + carrinho[index].nome, "erro");
    }
  }

  function removerItem(index) {
    carrinho.splice(index, 1);
    salvarCarrinho();
    renderizarCarrinho();
  }

  function limparCarrinho() {
    carrinho = [];
    limparCarrinhoPersistente();
    renderizarCarrinho();
    skuInput.value = "";
    formaPagamento.value = "";
    clienteSelect.value = "";
    descontoInput.value = "0";
    observacaoInput.value = "";
    skuInput.focus();
    mostrarMensagem("Carrinho limpo.", "info");
  }

  btnOrcamento.addEventListener("click", function () {
    if (carrinho.length === 0) {
      mostrarMensagem("Carrinho vazio.", "erro");
      return;
    }

    if (!confirm("Salvar como orçamento?\n\nO estoque NÃO será baixado agora. Converta em venda depois, na tela de Histórico.")) {
      return;
    }

    registrarVenda("orcamento");
  });

  btnFinalizar.addEventListener("click", function () {
    if (carrinho.length === 0) {
      mostrarMensagem("Carrinho vazio.", "erro");
      return;
    }

    var pagamento = formaPagamento.value;
    if (!pagamento) {
      mostrarMensagem("Selecione a forma de pagamento.", "erro");
      return;
    }

    var total = totalCarrinho();
    var desconto = descontoAtual();

    var mensagemConfirmacao =
      "Finalizar venda?\n\n" +
      "Itens: " +
      carrinho.length +
      "\n" +
      "Subtotal: R$ " +
      subtotalCarrinho().toFixed(2) +
      (desconto > 0 ? "\nDesconto: R$ " + desconto.toFixed(2) : "") +
      "\n" +
      "Total: R$ " +
      total.toFixed(2) +
      "\n" +
      "Pagamento: " +
      pagamento +
      (pagamento === "Fiado" ? "\n\nAtenção: será gerada uma conta a receber." : "");

    if (!confirm(mensagemConfirmacao)) {
      return;
    }

    registrarVenda("finalizada");
  });

  function registrarVenda(status) {
    mostrarLoading(true);
    btnFinalizar.disabled = true;
    btnOrcamento.disabled = true;
    btnFinalizar.textContent = status === "orcamento" ? "Salvando..." : "Finalizando...";

    var dados = {
      itens: carrinho,
      forma_pagamento: formaPagamento.value || null,
      cliente_id: clienteSelect.value ? Number(clienteSelect.value) : null,
      desconto: descontoAtual(),
      observacao: observacaoInput.value.trim() || null,
      total: totalCarrinho(),
      status: status,
    };

    if (!window.api || !window.api.finalizarVenda) {
      mostrarMensagem("API indisponível.", "erro");
      mostrarLoading(false);
      btnFinalizar.disabled = false;
      btnOrcamento.disabled = false;
      btnFinalizar.textContent = "Finalizar Venda";
      return;
    }

    window.api
      .finalizarVenda(dados)
      .then(function (resultado) {
        if (status === "orcamento") {
          mostrarMensagem("Orçamento salvo! ID: " + resultado.vendaId, "sucesso");
        } else {
          mostrarMensagem(
            "Venda finalizada com sucesso! ID: " + resultado.vendaId,
            "sucesso"
          );

          var dadosRecibo = {
            vendaId: resultado.vendaId,
            itens: carrinho,
            subtotal: subtotalCarrinho(),
            desconto: descontoAtual(),
            total: totalCarrinho(),
            forma_pagamento: dados.forma_pagamento,
            cliente_nome: clienteSelect.value ? clienteSelect.options[clienteSelect.selectedIndex].textContent : null,
            data: new Date().toISOString(),
          };
          mostrarRecibo(dadosRecibo);
        }

        carrinho = [];
        limparCarrinhoPersistente();
        renderizarCarrinho();
        formaPagamento.value = "";
        clienteSelect.value = "";
        descontoInput.value = "0";
        observacaoInput.value = "";
        skuInput.value = "";
        btnFinalizar.disabled = false;
        btnOrcamento.disabled = false;
        btnFinalizar.textContent = "Finalizar Venda";
        mostrarLoading(false);
        skuInput.focus();
      })
      .catch(function (err) {
        mostrarMensagem("Erro ao " + (status === "orcamento" ? "salvar orçamento" : "finalizar venda") + ": " + err, "erro");
        btnFinalizar.disabled = false;
        btnOrcamento.disabled = false;
        btnFinalizar.textContent = "Finalizar Venda";
        mostrarLoading(false);
      });
  }

  function mostrarRecibo(dados) {
    var overlay = document.getElementById("receiptOverlay");
    var content = document.getElementById("receiptContent");
    var htmlEl = document.getElementById("receiptHTML");

    if (!overlay || !htmlEl) return;

    var data = new Date(dados.data);
    var dataStr = data.toLocaleDateString("pt-BR") + " " + data.toLocaleTimeString("pt-BR");

    var html = "";
    html += "<div style='text-align: center; margin-bottom: 10px; font-size: 14px; font-weight: bold;'>";
    html += "Alga ERP";
    html += "</div>";
    html += "<div style='text-align: center; font-size: 10px; color: #666; margin-bottom: 10px;'>";
    html += "Cnpj: -- | Frente de Caixa";
    html += "</div>";
    html += "<hr style='border: none; border-top: 1px dashed #ccc; margin: 8px 0;'>";
    html += "<div style='font-size: 10px; margin-bottom: 4px;'><span style='display:inline-block;width:50%;'>Venda #" + dados.vendaId + "</span><span style='display:inline-block;width:50%; text-align:right;'>" + dataStr + "</span></div>";
    html += "<div style='font-size: 10px; margin-bottom: 4px;'><span style='display:inline-block;width:50%;'>Pagamento:</span><span style='display:inline-block;width:50%; text-align:right;'>" + dados.forma_pagamento + "</span></div>";
    if (dados.cliente_nome) {
      html += "<div style='font-size: 10px; margin-bottom: 4px;'><span style='display:inline-block;width:30%;'>Cliente:</span><span style='display:inline-block;width:70%; text-align:right;'>" + dados.cliente_nome + "</span></div>";
    }
    html += "<hr style='border: none; border-top: 1px dashed #ccc; margin: 8px 0;'>";

    dados.itens.forEach(function (item) {
      var subtotal = item.preco_unitario * item.quantidade;
      var detalhes = item.detalhes || formatarAtributos(item.atributos, item.tamanho, item.cor);
      var nomeLinha = item.nome;
      if (detalhes && detalhes !== "---") {
        nomeLinha += " (" + detalhes + ")";
      }
      html += "<div style='font-size: 9px; margin-bottom: 2px;'>";
      html += "<div style='display:inline-block;width:60%;'>" + nomeLinha + "</div>";
      html += "<div style='display:inline-block;width:12%; text-align:right;'>" + item.quantidade + "x</div>";
      html += "<div style='display:inline-block;width:28%; text-align:right;'>" + subtotal.toFixed(2) + "</div>";
      html += "</div>";
    });

    html += "<hr style='border: none; border-top: 1px dashed #ccc; margin: 8px 0;'>";
    if (dados.desconto > 0) {
      html += "<div style='font-size: 10px; text-align: right;'>Subtotal: R$ " + dados.subtotal.toFixed(2) + "</div>";
      html += "<div style='font-size: 10px; text-align: right;'>Desconto: - R$ " + dados.desconto.toFixed(2) + "</div>";
    }
    html += "<div style='font-size: 12px; font-weight: bold; text-align: right; margin-bottom: 4px;'>Total: R$ " + dados.total.toFixed(2) + "</div>";
    html += "<div style='text-align: center; font-size: 9px; color: #666; margin-top: 10px;'>Obrigado pela preferencia!</div>";

    htmlEl.innerHTML = html;
    overlay.style.display = "flex";
  }

  window.imprimirRecibo = function () {
    window.print();
  };

  window.fecharRecibo = function () {
    var overlay = document.getElementById("receiptOverlay");
    if (overlay) overlay.style.display = "none";
  };

  function mostrarMensagem(texto, tipo) {
    mensagemPDV.textContent = texto;
    mensagemPDV.className = "mensagem-pdv " + tipo;
    mensagemPDV.style.display = "block";

    setTimeout(function () {
      mensagemPDV.style.display = "none";
    }, 4000);
  }
})();
