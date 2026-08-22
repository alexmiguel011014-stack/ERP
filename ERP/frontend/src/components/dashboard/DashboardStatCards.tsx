"use client";
import React from "react";
import Badge from "../ui/badge/Badge";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	BoxIcon,
	DollarLineIcon,
	AlertIcon,
} from "@/icons";
import { formatarMoeda, formatarPercentual } from "./formatos";

type DashboardStats = {
	vendasHoje: number;
	vendasHojeVariacao: number | null;
	faturamentoHoje: number;
	faturamentoHojeVariacao: number | null;
	totalProdutos: number;
	estoqueBaixo: number;
	aReceberHoje: number;
	aPagarHoje: number;
};

function Variacao({ valor }: { valor: number | null }) {
	if (valor === null) return null;
	return (
		<Badge size="sm" color={valor >= 0 ? "success" : "error"}>
			{valor >= 0 ? <ArrowUpIcon /> : <ArrowDownIcon />}
			{formatarPercentual(valor)}
		</Badge>
	);
}

function CardBase({
	icone,
	label,
	valor,
	variacao,
	corIcone = "primary",
}: {
	icone: React.ReactNode;
	label: string;
	valor: string;
	variacao?: number | null;
	corIcone?: "primary" | "success" | "error" | "warning";
}) {
	const fundoIcone: Record<string, string> = {
		primary: "bg-brand-500 text-white",
		success: "bg-success-500 text-white",
		error: "bg-error-500 text-white",
		warning: "bg-warning-500 text-white",
	};
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-3.5 dark:border-gray-800 dark:bg-white/[0.03]">
			<div className="flex items-center gap-2">
				<div
					className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${fundoIcone[corIcone]}`}
				>
					{icone}
				</div>
				<span className="truncate text-xs text-gray-500 dark:text-gray-400">
					{label}
				</span>
			</div>
			<div className="mt-2 flex items-end justify-between gap-2">
				<h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">
					{valor}
				</h4>
				{variacao !== undefined && <Variacao valor={variacao} />}
			</div>
		</div>
	);
}

export default function DashboardStatCards({
	stats,
}: {
	stats: DashboardStats;
}) {
	return (
		<div className="grid grid-cols-2 gap-3">
			<CardBase
				icone={<BoxIcon className="size-4" />}
				label="Vendas hoje"
				valor={String(stats.vendasHoje)}
				variacao={stats.vendasHojeVariacao}
			/>
			<CardBase
				icone={<DollarLineIcon className="size-4" />}
				label="Faturamento hoje"
				valor={formatarMoeda(stats.faturamentoHoje)}
				variacao={stats.faturamentoHojeVariacao}
				corIcone="success"
			/>
			<CardBase
				icone={<BoxIcon className="size-4" />}
				label="Produtos"
				valor={String(stats.totalProdutos)}
			/>
			<CardBase
				icone={<AlertIcon className="size-4" />}
				label="Estoque baixo"
				valor={String(stats.estoqueBaixo)}
				corIcone="warning"
			/>
			<CardBase
				icone={<DollarLineIcon className="size-4" />}
				label="A receber"
				valor={formatarMoeda(stats.aReceberHoje)}
				corIcone="success"
			/>
			<CardBase
				icone={<DollarLineIcon className="size-4" />}
				label="A pagar"
				valor={formatarMoeda(stats.aPagarHoje)}
				corIcone="error"
			/>
		</div>
	);
}
