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
