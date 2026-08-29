"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTabs } from "@/context/TabsContext";
import { normalizarPathname } from "@/hooks/useModulos";

// Mantém o conteúdo de cada aba aberta genuinamente montado (não só
// escondido por CSS depois de recriado) — troca de aba não perde formulário
// em progresso, carrinho do PDV, scroll, nada. Padrão pesquisado antes de
// construir: o mecanismo nativo do Next.js pra isso (cacheComponents +
// <Activity>) só existe a partir da v16 (este projeto está na 15.5.23) e
// ainda tem bugs reais reportados mesmo lá — por isso um cache próprio, não
// uma dependência de terceiro nem um upgrade de framework só por causa
// disso. Só ~30 linhas, mesma ideia que várias libs de "keep-alive" da
// comunidade Next.js implementam.
export default function AbasAtivasWrapper({
	children,
}: {
	children: React.ReactNode;
}) {
	// normalizarPathname: mesma pegadinha do trailingSlash:true de sempre —
	// usePathname() pode devolver a rota com barra no final; sem normalizar
	// aqui, uma visita cujo pathname bruto ainda não tinha estabilizado no
	// formato com barra criava uma SEGUNDA entrada de cache pra "a mesma"
	// rota (uma visível, outra escondida, os dois com o mesmo conteúdo) —
	// bug real que quebrava toda navegação depois de abrir uma aba assim.
	const pathname = normalizarPathname(usePathname());
	const { abas } = useTabs();
	const cacheRef = useRef<Map<string, React.ReactNode>>(new Map());
	const [, forcarRender] = useState(0);

	// Só guarda a árvore atual no cache na PRIMEIRA visita a essa rota — numa
	// revisita, o Next.js monta uma árvore nova e sem estado pra `children`,
	// e é exatamente essa árvore nova que precisa ser ignorada em favor da
	// que já está viva no cache (senão a aba "voltada" perderia tudo que
	// tinha em progresso, o oposto do que essa feature existe pra resolver).
	if (!cacheRef.current.has(pathname)) {
		cacheRef.current.set(pathname, children);
	}

	// Remove do cache qualquer rota cuja aba foi fechada — sem isso "fechar"
	// só escondia a tela, sem liberar memória nem parar o que ela tava
	// fazendo em segundo plano.
	useEffect(() => {
		const hrefsAbertos = new Set(abas.map((a) => a.href));
		hrefsAbertos.add(pathname); // a aba atual é sempre válida
		let mudou = false;
		for (const key of cacheRef.current.keys()) {
			if (!hrefsAbertos.has(key)) {
				cacheRef.current.delete(key);
				mudou = true;
			}
		}
		if (mudou) forcarRender((n) => n + 1);
	}, [abas, pathname]);

	return (
		<>
			{Array.from(cacheRef.current.entries()).map(([path, node]) => (
				<div key={path} className={path === pathname ? "" : "hidden"}>
					{node}
				</div>
			))}
		</>
	);
}
