# DEVELOPMENT.md — Notas de Desenvolvimento

## Ambiente

- **Sistema operacional:** Windows 10/11
- **Node.js:** v18+ recomendado
- **npm:** incluso com Node.js
- **Terminal:** PowerShell 5.1

## Setup Inicial

```powershell
git clone https://github.com/alexmiguel011014-stack/ERP_HK.git
cd ERP_HK
npm install
npm start
```

## Estrutura de Código

### Main Process (`main.js`)

- Cria a janela Electron
- Carrega `public/index.html` por padrão
- Registra handlers IPC com `ipcMain.handle()`

### Preload Script (`preload.js`)

- Roda em contexto isolado entre main e renderer
- Expõe APIs via `contextBridge.exposeInMainWorld('api', {...})`
- Cada nova funcionalidade exige um novo método aqui

### Renderer (Frontend)

- HTML puro em `public/`
- CSS em `public/*.css`
- JS em `js/*.js`
- Comunicação com o backend via `window.api.NOME_METODO()`

### Database (`database.js`)

- Conexão única (`getConexao()`) com SQLite
- `iniciarBanco()` — cria tabelas com `IF NOT EXISTS`
- `runAsync()` e `getAsync()` — wrappers Promise para sqlite3
- Funções CRUD e transações para operações críticas

## Padrões de Commits

```
tipo(descricao curta)
```

Tipos aceitos:
- `feat:` — nova funcionalidade
- `fix:` — correção de bug
- `refactor:` — refatoração sem mudança de comportamento
- `docs:` — documentação
- `style:` — formatação, linting
- `test:` — testes
- `chore:` — tarefas de manutenção

## Segurança

- Nunca expor `require('electron')` diretamente ao renderer
- Nunca usar `nodeIntegration: true` em produção
- Sempre usar `contextIsolation: true` + `contextBridge`
- Validar todos os dados vindos do renderer no processo principal

## Build para .exe (Produção)

### 1. Pré-requisitos

Instale o electron-builder:

```powershell
npm install --save-dev electron-builder
```

Crie um ícone `.ico` (256x256px recomendado) e salve em `build/icon.ico`.

### 2. Configuração do empacotamento

O `build` configurado no `package.json` inclui:

- **App ID:** `com.erpjiujitsu.housekimono`
- **Nome do app:** JiuJitsu ERP
- **Instalador:** NSIS (Windows)
- **Atalhos:** cria automaticamente ícone na Área de Trabalho e no Menu Iniciar

### 3. Comandos de build

```powershell
# Testar o build localmente
npm run build

# Ou usar diretamente
npm run dist
```

### 4. Onde encontrar o .exe

O instalador gerado fica em:
```
dist/JiuJitsu ERP Setup 1.0.0.exe
```

### 5. Caminho do Banco de Dados em Produção

**Problema comum:** Em produção, o app é instalado em `C:\Program Files\...`, e o Windows bloqueia escrita nessa pasta. Sem a correção, o SQLite falharia ao criar/gravar o banco.

**Solução implementada:** `database.js` agora usa `app.getPath('userData')` quando empacotado.

| Ambiente | Caminho do banco |
|---|---|
| Desenvolvimento (`npm start`) | `./data/erp_jiujitsu.sqlite` |
| Produção (instalado) | `%APPDATA%/JiuJitsu ERP/erp_jiujitsu.sqlite` |

O `main.js` detecta automaticamente se o app está empacotado (`app.isPackaged`) e define o caminho correto.

### 6. Como testar a rota do banco antes do build final

1. Rode o app normalmente: `npm start`
2. Abra o DevTools na janela do Electron (Ctrl+Shift+I)
3. No console do DevTools, teste as funções disponíveis:
   - Digite `window.api.dashboardStats()` e veja as estatísticas em tempo real
   - Digite `window.api.buscarSKU('TESTE-001')` para buscar um SKU
4. Para testar o cadastro: abra `public/cadastro.html`, cadastre um produto
5. Verifique se o arquivo `./data/erp_jiujitsu.sqlite` foi criado na pasta do projeto

### 7. Checklist antes do build final

- [ ] Ícone `.ico` real colocado em `build/icon.ico`
- [ ] App testado completamente em `npm start`
- [ ] Todas as telas funcionando (cadastro, PDV)
- [ ] Banco de dados criando/atualizando corretamente
- [ ] `node_modules/`, `dist/` e `data/` estão no `.gitignore`

## Estrutura de Código

### Main Process (`main.js`)

- Cria a janela Electron
- Carrega `public/index.html` por padrão
- Registra handlers IPC com `ipcMain.handle()`
- Configura o caminho do banco de dados via `setDBPath()` antes de inicializar

### Preload Script (`preload.js`)

- Roda em contexto isolado entre main e renderer
- Expõe APIs via `contextBridge.exposeInMainWorld('api', {...})`
- Cada nova funcionalidade exige um novo método aqui

### Renderer (Frontend)

- HTML puro em `public/`
- CSS em `public/*.css`
- JS em `js/*.js`
- Comunicação com o backend via `window.api.NOME_METODO()`

### Database (`database.js`)

- Conexão única (`getConexao()`) com SQLite
- `iniciarBanco()` — cria tabelas com `IF NOT EXISTS`
- `runAsync()` e `getAsync()` — wrappers Promise para sqlite3
- `setDBPath(basePath)` — define o caminho do banco (chamar antes de `iniciarBanco()`)
- `getDBPath()` — retorna o caminho atual do banco
- Funções CRUD e transações para operações críticas

## Padrões de Commits