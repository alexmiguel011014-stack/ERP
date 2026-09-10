"use client";
import React, { createContext, useContext, useState } from "react";

// Sidebar 100% hover — sem estado de "fixada aberta" nem gaveta mobile (não
// existe mais botão hamburguer pra pilotar nenhum dos dois). Começa sempre
// recolhida (76px) e só expande enquanto o mouse está em cima.
type SidebarContextType = {
	isHovered: boolean;
	activeItem: string | null;
	openSubmenu: string | null;
	setIsHovered: (isHovered: boolean) => void;
	setActiveItem: (item: string | null) => void;
	toggleSubmenu: (item: string) => void;
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = () => {
	const context = useContext(SidebarContext);
	if (!context) {
		throw new Error("useSidebar must be used within a SidebarProvider");
	}
	return context;
};

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const [isHovered, setIsHovered] = useState(false);
	const [activeItem, setActiveItem] = useState<string | null>(null);
	const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

	const toggleSubmenu = (item: string) => {
		setOpenSubmenu((prev) => (prev === item ? null : item));
	};

	return (
		<SidebarContext.Provider
			value={{
				isHovered,
				activeItem,
				openSubmenu,
				setIsHovered,
				setActiveItem,
				toggleSubmenu,
			}}
		>
			{children}
		</SidebarContext.Provider>
	);
};
