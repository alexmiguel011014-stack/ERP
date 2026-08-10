/* Teste end-to-end da UI: sobe o app real (main.js), faz login e visita cada
   módulo, coletando erros de console e o resultado das chamadas ao banco.
   Uso: npx electron scripts/test-ui.js  (a partir da raiz do projeto) */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-ui-'));
app.setPath('userData', TMP);

const RAIZ = path.join(__dirname, '..');
require(path.join(RAIZ, 'main.js'));

const erros = [];
const logs = [];
let paginaAtual = '(inicial)';

function espiar(wc) {
  wc.on('console-message', (e, level, message, line, sourceId) => {
    const linha = '[' + paginaAtual + '] ' + message + ' (' + String(sourceId).split('/').pop() + ':' + line + ')';
    logs.push(linha);
    // Avisos de CSP do próprio Electron em modo dev não são defeitos do app.
    if (level >= 2 && message.indexOf('Electron Security Warning') === -1) erros.push(linha);
  });
  wc.on('did-fail-load', (e, code, desc, url) => {
    erros.push('[' + paginaAtual + '] DID-FAIL-LOAD ' + code + ' ' + desc + ' ' + url);
  });
}

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function aguardarCarregamento(win) {
  return new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
}

const PAGINAS = [
  ['Dashboard', 'modules/dashboard/index.html'],
  ['Produtos - Cadastro', 'modules/produtos/cadastro.html'],
  ['Produtos - Categorias', 'modules/produtos/categorias.html'],
  ['Clientes', 'modules/clientes/clientes.html'],
  ['Clientes - Lista', 'modules/clientes/lista-clientes.html'],
  ['PDV', 'modules/pdv/pdv.html'],
  ['Entrada de estoque', 'modules/entrada/entrada.html'],
  ['Lista de estoque', 'modules/entrada/estoque-lista.html'],
  ['Precificação', 'modules/precificacao/precificacao.html'],
  ['Importação', 'modules/importacao/importacao.html'],
  ['Vendas', 'modules/vendas/vendas.html'],
  ['Fornecedores', 'modules/fornecedores/fornecedores.html'],
  ['Compras', 'modules/compras/compras.html'],
  ['Financeiro', 'modules/financeiro/financeiro.html'],
  ['Relatórios', 'modules/relatorios/relatorios.html'],
  ['Acessos', 'modules/acessos/acessos.html'],
  ['Banco', 'modules/banco/banco.html'],
  ['Atualização', 'modules/atualizacao/atualizacao.html'],
];

// Sonda executada em cada página: exercita a camada erpBanco de verdade.
const SONDA = `
(async () => {
  const r = { url: location.pathname.split('/').slice(-2).join('/'), api: !!window.api, banco: !!window.erpBanco, store: !!window.erpCategoryStore, chamadas: {}, jsErro: null };
  try {
    if (window.erpAuthPromise) { await Promise.race([window.erpAuthPromise, new Promise(res => setTimeout(res, 3000))]); }
    const testes = {
      sessao: () => window.erpBanco.auth.sessao(),
      categorias: () => window.erpBanco.categorias.comUso(),
      produtos: () => window.erpBanco.produtos.detalhados(),
      dashboard: () => window.erpBanco.dashboard.stats(),
    };
    for (const k of Object.keys(testes)) {
      try { const v = await testes[k](); r.chamadas[k] = Array.isArray(v) ? 'array(' + v.length + ')' : 'ok'; }
      catch (e) { r.chamadas[k] = 'ERRO: ' + (e && e.message ? e.message : e); }
    }
  } catch (e) { r.jsErro = String(e && e.message ? e.message : e); }
  return r;
})()
`;

// Verificações de DOM por página: confirmam que o dado do banco chegou na tela.
const CHECAGENS_DOM = {
  'Produtos - Categorias': `
    (async () => {
      const r = {};
      const linhas = document.querySelectorAll('#corpoCategorias tr');
      r.linhasTabela = linhas.length;
      r.vazia = document.querySelector('#corpoCategorias .empty-state') ? true : false;
      r.opcoesPai = document.querySelectorAll('#categoriaPai option').length;
      r.temCodigo = !!document.querySelector('#corpoCategorias .cat-codigo');
      r.textoPrimeiraLinha = linhas[0] ? linhas[0].innerText.replace(/\\s+/g, ' ').trim() : null;
      return r;
    })()
  `,
  'Produtos - Cadastro': `
    (async () => {
      const r = {};
      r.sku = document.getElementById('skuProduto').value;
      document.getElementById('btnCatDropdown').click();
      await new Promise(res => setTimeout(res, 300));
      r.itensDropdown = document.querySelectorAll('#catPopoverList .cat-popover-item').length;
      r.dropdownVazio = !!document.querySelector('#catPopoverList .cat-popover-empty');
      document.getElementById('btnListaProdutos').click();
      await new Promise(res => setTimeout(res, 500));
      const linhas = document.querySelectorAll('#corpoProdutos tr');
      r.linhasProdutos = linhas.length;
      r.produtosVazio = !!document.querySelector('#corpoProdutos .empty-state');
      r.textoPrimeiroProduto = linhas[0] ? linhas[0].innerText.replace(/\\s+/g, ' ').trim() : null;
      return r;
    })()
  `,
  Precificação: `
    (async () => {
      const r = {};
      const dados = await window.erpBanco.precificacao.dados();
      r.produtosPrecificacao = Array.isArray(dados) ? dados.length : 'nao-array';
      r.linhasTabela = document.querySelectorAll('table tbody tr').length;
      return r;
    })()
  `,
  'Lista de estoque': `
    (async () => {
      await new Promise(res => setTimeout(res, 400));
      const r = {};
      r.stats = document.getElementById('statsEstoque').children.length;
      r.linhasTabela = document.querySelectorAll('#corpoEstoque tr').length;
      return r;
    })()
  `,
  PDV: `
    (async () => {
      const r = {};
      const achado = await window.erpBanco.produtos.buscarSKU('P0001');
      r.buscaSKU = achado ? achado.nome : 'nao-encontrado';
      const termo = await window.erpBanco.produtos.buscarPorTermo('Quimono');
      r.buscaTermo = Array.isArray(termo) ? termo.length : 'nao-array';
      const acento = await window.erpBanco.produtos.buscarPorTermo('trançado');
      r.buscaTermoAcento = Array.isArray(acento) ? acento.length : 'nao-array';
      return r;
    })()
  `,
};

