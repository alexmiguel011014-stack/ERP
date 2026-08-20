# AGENTS.md — ERP House Kimono

Memória de projeto para futuras sessões de IA + índice de automação (base_project).

## Automação e Economia de Tokens

- Siga as diretivas em `rules.md` (economia de tokens, workflow, ferramentas globais).
- Sub-agentes em `.opencode/agent/`:
  - `@architect`: arquitetura, análise e planejamento (read-only).
  - `@coder`: implementação e refatoração cirúrgica.
  - `@reviewer`: testes, validação e commits (Conventional Commits).
- Rode `/bootstrap` (ou `.\bootstrap.ps1`) para checar/instalar ferramentas globais
  (`gh`, `graphify`, `repomix`, `biome`, `typescript`) e gerar `repomix-output.xml` + `graphify-out/`.
- Análise de codebase: consulte `graphify-out/` ou `repomix-output.xml` ANTES de ler arquivos inteiros.

## Projeto

ERP desktop offline para uma loja de artigos de Jiu-Jitsu, empacotado como .exe.
Stack: Electron.js + Node.js + SQLite + HTML/CSS/JS puro.
Paleta visual: Tatame Clean (clara: `#F8FAFC`, `#FFFFFF`, `#1E293B`, `#2563EB`, `#16A34A`, `#E2E8F0`; dark: `#0F172A`, `#1E293B`, `#3B82F6`, `#E2E8F0`).

Repositório: `https://github.com/alexmiguel011014-stack/ERP.git` (branch `main`, push via HTTPS).
Versão atual: `v1.0.5` (`package.json`). Releases publicadas no GitHub Releases.

### Processo de release (checado em 2026-08-19, era conhecimento tribal até aqui)

`npm run build`/`npm run dist` (`electron-builder`) só geram o `.exe` em `dist/` — **não**
publicam sozinhos, apesar do bloco `"publish"` já configurado em `package.json` (provider
`github`, repo `alexmiguel011014-stack/ERP`). CI (`.github/workflows/ci.yml`) roda só
lint+test, nunca build/publish — releases são feitas manualmente, do computador de quem for
publicar:

```powershell
$env:GH_TOKEN = "<personal access token com escopo repo>"
npx electron-builder --publish always
```

`GH_TOKEN` é lido automaticamente pelo `electron-builder` (convenção própria dele) — nunca
colocar em `.env`, `package.json` ou qualquer arquivo versionado; é uma variável de ambiente
da sessão de quem publica, igual a qualquer outro token deste projeto (ver seção de Segurança
sobre credenciais de integração). Gerar o token em github.com → Settings → Developer settings
→ Personal access tokens, escopo `repo` (ou o fine-grained equivalente com permissão de
Contents: Read and write no repositório `ERP`).

## Comandos Essenciais

```powershell
npm install           # Instalar dependências
npm start             # Rodar o Electron (dev)
npm run build         # Gerar .exe instalador (NSIS)

npm test              # Testes automatizados (test/: integration + senha)
npm run lint          # ESLint (eslint.config.js)

node scripts/test-db.js          # CRUD produtos/categorias em banco temporário
node scripts/test-migracao.js    # Abre um banco de schema antigo e valida a migração
npx electron scripts             # E2E: login + visita todas as páginas, coleta erros de console
node scripts/corrigir-encoding.js [--aplicar]   # Detecta/corrige mojibake (UTF-8 duplo)
```

> `npx electron scripts` exige `ELECTRON_RUN_AS_NODE` **desligado** no shell.

## Estrutura do Projeto

