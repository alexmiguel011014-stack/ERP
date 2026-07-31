(function () {
  const form = document.getElementById("formProduto");
  const nomeInput = document.getElementById("nome");
  const categoriaInput = document.getElementById("categoria");
  const tbody = document.getElementById("linhasVariacoes");
  const btnAdd = document.getElementById("btnAddLinha");
  const btnLimpar = document.getElementById("btnLimpar");
  const avisoGrade = document.getElementById("avisoGrade");
  const mensagem = document.getElementById("mensagem");

  let contadorLinhas = 0;

  function gerarSKU(nomeProduto, cor, tamanho) {
    const palavras = nomeProduto.trim().split(/\s+/).filter(Boolean);
    const prefixoNome = palavras
      .map(function (p) {
        return p.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "");
      })
      .join("-");
    const prefixoCor = cor.trim().substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "");
    return prefixoNome + "-" + prefixoCor + "-" + tamanho.toUpperCase().trim();
  }

  function criarLinhaGradiente() {
    contadorLinhas++;
    var tr = document.createElement("tr");
    tr.setAttribute("data-linha", contadorLinhas);

    var tdTamanho = document.createElement("td");
    var inputTamanho = document.createElement("input");
    inputTamanho.type = "text";
    inputTamanho.name = "tamanho";
    inputTamanho.placeholder = "A1";
    inputTamanho.required = true;
    tdTamanho.appendChild(inputTamanho);

    var tdCor = document.createElement("td");
    var inputCor = document.createElement("input");
    inputCor.type = "text";
    inputCor.name = "cor";
    inputCor.placeholder = "Preto";
    inputCor.required = true;
    tdCor.appendChild(inputCor);

    var tdPreco = document.createElement("td");
    var inputPreco = document.createElement("input");
    inputPreco.type = "number";
    inputPreco.name = "preco";
    inputPreco.placeholder = "0.00";
    inputPreco.step = "0.01";
    inputPreco.min = "0";
    inputPreco.required = true;
    tdPreco.appendChild(inputPreco);

    var tdEstoque = document.createElement("td");
    var inputEstoque = document.createElement("input");
    inputEstoque.type = "number";
    inputEstoque.name = "estoque";
    inputEstoque.placeholder = "0";
    inputEstoque.min = "0";
    inputEstoque.required = true;
    inputEstoque.value = "0";
    tdEstoque.appendChild(inputEstoque);

    var tdSKU = document.createElement("td");
    var spanSKU = document.createElement("span");
    spanSKU.className = "sku-display";
    spanSKU.textContent = "---";
    tdSKU.appendChild(spanSKU);

    var tdRemover = document.createElement("td");
    var btnRemover = document.createElement("button");
    btnRemover.type = "button";
    btnRemover.className = "btn btn-small";
    btnRemover.textContent = "x";
    btnRemover.addEventListener("click", function () {
      tr.remove();
      atualizarAviso();
    });
    tdRemover.appendChild(btnRemover);

    tr.appendChild(tdTamanho);
    tr.appendChild(tdCor);
    tr.appendChild(tdPreco);
    tr.appendChild(tdEstoque);
    tr.appendChild(tdSKU);
    tr.appendChild(tdRemover);

    function atualizarSKU() {
      var nome = nomeInput.value;
      var cor = inputCor.value;
      var tamanho = inputTamanho.value;
      if (nome && cor && tamanho) {
        spanSKU.textContent = gerarSKU(nome, cor, tamanho);
      } else {
        spanSKU.textContent = "---";
      }
    }

    inputTamanho.addEventListener("input", atualizarSKU);
    inputCor.addEventListener("input", atualizarSKU);

    tbody.appendChild(tr);
    atualizarAviso();
  }

  function atualizarAviso() {
    var linhas = tbody.querySelectorAll("tr");
    if (linhas.length === 0) {
      avisoGrade.classList.add("visible");
    } else {
      avisoGrade.classList.remove("visible");
    }
  }

  btnAdd.addEventListener("click", function () {
    criarLinhaGradiente();
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    mensagem.className = "mensagem";
    mensagem.style.display = "none";

    var nomeProduto = nomeInput.value.trim();
    var categoria = categoriaInput.value.trim();
    var linhas = tbody.querySelectorAll("tr");

    if (!nomeProduto) {
      mostrarMensagem("Nome do produto e obrigatorio.", "error");
      return;
    }

    if (linhas.length === 0) {
      mostrarMensagem("Adicione pelo menos uma variacao.", "error");
      return;
    }

    var variacoes = [];
    for (var i = 0; i < linhas.length; i++) {
      var inputs = linhas[i].querySelectorAll("input");
      var tamanho = inputs[0].value.trim();
      var cor = inputs[1].value.trim();
      var preco = parseFloat(inputs[2].value);
      var estoque = parseInt(inputs[3].value, 10);

      if (!tamanho || !cor || isNaN(preco) || isNaN(estoque)) {
        mostrarMensagem("Preencha todos os campos da variacao corretamente.", "error");
        return;
      }

      var sku = gerarSKU(nomeProduto, cor, tamanho);

      variacoes.push({
        sku: sku,
        tamanho: tamanho,
        cor: cor,
        preco: preco,
        quantidade_estoque: estoque,
      });
    }

    var dados = {
      nome: nomeProduto,
      categoria: categoria || null,
      variacoes: variacoes,
    };

    if (window.api && window.api.salvarProduto) {
      window.api
        .salvarProduto(dados)
        .then(function (resultado) {
          mostrarMensagem("Produto salvo com sucesso! ID: " + resultado.produtoId, "success");
          form.reset();
          tbody.innerHTML = "";
          contadorLinhas = 0;
          atualizarAviso();
        })
        .catch(function (err) {
          mostrarMensagem("Erro ao salvar: " + err, "error");
        });
    } else {
      mostrarMensagem("API nao disponivel. Verifique o preload.", "error");
    }
  });

  btnLimpar.addEventListener("click", function () {
    tbody.innerHTML = "";
    contadorLinhas = 0;
    atualizarAviso();
    mensagem.className = "mensagem";
    mensagem.style.display = "none";
  });

  function mostrarMensagem(texto, tipo) {
    mensagem.textContent = texto;
    mensagem.className = "mensagem " + tipo;
    mensagem.style.display = "block";
  }
})();