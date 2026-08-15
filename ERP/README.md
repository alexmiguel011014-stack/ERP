# ERP ALLU

ERP desktop offline para uma loja de artigos de Jiu-Jitsu, empacotado como instalador `.exe` para Windows.

Stack: Electron + Node.js + SQLite (SQLCipher) + HTML/CSS/JS puro.

## Rodando localmente

```powershell
npm install           # instalar dependências
npm start              # abrir o app em modo dev (Electron)
npm run build          # gerar o instalador .exe (NSIS)
```

## Estrutura

```
ERP/
├── main.js          -- processo principal Electron
├── preload.js        -- ponte IPC (contextBridge)
├── database.js       -- SQLite + CRUD + transações + backup
└── modules/           -- um módulo por funcionalidade (pdv, produtos, clientes,
                          fornecedores, compras, entrada, vendas, financeiro,
                          precificacao, relatorios, acessos, auth, dashboard)
```

## Banco de dados

- Arquivo `erp.sqlite`, criptografado com SQLCipher. Dev: `./data/` · Produção: `%APPDATA%/ERP/`.
- A senha do app deriva a chave que destrava o banco; a chave-mestre é embrulhada por
  usuário (login+senha) para permitir múltiplos usuários de acesso.
- Backups automáticos diários.

## Scripts úteis

```powershell
node scripts/test-db.js          # CRUD produtos/categorias em banco temporário
node scripts/test-migracao.js    # valida migração de um banco de schema antigo
node scripts/corrigir-encoding.js [--aplicar]   # detecta/corrige mojibake (UTF-8 duplo)
```

Mais detalhes de arquitetura e convenções para desenvolvimento: [AGENTS.md](AGENTS.md).
