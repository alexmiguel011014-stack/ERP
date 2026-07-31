# ERP Jiu-Jitsu (House Kimono)

ERP desktop offline para uma loja de artigos de Jiu-Jitsu.
Empacotado como .exe com Electron.js + Node.js + SQLite.
Paleta visual: Tatame Clean (tons claros e neutros).

## Stack

- **Electron.js** (v33+) — janela nativa desktop
- **Node.js** — runtime backend
- **SQLite** (sqlite3) — banco de dados embutido (arquivo `.sqlite`)
- **HTML/CSS/JS puro** — interface frontend

## Estrutura do Projeto

```
ERP_HK/
├── .gitignore
├── package.json
├── package-lock.json
├── main.js                        # Processo principal Electron
├── preload.js                     # Ponte IPC (contextBridge)
├── database.js                    # SQLite + CRUD + transações
├── ERP_JiuJitsu_Launcher.bat    # Lançador rápido (dev)
├── CHECKLIST.md
├── README.md
├── ROADMAP.md
├── DEVELOPMENT.md
├── AGENTS.md
│
├── build/
│   ├── icon.ico                   # Ícone do .exe (placeholder)
│   └── README.md
│
├── data/                          # DB de desenvolvimento (criado automaticamente)
│   └── erp_jiujitsu.sqlite
│
├── public/                        # Arquivos estáticos do frontend
│   ├── index.html                 # Dashboard inicial com estatísticas
│   ├── pdv.html                   # Frente de Caixa
│   ├── cadastro.html              # Cadastro de produtos
│   ├── clientes.html              # Cadastro de clientes
│   ├── vendas.html                # Histórico de vendas
│   ├── pdv.css
│   ├── cadastro.css
│   ├── clientes.css
│   └── vendas.css
│
├── js/                            # Scripts frontend
│   ├── pdv.js
│   ├── cadastro.js
│   ├── clientes.js
│   ├── vendas.js
│   └── navbar.js                  # Navbar dinâmico (todas as páginas)
│
└── node_modules/                  # Dependências (não commitar)
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

Abre uma janela Electron 1280×720 com o dashboard inicial. O banco de dados é criado automaticamente na primeira execução.

---

## Módulos Implementados

### 1. Setup Base (Electron + SQLite)
- Processo principal com boas práticas de segurança (`contextIsolation`, `nodeIntegration: false`)
- Janela 1280×720
- Estrutura organizada em `public/` (HTML/CSS) e `js/` (frontend)

### 2. Cadastro de Produtos
- Tela: `public/cadastro.html` + `js/cadastro.js`
- Grade dinâmica de variações (tamanho, cor, preço, estoque) — adicione múltiplas linhas
- Geração automática de SKU (prefixo do nome + cor + tamanho)
- Validação inline de preço e estoque
- Transação SQLite para garantir consistência (produto + variações juntas)

### 3. Frente de Caixa / PDV
- Tela: `public/pdv.html` + `js/pdv.js`
- Leitor de SKU com foco automático + Enter
- Carrinho com incremento/decremento de quantidade (±)
- Atalhos de teclado: `Esc` limpa carrinho, `F2` abre cadastro
- Seleção de forma de pagamento (PIX, Cartão, Dinheiro)
- Diálogo de confirmação antes de finalizar
- Finalização com transação atômica (venda + itens + baixa de estoque)
- Estoque baixo destacado (amarelo, ≤ 5 unidades)
- Loading states durante busca e finalização

### 4. Cadastro de Clientes
- Tela: `public/clientes.html` + `js/clientes.js`
- CRUD completo: cadastrar, listar, remover
- Campos: nome, telefone, academia, faixa

### 5. Histórico de Vendas
- Tela: `public/vendas.html` + `js/vendas.js`
- Lista as últimas 100 vendas
- Filtro por data
- Exibe total, forma de pagamento e cliente

### 6. Backup / Restore
- Exportar banco para pasta `data/backup_TIMESTAMP.sqlite`
- Importar/restaurar a partir de arquivo `.sqlite`

### 7. Dashboard Inicial
- Cards de acesso rápido para PDV e Cadastro
- Estatísticas em tempo real (vendas hoje, faturamento, produtos cadastrados, estoque baixo)

### 8. Navegação
- Navbar persistente em todas as páginas
- Links: Dashboard | PDV | Cadastro | Clientes | Histórico
- Página ativa destacada

### 9. Tatame Clean — Paleta Visual

| Função | Cor | Hex |
|---|---|---|
| Fundo | Cinza gelo | `#F8FAFC` |
| Cards/Painéis | Branco | `#FFFFFF` |
| Texto principal | Cinza-grafite | `#1E293B` |
| Destaque/Botões | Azul Royal | `#2563EB` |
| Sucesso | Verde | `#16A34A` |
| Bordas/Cores suaves | Cinza sutil | `#E2E8F0` |

