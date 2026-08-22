"use client";
import { useEffect, useState } from "react";
import DashboardStatCards from "@/components/dashboard/DashboardStatCards";
import FaturamentoChart from "@/components/dashboard/FaturamentoChart";
import MaisVendidos from "@/components/dashboard/MaisVendidos";

type DashboardStats = {
	vendasHoje: number;
	vendasHojeVariacao: number | null;
	faturamentoHoje: number;
	faturamentoHojeVariacao: number | null;
	totalProdutos: number;
	estoqueBaixo: number;
	aReceberHoje: number;
	aPagarHoje: number;
	faturamentoUltimos7Dias: { dia: string; faturamento: number }[];
	topProdutos: {
		nome: string;
		imagem: string | null;
		sku: string;
		quantidade: number;
		receita: number;
	}[];
};

export default function DashboardPage() {
	const [stats, setStats] = useState<DashboardStats | null>(null);
	const [erro, setErro] = useState<string | null>(null);

	useEffect(() => {
		if (!window.api?.dashboardStats) {
			setErro(
				"window.api indisponível — esta tela só carrega dados reais rodando dentro do Electron.",
			);
			return;
		}
		window.api
			.dashboardStats()
			.then((dados) => setStats(dados as DashboardStats))
			.catch((e) => setErro(e instanceof Error ? e.message : String(e)));
	}, []);

	if (erro) {
		return (
			<div className="rounded-2xl border border-warning-200 bg-warning-50 p-6 text-sm text-warning-700 dark:border-warning-800 dark:bg-warning-500/10 dark:text-warning-400">
				{erro}
			</div>
		);
	}

	if (!stats) {
		return (
			<div className="animate-pulse text-sm text-gray-400">
				Carregando dashboard...
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
				<div className="lg:col-span-2">
					<DashboardStatCards stats={stats} />
				</div>
				<MaisVendidos produtos={stats.topProdutos} />
			</div>
			<FaturamentoChart dados={stats.faturamentoUltimos7Dias} />
		</div>
	);
}
