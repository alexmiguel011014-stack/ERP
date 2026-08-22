"use client";

import type React from "react";
import {
	createContext,
	useState,
	useContext,
	useEffect,
	useCallback,
} from "react";

type Usuario = {
	id: number;
	login: string;
	nome: string;
};

type Sessao = {
	autenticado: boolean;
	perfil?: "admin" | "vendedor";
	permissoes?: Record<string, boolean>;
	usuario?: Usuario;
};

type AuthContextType = {
	sessao: Sessao;
	carregando: boolean;
	isAdmin: boolean;
	podeModulo: (modulo: string) => boolean;
	login: (loginUsuario: string, senha: string) => Promise<void>;
	logout: () => Promise<void>;
};

const SESSAO_DESLOGADA: Sessao = { autenticado: false };

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
};

// Mesma lógica de modules/core/navbar.js (isAdmin || permissoes[modulo] === true)
// — mantida em paralelo aqui de propósito: o enforcement real continua 100% no
// IPC (ver docs do plano de migração), isso aqui é só o mesmo espelho
// cosmético que a sidebar vanilla já faz.
function calcularPodeModulo(sessao: Sessao) {
	const isAdmin = sessao.perfil === "admin";
	const permissoes = sessao.permissoes || {};
	return (modulo: string) => isAdmin || permissoes[modulo] === true;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const [sessao, setSessao] = useState<Sessao>(SESSAO_DESLOGADA);
	const [carregando, setCarregando] = useState(true);

	const buscarSessao = useCallback(async () => {
		if (!window.api?.getAuthSession) {
			setCarregando(false);
			return;
		}
		try {
			const resultado = (await window.api.getAuthSession()) as Sessao;
			setSessao(resultado || SESSAO_DESLOGADA);
		} catch {
			setSessao(SESSAO_DESLOGADA);
		} finally {
			setCarregando(false);
		}
	}, []);

	useEffect(() => {
		buscarSessao();
	}, [buscarSessao]);

	const login = useCallback(
		async (loginUsuario: string, senha: string) => {
			if (!window.api?.unlockWithProfile) {
				throw new Error("window.api indisponível — rodando fora do Electron?");
			}
			await window.api.unlockWithProfile(loginUsuario, senha);
			await buscarSessao();
		},
		[buscarSessao],
	);

	const logout = useCallback(async () => {
		if (window.api?.logout) {
			await window.api.logout();
		}
		setSessao(SESSAO_DESLOGADA);
	}, []);

	const isAdmin = sessao.perfil === "admin";

	return (
		<AuthContext.Provider
			value={{
				sessao,
				carregando,
				isAdmin,
				podeModulo: calcularPodeModulo(sessao),
				login,
				logout,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
};
