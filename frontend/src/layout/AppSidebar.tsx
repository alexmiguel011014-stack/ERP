"use client";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import { useAuth } from "../context/AuthContext";
import { HorizontaLDots } from "../icons/index";
import {
	hrefDoModulo,
	normalizarPathname,
	useModulosPermitidos,
} from "../hooks/useModulos";
import IconeModulo from "../components/common/IconeModulo";

const SECAO_LABEL: Record<string, string> = {
	principal: "Principal",
	gestao: "Gestão",
	administracao: "Administração",
};
const ORDEM_SECAO = ["principal", "gestao", "administracao"];

// Módulos cujo manifesto já existe (e por isso apareceriam na sidebar) mas
// ainda não têm rota real no frontend novo — clicar neles navegaria pra uma
// página inexistente no export estático e travaria em tela branca (mesmo
// bug de raiz corrigido pra "dashboard" em hooks/useModulos.ts). Renderizados
// desabilitados até cada um ganhar sua rota real; remover da lista assim que
// built. Vazio agora: "vendas" (/vendas) e "pdv" (/pdv) já têm rota real —
// era o último módulo do plano de migração, mecanismo mantido pro caso de um
// módulo novo entrar no manifesto antes de ganhar sua página no Next.js.
const MODULOS_SEM_ROTA_NOVA = new Set<string>([]);

const AppSidebar: React.FC = () => {
	const { isHovered, setIsHovered } = useSidebar();
	const pathname = usePathname();
	const { sessao } = useAuth();
	const modulos = useModulosPermitidos();

	const isActive = (path: string) => path === normalizarPathname(pathname);

	const secoes = ORDEM_SECAO.map((secaoId) => {
		const itens = modulos
			.filter((m) => m.navbar!.secao === secaoId)
			.sort((a, b) => (a.navbar!.ordem ?? 0) - (b.navbar!.ordem ?? 0));
		return { id: secaoId, label: SECAO_LABEL[secaoId], itens };
	}).filter((secao) => secao.itens.length > 0);

	return (
		<aside
			className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-4 left-0 bg-[#0F172A] text-gray-100 h-screen transition-all duration-300 ease-in-out z-50 border-r border-white/10 translate-x-0 ${
				isHovered ? "w-[260px]" : "w-[76px]"
			}`}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<div
				className={`py-5 flex items-center gap-3 ${
					isHovered ? "justify-start" : "lg:justify-center"
				}`}
			>
				<Link href="/" className="flex items-center gap-2.5">
					{isHovered ? (
						<Image
							src="/images/logo/allu-logo-dark.png"
							alt="Allu"
							width={220}
							height={98}
							className="h-8 w-auto"
						/>
					) : (
						<Image
							src="/images/logo/allu-mark-white.png"
							alt="Allu"
							width={454}
							height={601}
							className="h-8 w-8 shrink-0 object-contain"
						/>
					)}
				</Link>
			</div>
			<div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
				<nav className="mb-6">
					<div className="flex flex-col gap-5">
						{secoes.map((secao) => (
							<div key={secao.id}>
								<h2
									className={`mb-2 text-xs uppercase flex leading-[20px] text-gray-400 ${
										isHovered ? "justify-start" : "lg:justify-center"
									}`}
								>
									{isHovered ? secao.label : <HorizontaLDots />}
								</h2>
								<ul className="flex flex-col gap-1">
									{secao.itens.map((m) => {
										if (MODULOS_SEM_ROTA_NOVA.has(m.id)) {
											return (
												<li key={m.id}>
													<span
														title={`${m.navbar!.label} — em migração, ainda não disponível neste frontend`}
														className="menu-item cursor-not-allowed opacity-40"
													>
														<span className="menu-item-icon-inactive">
															<IconeModulo svg={m.navbar!.icone} />
														</span>
														{isHovered && (
															<span className="menu-item-text">
																{m.navbar!.label}
															</span>
														)}
													</span>
												</li>
											);
										}
										const href = hrefDoModulo(m);
										return (
											<li key={m.id}>
												<Link
													href={href}
													title={m.navbar?.dica || m.navbar?.label}
													className={`menu-item group ${
														isActive(href)
															? "menu-item-active"
															: "menu-item-inactive"
													}`}
												>
													<span
														className={
															isActive(href)
																? "menu-item-icon-active"
																: "menu-item-icon-inactive"
														}
													>
														<IconeModulo svg={m.navbar!.icone} />
													</span>
													{isHovered && (
														<span className="menu-item-text">
															{m.navbar!.label}
														</span>
													)}
												</Link>
											</li>
										);
									})}
								</ul>
							</div>
						))}
						{sessao.autenticado && secoes.length === 0 && (
							<p className="px-1 text-xs text-gray-400">
								{isHovered ? "Nenhum módulo disponível." : ""}
							</p>
						)}
					</div>
				</nav>
			</div>
		</aside>
	);
};

export default AppSidebar;
