"use client";

// "/produtos" precisa existir como rota (é o href da aba/sidebar do módulo e
// vira produtos/index.html no export estático), mas quem desenha a tela é
// layout/ProdutosWorkspace.tsx, instanciado por layout/AbasHost.tsx — esta
// página nunca chega a renderizar nada. Antes redirecionava pra
// /produtos/cadastro; hoje o workspace abre direto na última sub-aba usada.
export default function ProdutosIndexPage() {
	return null;
}
