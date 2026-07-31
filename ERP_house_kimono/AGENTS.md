# AGENTS.md — Contexto para Futuras Sessões de IA

## O que é este arquivo

Este arquivo serve como memória de projeto para que futuras sessões de IA
entendam o estado atual do projeto sem precisar de explicações repetidas.

Quando este chat for reiniciado (ao ligar o PC, por exemplo), um novo agente
de IA pode ler este arquivo para entender imediatamente o contexto do projeto.

---

## Projeto

ERP desktop offline para uma loja de artigos de Jiu-Jitsu, empacotado como
.exe. Stack: Electron.js + Node.js + SQLite + HTML/CSS/JS puro.
Stack visual: Tatame Clean (paleta clara: #F8FAFC, #FFFFFF, #1E293B, #2563EB, #16A34A, #E2E8F0).

## O que já foi feito

1. Setup base do Electron com boas práticas de segurança
2. Banco de dados SQLite com 5 tabelas e foreign keys
3. Módulo de cadastro de produtos com grade de variações e SKU automático
4. Módulo PDV (Frente de Caixa) com leitor de SKU, carrinho com qty +/-, finalização com transação atômica e baixa de estoque
5. Configuração do electron-builder para gerar .exe (NSIS) com atalhos de desktop
6. Fix de caminho do SQLite para produção (app.getPath('userData'))
7. Cadastro de Clientes com CRUD completo
8. Histórico de Vendas com filtro por data
9. Backup/Restore do banco de dados (exportar e importar .sqlite)
10. Dashboard na página inicial com estatísticas em tempo real (vendas hoje, faturamento, produtos, estoque baixo)
11. Navbar persistente em todas as páginas
12. Melhoria visual completa com paleta Tatame Clean
13. Toda a documentação (README.md, ROADMAP.md, CHECKLIST.md, DEVELOPMENT.md, este arquivo)
14. Sistema de atualização automática com electron-updater + GitHub Releases

## Estado da Sessão Atual

Últimas implementações: Batch 1 UX improvements + Batch 2 (navbar, dashboard) + Batch 3 (Clientes, Histórico, Backup) + Tatame Clean visual redesign + Gerador de .exe + GitHub Release v1.0.0 + Aba de atualizações automáticas com electron-updater
Push para GitHub: **em dia** (branch `main`, último commit `d2c5ef7`)
Release: **v1.0.0** publicada em https://github.com/alexmiguel011014-stack/JiuJitsu-ERP/releases/tag/v1.0.0 com `JiuJitsu ERP Setup 1.0.0.exe` (80MB)
Próxima tarefa sugerida: **Testar o instalador** gerado em `dist/JiuJitsu ERP Setup 1.0.0.exe` em uma máquina limpa

## Estrutura do Projeto (Git Root)

```
ERP_HK/                          ← Raiz do repositório git
├── .gitignore
├── package.json
├── package-lock.json
├── main.js                        -- Processo principal Electron
├── preload.js                     -- Ponte IPC (contextBridge)
├── database.js                    -- SQLite + CRUD + transações
├── ERP_JiuJitsu_Launcher.bat      -- Lançador rápido para Área de Trabalho (dev)
├── CHECKLIST.md                   -- Lista de melhorias implementadas e pendentes
├── README.md                      -- Documentação principal
├── ROADMAP.md                     -- Mapa de progresso e próximos passos
├── DEVELOPMENT.md                 -- Guia de build e notas técnicas
├── AGENTS.md                      -- Este arquivo
│
├── build/                         -- Ícone do .exe e assets de empacotamento
│   ├── icon.ico                   ← Substituir por ícone real .ico
│   └── README.md
│
├── data/                          -- Criado automaticamente em dev pelo DB
│   └── erp_jiujitsu.sqlite        ← Banco de dados (dev mode)
│
├── public/                        -- Arquivos estáticos do frontend
│   ├── index.html                 -- Dashboard inicial com estatísticas
│   ├── pdv.html                   -- Frente de Caixa (PDV)
│   ├── cadastro.html              -- Cadastro de produtos
│   ├── clientes.html              -- Cadastro de clientes
│   ├── vendas.html                -- Histórico de vendas
│   ├── pdv.css
│   ├── cadastro.css
│   ├── clientes.css
│   └── vendas.css
│
├── js/                            -- Scripts frontend
│   ├── pdv.js
│   ├── cadastro.js
│   ├── clientes.js
│   ├── vendas.js
│   └── navbar.js                  -- Navbar dinâmico (injetado em todas as páginas)
│
└── node_modules/                  -- Dependências (não commitar)
```

## Comandos Essenciais

```powershell
npm install           # Instalar dependências
npm start             # Rodar o Electron (dev)
npm run build         # Gerar .exe instalador (requer icon.ico real)
```

## Push para GitHub

Repositório remoto: `https://github.com/alexmiguel011014-stack/JiuJitsu-ERP.git`
Branch: `main`
Push via HTTPS (SSH não configurado nesta máquina).

## Próximos Passos Prioritários

1. Gerar .exe final com electron-builder (precisa de `build/icon.ico` real)
2. Melhorar o checkout de estoque (validar rollback se estoque insuficiente no UPDATE)
3. Melhorias finais de UI/UX (tema claro, feedback de validação mais granular)

## Decisões Arquiteturais

- `nodeIntegration: false` e `contextIsolation: true` — padrão de segurança
- Toda acesso ao banco passa por `ipcMain.handle` no processo principal
- `contextBridge` expõe apenas métodos específicos, nunca objetos Node.js brutos
- SQLite com `PRAGMA foreign_keys = ON` para integridade referencial
- Transações explícitas (BEGIN/COMMIT/ROLLBACK) para operações críticas
- SQLite path dinâmico: `app.getPath('userData')` em produção, `./data/` em dev
- DB em desenvolvimento fica em `./data/erp_jiujitsu.sqlite` (não na raiz)
- Navbar injetada dinamicamente via `js/navbar.js` em todas as páginas
- Paleta Tatame Clean aplicada em todas as telas (cores: #F8FAFC, #FFFFFF, #1E293B, #2563EB, #16A34A, #E2E8F0)

## Dicas para Continuidade

- Sempre consulte `ROADMAP.md` para ver o que está no topo da prioridade
- O `database.js` contém todas as funções CRUD para todas as tabelas
- O `preload.js` acumula todos os métodos expostos ao renderer — adicione novos lá junto com o handler correspondente em `main.js`
- O `CHECKLIST.md` lista todas as melhorias (feitas e pendentes)
- Arquivos estáticos ficam em `public/`, scripts frontend em `js/`
- Cada nova funcionalidade exige atualizar: database.js + main.js + preload.js + arquivos frontend