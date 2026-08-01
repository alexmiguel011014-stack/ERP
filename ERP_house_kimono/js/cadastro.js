(function () {
  var form = document.getElementById("formProduto");
  var nomeInput = document.getElementById("nome");
  var categoriaInput = document.getElementById("categoria");
  var tbody = document.getElementById("linhasVariacoes");
  var btnAdd = document.getElementById("btnAddLinha");
  var btnLimpar = document.getElementById("btnLimpar");
  var avisoGrade = document.getElementById("avisoGrade");
  var mensagem = document.getElementById("mensagem");
  var btnSalvar = form.querySelector('button[type="submit"]');

  var contadorLinhas = 0;
  var salvando = false;

  function gerarSKU(nomeProduto, cor, tamanho) {
    var palavras = nomeProduto.trim().split(/\s+/).filter(Boolean);
    var prefixoNome = palavras
      .map(function (p) {
        return p.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "");
      })
      .join("-");
    var prefixoCor = cor.trim().substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "");
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
    inputEstoque.step = "1";
    inputEstoque.required = true;
    inputEstoque.value = "0";
    tdEstoque.appendChild(inputEstoque);

    var tdSKU = document.createElement("td");
    var spanSKU = document.createElement("span");
    spanSKU.className = "sku-display";
    spanSKU.textContent = "---";
    tdSKU.appendChild(spanSKU);

    var tdErroPreco = document.createElement("td");
    tdErroPreco.className = "campo-erro";
    tdErroPreco.style.color = "#ff4c4c";
    tdErroPreco.style.fontSize = "0.7rem";
    tdErroPreco.textContent = "";

    var tdErroEstoque = document.createElement("td");
    tdErroEstoque.className = "campo-erro";
    tdErroEstoque.style.color = "#ff4c4c";
    tdErroEstoque.style.fontSize = "0.7rem";
    tdErroEstoque.textContent = "";

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
    tr.appendChild(tdErroPreco);
    tr.appendChild(tdErroEstoque);
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
      tdErroPreco.textContent = "";
      tdErroEstoque.textContent = "";
    }

    function validarLinha() {
      var preco = parseFloat(inputPreco.value);
      var estoque = parseInt(inputEstoque.value, 10);
      var temErro = false;

      if (inputPreco.value !== "" && (isNaN(preco) || preco < 0)) {
        tdErroPreco.textContent = "Pre\u00e7o inv\u00e1lido";
        temErro = true;
      } else {
        tdErroPreco.textContent = "";
      }

      if (inputEstoque.value !== "" && (isNaN(estoque) || estoque < 0 || !Number.isInteger(estoque))) {
        tdErroEstoque.textContent = "Estoque inv\u00e1lido";
        temErro = true;
      } else {
        tdErroEstoque.textContent = "";
      }

      return !temErro;
    }

    inputTamanho.addEventListener("input", atualizarSKU);
    inputCor.addEventListener("input", atualizarSKU);
    inputPreco.addEventListener("input", validarLinha);
    inputEstoque.addEventListener("input", validarLinha);

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

    if (salvando) return;

    var nomeProduto = nomeInput.value.trim();
    var categoria = categoriaInput.value.trim();
    var linhas = tbody.querySelectorAll("tr");

    if (!nomeProduto) {
      mostrarMensagem("Nome do produto e obrigatório.", "erro");
      return;
    }

    if (linhas.length === 0) {
      mostrarMensagem("Adicione pelo menos uma variação.", "erro");
      return;
    }

    var variacoes = [];
    var temErro = false;

    for (var i = 0; i < linhas.length; i++) {
      var inputs = linhas[i].querySelectorAll("input");
      var tamanho = inputs[0].value.trim();
      var cor = inputs[1].value.trim();
      var preco = parseFloat(inputs[2].value);
      var estoque = parseInt(inputs[3].value, 10);

      if (!tamanho || !cor || isNaN(preco) || preco < 0 || isNaN(estoque) || estoque < 0 || !Number.isInteger(estoque)) {
        mostrarMensagem(
          "Corrija os erros na variação " + (i + 1) + " antes de salvar.",
          "erro"
        );
        temErro = true;
        break;
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

    if (temErro) return;

    var dados = {
      nome: nomeProduto,
      categoria: categoria || null,
      variacoes: variacoes,
    };

    salvando = true;
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";

    if (window.api && window.api.salvarProduto) {
      window.api
        .salvarProduto(dados)
        .then(function (resultado) {
          mostrarMensagem(
            "Produto salvo com sucesso! ID: " + resultado.produtoId,
            "sucesso"
          );
          form.reset();
          tbody.innerHTML = "";
          contadorLinhas = 0;
          atualizarAviso();
          btnSalvar.disabled = false;
          btnSalvar.textContent = "Salvar Produto";
          salvando = false;
          nomeInput.focus();
        })
        .catch(function (err) {
          mostrarMensagem("Erro ao salvar: " + err, "erro");
          btnSalvar.disabled = false;
          btnSalvar.textContent = "Salvar Produto";
          salvando = false;
        });
    } else {
      mostrarMensagem("API não disponível. Verifique o preload.", "erro");
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar Produto";
      salvando = false;
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