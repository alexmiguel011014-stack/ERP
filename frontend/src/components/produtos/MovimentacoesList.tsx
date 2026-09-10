"use client";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useMovimentacoesEstoque } from "@/hooks/useMovimentacoesEstoque";
import { useCategorias } from "@/hooks/useCategorias";
import { useProdutos } from "@/hooks/useProdutos";
import { formatarMoeda } from "@/components/dashboard/formatos";
import { formatarAtributos } from "@/lib/utils/formatos";

function formatarData(iso: string) {
	try {
		return new Date(iso).toLocaleString("pt-BR");
	} catch {
		return iso;
	}
}

export default function MovimentacoesList({
	isOpen,
	onClose,
}: {
	isOpen: boolean;
	onClose: () => void;
}) {
	const { movimentacoes, carregando, erro, recarregar } =
		useMovimentacoesEstoque();
	const { categorias } = useCategorias();
	const { produtos } = useProdutos(false);
	const [categoriaFiltro, setCategoriaFiltro] = useState("");

	useEffect(() => {
		if (isOpen) recarregar();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	const gruposPrincipais = categorias.filter((c) => !c.categoria_pai_id);

	const categoriaPorProdutoNome = useMemo(() => {
		const mapa: Record<string, number | null> = {};
		produtos.forEach((p) => {
			if (p.categoria_id) mapa[p.nome] = p.categoria_id;
		});
		return mapa;
	}, [produtos]);

	const linhas = categoriaFiltro
		? movimentacoes.filter(
				(m) =>
					String(categoriaPorProdutoNome[m.produto_nome]) === categoriaFiltro,
			)
		: movimentacoes;

	return (
		<Modal isOpen={isOpen} onClose={onClose} className="max-w-[720px] p-0">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4 dark:border-gray-800">
				<h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
					Últimas movimentações
				</h2>
				<div>
					<label className="mr-2 text-xs font-medium text-gray-500 dark:text-gray-400">
						Categoria
					</label>
					<select
						value={categoriaFiltro}
						onChange={(e) => setCategoriaFiltro(e.target.value)}
						className="h-9 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
					>
						<option value="">Todas as categorias</option>
						{gruposPrincipais.map((c) => (
							<option key={c.id} value={c.id}>
								{c.nome}
							</option>
						))}
					</select>
				</div>
			</div>
			<div className="max-h-[70vh] overflow-y-auto p-4">
				{erro && (
					<div className="mb-3 rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
						{erro}
					</div>
				)}
				<div className="divide-y divide-gray-100 dark:divide-gray-800">
					{carregando ? (
						<div className="py-6 text-center text-sm text-gray-400">
							Carregando...
						</div>
					) : linhas.length === 0 ? (
						<div className="py-6 text-center text-sm text-gray-400">
							Nenhuma movimentação registrada.
						</div>
					) : (
						linhas.map((m) => {
							const sinal =
								m.tipo === "ajuste" && Number(m.quantidade) < 0 ? "" : "+";
							return (
								<div
									key={m.id}
									className="flex items-center justify-between gap-3 py-2.5"
								>
									<div>
										<div className="text-sm font-medium text-gray-800 dark:text-white/90">
											{m.produto_nome} (
											{formatarAtributos(m.atributos, m.tamanho, m.cor)})
										</div>
										<div className="text-xs text-gray-500 dark:text-gray-400">
											{formatarData(m.data)} | Origem: {m.origem || "manual"}
											{m.custo_unitario != null
												? " | Custo: " + formatarMoeda(m.custo_unitario)
												: ""}
											{m.observacao ? " | " + m.observacao : ""}
										</div>
									</div>
									<span className="shrink-0 rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-600 dark:bg-success-500/10 dark:text-success-400">
										{sinal}
										{m.quantidade}
									</span>
								</div>
							);
						})
					)}
				</div>
			</div>
		</Modal>
	);
}
