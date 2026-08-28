# ERP ALLU

ERP desktop offline para uma loja de artigos de Jiu-Jitsu, empacotado como instalador `.exe` para Windows.

Stack: Electron + Node.js + SQLite (SQLCipher) + HTML/CSS/JS puro.

## Rodando localmente

```powershell
npm install           # instalar dependências
npm start              # abrir o app em modo dev (Electron)
npm test                # testes automatizados (node:test)
npm run lint            # ESLint
npm run build          # gerar o instalador .exe (NSIS)
```

## Estrutura

```
ERP/
├── main.js          -- processo principal Electron
├── preload.js        -- ponte IPC (contextBridge)
├── database.js       -- agregador fino: reexporta db/*.js (não tem lógica própria)
├── db/               -- acesso a dados, um arquivo por domínio (produtos, vendas,
│                        clientes, pagamentos, schema, backup, etc.)
├── ipc/              -- handlers IPC (ipcMain.handle), um arquivo por domínio,
│                        registrados em main.js
├── integracoes/       -- provedores externos opcionais (Pix via Efí, NF-e via
│                        FocusNFe) — ver .env.example, funcionam sem configurar nada
├── test/             -- testes automatizados (node:test)
└── modules/           -- um módulo de UI por funcionalidade (pdv, produtos, clientes,
                          fornecedores, compras, entrada, vendas, financeiro,
                          precificacao, relatorios, acessos, pagamentos, auth, dashboard)
```

## Frontend (Next.js)

Desde o cutover (2026-08-28), `npm start` / `ERP_Launcher.bat` abrem o frontend novo em
`frontend/` — Next.js 15 + React 19 + Tailwind v4, build estático (`output: 'export'`),
servido pelo Electron via protocolo customizado `app://renderer/` (ver `main.js`). É o
único frontend usado por padrão agora.

`modules/` (HTML/CSS/JS puro, o app antigo) continua no repo como rede de segurança —
ainda não apagado — acessível só via uma env var interna, nunca exposta ao usuário final:

```powershell
$env:ERP_LEGACY_FRONTEND = "1"; npm start   # força o app antigo (modules/), só pra emergência
```

`frontend/` é um projeto npm isolado (`package.json`/lockfile próprios — nunca roda
`npm install` nele a partir da raiz):

```powershell
cd frontend
npm install
npm run dev          # next dev, hot reload — aponte main.js pra http://localhost:3000 pra usar
npm run build         # gera frontend/out/, o que o Electron empacotado de fato serve
npm run lint            # eslint .
npm run typecheck      # tsc --noEmit
```

Progresso da migração módulo-por-módulo: [GOALS.md](GOALS.md).

## Banco de dados

- Arquivo `erp.sqlite`, criptografado com SQLCipher. Dev: `./data/` · Produção: `%APPDATA%/ERP/`.
- A senha do app deriva a chave que destrava o banco; a chave-mestre é embrulhada por
  usuário (login+senha) para permitir múltiplos usuários de acesso.
- Backups automáticos diários, retenção de 30 dias (`db/sistema.js`).

## Scripts úteis

```powershell
node scripts/test-db.js          # CRUD produtos/categorias em banco temporário
node scripts/test-migracao.js    # valida migração de um banco de schema antigo
node scripts/corrigir-encoding.js [--aplicar]   # detecta/corrige mojibake (UTF-8 duplo)
```

Mais detalhes de arquitetura e convenções para desenvolvimento: [AGENTS.md](AGENTS.md).
