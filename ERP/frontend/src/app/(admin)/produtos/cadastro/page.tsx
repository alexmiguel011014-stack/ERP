"use client";
import { useState } from "react";
import ProdutoFormPanel from "@/components/produtos/ProdutoFormPanel";
import ProdutosListModal from "@/components/produtos/ProdutosListModal";
import CategoriasListModal from "@/components/produtos/CategoriasListModal";
import type { ProdutoDetalhado } from "@/lib/erpApi";

export default function CadastroProdutoPage() {
	const [modalAberto, setModalAberto] = useState(false);
	const [modalCategoriasAberto, setModalCategoriasAberto] = useState(false);
	const [produtoEditando, setProdutoEditando] =
		useState<ProdutoDetalhado | null>(null);
	const [refreshTick, setRefreshTick] = useState(0);

	return (
		<div className="grid grid-cols-1 gap-4">
			<ProdutoFormPanel
				key={refreshTick}
				produtoEditando={produtoEditando}
				onSalvo={() => setRefreshTick((t) => t + 1)}
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
