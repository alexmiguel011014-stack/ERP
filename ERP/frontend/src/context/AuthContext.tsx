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
	// Avatar do usuário logado — ver frontend/src/lib/avatarCores.ts.
	corAvatar?: string | null;
	foto?: string | null;
};

type Sessao = {
	autenticado: boolean;
	perfil?: "admin" | "dono" | "vendedor";
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
	// Recarrega a sessão sem logout/login — usado depois de salvar cor/foto do
	// avatar (MeuPerfilModal) pra o header refletir a mudança na hora.
	refreshSessao: () => Promise<void>;
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

// "dono" tem o mesmo nível de acesso de "admin" em todo o app — mesmo par de
// perfis que main.js#ehNivelAdmin aceita pro gate real no IPC. Isso aqui é só
// o espelho cosmético (enforcement de verdade continua 100% no IPC).
function ehNivelAdmin(sessao: Sessao) {
	return sessao.perfil === "admin" || sessao.perfil === "dono";
}

function calcularPodeModulo(sessao: Sessao) {
	const nivelAdmin = ehNivelAdmin(sessao);
	const permissoes = sessao.permissoes || {};
	return (modulo: string) => nivelAdmin || permissoes[modulo] === true;
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

	const isAdmin = ehNivelAdmin(sessao);

	return (
		<AuthContext.Provider
			value={{
				sessao,
				carregando,
				isAdmin,
				podeModulo: calcularPodeModulo(sessao),
				login,
				logout,
				refreshSessao: buscarSessao,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
};
