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

Repositório: `https://github.com/alexmiguel011014-stack/JiuJitsu-ERP.git` (branch `main`, push via HTTPS).
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
│   ├── pdv.html                     -- Frente de Caixa + recibo
│   ├── cadastro.html                -- Cadastro de produtos
│   ├── clientes.html                -- Cadastro de clientes
│   ├── vendas.html                  -- Histórico + exportação CSV
│   ├── estoquenegativo.html         -- Relatório de estoque negativo
│   ├── login.html                   -- Tela de login
│   ├── atualizacao.html             -- Página de atualizações
│   └── *.css
│
└── js/                              -- Scripts frontend
    ├── pdv.js                       -- PDV: persistência, cancelamento, recibo
    ├── cadastro.js / clientes.js / vendas.js / estoquenegativo.js
    ├── login.js                     -- Login e alteração de senha
    ├── auth.js                      -- Guarda de autenticação
    ├── head.js                      -- Detecção precoce de tema escuro
    ├── navbar.js                    -- Navbar dinâmico (tema + logout)
    └── atualizacao.js               -- Verificação/instalação de updates
```

## Banco de Dados

- Arquivo: `erp_jiujitsu.sqlite` (criptografado com SQLCipher). Dev: `./data/` | Produção: `%APPDATA%/JiuJitsu ERP/`.
- 6 tabelas: `Categorias` (2 níveis), `Produtos`, `Variacoes` (sku UNIQUE, atributos JSON e preço de custo), `Clientes`, `Vendas`, `ItensVenda`.
- `PRAGMA foreign_keys = ON`; FKs com `ON DELETE CASCADE/RESTRICT`.
- **Criptografia**: ao fazer login, a senha do app deriva a chave (SHA-256) que destrava o banco via SQLCipher. Banco em texto plano é migrado automaticamente no primeiro login. Troca de senha usa `PRAGMA rekey`. Backups são cópias criptografadas do arquivo.
- Backups automáticos diários em `data/backups/` (dev) ou `userData/backups/` (produção).

## Decisões Arquiteturais

- `nodeIntegration: false` e `contextIsolation: true` — padrão de segurança.
- Todo acesso ao banco passa por `ipcMain.handle` no processo principal.
- `contextBridge` expõe apenas métodos específicos, nunca objetos Node.js brutos.
- Transações explícitas (BEGIN/COMMIT/ROLLBACK) para operações críticas.
- Navbar injetada dinamicamente via `js/navbar.js` em todas as páginas: sticky no topo, full-width, links em blocos clicáveis (inserida no `<body>`, não no `.container`).
- Janela inicia maximizada (`janela.maximize()`), mínimo 1024x640.
- Tema escuro via classe `dark-theme` no `<html>` (configurado por `js/head.js`).
- Auth via localStorage (`erp_auth` flag, `erp_senha` senha; default `123456`).
- Atualização automática: `electron-updater` + GitHub Releases.

## Regras de Continuidade

- Cada nova funcionalidade exige atualizar: `database.js` + `main.js` + `preload.js` + frontend.
- Use `js/head.js` no `<head>` de todas as páginas (tema sem flash branco).
- Use `js/auth.js` em todas as páginas protegidas (exceto `login.html`).
- `package.json` `files` usa globs `js/**/*` e `public/**/*` — novos arquivos incluídos automaticamente.

## Funcionalidades Implementadas (resumo)

Setup Electron seguro · SQLite 5 tabelas · SQLCipher (criptografia por senha) · Migração automática plaintext→cipher · Cadastro de produtos c/ variações + SKU auto · PDV (leitor SKU, carrinho, transação atômica, recibo térmico) · Clientes CRUD · Histórico de vendas (filtro, detalhes modal, CSV) · Estoque negativo · Backup/Restore manual + automático diário · Dashboard c/ estatísticas · Navbar persistente · Tema escuro · Login · Auto-update · Build NSIS v1.0.0 · Janela maximizada · Launcher silencioso (VBS)

## Próximos Passos Prioritários

1. **Melhorar checkout de estoque**: validar rollback se estoque insuficiente no UPDATE.
2. **Testar o instalador** em uma máquina limpa.
3. **Melhorias finais de UI/UX**: ícones vetoriais, tipografia refinada.
4. Push pendente para o GitHub (mudanças locais não commitadas).

Backlog: troco automático no PDV · busca de cliente no PDV · relatório de mais vendidos ·
relatório por período · desconto/observação na venda · imagens nos produtos ·
log de erros em arquivo · window.onerror global.
