# ROADMAP — ERP Jiu-Jitsu (House Kimono)

## Estado Atual (v0.2)

### ✅ Concluído

1. **Setup base do Electron**
   - Processo principal com boas práticas de segurança
   - Janela 1280×720, contextIsolation, nodeIntegration desabilitado
   - Estrutura de pastas organizada (`public/`, `js/`)

2. **Banco de dados SQLite**
   - Arquivo `erp_jiujitsu.sqlite` criado automaticamente
   - 5 tabelas: Produtos, Variações, Clientes, Vendas, ItensVenda
   - Foreign Keys com ON DELETE CASCADE / RESTRICT
   - `PRAGMA foreign_keys = ON` habilitado

3. **Módulo de Cadastro de Produtos**
   - Tela `public/cadastro.html` com grade dinâmica de variações
   - Geração automática de SKU
   - Transação SQLite (produto + variações juntas)

4. **Módulo PDV (Frente de Caixa)**
   - Tela `public/pdv.html` com leitor de SKU (Enter)
   - Carrinho com adicionar, remover e recálculo de total
   - Seleção de forma de pagamento (PIX, Cartão, Dinheiro)
   - Finalização com transação atômica e baixa de estoque

5. **Documentação**
   - `README.md` — guia completo do projeto
   - `ROADMAP.md` — este arquivo
   - `AGENTS.md` — contexto para futuras sessões de IA

---

## 🔜 Próximos Passos (v0.3)

### ✅ Empacotamento Configurado

5. **Configuração do electron-builder**
   - `package.json` com bloco `build` configurado (NSIS, appId, atalhos)
   - Pasta `build/` para ícone (preencher com `icon.ico`)
   - Fix de caminho do SQLite para produção (`app.getPath('userData')`)
   - Script de lançamento `ERP_JiuJitsu_Launcher.bat` para a Área de Trabalho

### Pendente: Gerar o .exe final
   - Tela de cadastro com nome, telefone, academia e faixa
   - Busca de clientes por nome ou telefone
   - Vincular cliente à venda finalizada

2. **Listagem de Vendas (Histórico)**
   - Tela que lista todas as vendas com filtros (data, cliente, forma de pagamento)
   - Detalhe de cada venda mostrando itens comprados

3. **Relatórios Básicos**
   - Total vendido por período
   - Produtos mais vendidos
   - Estoque atual (alertas de produto com estoque baixo)

4. **Exportar para .exe**
   - Usar `electron-builder` ou `electron-packager`
   - Configurar `package.json` para build
   - Gerar o instalador .exe para Windows

### Prioridade Média

5. **Busca de Clientes no PDV**
   - Adicionar campo de busca de clientes na tela de PDV antes de finalizar
   - Vincular `cliente_id` à venda

6. **Edição e Exclusão de Produtos**
   - Botão para editar produto e variações existentes
   - Botão para desativar/excluir produtos

7. **Controle de Usuários**
   - Login básico (tela de autenticação)
   - Diferenciar permissões (caixa vs. gerente)

### Prioridade Baixa

8. **Backup Automático**
   - Rotina de cópia do arquivo SQLite para backup periódico

9. **Tema Claro/Escuro**
   - Toggle para alternar entre temas

10. **Notificações do Sistema**
    - Alerts de estoque baixo
    - Confirmações de ações críticas

---

## Estado da Sessão Atual

- Último módulo implementado: **PDV (Frente de Caixa)**
- Push para GitHub: **realizado** (branch `main`, commit `62c9df1`)
- Próxima tarefa sugerida: **Cadastro de Clientes** ou **Histórico de Vendas**