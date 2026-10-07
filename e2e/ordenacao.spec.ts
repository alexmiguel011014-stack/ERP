import { expect, test } from "@playwright/test";
import {
	OPCOES_ORDENACAO_CATEGORIAS,
	OPCOES_ORDENACAO_PRODUTOS,
	ORDENACAO_PADRAO_CATEGORIAS,
	ORDENACAO_PADRAO_PRODUTOS,
	alternarPorCampo,
	ariaSortDoCampo,
	buscarOpcao,
	lerOrdenacaoPersistida,
	ordenar,
	type ItemOrdenavel,
} from "../frontend/src/lib/utils/ordenacao";

// Testes unitários do comparador das listas de Produtos/Categorias (GOALS 30).
// Não lançam o Electron: o frontend não tem runner próprio e o Playwright já
// compila TS — por isso moram em e2e/ (ver e2e/README.md).

const produtos = OPCOES_ORDENACAO_PRODUTOS;
const opcao = (id: string) => {
	const o = buscarOpcao(OPCOES_ORDENACAO_CATEGORIAS, id);
	if (!o) throw new Error(`opção inexistente: ${id}`);
	return o;
};
const nomes = (l: ItemOrdenavel[]) => l.map((i) => i.nome);
const item = (
	id: number,
	nome: string,
	atualizado_em: string | null,
	categoria_pai_id: number | null = null,
): ItemOrdenavel => ({ id, nome, atualizado_em, categoria_pai_id });

