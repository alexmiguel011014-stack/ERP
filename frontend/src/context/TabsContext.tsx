"use client";
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
	hrefDoModulo,
	moduloDaRota,
	normalizarPathname,
	useModulosPermitidos,
} from "@/hooks/useModulos";

export type Aba = {
	id: string; // = id do módulo no manifesto
	titulo: string;
	href: string;
	icone: string;
};

type TabsContextType = {
	abas: Aba[];
	// null quando a rota atual não é de nenhum módulo (ex.: /categorias) —
	// AbasHost usa isso pra cair no conteúdo normal do Next nesse caso.
	abaAtivaId: string | null;
	// false enquanto o manifesto de módulos ainda não chegou do IPC.
	pronto: boolean;
	fecharAba: (id: string) => void;
};

const TabsContext = createContext<TabsContextType | undefined>(undefined);

export function TabsProvider({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	const router = useRouter();
	const modulos = useModulosPermitidos();
	const [abas, setAbas] = useState<Aba[]>([]);
	const [abaAtivaId, setAbaAtivaId] = useState<string | null>(null);

	// Limpa a chave da antiga persistência de abas entre sessões (removida —
	// só existe pra não deixar lixo esquecido no localStorage de quem já tinha).
	useEffect(() => {
		try {
			window.localStorage.removeItem("app_abas_abertas");
		} catch {
			// localStorage indisponível — nada a limpar.
		}
	}, []);

	// Auto-registra uma aba toda vez que a rota muda pra um módulo válido —
	// nenhum clique da sidebar precisa chamar isso explicitamente, então
	// nenhuma navegação (inclusive um link fora da sidebar) pode driblar o
	// registro por engano.
	useEffect(() => {
		if (modulos.length === 0) return; // manifesto ainda não carregou
		const rota = normalizarPathname(pathname);
		// moduloDaRota casa também sub-rotas ("/produtos/estoque" -> produtos):
		// a aba de um workspace é uma só, não importa em qual sub-tela esteja.
		const modulo = moduloDaRota(modulos, rota);
		if (!modulo) {
			setAbaAtivaId(null); // rota fora do conjunto tabável (ex: /categorias)
			return;
		}
		setAbas((atual) => {
			if (atual.some((a) => a.id === modulo.id)) return atual;
			return [
				...atual,
				{
					id: modulo.id,
					titulo: modulo.navbar!.label,
					href: hrefDoModulo(modulo),
					icone: modulo.navbar!.icone,
				},
			];
		});
		setAbaAtivaId(modulo.id);
	}, [pathname, modulos]);

	// Efeitos colaterais (navegação, setAbaAtivaId) ficam FORA do updater do
	// setAbas — chamá-los de dentro de um updater é impuro e o Strict Mode do
	// React invoca updaters duas vezes pra flagrar exatamente esse tipo de
	// bug (a navegação/estado disparariam duplicado).
	function fecharAba(id: string) {
		const idx = abas.findIndex((a) => a.id === id);
		if (idx === -1) return;
		const nova = abas.filter((a) => a.id !== id);
		setAbas(nova);
		if (abaAtivaId === id) {
			const proxima = nova[idx - 1] || nova[0] || null;
			if (proxima) {
				router.push(proxima.href);
			} else {
				setAbaAtivaId(null);
				router.push("/");
			}
		}
	}

	return (
		<TabsContext.Provider
			value={{ abas, abaAtivaId, pronto: modulos.length > 0, fecharAba }}
		>
			{children}
		</TabsContext.Provider>
	);
}

export function useTabs() {
	const ctx = useContext(TabsContext);
	if (!ctx) {
		throw new Error("useTabs must be used within a TabsProvider");
	}
	return ctx;
}