app.whenReady().then(async () => {
  await esperar(1200);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.log('FALHA: nenhuma janela criada por main.js');
    app.exit(2);
    return;
  }
  win.hide();
  espiar(win.webContents);

  // 1) Login (banco novo -> primeiro usuário é semeado automaticamente)
  await esperar(1500);
  let url = win.webContents.getURL();
  console.log('URL inicial:', url.split('/').slice(-2).join('/'));
  if (url.indexOf('login.html') === -1) {
    await win.loadFile(path.join(RAIZ, 'modules/auth/login.html'));
    await esperar(500);
  }
  paginaAtual = 'login';
  const login = await win.webContents.executeJavaScript(
    "window.api.unlockWithProfile('admin', 'admin1234').then(r => JSON.stringify(r)).catch(e => 'ERRO: ' + e)"
  );
  console.log('Login:', login);
  const loginOk = String(login).indexOf('ERRO') === -1;

  // 2) Semeia dados via IPC para as telas terem o que renderizar
  if (loginOk) {
    const semear = await win.webContents.executeJavaScript(`
      (async () => {
        const out = [];
        try {
          const g = await window.api.salvarCategoria('Tamanhos', null);
          const s = await window.api.salvarCategoria('A1', g.id);
          const sku = await window.api.proximoSkuProduto();
          const p = await window.api.salvarProduto({
            nome: 'Quimono Trançado', categoria: null, categoria_id: null, subcategoria_id: null,
            categoriasSelecionadas: [g.id, s.id],
            variacoes: [{ sku: sku, preco: 0, preco_custo: 0, quantidade_estoque: 10, atributos: [{ chave: 'Unidade', valor: 'Padrão' }] }]
          });
          out.push('categorias=' + g.id + '/' + s.id, 'produto=' + JSON.stringify(p));
        } catch (e) { out.push('ERRO: ' + (e && e.message ? e.message : e)); }
        return out.join(' | ');
      })()
    `);
    console.log('Seed:', semear);
  }

  // 3) Visita cada página
  const relatorio = [];
  for (const [nome, arquivo] of PAGINAS) {
    paginaAtual = nome;
    try {
      const carregou = aguardarCarregamento(win);
      await win.loadFile(path.join(RAIZ, arquivo));
      await carregou;
      await esperar(900);
      const r = await win.webContents.executeJavaScript(SONDA);
      if (CHECAGENS_DOM[nome]) {
        try {
          r.dom = await win.webContents.executeJavaScript(CHECAGENS_DOM[nome]);
        } catch (e) {
          r.dom = { erro: String(e && e.message ? e.message : e) };
        }
      }
      relatorio.push({ nome, ...r });
    } catch (e) {
      relatorio.push({ nome, erro: String(e && e.message ? e.message : e) });
    }
  }

  console.log('\n================ RELATÓRIO POR PÁGINA ================');
  let falhas = 0;
  for (const r of relatorio) {
    const problemas = [];
    if (r.erro) problemas.push('load: ' + r.erro);
    if (r.api === false) problemas.push('window.api ausente');
    if (r.banco === false) problemas.push('window.erpBanco ausente');
    if (r.jsErro) problemas.push('js: ' + r.jsErro);
    Object.keys(r.chamadas || {}).forEach((k) => {
      if (String(r.chamadas[k]).indexOf('ERRO') === 0) problemas.push(k + ' ' + r.chamadas[k]);
    });
    if (problemas.length) falhas++;
    console.log((problemas.length ? 'FALHA ' : 'OK    ') + r.nome + (problemas.length ? '\n         ' + problemas.join('\n         ') : ''));
    if (r.dom) console.log('         DOM: ' + JSON.stringify(r.dom));
  }

  console.log('\n================ ERROS DE CONSOLE ================');
  if (!erros.length) console.log('(nenhum)');
  erros.forEach((e) => console.log(' - ' + e));

  console.log('\nPáginas com problema: ' + falhas + '/' + relatorio.length + ' | erros de console: ' + erros.length);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* ignora */ }
  app.exit(falhas || erros.length ? 1 : 0);
});
