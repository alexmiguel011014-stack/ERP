// Ordenação das listas de Produtos e Categorias (GOALS 30). Funções puras, sem
// React e sem imports com alias "@/": o spec e2e/ordenacao.spec.ts importa este
// arquivo direto (o frontend não tem runner de teste unitário próprio).

export type CampoOrdenacao = "padrao" | "nome" | "modificado";
export type DirecaoOrdenacao = "asc" | "desc";

export type OpcaoOrdenacao = {
	id: string;
	label: string;
	// Título do grupo no menu ("" = sem título, opção solta no topo).
	grupo: string;
	campo: CampoOrdenacao;
	direcao: DirecaoOrdenacao;
};

export type ItemOrdenavel = {
	id: number;
	nome: string;
	atualizado_em: string | null;
	// Só a opção "Padrão" das categorias usa: grupos (sem pai) antes dos atributos.
	categoria_pai_id?: number | null;
};

const NOME_ASC: OpcaoOrdenacao = {
	id: "nome-asc",
	label: "Nome (A → Z)",
	grupo: "Nome",
	campo: "nome",
	direcao: "asc",
};
const NOME_DESC: OpcaoOrdenacao = {
	id: "nome-desc",
	label: "Nome (Z → A)",
	grupo: "Nome",
	campo: "nome",
	direcao: "desc",
};
const MODIFICADO_DESC: OpcaoOrdenacao = {
	id: "modificado-desc",
	label: "Modificação (mais recente)",
	grupo: "Última modificação",
	campo: "modificado",
	direcao: "desc",
};
const MODIFICADO_ASC: OpcaoOrdenacao = {
	id: "modificado-asc",
	label: "Modificação (mais antiga)",
	grupo: "Última modificação",
	campo: "modificado",
	direcao: "asc",
};

export const OPCOES_ORDENACAO_PRODUTOS: OpcaoOrdenacao[] = [
	NOME_ASC,
	NOME_DESC,
	MODIFICADO_DESC,
	MODIFICADO_ASC,
];
export const ORDENACAO_PADRAO_PRODUTOS = NOME_ASC.id;

// Categorias: "Padrão" é a ordem de sempre (grupos primeiro, depois por nome).
export const OPCOES_ORDENACAO_CATEGORIAS: OpcaoOrdenacao[] = [
	{
		id: "padrao",
		label: "Padrão (grupos primeiro, depois A → Z)",
		grupo: "",
		campo: "padrao",
		direcao: "asc",
	},
	NOME_ASC,
	NOME_DESC,
	MODIFICADO_DESC,
	MODIFICADO_ASC,
];
export const ORDENACAO_PADRAO_CATEGORIAS = "padrao";

// sensitivity "base": acento e caixa não mudam a posição ("Água" fica entre
// "Aba" e "Azul", não depois de "Zebra" como no COLLATE NOCASE do SQLite, que
// só dobra ASCII); numeric: "Kimono A2" vem antes de "Kimono A10".
const collator = new Intl.Collator("pt-BR", {
	sensitivity: "base",
	numeric: true,
});

function compararNome(a: ItemOrdenavel, b: ItemOrdenavel): number {
	return collator.compare(a.nome, b.nome);
}

function compararId(a: ItemOrdenavel, b: ItemOrdenavel): number {
	return a.id - b.id;
}

function sinal(direcao: DirecaoOrdenacao): number {
	return direcao === "asc" ? 1 : -1;
}

function comparador(opcao: OpcaoOrdenacao) {
	const dir = sinal(opcao.direcao);
	return (a: ItemOrdenavel, b: ItemOrdenavel): number => {
		if (opcao.campo === "padrao") {
			const grupoA = a.categoria_pai_id ? 1 : 0;
			const grupoB = b.categoria_pai_id ? 1 : 0;
			return (
				grupoA - grupoB || compararNome(a, b) || compararId(a, b)
			);
		}
		if (opcao.campo === "nome") {
			return dir * compararNome(a, b) || compararId(a, b);
		}
		// "modificado": data desconhecida (null) vai SEMPRE pro fim, nas duas
		// direções — não há data pra comparar, e "mais antiga primeiro" não deve
		// encher o topo de linhas sem informação.
		const dataA = a.atualizado_em;
		const dataB = b.atualizado_em;
		if (dataA === null && dataB !== null) return 1;
		if (dataA !== null && dataB === null) return -1;
		if (dataA !== null && dataB !== null && dataA !== dataB) {
			// ISO-8601 UTC com ms e "Z" (db/datas-modificacao.js): comparar como
			// texto ordena certo.
			return dir * (dataA < dataB ? -1 : 1);
		}
		// Desempate estável e previsível: nome (sempre A→Z), depois id.
		return compararNome(a, b) || compararId(a, b);
	};
}

export function buscarOpcao(
	opcoes: OpcaoOrdenacao[],
	id: string,
): OpcaoOrdenacao | undefined {
	return opcoes.find((o) => o.id === id);
}

export function ordenar<T extends ItemOrdenavel>(
	lista: T[],
	opcao: OpcaoOrdenacao,
): T[] {
	return [...lista].sort(comparador(opcao));
}

// Valor vindo do localStorage pode estar obsoleto/corrompido (opção removida,
// outra lista, JSON editado à mão): qualquer id que não esteja no registro
// volta pro padrão.
export function lerOrdenacaoPersistida(
	valor: unknown,
	opcoes: OpcaoOrdenacao[],
	padrao: string,
): string {
	return typeof valor === "string" && opcoes.some((o) => o.id === valor)
		? valor
		: padrao;
}

// Clique no cabeçalho de coluna, no estilo do Explorador: coluna que já está
// ativa inverte a direção; coluna nova começa pela direção natural (nome
// A→Z, data mais recente primeiro). Devolve o id da nova opção, ou o atual
// se a lista não oferece essa coluna.
export function alternarPorCampo(
	opcoes: OpcaoOrdenacao[],
	idAtual: string,
	campo: "nome" | "modificado",
): string {
	const atual = buscarOpcao(opcoes, idAtual);
	const direcaoNatural: DirecaoOrdenacao = campo === "nome" ? "asc" : "desc";
	const alvoDirecao: DirecaoOrdenacao =
		atual && atual.campo === campo
			? atual.direcao === "asc"
				? "desc"
				: "asc"
			: direcaoNatural;
	return (
		opcoes.find((o) => o.campo === campo && o.direcao === alvoDirecao)?.id ??
		idAtual
	);
}

// Valor de aria-sort do <th> de uma coluna.
export function ariaSortDoCampo(
	opcao: OpcaoOrdenacao | undefined,
	campo: "nome" | "modificado",
): "ascending" | "descending" | "none" {
	if (!opcao || opcao.campo !== campo) return "none";
	return opcao.direcao === "asc" ? "ascending" : "descending";
}
