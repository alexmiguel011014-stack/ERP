"use client";

import Footer from "@/components/footer/Footer";
import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/context/AuthContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { isHovered } = useSidebar();
	const { sessao, carregando } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (!carregando && !sessao.autenticado) {
			router.replace("/signin");
		}
	}, [carregando, sessao.autenticado, router]);

	// Evita "flash" do conteúdo protegido antes do redirect, e evita quebrar
	// quando window.api não existe (fora do Electron, ex. `next dev` no
	// browser puro) — nesse caso carregando fica false com sessao.autenticado
	// false, e o redirect acima cuida disso.
	if (carregando || !sessao.autenticado) {
		return null;
	}

	// Sidebar é 100% hover: margem do conteúdo só cresce enquanto o mouse
	// está em cima dela (ver AppSidebar.tsx / SidebarContext.tsx).
	const mainContentMargin = isHovered ? "lg:ml-[260px]" : "lg:ml-[76px]";

	return (
		<div className="min-h-screen xl:flex">
			<AppSidebar />
			{/* Main Content Area */}
			<div
				className={`flex-1 transition-all  duration-300 ease-in-out ${mainContentMargin}`}
			>
				{/* Header */}
				<AppHeader />
				{/* Page Content */}
				<div className="p-4 mx-auto max-w-(--breakpoint-2xl)">
					{children}

					<Footer />
				</div>
			</div>
		</div>
	);
}
