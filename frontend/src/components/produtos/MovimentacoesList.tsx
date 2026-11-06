"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EstoqueDialog } from "@/components/produtos/EstoqueDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMovimentacoesEstoque } from "@/hooks/useMovimentacoesEstoque";
import { useCategorias } from "@/hooks/useCategorias";
import { useAuth } from "@/context/AuthContext";
import { erpApi, type ProdutoDetalhado } from "@/lib/erpApi";
import { formatarMoeda } from "@/components/dashboard/formatos";
import { formatarAtributos } from "@/lib/utils/formatos";
import {
	formatarSinalMovimentacao,
	mapearCategoriasPorProduto,
	mensagemErroFiltroCategoria,
} from "@/lib/estoque/categoriasMovimentacao";

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
	const {
		categorias,
		carregando: carregandoCategorias,
		erro: erroCategorias,
		recarregar: recarregarCategorias,
	} = useCategorias(true);
	const { podeModulo } = useAuth();
	const podeFiltrarPorProduto = podeModulo("produtos");
	const [produtos, setProdutos] = useState<ProdutoDetalhado[]>([]);
	const [carregandoProdutos, setCarregandoProdutos] = useState(false);
	const [erroProdutos, setErroProdutos] = useState<string | null>(null);
	const [categoriaFiltro, setCategoriaFiltro] = useState("");
	const produtosCarregandoRef = useRef(false);
	const dialogoEstavaAbertoRef = useRef(false);

	const recarregarProdutos = useCallback(async () => {
		if (produtosCarregandoRef.current) return;
		produtosCarregandoRef.current = true;
		setCarregandoProdutos(true);
		setErroProdutos(null);
		try {
			setProdutos(await erpApi.produtos.detalhados(true));
		} catch (e) {
			setErroProdutos(e instanceof Error ? e.message : String(e));
		} finally {
			produtosCarregandoRef.current = false;
			setCarregandoProdutos(false);
		}
	}, []);

	const recarregarMetadados = useCallback(async () => {
		await Promise.all([recarregarProdutos(), recarregarCategorias()]);
	}, [recarregarProdutos, recarregarCategorias]);

	useEffect(() => {
		if (!isOpen) {
			dialogoEstavaAbertoRef.current = false;
			return;
		}
		if (dialogoEstavaAbertoRef.current) return;
		dialogoEstavaAbertoRef.current = true;
		void recarregar();
		void recarregarProdutos();
		// useCategorias já inicia uma consulta no mount. Se ela ainda estiver
		// pendente ao abrir o diálogo, reutilize-a em vez de criar uma corrida.
		if (!carregandoCategorias) void recarregarCategorias();
	}, [isOpen, carregandoCategorias, recarregar, recarregarCategorias, recarregarProdutos]);

	const gruposPrincipais = useMemo(
		() => categorias.filter((c) => !c.categoria_pai_id),
		[categorias],
	);

	const categoriasPorProduto = useMemo(
		() => mapearCategoriasPorProduto(produtos, categorias),
		[produtos, categorias],
	);
	const metadadosCarregando = carregandoProdutos || carregandoCategorias;
	const metadadosErro = Boolean(erroProdutos || erroCategorias);
	const filtroIndisponivel =
		!podeFiltrarPorProduto || metadadosCarregando || metadadosErro;
	const mensagemErro = !podeFiltrarPorProduto
		? mensagemErroFiltroCategoria(false)
		: metadadosErro
			? mensagemErroFiltroCategoria(true)
			: null;

	useEffect(() => {
		if (
			!categoriaFiltro ||
			carregandoCategorias ||
			erroCategorias
		) return;
		if (!gruposPrincipais.some((categoria) => String(categoria.id) === categoriaFiltro)) {
			setCategoriaFiltro("");
		}
	}, [categoriaFiltro, carregandoCategorias, erroCategorias, gruposPrincipais]);

	const linhas = categoriaFiltro && !filtroIndisponivel
		? movimentacoes.filter(
					(m) => categoriasPorProduto.get(m.produto_id)?.has(Number(categoriaFiltro)) ?? false,
			)
		: movimentacoes;

	return (
		<EstoqueDialog
			isOpen={isOpen}
			onClose={onClose}
			busy={false}
			title="Últimas movimentações"
		>
			<div className="p-4">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-56 flex-1">
						{mensagemErro && (
							<div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
								<span role="alert">{mensagemErro}</span>
								{podeFiltrarPorProduto && metadadosErro && (
									<button
										type="button"
										onClick={() => void recarregarMetadados()}
										disabled={metadadosCarregando}
										className="ml-2 font-semibold underline disabled:opacity-60"
									>
										Tentar novamente
									</button>
								)}
							</div>
						)}
					</div>
					<div>
						<label htmlFor="filtro-categoria-movimentacoes" className="mr-2 text-xs font-medium text-gray-500 dark:text-gray-400">
							Categoria
						</label>
					<select
						id="filtro-categoria-movimentacoes"
						value={categoriaFiltro}
						onChange={(e) => setCategoriaFiltro(e.target.value)}
						disabled={filtroIndisponivel}
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
				{erro && (
					<div className="mb-3 rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
						{erro}
					</div>
				)}
				<ScrollArea size="lg" aria-label="Histórico de movimentações">
					<div className="divide-y divide-gray-100 dark:divide-gray-800">
						{carregando && movimentacoes.length === 0 ? (
							<div className="py-6 text-center text-sm text-gray-400">
								Carregando...
							</div>
						) : linhas.length === 0 ? (
							<div className="py-6 text-center text-sm text-gray-400">
								Nenhuma movimentação registrada.
							</div>
						) : (
							linhas.map((m) => {
								const sinal = formatarSinalMovimentacao(m.tipo, m.quantidade);
								const negativo = sinal.startsWith("-") || sinal.startsWith("−");
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
										<span className={
											negativo
												? "shrink-0 rounded-full bg-error-50 px-2.5 py-0.5 text-xs font-semibold text-error-600 dark:bg-error-500/10 dark:text-error-400"
												: "shrink-0 rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-600 dark:bg-success-500/10 dark:text-success-400"
											}
										>
											{sinal}
										</span>
									</div>
								);
							})
						)}
					</div>
				</ScrollArea>
			</div>
		</EstoqueDialog>
	);
}
