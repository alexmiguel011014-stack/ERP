"use client";
import { useEffect, useRef, useState } from "react";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import CategoriaSelector from "./CategoriaSelector";
import ProdutoImagemPicker from "./ProdutoImagemPicker";
import { useCategorias } from "@/hooks/useCategorias";
import { usePersistedState } from "@/hooks/usePersistedState";
import {
	erpApi,
	type CategoriaComUso,
	type NovoProdutoDados,
	type ProdutoDetalhado,
} from "@/lib/erpApi";

function derivarAtributosDeCategorias(
	categoriaIds: number[],
	categorias: CategoriaComUso[],
) {
	const atributos = categoriaIds
		.map((id) => categorias.find((c) => c.id === id))
		.filter((c): c is CategoriaComUso => !!c)
		.map((c) => ({
			chave: c.categoria_pai_nome || "Categoria",
			valor: c.nome,
		}));
	if (atributos.length === 0)
		atributos.push({ chave: "Categoria", valor: "Geral" });
	return atributos;
}

export default function ProdutoFormPanel({
	produtoEditando,
	onSalvo,
	onCancelarEdicao,
	onAbrirLista,
	onAbrirListaCategorias,
}: {
	produtoEditando: ProdutoDetalhado | null;
	onSalvo: () => void;
	onCancelarEdicao: () => void;
	onAbrirLista: () => void;
	onAbrirListaCategorias: () => void;
}) {
	const { categorias, recarregar: recarregarCategorias } = useCategorias();
	// Rascunho de "produto novo" sobrevive a sair da tela e voltar — mesmo
	// mecanismo já usado no PDV/Compras/Categorias.
	const [nome, setNome, limparNome] = usePersistedState(
		"produtos_form_nome",
		"",
	);
	const [sku, setSku] = useState("");
	const [codigoBarras, setCodigoBarras] = useState("");
	const [estoque, setEstoque, limparEstoque] = usePersistedState(
		"produtos_form_estoque",
		"0",
	);
	const [imagem, setImagem] = useState<string | null>(null);
	const [categoriasSelecionadas, setCategoriasSelecionadas, limparCategorias] =
		usePersistedState<string[]>("produtos_form_categorias", []);
	const [mensagem, setMensagem] = useState<{
		texto: string;
		sucesso: boolean;
	} | null>(null);
	const [salvando, setSalvando] = useState(false);
	// Evita que o efeito abaixo apague um rascunho recém-carregado do
	// localStorage no primeiro render (produtoEditando começa null tanto
	// "sem edição nenhuma" quanto "acabou de cancelar uma edição").
	const primeiraVez = useRef(true);

	const editandoId = produtoEditando?.id ?? null;

	useEffect(() => {
		if (produtoEditando) {
			setNome(produtoEditando.nome || "");
			const variacao = produtoEditando.variacoes[0] || null;
			setSku(variacao ? variacao.sku : "");
			setCodigoBarras(variacao ? variacao.codigo_barras || "" : "");
			setEstoque(
				String(variacao ? Number(variacao.quantidade_estoque || 0) : 0),
			);
			setImagem(produtoEditando.imagem);
			let sels = produtoEditando.categorias_selecionadas.map((c) =>
				String(c.id),
			);
			if (sels.length === 0) {
				if (produtoEditando.subcategoria_id)
					sels = [String(produtoEditando.subcategoria_id)];
				else if (produtoEditando.categoria_id)
					sels = [String(produtoEditando.categoria_id)];
			}
			setCategoriasSelecionadas(sels);
		} else if (!primeiraVez.current) {
			limparFormulario();
		} else if (!sku) {
			buscarProximoSku();
		}
		primeiraVez.current = false;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [produtoEditando]);

	function limparFormulario() {
		limparNome();
		limparEstoque();
		setImagem(null);
		setCodigoBarras("");
		limparCategorias();
		if (!editandoId) buscarProximoSku();
	}

	function buscarProximoSku() {
		erpApi.produtos
			.proximoSku()
			.then(setSku)
			.catch(() => setSku(""));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (salvando) return;
		const nomeProduto = nome.trim();
		if (!nomeProduto) {
			setMensagem({ texto: "Nome do produto é obrigatório.", sucesso: false });
			return;
		}
		const estoqueNum = Number(estoque);
		if (
			!Number.isInteger(estoqueNum) ||
			estoqueNum < 0 ||
			estoque.trim() === ""
		) {
			setMensagem({
				texto: "Estoque inválido. Informe um número inteiro.",
				sucesso: false,
			});
			return;
		}

		const categoriaIds = categoriasSelecionadas.map((id) => parseInt(id, 10));
		const dados: NovoProdutoDados = {
			nome: nomeProduto,
			categoria: null,
			categoria_id: null,
			subcategoria_id: null,
			categoriasSelecionadas: categoriaIds,
			variacoes: [
				{
					sku: sku.trim().toUpperCase(),
					codigo_barras: codigoBarras.trim() || null,
					preco: 0,
					preco_custo: 0,
					quantidade_estoque: estoqueNum,
					atributos: derivarAtributosDeCategorias(categoriaIds, categorias),
				},
			],
		};

		setSalvando(true);
		setMensagem(null);
		try {
			if (editandoId) {
				await erpApi.produtos.atualizar(editandoId, dados);
				setMensagem({
					texto: "Produto atualizado com sucesso!",
					sucesso: true,
				});
			} else {
				await erpApi.produtos.salvar(dados);
				setMensagem({ texto: "Produto salvo com sucesso!", sucesso: true });
			}
			recarregarCategorias();
			onSalvo();
			if (!editandoId) limparFormulario();
		} catch (e) {
			setMensagem({
				texto:
					"Erro ao salvar: " + (e instanceof Error ? e.message : String(e)),
				sucesso: false,
			});
		} finally {
			setSalvando(false);
		}
	}

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
				Cadastro de Produto
			</h2>
			<form onSubmit={handleSubmit} className="mt-3 space-y-4">
				<div>
					<Label>Nome do Produto</Label>
					<Input
						value={nome}
						onChange={(e) => setNome(e.target.value)}
						placeholder="Ex: Quimono Trançado"
					/>
				</div>

				{editandoId && (
					<ProdutoImagemPicker
						produtoId={editandoId}
						imagem={imagem}
						onErro={(t) => setMensagem({ texto: t, sucesso: false })}
						onSucesso={(t) => setMensagem({ texto: t, sucesso: true })}
					/>
				)}

				<div className="grid grid-cols-2 gap-4">
					<div>
						<Label>SKU</Label>
						<Input
							value={sku}
							disabled
							placeholder="Será gerado automaticamente"
						/>
					</div>
					<div>
						<Label>Estoque inicial</Label>
						<Input
							type="number"
							value={estoque}
							onChange={(e) => setEstoque(e.target.value)}
							min="0"
							step={1}
						/>
					</div>
				</div>

				<div>
					<Label>Código de barras (EAN)</Label>
					<Input
						value={codigoBarras}
						onChange={(e) => setCodigoBarras(e.target.value)}
						placeholder="Opcional — leia com o leitor ou digite o código do fabricante"
					/>
				</div>

				<div>
					<Label>Categorias / Atributos</Label>
					<CategoriaSelector
						categorias={categorias}
						selecionados={categoriasSelecionadas}
						onChange={setCategoriasSelecionadas}
						onCategoriaCriada={recarregarCategorias}
					/>
				</div>

				{mensagem && (
					<div
						className={
							mensagem.sucesso
								? "rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-800 dark:bg-success-500/10 dark:text-success-400"
								: "rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400"
						}
					>
						{mensagem.texto}
					</div>
				)}

				<div className="flex flex-wrap gap-3">
					<Button type="submit" disabled={salvando}>
						{salvando
							? "Salvando..."
							: editandoId
								? "Salvar Alterações"
								: "Salvar Produto"}
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							limparFormulario();
							setMensagem(null);
						}}
					>
						Limpar
					</Button>
					{editandoId && (
						<Button type="button" variant="outline" onClick={onCancelarEdicao}>
							Cancelar Edição
						</Button>
					)}
				</div>

				<div className="flex flex-wrap gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
					<Button type="button" variant="outline" onClick={onAbrirLista}>
						Lista de Produtos
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={onAbrirListaCategorias}
					>
						Lista de Categorias
					</Button>
				</div>
			</form>
		</div>
	);
}
