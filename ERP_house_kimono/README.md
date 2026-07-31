# ERP Jiu-Jitsu (House Kimono)

ERP desktop local (offline) para uma loja de artigos de Jiu-Jitsu.
Empacotado como .exe com Electron.js + Node.js + SQLite.

## Stack

- **Electron.js** (v33+) — janela nativa desktop
- **Node.js** — runtime backend
- **SQLite** (sqlite3) — banco de dados embutido (arquivo `.sqlite`)
- **HTML/CSS/JS puro** — interface frontend

## Estrutura do Projeto

```
ERP_house_kimono/
├── .gitignore
├── package.json
├── package-lock.json
├── main.js              # Processo principal Electron (janela, ciclo de vida)
├── preload.js           # Ponte segura IPC (contextBridge)
├── database.js          # Conexão SQLite, criação de tabelas, funções CRUD
│
├── public/              # Arquivos estáticos do frontend
│   ├── index.html       # Tela de boas-vindas / teste
│   ├── pdv.html         # Tela da Frente de Caixa (PDV)
│   ├── cadastro.html    # Tela de cadastro de produto
│   ├── pdv.css          # Estilos do PDV
│   └── cadastro.css     # Estilos do cadastro
│
├── js/                  # Scripts frontend
│   ├── pdv.js           # Lógica da Frente de Caixa
│   └── cadastro.js      # Lógica do cadastro
│
└── node_modules/        # Dependências (não commitar)
```

## Como Instalar e Rodar

### 1. Clonar o repositório

```powershell
git clone https://github.com/alexmiguel011014-stack/ERP_HK.git
cd ERP_HK
```

### 2. Instalar dependências

```powershell
npm install
```

### 3. Executar o projeto

```powershell
npm start
```

Isso abre uma janela Electron de 1280×720 com a tela inicial (`index.html`).

---

## Módulos Implementados

### 1. Setup Base (Electron + SQLite)
- `main.js` — processo principal com `contextIsolation: true` e `nodeIntegration: false`
- `preload.js` — ponte segura via `contextBridge`
- `database.js` — conexão com `erp_jiujitsu.sqlite` e criação das tabelas

### 2. Cadastro de Produtos
- Tela: `public/cadastro.html` + `js/cadastro.js`
- Funcionalidades:
  - Cadastro de produto (nome + categoria)
  - Grade dinâmica de variações (tamanho, cor, preço, estoque)
  - Geração automática de SKU (prefixo do nome + cor + tamanho)
  - Envio via IPC para o backend
  - Transação SQLite para garantir consistência (produto + variações)

### 3. Frente de Caixa / PDV
- Tela: `public/pdv.html` + `js/pdv.js`
- Funcionalidades:
  - Leitor de código de barras/SKU com foco automático + Enter
  - Carrinho de compras (adicionar, remover, recalcular total)
  - Seleção de forma de pagamento (PIX, Cartão, Dinheiro)
  - Finalizar venda com transação atômica (venda + itens + baixa de estoque)
  - Mensagens de feedback (sucesso/erro)

### 4. Backend (IPC + SQLite)

| endpoint IPC        | Entrada                         | Saída                    |
|---------------------|---------------------------------|--------------------------|
| `buscar-produtos`   | —                               | Array de produtos        |
| `buscar-sku`        | SKU (string)                    | Dados da variação + estoque |
| `salvar-produto`    | `{ nome, categoria, variacoes }`| `{ success, produtoId }` |
| `finalizar-venda`   | `{ itens, forma_pagamento, total }` | `{ success, vendaId }` |

## Banco de Dados

Arquivo: `erp_jiujitsu.sqlite` (criado automaticamente na primeira execução)

### Tabelas

| Tabela       | Colunas                                                       |
|--------------|---------------------------------------------------------------|
| `Produtos`   | id, nome, categoria                                           |
| `Variações`  | id, produto_id (FK), sku (UNIQUE), tamanho, cor, preco, quantidade_estoque |
| `Clientes`   | id, nome, telefone, academia, faixa                           |
| `Vendas`     | id, cliente_id (FK, nullable), total, forma_pagamento, data_venda |
| `ItensVenda` | id, venda_id (FK), variacao_id (FK), quantidade, preco_unitario |

### Integridade Referencial
- `FOREIGN KEY (produto_id) REFERENCES Produtos(id) ON DELETE CASCADE`
- `FOREIGN KEY (variacao_id) REFERENCES Variacoes(id) ON DELETE RESTRICT`
- `FOREIGN KEY (venda_id) REFERENCES Vendas(id) ON DELETE CASCADE`
- `PRAGMA foreign_keys = ON` habilitado na conexão

## Segurança

- `nodeIntegration: false` no renderer
- `contextIsolation: true` no webPreferences
- `contextBridge` expõe apenas métodos específicos (nunca objetos brutos do Node.js)
- Todas as consultas ao banco passam pelo processo principal (IPC)

## Lanceiro na Área de Trabalho (Dev)

Para abrir o ERP rapidamente sem abrir o terminal:

1. Copie o arquivo `ERP_JiuJitsu_Launcher.bat` da raiz do projeto
2. Cole na sua Área de Trabalho
3. Clique duas vezes para abrir o app

No Windows 11, pode ser necessário desbloquear o arquivo clicando com o botão direito → **Propriedades** → marcar **Desbloquear**.

## Empacotamento para .exe (Produção)

Veja `DEVELOPMENT.md` para o guia completo de build.

### Passo rápido

```powershell
npm install electron-builder --save-dev
npm run build
```

### Onde encontrar o .exe

O instalador será gerado na pasta `dist/` após o build. O NSIS instalador criará automaticamente:
- Ícone na Área de Trabalho
- Entrada no Menu Iniciar
- Atalho para desinstalar

### Banco de Dados em Produção

Em produção (app instalado), o SQLite grava em `%APPDATA%/JiuJitsu ERP/erp_jiujitsu.sqlite`.
Isso garante que o banco **não seja apagado** ao atualizar ou reinstalar o app.
Durante o desenvolvimento, o banco fica em `./data/erp_jiujitsu.sqlite`.

## Próximos Passos

Veja `ROADMAP.md` para o plano de desenvolvimento detalhado.

## Licença

ISC