```
ERP/
├── package.json / package-lock.json
├── main.js                          -- Processo principal Electron
├── preload.js                       -- Ponte IPC (contextBridge)
├── database.js                      -- Fachada de compatibilidade: re-exporta db/
├── eslint.config.js                 -- Lint (npm run lint)
├── ERP_Launcher.bat                 -- Lançador (chama o .vbs)
├── ERP_Launcher.vbs                 -- Lançador silencioso (sem console)
├── rules.md                         -- Regras operacionais (base_project)
├── opencode.json                    -- Config OpenCode (modelos)
├── bootstrap.ps1 / bootstrap.sh     -- Setup de ambiente portátil
├── AGENTS.md                        -- Este arquivo
│
├── .opencode/
│   ├── agent/                       -- architect, coder, reviewer
│   └── command/                     -- /bootstrap
│
├── build/                           -- Ícone do .exe e assets de empacotamento
├── data/                            -- DB dev + backups automáticos (gitignored)
├── docs/                            -- DB_PATHS.md, SHORTCUTS.md
│
├── db/                              -- Camada de dados por domínio (conexao, schema, usuarios,
│                                      produtos, vendas, estoque, financeiro, etc.)
├── ipc/                             -- Handlers ipcMain por domínio (auth, vendas, estoque, ...)
├── integracoes/                     -- Adapters de provedor externo (Pix, fiscal) — ver seção própria abaixo
│   ├── pix/                         -- payload.js (QR genérico), qrimage.js, provider.js, providers/efi.js
│   └── fiscal/                      -- provider.js, providers/focusnfe.js
│
├── modules/                         -- Módulos organizados por funcionalidade
│   ├── core/                        -- Shared: auth.js, banco.js, formatos.js, head.js,
│   │                                  loading.js, navbar.js, store.js, modulos.css
│   ├── acessos/                     -- Gerenciar usuários/acessos (admin)
│   ├── atualizacao/                 -- Página de atualizações
│   ├── auth/                        -- Tela de login
│   ├── banco/                       -- Inspeção crua das tabelas (admin)
│   ├── clientes/                    -- Cadastro de clientes + lista
│   ├── compras/                     -- Pedidos e recebimento de mercadorias
│   ├── dashboard/                   -- Dashboard principal (abas via iframe)
│   ├── entrada/                     -- Entrada de estoque + estoque negativo
│   ├── financeiro/                  -- Contas a pagar/receber + fluxo de caixa
│   ├── fornecedores/                -- CRUD de fornecedores
│   ├── importacao/                  -- Importação de dados
│   ├── pagamentos/                  -- Recebimentos (Pix/Boleto/etc.) vinculados a vendas
│   ├── pdv/                         -- Frente de Caixa + recibo
│   ├── precificacao/                -- Precificação e margens
│   ├── produtos/                    -- Cadastro de produtos + categorias + gerenciamento
│   ├── relatorios/                  -- Vendas por período + Curva ABC
│   └── vendas/                      -- Histórico + exportação CSV
│
├── scripts/                         -- Utilitários manuais: test-db.js, test-migracao.js,
│                                      test-ui.js, corrigir-encoding.js, criar-atalho.*
└── test/                            -- Testes automatizados (npm test): integration.test.js, senha.test.js
```

## Banco de Dados

- Arquivo: `erp.sqlite` (criptografado com SQLCipher). Dev: `./data/` | Produção: `%APPDATA%/ERP/`.
- 8 tabelas principais: `Categorias` (2 níveis), `Produtos`, `Variacoes` (sku UNIQUE, atributos JSON, preço de custo, `estoque_minimo`), `Clientes` (cpf/cnpj, email, endereco), `Vendas` (desconto, observacao, status), `ItensVenda`, `Precificacao`, `Usuarios` (login, nome, perfil, ativo) (+ `ProdutoCategorias`/`Configuracao`).
- Novas tabelas: `MovimentacoesEstoque`, `Fornecedores`, `PedidosCompra` + `ItensPedidoCompra`, `LancamentosFinanceiros`.
- `PRAGMA foreign_keys = ON`; FKs com `ON DELETE CASCADE/RESTRICT`.
- **Criptografia**: ao fazer login, a senha do app deriva a chave (SHA-256) que destrava o banco via SQLCipher. Banco em texto plano é migrado automaticamente no primeiro login. Troca de senha usa `PRAGMA rekey`. Backups são cópias do arquivo criptografado. Cada usuário do sistema tem login+senha; a chave-mestre é embrulhada por login/senha via AES-256-GCM (`erp_usuarios.json` ao lado do DB), permitindo vários usuários de acesso.
- Backups automáticos diários em `data/backups/` (dev) ou `userData/backups/` (produção).

## Integrações Externas (Pix / Fiscal)

Estrutura genérica pronta, aguardando credenciais reais (loja não é do desenvolvedor;
certificado A1 e conta em provedor de pagamento ainda pendentes de acesso — ver `GOALS.md`).

