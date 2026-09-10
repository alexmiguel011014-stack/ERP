export {};

type SessaoAuth = {
	autenticado: boolean;
	perfil?: "admin" | "dono" | "vendedor";
	permissoes?: Record<string, boolean>;
	usuario?: { id: number; login: string; nome: string };
};

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
	versao: string;
	tipo: "pagina" | "workspace-dashboard";
	entrada: string | null;
	permissao:
		| { tipo: "sempre" }
		| { tipo: "admin" }
		| { tipo: "modulo"; nomeModulo: string };
	navbar: ManifestoNavbar | null;
};

type DashboardStats = {
	vendasHoje: number;
	vendasHojeVariacao: number | null;
	faturamentoHoje: number;
	faturamentoHojeVariacao: number | null;
	totalProdutos: number;
	estoqueBaixo: number;
	aReceberHoje: number;
	aPagarHoje: number;
	topProdutos: {
		nome: string;
		imagem: string | null;
		sku: string;
		quantidade: number;
		receita: number;
	}[];
};

type EscopoPeriodo = "7d" | "1m" | "6m" | "1a" | "5a" | "tudo";

type FaturamentoPorPeriodo = {
	granularidade: "dia" | "semana" | "mes";
	dados: { periodo: string; faturamento: number }[];
};

declare global {
	interface Window {
		api?: Record<string, (...args: unknown[]) => Promise<unknown>> & {
			getAuthSession?: () => Promise<SessaoAuth>;
			unlockWithProfile?: (
				login: string,
				senha: string,
			) => Promise<{ usuario: { perfil: string } }>;
			logout?: () => Promise<{ success: boolean }>;
			getModulosCarregados?: () => Promise<ManifestoModulo[]>;
			dashboardStats?: () => Promise<DashboardStats>;
			dashboardFaturamentoPeriodo?: (
				range: EscopoPeriodo,
			) => Promise<FaturamentoPorPeriodo>;
		};
	}
}
