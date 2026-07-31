(function () {
  var skuInput = document.getElementById("skuInput");
  var carrinhoBody = document.getElementById("carrinhoBody");
  var carrinhoVazio = document.getElementById("carrinhoVazio");
  var totalValue = document.getElementById("totalValue");
  var formaPagamento = document.getElementById("formaPagamento");
  var btnFinalizar = document.getElementById("btnFinalizar");
  var mensagemPDV = document.getElementById("mensagemPDV");
  var pdvDate = document.getElementById("pdvDate");

  var carrinho = [];
  var buscando = false;

  pdvDate.textContent = new Date().toLocaleDateString("pt-BR");

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
      limparCarrinho();
    }
    if (e.key === "F2") {
      e.preventDefault();
      window.open("cadastro.html", "_blank");
    }
  });

  function buscarESku(sku) {
    if (buscando) return;
    if (!window.api || !window.api.buscarSKU) {
      mostrarMensagem("API indisponvel.", "erro");
      return;
    }

    buscando = true;
    skuInput.disabled = true;
    skuInput.value = "Buscando...";

    window.api
      .buscarSKU(sku)
      .then(function (produto) {
        buscando = false;
        skuInput.disabled = false;
        skuInput.value = "";

        if (!produto) {
          mostrarMensagem("SKU nao encontrado: " + sku, "erro");
          skuInput.focus();
          return;
        }

        if (produto.quantidade_estoque <= 0) {
          mostrarMensagem("Sem estoque para: " + produto.nome, "erro");
          skuInput.focus();
          return;
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

        renderizarCarrinho();
        skuInput.value = "";
        skuInput.focus();
      })
      .catch(function (err) {
        buscando = false;
        skuInput.disabled = false;
        skuInput.value = "";
        mostrarMensagem("Erro ao buscar SKU: " + err, "erro");
        skuInput.focus();
      });
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
        tdNome.style.color = "#ffaa00";
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
    renderizarCarrinho();
  }

  function aumentarQtd(index) {
    if (carrinho[index].quantidade < carrinho[index].estoque) {
      carrinho[index].quantidade += 1;
    } else {
      mostrarMensagem("Estoque insuficiente para " + carrinho[index].nome, "erro");
    }
    renderizarCarrinho();
  }

  function removerItem(index) {
    carrinho.splice(index, 1);
    renderizarCarrinho();
  }

  function limparCarrinho() {
    carrinho = [];
    renderizarCarrinho();
    skuInput.value = "";
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
    btnFinalizar.disabled = true;
    btnFinalizar.textContent = "Finalizando...";

    var dados = {
      itens: carrinho,
      forma_pagamento: pagamento,
      total: total,
    };

    if (!window.api || !window.api.finalizarVenda) {
      mostrarMensagem("API indisponvel.", "erro");
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
        carrinho = [];
        renderizarCarrinho();
        formaPagamento.value = "";
        skuInput.value = "";
        btnFinalizar.disabled = false;
        btnFinalizar.textContent = "Finalizar Venda";
        skuInput.focus();
      })
      .catch(function (err) {
        mostrarMensagem("Erro ao finalizar venda: " + err, "erro");
        btnFinalizar.disabled = false;
        btnFinalizar.textContent = "Finalizar Venda";
      });
  }

  function mostrarMensagem(texto, tipo) {
    mensagemPDV.textContent = texto;
    mensagemPDV.className = "mensagem-pdv " + tipo;
    mensagemPDV.style.display = "block";

    setTimeout(function () {
      mensagemPDV.style.display = "none";
    }, 4000);
  }
})();