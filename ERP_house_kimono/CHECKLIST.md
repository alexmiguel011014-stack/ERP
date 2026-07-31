# CHECKLIST — Melhorias ERP Jiu-Jitsu

## 🟢 Quick Wins (implementar primeiro)

### UX / Interface
- [ ] Loading states (spinner) ao salvar e buscar
- [ ] Confirmação antes de finalizar venda (dialog)
- [ ] Validação de formulários com erro inline
- [ ] Atalhos de teclado (Esc limpa carrinho, F2 abre cadastro)
- [ ] Troco automático no PDV (Dinheiro)
- [ ] Melhorias gerais de CSS (espaçamento, hover effects)

### UI/UX do PDV
- [ ] Badge vermelho para estoque baixo (< 5 unidades)
- [ ] Botão de diminuir quantidade no carrinho (em vez de só remover)
- [ ] Auto-focus sempre no campo de SKU após qualquer ação
- [ ] Mensagem de "Buscando..." enquanto consulta o SKU

### UX do Cadastro
- [ ] Mensagem de "Salvando..." enquanto grava
- [ ] Validação de preço (não negativo) e estoque (inteiro >= 0)
- [ ] Mostrar total de itens no carrinho no resumo da venda

### Navegação
- [ ] Resumo ao abrir (dashboard: total vendas hoje, estoque baixo)
- [ ] Barra de navegação persistente (PDV | Cadastro | Clientes | Config)

## 🟡 Funcionalidades

### Cadastro de Clientes
- [ ] Tela de cadastro de clientes (nome, telefone, academia, faixa)
- [ ] Busca de clientes no PDV (por nome ou telefone)
- [ ] Vincular cliente à venda antes de finalizar

### Histórico e Relatórios
- [ ] Histórico de vendas com filtros (data, cliente, forma de pagamento)
- [ ] Detalhe de cada venda (itens comprados)
- [ ] Relatório de produtos mais vendidos
- [ ] Relatório de total vendido por período

### Backup e Dados
- [ ] Backup automático do SQLite diário (copiar para pasta backup/)
- [ ] Botão de exportar backup na interface
- [ ] Botão de importar/restaurar backup na interface
- [ ] Log de erros em arquivo (para suporte)

## 🔵 Nice to Have (produção)

### Configurações
- [ ] Tela de configurações da loja (nome, endereço, CNPJ, logo)
- [ ] Taxa de juros para parcelamento de cartão
- [ ] Configuração de impressora térmica

### Vendas Avançadas
- [ ] Pagamento parcelado no cartão
- [ ] Método de desconto (valor ou percentual)
- [ ] Adicionar observação na venda

### Segurança e Manutenção
- [ ] Tratamento global de erros no renderer (window.onerror)
- [ ] Criptografia do banco (sqlcipher)
- [ ] Atualização automática do app (verificar GitHub Releases)

## 🔴 Bugs/Problemas Conhecidos
- [ ] Sem ícone `.ico` real (placeholder gerado automaticamente)
- [ ] index.html ainda é a página de fallback — deve redirecionar ou ser dashboard
- [ ] Sem impressão de recibo
- [ ] Sem imagens nos produtos
- [ ] SKU generation pode gerar colisões se nomes forem muito curtos