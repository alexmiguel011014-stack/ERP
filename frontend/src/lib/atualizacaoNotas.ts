export type NotasAtualizacao = {
	versao: string;
	itens: string[];
};

// Fonte local e offline das notas exibidas na tela de Atualizações. A entrada
// só deve ser alterada junto da versão que realmente será empacotada/publicada.
export const NOTAS_ATUALIZACAO: Record<string, NotasAtualizacao> = {
	"1.5.0": {
		versao: "1.5.0",
		itens: [
			"Estoque: veja saldo atual, mínimo, custo, valor e situação de cada variação, com ações de entrada e retirada.",
			"Reposição em lote com busca por nome, SKU, código de barras ou ID; o rascunho fica salvo enquanto você alterna de tela.",
			"Baixas avisam quando há itens reservados. O estoque mínimo continua sendo um alerta e não altera o saldo.",
			"O histórico mostra entradas, retiradas, quantidades e custos; a busca por leitor seleciona automaticamente uma única variação correspondente.",
		],
	},
	"1.4.4": {
		versao: "1.4.4",
		itens: [
			"Tabelas e listas longas (relatórios, financeiro, histórico de vendas, clientes, fornecedores, pedidos de compra, carrinho do PDV) agora têm altura máxima e rolam dentro do próprio card, sem esticar a página: o cabeçalho da tabela fica fixo e um degradê no rodapé indica que há mais conteúdo.",
			"Janelas altas deixaram de perder o topo: o conteúdo rola dentro da janela e o botão de fechar fica sempre à vista.",
		],
	},
	"1.4.3": {
		versao: "1.4.3",
		itens: [
			"Corrige campos que deixavam de aceitar digitação depois de uma confirmação ou aviso (por exemplo, ao finalizar uma venda ou excluir um produto): as confirmações agora são janelas do próprio sistema.",
			"Excluir produto: o campo de senha já abre pronto para digitar, Esc fecha só a janela de cima e o cursor volta ao botão de origem.",
			"Listas de Produtos e Categorias: botão Ordenar (nome A→Z ou Z→A, modificação mais recente ou mais antiga), cabeçalhos clicáveis e nova coluna \"Modificado em\".",
			"Motor do aplicativo atualizado (Electron 43.7.8), com a correção de digitação no Windows.",
		],
	},
	"1.4.2": {
		versao: "1.4.2",
		itens: [
			"Abas do sistema preservam o que você estava fazendo: trocar de aba e voltar mantém texto, cursor e rolagem — sem campos travados.",
			"Financeiro: lançamento de venda histórica (sem produto nem estoque) para registrar vendas antigas; Fiado gera o recebível.",
			"Importação em dois modos: JSON (arquivo ou pasta, com prévia e checksum, qualquer mês) e Excel.",
			"Pagamento dividido no PDV: taxa e parcelas só na parte do Cartão; cada parcela vira um recebimento pendente até a liquidação.",
			"Relatórios: datas legíveis no gráfico \"Faturamento por dia\" em períodos longos.",
		],
	},
	"1.4.1": {
		versao: "1.4.1",
		itens: [
			"Pagamento misto no PDV com PIX, Cartão e Dinheiro.",
			"Taxa e parcelamento do Cartão calculados somente sobre a parte paga no cartão.",
			"Orçamentos preservam o total aprovado e não geram cobrança duplicada na conversão.",
			"Atualização por perfil com diagnóstico seguro para sessão, rede e release.",
		],
	},
};

export function obterNotasAtualizacao(versao: string): NotasAtualizacao | null {
	const chave = String(versao || "").trim().replace(/^v/i, "");
	return NOTAS_ATUALIZACAO[chave] || null;
}
