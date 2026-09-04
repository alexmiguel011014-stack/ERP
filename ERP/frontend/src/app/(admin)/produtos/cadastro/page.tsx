"use client";
import { useState } from "react";
import { usePageHeader } from "@/context/PageHeaderContext";
import ProdutoFormPanel from "@/components/produtos/ProdutoFormPanel";
import ProdutosListModal from "@/components/produtos/ProdutosListModal";
import CategoriasListModal from "@/components/produtos/CategoriasListModal";
import { erpApi, type ProdutoDetalhado } from "@/lib/erpApi";

export default function CadastroProdutoPage() {
	usePageHeader("Cadastro de Produto", "Cadastre produtos, SKUs e categorias.");
	const [modalAberto, setModalAberto] = useState(false);
	const [modalCategoriasAberto, setModalCategoriasAberto] = useState(false);
	const [produtoEditando, setProdutoEditando] =
		useState<ProdutoDetalhado | null>(null);
	const [refreshTick, setRefreshTick] = useState(0);

	// Depois de criar um produto novo, entra no mesmo "modo edição" de um
	// produto já existente — reaproveita o ProdutoImagemPicker, que só
	// aparece quando produtoEditando tem id, pra deixar anexar a imagem na
	// hora, sem precisar sair e reabrir o produto pela lista.
	async function handleProdutoCriado(id: number) {
		try {
			const lista = await erpApi.produtos.detalhados();
			const criado = lista.find((p) => p.id === id);
			if (criado) setProdutoEditando(criado);
		} catch {
			/* produto já foi salvo; só não conseguimos abrir o modo de edição
			   automaticamente pra adicionar a imagem agora */
		}
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<ProdutoFormPanel
				key={refreshTick}
				produtoEditando={produtoEditando}
				onSalvo={() => setRefreshTick((t) => t + 1)}
				onProdutoCriado={handleProdutoCriado}
				onCancelarEdicao={() => setProdutoEditando(null)}
				onAbrirLista={() => setModalAberto(true)}
				onAbrirListaCategorias={() => setModalCategoriasAberto(true)}
			/>
			<ProdutosListModal
				isOpen={modalAberto}
				onClose={() => setModalAberto(false)}
				onEditar={setProdutoEditando}
			/>
			<CategoriasListModal
				isOpen={modalCategoriasAberto}
				onClose={() => setModalCategoriasAberto(false)}
				onAlterado={() => setRefreshTick((t) => t + 1)}
			/>
		</div>
	);
}
