"use client";
import { useEffect } from "react";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	// Achado real (2026-08-31): a tela de login não tem tema escuro, de
	// propósito — sempre branco à esquerda, azul à direita, mesmo se o app
	// (já logado antes) tiver salvo "dark" no localStorage. Só remover a
	// classe "dark" do <html> uma vez no mount NÃO bastava: o ThemeProvider
	// do layout raiz (app/layout.tsx, ancestral deste) também roda seu
	// próprio efeito de sincronização no mount, e efeito de componente pai
	// dispara DEPOIS do efeito do filho no React — ele recolocava "dark" de
	// volta logo em seguida, vencendo a corrida. Um MutationObserver não
	// depende de ordem de efeito: reage a qualquer tentativa de recolocar a
	// classe enquanto esta tela estiver montada, e para de observar ao sair
	// (login bem-sucedido), devolvendo o controle pro app normal.
	useEffect(() => {
		const html = document.documentElement;
		html.classList.remove("dark");
		const observer = new MutationObserver(() => {
			if (html.classList.contains("dark")) {
				html.classList.remove("dark");
			}
		});
		observer.observe(html, { attributes: true, attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);

	return (
		<div className="relative p-6 bg-white z-1 sm:p-0">
			<div className="relative flex lg:flex-row w-full h-screen justify-center flex-col sm:p-0">
				{children}
				{/* bg-[#071440]: fundo do loader_v3.gif (2026-08-31, terceira versão
				    reexportada do Canva) — dessa vez genuinamente quase sólido:
				    #071440 domina 33688 das amostras contra 54 da segunda cor mais
				    comum (~600:1, e essa segunda nem é ruído de fundo, é borda de
				    fita capturada por acaso). Versões anteriores (v1/v2) tinham
				    dithering real oscilando frame a frame, impedindo um match
				    100% — essa não. Não é #000066, o azul pedido originalmente;
				    a escolha (2026-08-30/31) foi casar com o GIF exatamente. */}
				<div className="lg:w-1/2 w-full h-full bg-[#071440] lg:grid items-center hidden">
					<div className="relative items-center justify-center  flex z-1">
						{/* eslint-disable-next-line @next/next/no-img-element -- GIF
						    animado: next/image otimiza como estático (perderia a
						    animação); unoptimized:true no config já cobre isso pra
						    outras imagens, mas <img> puro evita qualquer processamento */}
						{/* max-w-[314px] = 70% de max-w-md (448px), a pedido do dono */}
						<img
							src="/images/loader/Loader.gif"
							alt=""
							className="relative w-full max-w-[314px]"
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