- **Padrão adapter**: `integracoes/<pix|fiscal>/provider.js` lê `PIX_PROVIDER`/`FISCAL_PROVIDER`
  do `.env` e devolve o adapter concreto (`integracoes/<pix|fiscal>/providers/*.js`) já
  configurado, ou `null` se não houver credenciais — nenhuma tela trava por falta de provedor.
  Trocar de provedor é escrever um novo arquivo em `providers/`, sem tocar o resto do app.
- **Pix — sem provedor configurado**: `integracoes/pix/payload.js` gera um QR Code Pix
  "Copia e Cola" (padrão BR Code/EMV do Bacen) genérico, que funciona com a chave Pix de
  qualquer banco, sem conta em lugar nenhum. Confirmação de recebimento fica manual (como
  já era antes desta integração).
- **Pix — com `PIX_PROVIDER=efi`**: usa a API Pix da Efí (mTLS + OAuth2) pra gerar cobrança
  vinculada e permitir confirmação automática depois. Ver `.env.example` pras variáveis.
- **Fiscal — sem provedor configurado**: emissão pelo ERP fica indisponível; a tela de Vendas
  tem um campo manual (`nota_status`/`nota_numero` em `Vendas`) pra marcar "emitida por fora"
  quando a nota sai por outro sistema (ex.: contador) — evita emissão duplicada.
- **Fiscal — com `FISCAL_PROVIDER=focusnfe`**: emite NFC-e via Focus NFe. Exige que os produtos
  tenham `ncm`/`csosn` preenchidos (`Produtos`); sem isso, `ipc/fiscal.js` recusa a emissão com
  mensagem clara em vez de mandar uma nota incompleta pra SEFAZ.
- **`.env`**: carregado em `main.js` via `process.loadEnvFile()` (Node 20.6+, nativo, sem
  dependência). Só cobre modo dev (`.env` na raiz do app) — produção empacotada (`.exe`) ainda
  não tem um local definido pra guardar as credenciais reais; decidir isso quando as
  credenciais existirem.
- **Nada disso foi testado contra API real** — payloads seguem a documentação pública de cada
  provedor, mas o primeiro teste de verdade só acontece quando houver certificado/token reais.

## Decisões Arquiteturais

- `nodeIntegration: false` e `contextIsolation: true` — padrão de segurança.
- Todo acesso ao banco passa por `ipcMain.handle` no processo principal.
- `contextBridge` expõe apenas métodos específicos, nunca objetos Node.js brutos.
- Transações explícitas (BEGIN/COMMIT/ROLLBACK) para operações críticas (venda, entrada, recebimento de PO).
- Navbar injetada dinamicamente via `js/navbar.js` em todas as páginas: sticky no topo, full-width, links em blocos clicáveis (inserida no `<body>`, não no `.container`).
- Janela inicia maximizada (`janela.maximize()`), mínimo 1024x640.
- Tema escuro via classe `dark-theme` no `<html>` (configurado por `js/head.js`).
- Checkout de estoque com guarda atômica: `UPDATE ... WHERE id=? AND quantidade_estoque >= ?`; rollback na falha contendo o SKU do item com saldo insuficiente.
- Auth via sessão no processo principal (`get-auth-session` → `getAuthSession` no preload); perfil atual `erp_perfil` = admin.
- Login exigido apenas na entrada do app (`modules/core/auth.js` redireciona para `modules/auth/login.html` se não autenticado). Usuários são gerenciados em `modules/acessos/` (acessível pela sidebar: "Gerenciar Acessos", admin).
- Dois perfis: `admin` (acesso total) e `vendedor` (restrito por `permissoes` JSON, gerenciado em `modules/acessos/`). Admin sempre passa em `exigirPermissao(modulo)` independente de `permissoes`. `main.js:exigirPermissao` já gate 11 domínios IPC (produtos, categorias, clientes, vendas, estoque, fornecedores, compras, precificacao, financeiro, caixa, relatorios); `pagamentos`, `dashboard`, `usuarios`, `banco-admin`, `sistema` e `auth` ainda usam só `exigirSessao('admin')`.
- Atualização automática: `electron-updater` + GitHub Releases.
- **Camada central de acesso**: `modules/core/banco.js` expõe `window.erpBanco` (agrupado por domínio: produtos, categorias, clientes, vendas, estoque, precificacao, fornecedores, compras, financeiro, relatorios, dashboard, usuarios, sistema). Incluído em todas as páginas via `<script src="../core/banco.js">`. Módulos novos devem usar `window.erpBanco.*`; `window.api.*` permanece disponível para código legado.
- **Módulo banco** (`modules/banco/banco.html` + `banco.js`): inspeção crua das tabelas via sidebar (admin). Exige sessão admin (`exigirSessao('admin')`) nos IPC `listar-tabelas-banco` / `consultar-tabela-banco` e confirmação de senha do admin (`verificar-senha-admin`). Cadastros do dia a dia NÃO exigem senha extra (a sessão já autentica).

