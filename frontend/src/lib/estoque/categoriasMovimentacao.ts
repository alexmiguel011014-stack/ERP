import type { CategoriaComUso, ProdutoDetalhado } from "@/lib/erpApi";

export function mapearCategoriasPorProduto(
	produtos: readonly ProdutoDetalhado[],
	categorias: readonly CategoriaComUso[],
): Map<number, Set<number>> {
	const categoriaPorId = new Map(categorias.map((categoria) => [categoria.id, categoria]));
	const mapa = new Map<number, Set<number>>();

	const idDaCategoriaRaiz = (
		id: number | null,
		paiFallback: number | null = null,
	): number | null => {
		if (id === null) return null;
		const categoria = categoriaPorId.get(id);
		return categoria
			? (categoria.categoria_pai_id ?? categoria.id)
			: (paiFallback ?? id);
	};

	for (const produto of produtos) {
		const categoriasRaiz = new Set<number>();
		const selecionadas = produto.categorias_selecionadas || [];
		if (selecionadas.length > 0) {
			for (const categoria of selecionadas) {
				const idRaiz = idDaCategoriaRaiz(categoria.id, categoria.categoria_pai_id);
				if (idRaiz !== null) categoriasRaiz.add(idRaiz);
			}
		} else {
			const categoriaLegada = idDaCategoriaRaiz(produto.categoria_id);
			const subcategoriaLegada = idDaCategoriaRaiz(
				produto.subcategoria_id,
				categoriaLegada,
			);
			if (categoriaLegada !== null) categoriasRaiz.add(categoriaLegada);
			if (subcategoriaLegada !== null) categoriasRaiz.add(subcategoriaLegada);
		}

		mapa.set(produto.id, categoriasRaiz);
	}

	return mapa;
}

export function mensagemErroFiltroCategoria(podeProdutos: boolean): string {
	return podeProdutos
		? "Não foi possível carregar as categorias. Tente novamente."
		: "Filtro por categoria indisponível para este perfil";
}

export function formatarSinalMovimentacao(
	tipo: string,
	quantidade: number,
): string {
	const valor = Number(quantidade);
	if (!Number.isFinite(valor)) return String(quantidade);
	if (tipo === "entrada") return `+${Math.abs(valor)}`;
	if (tipo === "saida") return `−${Math.abs(valor)}`;
	return String(valor);
}
