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

  pdvDate.textContent = new Date().toLocaleDateString("pt-BR");

  skuInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      var sku = skuInput.value.trim().toUpperCase();
      if (!sku) return;
      buscarESku(sku);
    }
  });

  function buscarESku(sku) {
    if (!window.api || !window.api.buscarSKU) {
      mostrarMensagem("API indisponvel.", "erro");
      return;
    }

    window.api
      .buscarSKU(sku)
      .then(function (produto) {
        if (!produto) {
          mostrarMensagem("SKU nao encontrado: " + sku, "erro");
          skuInput.value = "";
          skuInput.focus();
          return;
        }

        if (produto.quantidade_estoque <= 0) {
          mostrarMensagem("Sem estoque para: " + produto.nome, "erro");
          skuInput.value = "";
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
          });
        }

        renderizarCarrinho();
        skuInput.value = "";
        skuInput.focus();
      })
      .catch(function (err) {
        mostrarMensagem("Erro ao buscar SKU: " + err, "erro");
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

      var tr = document.createElement("tr");

      var tdNome = document.createElement("td");
      tdNome.textContent = item.nome;

      var tdTamanho = document.createElement("td");
      tdTamanho.textContent = item.tamanho;

      var tdCor = document.createElement("td");
      tdCor.textContent = item.cor;

      var tdQtd = document.createElement("td");
      tdQtd.textContent = item.quantidade;

      var tdPreco = document.createElement("td");
      tdPreco.textContent = "R$ " + item.preco_unitario.toFixed(2);

      var tdSubtotal = document.createElement("td");
      tdSubtotal.textContent = "R$ " + subtotal.toFixed(2);

      var tdRemover = document.createElement("td");
      var btnRemover = document.createElement("button");
      btnRemover.type = "button";
      btnRemover.className = "btn-remover";
      btnRemover.textContent = "x";
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

  function removerItem(index) {
    carrinho.splice(index, 1);
    renderizarCarrinho();
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

    var dados = {
      itens: carrinho,
      forma_pagamento: pagamento,
      total: total,
    };

    if (!window.api || !window.api.finalizarVenda) {
      mostrarMensagem("API indisponvel.", "erro");
      return;
    }

    window.api
      .finalizarVenda(dados)
      .then(function (resultado) {
        mostrarMensagem(
          "Venda finalizada! ID: " + resultado.vendaId,
          "sucesso"
        );
        carrinho = [];
        renderizarCarrinho();
        formaPagamento.value = "";
        skuInput.value = "";
        skuInput.focus();
      })
      .catch(function (err) {
        mostrarMensagem("Erro ao finalizar venda: " + err, "erro");
      });
  });

  function mostrarMensagem(texto, tipo) {
    mensagemPDV.textContent = texto;
    mensagemPDV.className = "mensagem-pdv " + tipo;
    mensagemPDV.style.display = "block";

    setTimeout(function () {
      mensagemPDV.style.display = "none";
    }, 4000);
  }
})();