## Regras de Continuidade

- Cada nova funcionalidade exige atualizar: `database.js` + `main.js` + `preload.js` + frontend.
- Use `modules/core/head.js` no `<head>` de todas as páginas (tema sem flash branco).
- Use `modules/core/auth.js` em todas as páginas protegidas (exceto `login.html`).
- `package.json` `files` usa glob `modules/**/*` — novos arquivos incluídos automaticamente.

## Funcionalidades Implementadas (resumo)

Setup Electron seguro · SQLite 8 tabelas + extensões · SQLCipher (criptografia por senha) + migração automática plaintext→cipher · Migração de colunas (`migrarColunas`) · Cadastro de produtos c/ variações + SKU auto + estoque_mínimo · Clientes CRUD (CPF/CNPJ, e-mail, endereço) · Fornecedores CRUD · PDV (leitor SKU, carrinho, cliente, desconto, observação, fiado, orçamento, transação atômica com guarda de estoque, recibo) · Orçamentos (salvar → converter em venda; não movimenta estoque até conversão) · Histórico de vendas (filtro data+status, badge, detalhes modal, conversão de orçamento, CSV) · Entrada de mercadorias (custo médio ponderado, ledger `MovimentacoesEstoque`) · Alerta de estoque mínimo (dashboard, PDV, página de entrada) · Pedidos de compra (criar/receber/cancelar; recebimento gera conta a pagar) · Financeiro (contas a pagar/receber, baixa, fluxo de caixa por dia, provisão de DAS por regime de caixa) · Relatórios (vendas por período, por pagamento, ticket médio, Curva ABC A/B/C + CSV, DRE, margem de contribuição, ponto de equilíbrio, giro de estoque) · Dashboard (vendas/faturamento/estoque/hoje + a receber e a pagar hoje) · Navbar por perfil · Tema escuro · Login multi-usuário (admin) + Gerenciar Acessos · Backup/Restore + automático diário · Auto-update · Build NSIS v1.0.0 · Janela maximizada · Launcher silencioso (VBS)

## Fora de escopo (decidido)

- **Emissão de NF-e / NFC-e**: requer integração ao SEFAZ, certificado digital A1, contingência e retenção de numeração — inviável em ERP desktop offline sem infraestrutura. Mantido o recibo térmico.

## Próximos Passos

1. **Testar o instalador** (.exe NSIS) em uma máquina limpa.
2. **Melhorias finais de UI/UX**: ícones vetoriais, tipografia refinada.
3. **NFC-e**: avaliar ACBr/biblioteca de emissão como evolução futura.

~~Backlog restante: troco automático no PDV · busca de cliente no PDV · imagens nos produtos.~~
Esta linha estava desatualizada (checado em 2026-08-19, via GOALS.md): os três já existem e
funcionam — troco automático (`modules/pdv/pdv.js:atualizarTroco()`), busca de cliente no PDV
(`modules/pdv/pdv.js`, campo `clienteBusca` com dropdown de resultados) e imagens de produto
(`modules/produtos/cadastro.js`, `escolherImagem`/`removerImagem`/preview).
Log de erros em arquivo + `window.onerror` global já implementados (`main.js:logErro`/`CAMINHO_LOG_ERRO`).

Ver `GOALS.md` para o plano completo (o que falta, por área) e o que já foi corrigido nesta rodada.
