"use client";
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
	hrefDoModulo,
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
	abaAtivaId: string | null;
	fecharAba: (id: string) => void;
};

const TabsContext = createContext<TabsContextType | undefined>(undefined);

const CHAVE_ABAS = "app_abas_abertas";

type AbasSalvas = { abas: Aba[]; abaAtivaId: string | null };

function carregarAbasSalvas(): AbasSalvas | null {
	if (typeof window === "undefined") return null;
	try {
		const bruto = window.localStorage.getItem(CHAVE_ABAS);
		return bruto ? JSON.parse(bruto) : null;
	} catch {
		return null;
	}
}

export function TabsProvider({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	const router = useRouter();
	const modulos = useModulosPermitidos();
	const [abas, setAbas] = useState<Aba[]>([]);
	const [abaAtivaId, setAbaAtivaId] = useState<string | null>(null);
	const [carregado, setCarregado] = useState(false);

	// Restaura a sessão de abas salva — igual "voltou de onde parou" que o
	// resto do app já faz pra formulários, agora pras abas em si. Se a aba
	// que estava ativa não é a raiz "/" (onde o Electron sempre abre), navega
	// pra ela; o efeito de auto-registro abaixo então reconhece a rota nova
	// e sincroniza abaAtivaId sozinho.
	useEffect(() => {
		const salvo = carregarAbasSalvas();
		if (salvo && salvo.abas.length > 0) {
			setAbas(salvo.abas);
			const ativa = salvo.abas.find((a) => a.id === salvo.abaAtivaId);
			if (ativa && ativa.href !== normalizarPathname(pathname)) {
				router.replace(ativa.href);
			} else if (ativa) {
				setAbaAtivaId(ativa.id);
			}
		}
		setCarregado(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Auto-registra uma aba toda vez que a rota muda pra um módulo válido —
	// nenhum clique da sidebar precisa chamar isso explicitamente, então
	// nenhuma navegação (inclusive um link fora da sidebar) pode driblar o
	// registro por engano.
	useEffect(() => {
		if (modulos.length === 0) return; // manifesto ainda não carregou
		const rota = normalizarPathname(pathname);
		const modulo = modulos.find((m) => hrefDoModulo(m) === rota);
		if (!modulo) return; // rota fora do conjunto tabável (ex: /signin)
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

	useEffect(() => {
		if (!carregado) return;
		try {
			const dados: AbasSalvas = { abas, abaAtivaId };
			window.localStorage.setItem(CHAVE_ABAS, JSON.stringify(dados));
		} catch {
			// localStorage indisponível — só significa que as abas não
			// sobrevivem a um restart, não é motivo pra quebrar o app.
		}
	}, [abas, abaAtivaId, carregado]);

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
		<TabsContext.Provider value={{ abas, abaAtivaId, fecharAba }}>
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
