"use client";

import Footer from "@/components/footer/Footer";
import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/context/AuthContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { isExpanded, isHovered, isMobileOpen } = useSidebar();
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

	// Dynamic class for main content margin based on sidebar state
	const mainContentMargin = isMobileOpen
		? "ml-0"
		: isExpanded || isHovered
			? "lg:ml-[290px]"
			: "lg:ml-[90px]";

	return (
		<div className="min-h-screen xl:flex">
			{/* Sidebar and Backdrop */}
			<AppSidebar />
			<Backdrop />
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
