import { usePersistedState } from "@/hooks/usePersistedState";

export type ItemReposicao = {
	variacao_id: number;
	nome: string;
	detalhes: string;
	sku: string;
	quantidade: number;
	custo_unitario: number | null;
};

export function useEstoqueReposicao() {
	const [itens, setItens, limparItens] = usePersistedState<ItemReposicao[]>(
		"estoque_reposicao_itens",
		[],
	);
	const [observacao, setObservacao, limparObservacao] = usePersistedState(
		"estoque_reposicao_observacao",
		"",
	);

	return {
		itens,
		setItens,
		limparItens,
		observacao,
		setObservacao,
		limparObservacao,
	};
}
