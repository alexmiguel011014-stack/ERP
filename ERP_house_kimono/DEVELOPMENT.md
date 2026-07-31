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

## Build para .exe

Para empacotar o projeto como executável Windows:

```powershell
npm install --save-dev electron-builder
```

Configurar `scripts.build` no `package.json`:

```json
"scripts": {
  "start": "electron .",
  "build": "electron-builder"
}
```

Configurar `build` no `package.json`:

```json
"build": {
  "appId": "com.ERP_HOUSE_KIMONO.erp_jiujitsu",
  "productName": "ERP Jiu-Jitsu",
  "directories": { "output": "dist" },
  "files": [
    "main.js",
    "preload.js",
    "database.js",
    "public/**/*",
    "js/**/*",
    "package.json"
  ],
  "win": {
    "target": "nsis"
  }
}
```