test.describe("ordenacao (puro)", () => {
	test("nome A→Z e Z→A respeitam acento e caixa (Água não vai depois de Zebra)", () => {
		const lista = [
			item(1, "Zebra", null),
			item(2, "Água", null),
			item(3, "abacate", null),
			item(4, "Azul", null),
		];
		expect(nomes(ordenar(lista, opcao("nome-asc")))).toEqual([
			"abacate",
			"Água",
			"Azul",
			"Zebra",
		]);
		expect(nomes(ordenar(lista, opcao("nome-desc")))).toEqual([
			"Zebra",
			"Azul",
			"Água",
			"abacate",
		]);
	});

	test("números dentro do nome ordenam como número (A2 antes de A10)", () => {
		const lista = [
			item(1, "Kimono A10", null),
			item(2, "Kimono A2", null),
			item(3, "Kimono A1", null),
		];
		expect(nomes(ordenar(lista, opcao("nome-asc")))).toEqual([
			"Kimono A1",
			"Kimono A2",
			"Kimono A10",
		]);
	});

	test("modificação: mais recente primeiro / mais antiga primeiro", () => {
		const lista = [
			item(1, "B", "2026-03-01T10:00:00.000Z"),
			item(2, "A", "2026-05-01T10:00:00.000Z"),
			item(3, "C", "2026-01-01T10:00:00.000Z"),
		];
		expect(nomes(ordenar(lista, opcao("modificado-desc")))).toEqual([
			"A",
			"B",
			"C",
		]);
		expect(nomes(ordenar(lista, opcao("modificado-asc")))).toEqual([
			"C",
			"B",
			"A",
		]);
	});

	test("data desconhecida (null) vai SEMPRE pro fim, nas duas direções", () => {
		const lista = [
			item(1, "Sem data", null),
			item(2, "Velha", "2026-01-01T00:00:00.000Z"),
			item(3, "Nova", "2026-09-01T00:00:00.000Z"),
		];
		expect(nomes(ordenar(lista, opcao("modificado-desc")))).toEqual([
			"Nova",
			"Velha",
			"Sem data",
		]);
		expect(nomes(ordenar(lista, opcao("modificado-asc")))).toEqual([
			"Velha",
			"Nova",
			"Sem data",
		]);
	});

	test("empate é estável: mesma data desempata por nome (A→Z), depois por id", () => {
		const data = "2026-04-04T04:04:04.000Z";
		const lista = [
			item(5, "Beta", data),
			item(2, "Alfa", data),
			item(9, "Alfa", data),
		];
		// ids 2 e 9 têm o mesmo nome: id menor primeiro; vale nas duas direções.
		const ids = (l: ItemOrdenavel[]) => l.map((i) => i.id);
		expect(ids(ordenar(lista, opcao("modificado-desc")))).toEqual([2, 9, 5]);
		expect(ids(ordenar(lista, opcao("modificado-asc")))).toEqual([2, 9, 5]);
		expect(ids(ordenar(lista, opcao("nome-desc")))).toEqual([5, 2, 9]);
	});

	test("não muta a lista de entrada", () => {
		const lista = [item(1, "B", null), item(2, "A", null)];
		ordenar(lista, opcao("nome-asc"));
		expect(nomes(lista)).toEqual(["B", "A"]);
	});

	test("categorias 'Padrão': grupos primeiro, depois por nome", () => {
		const lista = [
			item(1, "Zeta (atributo)", null, 10),
			item(2, "Beta (grupo)", null, null),
			item(3, "Alfa (atributo)", null, 10),
			item(10, "Alfa (grupo)", null, null),
		];
		expect(nomes(ordenar(lista, opcao("padrao")))).toEqual([
			"Alfa (grupo)",
			"Beta (grupo)",
			"Alfa (atributo)",
			"Zeta (atributo)",
		]);
	});

	test("valor persistido desconhecido volta pro padrão da lista", () => {
		expect(
			lerOrdenacaoPersistida(
				"modificado-desc",
				produtos,
				ORDENACAO_PADRAO_PRODUTOS,
			),
		).toBe("modificado-desc");
		for (const lixo of ["nao-existe", "", 42, null, undefined, { a: 1 }]) {
			expect(
				lerOrdenacaoPersistida(lixo, produtos, ORDENACAO_PADRAO_PRODUTOS),
			).toBe(ORDENACAO_PADRAO_PRODUTOS);
		}
		// "padrao" só existe nas categorias: numa lista de produtos é desconhecido.
		expect(
			lerOrdenacaoPersistida("padrao", produtos, ORDENACAO_PADRAO_PRODUTOS),
		).toBe(ORDENACAO_PADRAO_PRODUTOS);
		expect(
			lerOrdenacaoPersistida(
				"padrao",
				OPCOES_ORDENACAO_CATEGORIAS,
				ORDENACAO_PADRAO_CATEGORIAS,
			),
		).toBe("padrao");
	});

	test("clique no cabeçalho (Explorador): coluna nova usa a direção natural, a ativa inverte", () => {
		// Nome começa A→Z; data começa pela mais recente.
		expect(alternarPorCampo(produtos, "modificado-desc", "nome")).toBe(
			"nome-asc",
		);
		expect(alternarPorCampo(produtos, "nome-asc", "modificado")).toBe(
			"modificado-desc",
		);
		// Segundo clique inverte.
		expect(alternarPorCampo(produtos, "nome-asc", "nome")).toBe("nome-desc");
		expect(alternarPorCampo(produtos, "nome-desc", "nome")).toBe("nome-asc");
		expect(alternarPorCampo(produtos, "modificado-desc", "modificado")).toBe(
			"modificado-asc",
		);
		// Categorias: do "Padrão", clicar em Nome vai pra A→Z.
		expect(
			alternarPorCampo(OPCOES_ORDENACAO_CATEGORIAS, "padrao", "nome"),
		).toBe("nome-asc");
	});

	test("aria-sort do cabeçalho reflete a opção ativa", () => {
		expect(ariaSortDoCampo(opcao("nome-asc"), "nome")).toBe("ascending");
		expect(ariaSortDoCampo(opcao("nome-desc"), "nome")).toBe("descending");
		expect(ariaSortDoCampo(opcao("nome-asc"), "modificado")).toBe("none");
		expect(ariaSortDoCampo(opcao("padrao"), "nome")).toBe("none");
		expect(ariaSortDoCampo(undefined, "nome")).toBe("none");
	});
});
