(function () {
  var skuInput = document.getElementById("skuInput");
  var carrinhoBody = document.getElementById("carrinhoBody");
  var carrinhoVazio = document.getElementById("carrinhoVazio");
  var totalValue = document.getElementById("totalValue");
  var formaPagamento = document.getElementById("formaPagamento");
  var btnFinalizar = document.getElementById("btnFinalizar");
  var btnCancelar = document.getElementById("btnCancelarVenda");
  var mensagemPDV = document.getElementById("mensagemPDV");
  var loadingOverlay = document.getElementById("loadingOverlay");
  var pdvDate = document.getElementById("pdvDate");

  var carrinho = [];
  var buscando = false;

  pdvDate.textContent = new Date().toLocaleDateString("pt-BR");

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

  carregarCarrinho();

  skuInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      var sku = skuInput.value.trim().toUpperCase();
      if (!sku) return;
      buscarESku(sku);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (carrinho.length > 0) {
        confirmarCancelamento();
      } else {
        window.location.href = "index.html";
      }
    }
    if (e.key === "F2") {
      e.preventDefault();
      window.location.href = "cadastro.html";
    }
  });

  if (btnCancelar) {
    btnCancelar.addEventListener("click", function () {
      confirmarCancelamento();
    });
  }

  function confirmarCancelamento() {
    if (carrinho.length === 0) {
      window.location.href = "index.html";
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
      window.location.href = "index.html";
    }
  }

  function buscarESku(sku) {
    if (buscando) return;
    if (!window.api || !window.api.buscarSKU) {
      mostrarMensagem("API indisponível.", "erro");
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

        if (produto.quantidade_estoque <= 5) {
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
      "<div>Tamanho: " + produto.tamanho + " | Cor: " + produto.cor + "</div>" +
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
      return;
    }

    carrinhoVazio.style.display = "none";
    var total = 0;

    carrinho.forEach(function (item, index) {
      var subtotal = item.preco_unitario * item.quantidade;
      total += subtotal;
      var estoqueBaixo = item.estoque !== undefined && item.estoque <= 5;

      var tr = document.createElement("tr");

      var tdNome = document.createElement("td");
      tdNome.textContent = item.nome;
      if (estoqueBaixo) {
        tdNome.style.color = "#f59e0b";
        tdNome.title = "Estoque baixo: " + item.estoque + " unidades";
      }

      var tdTamanho = document.createElement("td");
      tdTamanho.textContent = item.tamanho;

      var tdCor = document.createElement("td");
      tdCor.textContent = item.cor;

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
      tr.appendChild(tdTamanho);
      tr.appendChild(tdCor);
      tr.appendChild(tdQtd);
      tr.appendChild(tdPreco);
      tr.appendChild(tdSubtotal);
      tr.appendChild(tdRemover);

      carrinhoBody.appendChild(tr);
    });

    totalValue.textContent = "R$ " + total.toFixed(2);
    btnFinalizar.disabled = false;
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
    skuInput.focus();
    mostrarMensagem("Carrinho limpo.", "info");
  }

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

    var total = carrinho.reduce(function (acc, item) {
      return acc + item.preco_unitario * item.quantidade;
    }, 0);

    var mensagemConfirmacao =
      "Finalizar venda?\n\n" +
      "Itens: " +
      carrinho.length +
      "\n" +
      "Total: R$ " +
      total.toFixed(2) +
      "\n" +
      "Pagamento: " +
      pagamento;

    if (!confirm(mensagemConfirmacao)) {
      return;
    }

    finalizarVenda(total, pagamento);
  });

  function finalizarVenda(total, pagamento) {
    mostrarLoading(true);
    btnFinalizar.disabled = true;
    btnFinalizar.textContent = "Finalizando...";

    var dados = {
      itens: carrinho,
      forma_pagamento: pagamento,
      total: total,
    };

    if (!window.api || !window.api.finalizarVenda) {
      mostrarMensagem("API indisponível.", "erro");
      mostrarLoading(false);
      btnFinalizar.disabled = false;
      btnFinalizar.textContent = "Finalizar Venda";
      return;
    }

    window.api
      .finalizarVenda(dados)
      .then(function (resultado) {
        mostrarMensagem(
          "Venda finalizada com sucesso! ID: " + resultado.vendaId,
          "sucesso"
        );

        var dadosRecibo = {
          vendaId: resultado.vendaId,
          itens: carrinho,
          total: total,
          forma_pagamento: pagamento,
          data: new Date().toISOString(),
        };
        mostrarRecibo(dadosRecibo);

        carrinho = [];
        limparCarrinhoPersistente();
        renderizarCarrinho();
        formaPagamento.value = "";
        skuInput.value = "";
        btnFinalizar.disabled = false;
        btnFinalizar.textContent = "Finalizar Venda";
        mostrarLoading(false);
        skuInput.focus();
      })
      .catch(function (err) {
        mostrarMensagem("Erro ao finalizar venda: " + err, "erro");
        btnFinalizar.disabled = false;
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
    html += "JiuJitsu ERP";
    html += "</div>";
    html += "<div style='text-align: center; font-size: 10px; color: #666; margin-bottom: 10px;'>";
    html += "Cnpj: -- | Frente de Caixa";
    html += "</div>";
    html += "<hr style='border: none; border-top: 1px dashed #ccc; margin: 8px 0;'>";
    html += "<div style='font-size: 10px; margin-bottom: 4px;'><span style='display:inline-block;width:50%;'>Venda #" + dados.vendaId + "</span><span style='display:inline-block;width:50%; text-align:right;'>" + dataStr + "</span></div>";
    html += "<div style='font-size: 10px; margin-bottom: 8px;'><span style='display:inline-block;width:50%;'>Pagamento:</span><span style='display:inline-block;width:50%; text-align:right;'>" + dados.forma_pagamento + "</span></div>";
    html += "<hr style='border: none; border-top: 1px dashed #ccc; margin: 8px 0;'>";

    dados.itens.forEach(function (item) {
      var subtotal = item.preco_unitario * item.quantidade;
      html += "<div style='font-size: 9px; margin-bottom: 2px;'>";
      html += "<div style='display:inline-block;width:60%;'>" + item.nome + " (" + item.tamanho + "/" + item.cor + ")</div>";
      html += "<div style='display:inline-block;width:12%; text-align:right;'>" + item.quantidade + "x</div>";
      html += "<div style='display:inline-block;width:28%; text-align:right;'>" + subtotal.toFixed(2) + "</div>";
      html += "</div>";
    });

    html += "<hr style='border: none; border-top: 1px dashed #ccc; margin: 8px 0;'>";
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
