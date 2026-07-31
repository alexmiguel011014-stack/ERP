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

## O que já foi feito

1. Setup base do Electron com boas práticas de segurança
2. Banco de dados SQLite com 5 tabelas e foreign keys
3. Módulo de cadastro de produtos com grade de variações
4. Módulo PDV (Frente de Caixa) com leitor de SKU, carrinho e finalização
5. Toda a documentação (README.md, ROADMAP.md, este arquivo)

## Estrutura do Projeto

```
ERP_house_kimono/
├── .gitignore
├── package.json
├── main.js              -- Processo principal Electron
├── preload.js           -- Ponte IPC (contextBridge)
├── database.js          -- SQLite + funções CRUD + transações
├── public/
│   ├── index.html       -- Tela inicial de teste
│   ├── pdv.html         -- Frente de Caixa
│   ├── cadastro.html    -- Cadastro de produto
│   ├── pdv.css
│   └── cadastro.css
├── js/
│   ├── pdv.js           -- Lógica do PDV
│   └── cadastro.js      -- Lógica do cadastro
├── node_modules/
├── erp_jiujitsu.sqlite  -- Criado na primeira execução
├── README.md
├── ROADMAP.md
├── DEVELOPMENT.md
└── AGENTS.md
```

## Comandos Essenciais

```powershell
npm install           # Instalar dependências
npm start             # Rodar o Electron
```

## Push para GitHub

Repositório remoto: `https://github.com/alexmiguel011014-stack/ERP_HK.git`
Branch: `main`
Push via HTTPS (SSH pode precisar de configuração local).

## Próximos Passos Prioritários

1. Cadastro de Clientes (tela + integration com Vendas)
2. Histórico de Vendas com filtros
3. Relatórios básicos (total vendido, produtos mais vendidos, estoque baixo)
4. Exportar para .exe (electron-builder)

## Decisões Arquiteturais

- `nodeIntegration: false` e `contextIsolation: true` — padrão de segurança
- Toda acesso ao banco passa por `ipcMain.handle` no processo principal
- `contextBridge` expõe apenas métodos específicos, nunca objetos Node.js brutos
- SQLite com `PRAGMA foreign_keys = ON` para integridade referencial
- Transações explícitas (BEGIN/COMMIT/ROLLBACK) para operações críticas

## Dicas para Continuidade

- Sempre consulte `ROADMAP.md` para ver o que está no topo da prioridade
- O `database.js` contém `runAsync`, `getAsync` e funções async para operações com banco
- O `preload.js` acumula os métodos expostos ao renderer — adicione novos lá junto com o handler correspondente em `main.js`
- Arquivos estáticos ficam em `public/`, scripts frontend em `js/`