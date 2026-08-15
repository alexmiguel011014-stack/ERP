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
- Perfil admin tem acesso total via `exigirSessao('admin')` nos IPC; por enquanto o único perfil é `admin`.
- Atualização automática: `electron-updater` + GitHub Releases.
- **Camada central de acesso**: `modules/core/banco.js` expõe `window.erpBanco` (agrupado por domínio: produtos, categorias, clientes, vendas, estoque, precificacao, fornecedores, compras, financeiro, relatorios, dashboard, usuarios, sistema). Incluído em todas as páginas via `<script src="../core/banco.js">`. Módulos novos devem usar `window.erpBanco.*`; `window.api.*` permanece disponível para código legado.
- **Módulo banco** (`modules/banco/banco.html` + `banco.js`): inspeção crua das tabelas via sidebar (admin). Exige sessão admin (`exigirSessao('admin')`) nos IPC `listar-tabelas-banco` / `consultar-tabela-banco` e confirmação de senha do admin (`verificar-senha-admin`). Cadastros do dia a dia NÃO exigem senha extra (a sessão já autentica).

## Regras de Continuidade

- Cada nova funcionalidade exige atualizar: `database.js` + `main.js` + `preload.js` + frontend.
- Use `modules/core/head.js` no `<head>` de todas as páginas (tema sem flash branco).
- Use `modules/core/auth.js` em todas as páginas protegidas (exceto `login.html`).
- `package.json` `files` usa glob `modules/**/*` — novos arquivos incluídos automaticamente.

## Funcionalidades Implementadas (resumo)

Setup Electron seguro · SQLite 8 tabelas + extensões · SQLCipher (criptografia por senha) + migração automática plaintext→cipher · Migração de colunas (`migrarColunas`) · Cadastro de produtos c/ variações + SKU auto + estoque_mínimo · Clientes CRUD (CPF/CNPJ, e-mail, endereço) · Fornecedores CRUD · PDV (leitor SKU, carrinho, cliente, desconto, observação, fiado, orçamento, transação atômica com guarda de estoque, recibo) · Orçamentos (salvar → converter em venda; não movimenta estoque até conversão) · Histórico de vendas (filtro data+status, badge, detalhes modal, conversão de orçamento, CSV) · Entrada de mercadorias (custo médio ponderado, ledger `MovimentacoesEstoque`) · Alerta de estoque mínimo (dashboard, PDV, página de entrada) · Pedidos de compra (criar/receber/cancelar; recebimento gera conta a pagar) · Financeiro (contas a pagar/receber, baixa, fluxo de caixa por dia) · Relatórios (vendas por período, por pagamento, ticket médio, Curva ABC A/B/C + CSV) · Dashboard (vendas/faturamento/estoque/hoje + a receber e a pagar hoje) · Navbar por perfil · Tema escuro · Login multi-usuário (admin) + Gerenciar Acessos · Backup/Restore + automático diário · Auto-update · Build NSIS v1.0.0 · Janela maximizada · Launcher silencioso (VBS)

## Fora de escopo (decidido)

- **Emissão de NF-e / NFC-e**: requer integração ao SEFAZ, certificado digital A1, contingência e retenção de numeração — inviável em ERP desktop offline sem infraestrutura. Mantido o recibo térmico.

## Próximos Passos

1. **Testar o instalador** (.exe NSIS) em uma máquina limpa.
2. **Melhorias finais de UI/UX**: ícones vetoriais, tipografia refinada.
3. **NFC-e**: avaliar ACBr/biblioteca de emissão como evolução futura.
4. Push pendente para o GitHub (mudanças locais não commitadas).

Backlog restante: troco automático no PDV · busca de cliente no PDV · imagens nos produtos · log de erros em arquivo · window.onerror global.
