"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import { useAuth } from "../context/AuthContext";
import { HorizontaLDots } from "../icons/index";

type ManifestoNavbar = {
	secao: "principal" | "gestao" | "administracao";
	label: string;
	dica?: string;
	icone: string;
	ordem: number;
	abaDashboard: boolean;
	workspaceParam?: string;
};

type ManifestoModulo = {
	id: string;
	nome: string;
	tipo: "pagina" | "workspace-dashboard";
	entrada: string | null;
	permissao:
		| { tipo: "sempre" }
		| { tipo: "admin" }
		| { tipo: "modulo"; nomeModulo: string };
	navbar: ManifestoNavbar | null;
};

const SECAO_LABEL: Record<string, string> = {
	principal: "Principal",
	gestao: "Gestão",
	administracao: "Administração",
};
const ORDEM_SECAO = ["principal", "gestao", "administracao"];

// Renderiza o SVG bruto que já vem no manifesto (modulo.json) — mesmo ícone
// usado no navbar.js vanilla, sem reconverter pra componente React um por
// um. Fonte confiável (nossos próprios arquivos, não dado de usuário).
function IconeModulo({ svg }: { svg: string }) {
	return (
		<span
			className="[&>svg]:h-[18px] [&>svg]:w-[18px]"
			dangerouslySetInnerHTML={{ __html: svg }}
		/>
	);
}

function hrefDoModulo(m: ManifestoModulo): string {
	if (m.tipo === "workspace-dashboard") {
		return `/?workspace=${m.navbar?.workspaceParam ?? m.id}`;
	}
	return `/${m.id}`;
}

const AppSidebar: React.FC = () => {
	const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
	const pathname = usePathname();
	const { sessao, isAdmin, podeModulo } = useAuth();
	const [modulos, setModulos] = useState<ManifestoModulo[]>([]);

	useEffect(() => {
		if (!window.api?.getModulosCarregados) return;
		window.api
			.getModulosCarregados()
			.then((lista) => setModulos(lista as ManifestoModulo[]))
			.catch(() => setModulos([]));
	}, []);

	function permissaoLiberada(m: ManifestoModulo) {
		if (m.permissao.tipo === "sempre") return true;
		if (m.permissao.tipo === "admin") return isAdmin;
		return podeModulo(m.permissao.nomeModulo);
	}

	const isActive = (path: string) => path === pathname;

	const secoes = ORDEM_SECAO.map((secaoId) => {
		const itens = modulos
			.filter((m) => m.navbar && m.navbar.secao === secaoId)
			.filter(permissaoLiberada)
			.sort((a, b) => (a.navbar!.ordem ?? 0) - (b.navbar!.ordem ?? 0));
		return { id: secaoId, label: SECAO_LABEL[secaoId], itens };
	}).filter((secao) => secao.itens.length > 0);

	return (
		<aside
			className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200
        ${
					isExpanded || isMobileOpen
						? "w-[290px]"
						: isHovered
							? "w-[290px]"
							: "w-[90px]"
				}
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
			onMouseEnter={() => !isExpanded && setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<div
				className={`py-5 flex items-center gap-3 ${
					!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
				}`}
			>
				<Link href="/" className="flex items-center gap-2.5">
					<span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-extrabold text-white">
						AE
					</span>
					{(isExpanded || isHovered || isMobileOpen) && (
						<span className="text-base font-bold text-gray-800 dark:text-white/90">
							ALLU ERP
						</span>
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
										!isExpanded && !isHovered
											? "lg:justify-center"
											: "justify-start"
									}`}
								>
									{isExpanded || isHovered || isMobileOpen ? (
										secao.label
									) : (
										<HorizontaLDots />
									)}
								</h2>
								<ul className="flex flex-col gap-1">
									{secao.itens.map((m) => {
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
													{(isExpanded || isHovered || isMobileOpen) && (
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
								{isExpanded || isHovered || isMobileOpen
									? "Nenhum módulo disponível."
									: ""}
							</p>
						)}
					</div>
				</nav>
			</div>
		</aside>
	);
};

export default AppSidebar;