---

## IPC Endpoints

| Endpoint | Entrada | Saída |
|---|---|---|
| `buscar-produtos` | — | Array de produtos |
| `buscar-sku` | SKU (string) | Dados da variação + estoque |
| `salvar-produto` | `{ nome, categoria, variacoes }` | `{ success, produtoId }` |
| `finalizar-venda` | `{ itens, forma_pagamento, total }` | `{ success, vendaId }` |
| `dashboard-stats` | — | `{ vendasHoje, faturamentoHoje, totalProdutos, estoqueBaixo }` |
| `get-clientes` | — | Array de clientes |
| `salvar-cliente` | `{ nome, telefone, academia, faixa }` | `{ success, clienteId }` |
| `remover-cliente` | id | `{ success }` |
| `buscar-cliente` | filtro (string) | Array de clientes |
| `get-vendas` | filtroData (opcional) | Array de vendas |
| `get-vendas-hoje` | — | Array de vendas do dia |
| `export-backup` | — | Caminho do backup |
| `import-backup` | caminho (string) | `{ success, message }` |

## Banco de Dados

Arquivo: `erp_jiujitsu.sqlite` (criado automaticamente na primeira execução)

### Tabelas

| Tabela | Colunas |
|---|---|
| `Produtos` | id, nome, categoria |
| `Variações` | id, produto_id (FK), sku (UNIQUE), tamanho, cor, preco, quantidade_estoque |
| `Clientes` | id, nome, telefone, academia, faixa |
| `Vendas` | id, cliente_id (FK, nullable), total, forma_pagamento, data_venda |
| `ItensVenda` | id, venda_id (FK), variacao_id (FK), quantidade, preco_unitario |

### Integridade Referencial
- `FOREIGN KEY (produto_id) REFERENCES Produtos(id) ON DELETE CASCADE`
- `FOREIGN KEY (variacao_id) REFERENCES Variacoes(id) ON DELETE RESTRICT`
- `FOREIGN KEY (venda_id) REFERENCES Vendas(id) ON DELETE CASCADE`
- `PRAGMA foreign_keys = ON` habilitado na conexão

### Caminhos do Banco

| Ambiente | Caminho |
|---|---|
| Desenvolvimento (`npm start`) | `./data/erp_jiujitsu.sqlite` |
| Produção (instalado como .exe) | `%APPDATA%/JiuJitsu ERP/erp_jiujitsu.sqlite` |

## Segurança

- `nodeIntegration: false` no renderer
- `contextIsolation: true` no webPreferences
- `contextBridge` expõe apenas métodos específicos (nunca objetos brutos do Node.js)
- Todas as consultas ao banco passam pelo processo principal (IPC)

## Lançador na Área de Trabalho (Dev)

Copie `ERP_JiuJitsu_Launcher.bat` da raiz do projeto para a Área de Trabalho. Clique duas vezes para abrir o app.

## Empacotamento para .exe (Produção)

Veja `DEVELOPMENT.md` para o guia completo de build.

### Passo rápido

```powershell
npm run build
```

O instalador NSIS será gerado na pasta `dist/` e criará automaticamente ícone na Área de Trabalho e no Menu Iniciar.

## Licença

ISC