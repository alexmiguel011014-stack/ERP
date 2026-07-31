# ROADMAP — ERP Jiu-Jitsu (House Kimono)

## Estado Atual (v0.3 — Funcional)

### ✅ Concluído

1. **Setup base do Electron**
   - Processo principal com boas práticas de segurança
   - Janela 1280×720, contextIsolation, nodeIntegration desabilitado
   - Estrutura de pastas organizada (`public/`, `js/`)
   - Lançador `ERP_JiuJitsu_Launcher.bat` na raiz

2. **Banco de dados SQLite**
   - Arquivo `erp_jiujitsu.sqlite` criado automaticamente
   - 5 tabelas: Produtos, Variações, Clientes, Vendas, ItensVenda
   - Foreign Keys com ON DELETE CASCADE / RESTRICT
   - `PRAGMA foreign_keys = ON` habilitado
   - Caminho dinâmico: `app.getPath('userData')` em produção, `./data/` em dev

3. **Módulo de Cadastro de Produtos**
   - Tela `public/cadastro.html` com grade dinâmica de variações
   - Geração automática de SKU (nome + cor + tamanho)
   - Validação inline de preço e estoque
   - Transação SQLite para garantir consistência (produto + variações)
   - Loading state no botão salvar

4. **Módulo PDV (Frente de Caixa)**
   - Tela `public/pdv.html` com leitor de SKU focado + Enter
   - Carrinho com qty +/- (incrementar/decrementar)
   - Seleção de forma de pagamento (PIX, Cartão, Dinheiro)
   - Confirmação antes de finalizar
   - Finalização com transação atômica (venda + itens + baixa de estoque)
   - Mensagens de feedback (sucesso/erro/info)
   - Alerta visual de estoque baixo (amarelo)
   - Loading state no botão finalizar

5. **Módulo de Cadastro de Clientes**
   - Tela `public/clientes.html` com formulário completo
   - CRUD: cadastrar, listar e remover clientes
   - Campos: nome, telefone, academia, faixa

6. **Módulo de Histórico de Vendas**
   - Tela `public/vendas.html` com lista das últimas 100 vendas
   - Filtro por data
   - Exibe total, forma de pagamento e nome do cliente

7. **Backup / Restore**
   - `exportBackup` — copia o SQLite para `data/backup_TIMESTAMP.sqlite`
   - `importBackup` — substitui o banco atual por um arquivo .sqlite
   - IPC handlers e funções prontas

8. **Dashboard Inicial**
   - `public/index.html` com cards de acesso rápido
   - Estatísticas em tempo real via IPC (vendas hoje, faturamento, produtos, estoque baixo)

9. **Navegação**
   - Navbar persistente em todas as páginas (Dashboard | PDV | Cadastro | Clientes | Histórico)
   - Highlight da página ativa

10. **Tatame Clean — Paleta Visual**
    - Fundo: `#F8FAFC` (cinza gelo)
    - Cards/Painéis: `#FFFFFF` (branco)
    - Texto: `#1E293B` (cinza-grafite)
    - Destaque: `#2563EB` (azul royal)
    - Sucesso: `#16A34A` (verde)
    - Bordas: `#E2E8F0` (cinza sutil)
    - Mensagens: verde (sucesso) / vermelho (erro) / azul (info)

11. **Documentação**
    - `README.md` — guia completo do projeto
    - `ROADMAP.md` — este arquivo
    - `AGENTS.md` — contexto para futuras sessões de IA
    - `DEVELOPMENT.md` — guia de build e notas técnicas
    - `CHECKLIST.md` — lista de melhorias (feitas e pendentes)

12. **Empacotamento Configurado**
    - `electron-builder` instalado como devDependency
    - `package.json` com bloco `build` completo (NSIS, appId, atalhos)
    - Pasta `build/` para ícone `.ico` (placeholder vazio)

---

### ✅ Concluído (v0.4 — Build .exe)

13. **Empacotamento .exe**
    - `build/icon.ico` gerado (placeholder gradiente azul 256x256)
    - `npm run build` executado com sucesso
    - Instalador NSIS gerado: `dist/JiuJitsu ERP Setup 1.0.0.exe` (80MB)
    - Atalhos de desktop e Menu Iniciar configurados

---

## Próximos Passos

### Prioridade Alta

1. **Testar o instalador**
   - Instalar o `.exe` gerado em uma máquina limpa
   - Verificar se o app abre corretamente e o banco de dados funciona em `%APPDATA%/JiuJitsu ERP/`

### Prioridade Média

2. **Melhorar checkout de estoque**
   - Validar rollback se estoque insuficiente no UPDATE
   - Adicionar transação mais robusta com verificação prévia

3. **Exportar e importar backup na UI**
   - Adicionar botões na interface para exportar/importar .sqlite manually

4. **Melhorias finas de UI/UX**
   - Ícones vetoriais (substituir emoji)
   - Sistema de tipografia mais refinado
   - Animações sutis

### Prioridade Baixa

5. **Tela de configurações da loja**
   - Nome da loja, endereço, CNPJ, logo

6. **Relatórios visuais**
   - Gráficos de vendas por período
   - Ranking de produtos mais vendidos

7. **Impressão de recibo**
   - Integrar com impressora térmica via IPC
