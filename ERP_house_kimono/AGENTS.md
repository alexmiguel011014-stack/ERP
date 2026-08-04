# AGENTS.md — ERP Jiu-Jitsu (House Kimono)

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
Release `v1.0.0` publicada no GitHub Releases.

## Comandos Essenciais

```powershell
npm install           # Instalar dependências
npm start             # Rodar o Electron (dev)
npm run build         # Gerar .exe instalador (NSIS)
```

## Estrutura do Projeto

```
ERP_house_kimono/
├── package.json
├── main.js                          -- Processo principal Electron
├── preload.js                       -- Ponte IPC (contextBridge)
├── database.js                      -- SQLite + CRUD + transações + backup
├── ERP_JiuJitsu_Launcher.bat        -- Lançador (chama o .vbs)
├── ERP_JiuJitsu_Launcher.vbs        -- Lançador silencioso (sem console)
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
│
├── public/                          -- Frontend estático
│   ├── index.html                   -- Dashboard + backup button
│   ├── pdv.html                     -- Frente de Caixa + recibo (desconto/obs, cliente, orçamento, fiado)
│   ├── cadastro.html                -- Cadastro de produtos
│   ├── clientes.html                -- Cadastro de clientes (CPF/CNPJ, e-mail, endereço)
│   ├── vendas.html                  -- Histórico + exportação CSV (status + conversão de orçamento)
│   ├── estoquenegativo.html         -- Relatório de estoque negativo
│   ├── fornecedores.html            -- CRUD de fornecedores
│   ├── compras.html                 -- Pedidos e recebimento de mercadorias
│   ├── entrada.html                 -- Entrada de mercadorias + ajuste de estoque mínimo
│   ├── financeiro.html              -- Contas a pagar/receber + fluxo de caixa
│   ├── relatorios.html              -- Vendas por período + Curva ABC
│   ├── login.html                   -- Tela de login (admin/vendedor)
│   ├── atualizacao.html             -- Página de atualizações
│   └── *.css / modulos.css          -- CSS (modulos.css é compartilhado pelos novos módulos)
│
└── js/                              -- Scripts frontend
    ├── pdv.js                       -- PDV: cliente, desconto/obs, orçamento, fiado, persistência, cancelamento, recibo
    ├── cadastro.js / clientes.js / vendas.js / estoquenegativo.js
    ├── fornecedores.js              -- CRUD de fornecedores
    ├── compras.js                   -- Pedidos + recebimento (custo médio, conta a pagar)
    ├── entrada.js                   -- Entrada de estoque + alertas de mínimo
    ├── financeiro.js                -- Contas a pagar/receber, baixa, fluxo de caixa
    ├── relatorios.js                -- Vendas por período + Curva ABC
    ├── login.js                     -- Login admin/vendedor + senha do vendedor (AES-256-GCM)
    ├── auth.js                      -- Guarda de autenticação
    ├── head.js                      -- Detecção precoce de tema escuro
    ├── navbar.js                    -- Navbar dinâmico (tema + logout)
    └── atualizacao.js               -- Verificação/instalação de updates
```

## Banco de Dados

- Arquivo: `erp_jiujitsu.sqlite` (criptografado com SQLCipher). Dev: `./data/` | Produção: `%APPDATA%/JiuJitsu ERP/`.
- 7 tabelas principais: `Categorias` (2 níveis), `Produtos`, `Variacoes` (sku UNIQUE, atributos JSON, preço de custo, `estoque_minimo`), `Clientes` (cpf/cnpj, email, endereco), `Vendas` (desconto, observacao, status), `ItensVenda`, `Precificacao` (+ `ProdutoCategorias`/`Configuracao`).
- Novas tabelas: `MovimentacoesEstoque`, `Fornecedores`, `PedidosCompra` + `ItensPedidoCompra`, `LancamentosFinanceiros`.
- `PRAGMA foreign_keys = ON`; FKs com `ON DELETE CASCADE/RESTRICT`.
- **Criptografia**: ao fazer login, a senha do app deriva a chave (SHA-256) que destrava o banco via SQLCipher. Banco em texto plano é migrado automaticamente no primeiro login. Troca de senha usa `PRAGMA rekey`. Backups são cópias do arquivo criptografado. A senha do vendedor desembrulha a chave real via AES-256-GCM (`erp_perfis.json` ao lado do DB); quando a senha do admin muda, a senha do vendedor é invalidada e deve ser redefinida.
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
- Auth via localStorage (`erp_auth` flag, `erp_perfil` = admin|vendedor). Admin usa a senha que desbloqueia o banco; vendedor usa senha que desembrulha a chave (sem acesso admin).
- Perfis: vendedor é redirecionado das páginas restritas pelo `navbar.js`; links restritos são ocultados.
- Atualização automática: `electron-updater` + GitHub Releases.

## Regras de Continuidade

- Cada nova funcionalidade exige atualizar: `database.js` + `main.js` + `preload.js` + frontend.
- Use `js/head.js` no `<head>` de todas as páginas (tema sem flash branco).
- Use `js/auth.js` em todas as páginas protegidas (exceto `login.html`).
- `package.json` `files` usa globs `js/**/*` e `public/**/*` — novos arquivos incluídos automaticamente.

## Funcionalidades Implementadas (resumo)

Setup Electron seguro · SQLite 7 tabelas + extensões · SQLCipher (criptografia por senha) + migração automática plaintext→cipher · Migração de colunas (`migrarColunas`) · Cadastro de produtos c/ variações + SKU auto + estoque_mínimo · Clientes CRUD (CPF/CNPJ, e-mail, endereço) · Fornecedores CRUD · PDV (leitor SKU, carrinho, cliente, desconto, observação, fiado, orçamento, transação atômica com guarda de estoque, recibo) · Orçamentos (salvar → converter em venda; não movimenta estoque até conversão) · Histórico de vendas (filtro data+status, badge, detalhes modal, conversão de orçamento, CSV) · Entrada de mercadorias (custo médio ponderado, ledger `MovimentacoesEstoque`) · Alerta de estoque mínimo (dashboard, PDV, página de entrada) · Pedidos de compra (criar/receber/cancelar; recebimento gera conta a pagar) · Financeiro (contas a pagar/receber, baixa, fluxo de caixa por dia) · Relatórios (vendas por período, por pagamento, ticket médio, Curva ABC A/B/C + CSV) · Dashboard (vendas/faturamento/estoque/hoje + a receber e a pagar hoje) · Navbar por perfil · Tema escuro · Login admin/vendedor · Backup/Restore + automático diário · Auto-update · Build NSIS v1.0.0 · Janela maximizada · Launcher silencioso (VBS)

## Fora de escopo (decidido)

- **Emissão de NF-e / NFC-e**: requer integração ao SEFAZ, certificado digital A1, contingência e retenção de numeração — inviável em ERP desktop offline sem infraestrutura. Mantido o recibo térmico.

## Próximos Passos

1. **Testar o instalador** (.exe NSIS) em uma máquina limpa.
2. **Melhorias finais de UI/UX**: ícones vetoriais, tipografia refinada.
3. **NFC-e**: avaliar ACBr/biblioteca de emissão como evolução futura.
4. Push pendente para o GitHub (mudanças locais não commitadas).

Backlog restante: troco automático no PDV · busca de cliente no PDV · imagens nos produtos · log de erros em arquivo · window.onerror global.
