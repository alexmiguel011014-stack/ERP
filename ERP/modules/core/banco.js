(function () {
  "use strict";

  var api = window.api || {};

  function invocar(nome) {
    var metodo = api[nome];
    if (typeof metodo !== "function") {
      return Promise.reject(new Error("API indisponível: " + nome));
    }
    var args = Array.prototype.slice.call(arguments, 1);
    return metodo.apply(api, args);
  }

  function verAutenticacao() {
    return invocar("getAuthSession");
  }

  var banco = {
    version: "1",
    api: api,

    /* ===== sessão ===== */
    auth: {
      sessao: verAutenticacao,
      unlockComPerfil: function (login, senha) { return invocar("unlockWithProfile", login, senha); },
      logout: function () { return invocar("logout"); },
    },

    /* ===== Acessos / usuários (somente admin) ===== */
    usuarios: {
      listar: function () { return invocar("listarUsuarios"); },
      salvar: function (dados) { return invocar("salvarUsuario", dados); },
      remover: function (id) { return invocar("removerUsuario", id); },
    },

    /* ===== Produtos ===== */
    produtos: {
      buscar: function () { return invocar("buscarProdutos"); },
      detalhados: function (incluirInativos) { return invocar("listarProdutosDetalhados", incluirInativos); },
      proximoSku: function () { return invocar("proximoSkuProduto"); },
      salvar: function (dados) { return invocar("salvarProduto", dados); },
      atualizar: function (id, dados) { return invocar("atualizarProduto", id, dados); },
      remover: function (id) { return invocar("removerProduto", id); },
      restaurar: function (id) { return invocar("restaurarProduto", id); },
      excluirPermanente: function (id) { return invocar("excluirProdutoPermanente", id); },
      buscarSKU: function (sku) { return invocar("buscarSKU", sku); },
      buscarPorTermo: function (termo) { return invocar("buscarProdutosTermo", termo); },
      escolherImagem: function (produtoId) { return invocar("escolherImagemProduto", produtoId); },
      removerImagem: function (produtoId) { return invocar("removerImagemProduto", produtoId); },
      imagem: function (nomeArquivo) { return invocar("getImagemProduto", nomeArquivo); },
    },

    /* ===== Categorias ===== */
    categorias: {
      listar: function () { return invocar("getCategorias"); },
      comUso: function () { return invocar("categoriasWithUsage"); },
      proximoCodigo: function () { return invocar("proximoCodigoCategoria"); },
      salvar: function (nome, categoriaPaiId) { return invocar("salvarCategoria", nome, categoriaPaiId); },
      salvarComSubcategorias: function (dados) { return invocar("salvarCategoriaComSubcategorias", dados); },
      remover: function (id) { return invocar("removerCategoria", id); },
    },

    /* ===== Clientes ===== */
    clientes: {
      listar: function (incluirInativos) { return invocar("getClientes", incluirInativos); },
      proximoCodigo: function () { return invocar("proximoCodigoCliente"); },
      salvar: function (dados) { return invocar("salvarCliente", dados); },
      atualizar: function (id, dados) { return invocar("atualizarCliente", id, dados); },
      remover: function (id) { return invocar("removerCliente", id); },
      restaurar: function (id) { return invocar("restaurarCliente", id); },
      excluirPermanente: function (id) { return invocar("excluirClientePermanente", id); },
      movimentacoes: function (id) { return invocar("movimentacoesCliente", id); },
      buscar: function (filtro) { return invocar("buscarCliente", filtro); },
      precos: function (clienteId) { return invocar("listarPrecosCliente", clienteId); },
      salvarPreco: function (dados) { return invocar("salvarPrecoCliente", dados); },
      removerPreco: function (id) { return invocar("removerPrecoCliente", id); },
      precoEspecial: function (clienteId, variacaoId) { return invocar("getPrecoCliente", clienteId, variacaoId); },
    },

    /* ===== Vendas / PDV ===== */
    vendas: {
      finalizar: function (dados) { return invocar("finalizarVenda", dados); },
      listar: function (filtroData) { return invocar("getVendas", filtroData); },
      hoje: function () { return invocar("getVendasHoje"); },
      itens: function (vendaId) { return invocar("getItensVenda", vendaId); },
      converterOrcamento: function (vendaId) { return invocar("converterOrcamento", vendaId); },
      cancelarOrcamento: function (vendaId) { return invocar("cancelarOrcamento", vendaId); },
      registrarDevolucao: function (dados) { return invocar("registrarDevolucao", dados); },
      devolucoes: function (filtro) { return invocar("getDevolucoes", filtro); },
      itensDevolucao: function (devolucaoId) { return invocar("getItensDevolucao", devolucaoId); },
    },

    /* ===== Estoque ===== */
    estoque: {
      negativo: function () { return invocar("getEstoqueNegativo"); },
      baixo: function () { return invocar("getEstoqueBaixo"); },
      visaoGeral: function () { return invocar("getEstoqueVisaoGeral"); },
      movimentacoes: function (limite) { return invocar("getMovimentacoesEstoque", limite); },
      registrarEntrada: function (dados) { return invocar("registrarEntradaEstoque", dados); },
      ajustarManual: function (dados) { return invocar("ajustarEstoqueManual", dados); },
      salvarMinimo: function (variacaoId, valor) { return invocar("salvarEstoqueMinimo", variacaoId, valor); },
    },

    /* ===== Precificação ===== */
    precificacao: {
      dados: function () { return invocar("getPricingData"); },
      margemGlobal: function () { return invocar("getGlobalMargin"); },
      salvarMargemGlobal: function (valor) { return invocar("saveGlobalMargin", valor); },
      custoFixoConfig: function () { return invocar("getCustoFixoConfig"); },
      salvarCustoFixoConfig: function (mensal, volumeMensal) { return invocar("saveCustoFixoConfig", mensal, volumeMensal); },
      salvarAplicarCustoFixo: function (produtoId, aplicar) { return invocar("saveAplicarCustoFixo", produtoId, aplicar); },
      salvarMargemProduto: function (produtoId, margem) { return invocar("saveProductMargin", produtoId, margem); },
      salvarPreco: function (produtoId, precoVenda) { return invocar("saveProductPrice", produtoId, precoVenda); },
      salvarCusto: function (produtoId, custo) { return invocar("saveProductCost", produtoId, custo); },
      salvarImpostos: function (produtoId, valor) { return invocar("saveProductTaxes", produtoId, valor); },
      aplicarMargemEmLote: function (produtoIds, margem) { return invocar("massUpdateMargem", produtoIds, margem); },
    },

    /* ===== Fornecedores ===== */
    fornecedores: {
      listar: function () { return invocar("getFornecedores"); },
      salvar: function (dados) { return invocar("salvarFornecedor", dados); },
      atualizar: function (id, dados) { return invocar("atualizarFornecedor", id, dados); },
      remover: function (id) { return invocar("removerFornecedor", id); },
      produtos: function (fornecedorId) { return invocar("listarProdutosFornecedor", fornecedorId); },
      salvarProduto: function (dados) { return invocar("salvarProdutoFornecedor", dados); },
      removerProduto: function (id) { return invocar("removerProdutoFornecedor", id); },
      custoProduto: function (fornecedorId, variacaoId) { return invocar("getCustoFornecedorProduto", fornecedorId, variacaoId); },
      cotacao: function (variacaoId) { return invocar("getCotacaoProduto", variacaoId); },
    },

    /* ===== Compras ===== */
    compras: {
      criarPedido: function (dados) { return invocar("criarPedidoCompra", dados); },
      pedidos: function () { return invocar("getPedidosCompra"); },
      itensPedido: function (pedidoId) { return invocar("getItensPedidoCompra", pedidoId); },
      receberPedido: function (pedidoId, itensRecebidos) { return invocar("receberPedidoCompra", pedidoId, itensRecebidos); },
      cancelarPedido: function (pedidoId) { return invocar("cancelarPedidoCompra", pedidoId); },
    },

    /* ===== Financeiro ===== */
    financeiro: {
      lancamentos: function (filtro) { return invocar("getLancamentos", filtro); },
      criarLancamento: function (dados) { return invocar("criarLancamento", dados); },
      baixar: function (id) { return invocar("baixarLancamento", id); },
      excluir: function (id) { return invocar("excluirLancamento", id); },
      fluxoCaixa: function (inicio, fim) { return invocar("getFluxoCaixa", inicio, fim); },
    },

    /* ===== Fechamento de caixa (PDV) ===== */
    caixa: {
      abrir: function (valorAbertura) { return invocar("abrirCaixa", valorAbertura); },
      fechar: function (valorInformado, observacao) { return invocar("fecharCaixa", valorInformado, observacao); },
      aberto: function () { return invocar("getCaixaAberto"); },
      resumo: function () { return invocar("getResumoCaixaAberto"); },
      historico: function (limite) { return invocar("getHistoricoCaixa", limite); },
    },

    /* ===== Relatórios ===== */
    relatorios: {
      dre: function (inicio, fim) { return invocar("getDRE", inicio, fim); },
      vendasPeriodo: function (inicio, fim) { return invocar("getRelatorioVendas", inicio, fim); },
      curvaABC: function (inicio, fim) { return invocar("getCurvaABC", inicio, fim); },
      comissoes: function (inicio, fim) { return invocar("getComissoes", inicio, fim); },
    },

    /* ===== Dashboard ===== */
    dashboard: {
      stats: function () { return invocar("dashboardStats"); },
    },

    /* ===== Busca global ===== */
    busca: {
      global: function (termo) { return invocar("buscaGlobal", termo); },
    },

    /* ===== Sistema ===== */
    sistema: {
      backupAutomatico: function () { return invocar("backupAutomatico"); },
      exportBackup: function () { return invocar("exportBackup"); },
      importBackup: function (caminho) { return invocar("importBackup", caminho); },
      versaoApp: function () { return invocar("getAppVersion"); },
      caminhoBanco: function () { return invocar("getDBPath"); },
      verificarUpdate: function () { return invocar("checkForUpdates"); },
      baixarUpdate: function () { return invocar("downloadUpdate"); },
      sairEInstalar: function () { return invocar("quitAndInstall"); },
    },

    /* ===== Gestão do banco (somente admin — ver dados crus) ===== */
    banco: {
      listarTabelas: function () { return invocar("listarTabelasBanco"); },
      resumoTabelas: function () { return invocar("resumoTabelasBanco"); },
      logAtividades: function (filtro) { return invocar("getLogAtividades", filtro); },
      consultarTabela: function (tabela, limite) { return invocar("consultarTabelaBanco", tabela, limite); },
      exportarJSON: function () { return invocar("exportarBancoJSON"); },
      verificarSenhaAdmin: function (senha) { return invocar("verificarSenhaAdmin", senha); },
    },
  };

  window.erpBanco = banco;
})();