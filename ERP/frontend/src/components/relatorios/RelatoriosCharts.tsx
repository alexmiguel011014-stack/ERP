"use client";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { formatarMoeda } from "./formatos";
import type {
	CurvaAbcLinha,
	DreResultado,
	RelatorioVendasResultado,
} from "@/lib/erpApi";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
	ssr: false,
});

const CORES = {
	azul: "#6D28D9",
	verde: "#369929",
	vermelho: "#B91C1C",
	amarelo: "#B45309",
	cinza: "#64748B",
	paleta: [
		"#6D28D9",
		"#369929",
		"#F5B301",
		"#B91C1C",
		"#8B5CF6",
		"#0891B2",
		"#DB2777",
	],
};

function formatarDiaCurto(iso: string): string {
	const [, mes, dia] = iso.split("-");
	return `${dia}/${mes}`;
}

export function PorDiaChart({
	dados,
}: {
	dados: RelatorioVendasResultado["porDia"];
}) {
	const options: ApexOptions = {
		colors: [CORES.azul],
		chart: { type: "bar", height: 240, toolbar: { show: false } },
		plotOptions: { bar: { borderRadius: 4, columnWidth: "45%" } },
		dataLabels: { enabled: false },
		xaxis: { categories: dados.map((d) => formatarDiaCurto(d.dia)) },
		legend: { show: false },
		grid: { yaxis: { lines: { show: true } } },
		tooltip: { y: { formatter: (v: number) => formatarMoeda(v) } },
	};
	const series = [
		{ name: "Faturamento", data: dados.map((d) => d.faturamento) },
	];
	return (
		<ReactApexChart options={options} series={series} type="bar" height={240} />
	);
}

export function PorPagamentoChart({
	dados,
}: {
	dados: RelatorioVendasResultado["porPagamento"];
}) {
	const options: ApexOptions = {
		colors: CORES.paleta,
		chart: { type: "donut", height: 240 },
		labels: dados.map((p) => p.forma_pagamento),
		legend: { position: "bottom", fontSize: "12px" },
		dataLabels: { enabled: false },
		tooltip: { y: { formatter: (v: number) => formatarMoeda(v) } },
	};
	const series = dados.map((p) => p.faturamento);
	return (
		<ReactApexChart
			options={options}
			series={series}
			type="donut"
			height={240}
		/>
	);
}

export function CurvaAbcChart({ dados }: { dados: CurvaAbcLinha[] }) {
	const receitaPorClasse = { A: 0, B: 0, C: 0 };
	dados.forEach((l) => {
		receitaPorClasse[l.classe] += l.receita;
	});
	const options: ApexOptions = {
		colors: [CORES.verde, CORES.amarelo, CORES.cinza],
		chart: { type: "pie", height: 240 },
		labels: ["Classe A", "Classe B", "Classe C"],
		legend: { position: "bottom", fontSize: "12px" },
		dataLabels: { enabled: false },
		tooltip: { y: { formatter: (v: number) => formatarMoeda(v) } },
	};
	const series = [receitaPorClasse.A, receitaPorClasse.B, receitaPorClasse.C];
	return (
		<ReactApexChart options={options} series={series} type="pie" height={240} />
	);
}

export function DreChart({ dre }: { dre: DreResultado }) {
	const valores = [
		dre.receitaLiquida,
		-dre.cmv,
		-dre.despesas,
		dre.lucroLiquido,
	];
	// ApexCharts (uma única série de barras) só aplica uma cor por barra via
	// `distributed: true`.
	const options: ApexOptions = {
		chart: { type: "bar", height: 220, toolbar: { show: false } },
		plotOptions: {
			bar: { horizontal: true, borderRadius: 4, distributed: true },
		},
		dataLabels: { enabled: false },
		xaxis: {
			categories: ["Receita Líquida", "CMV", "Despesas", "Lucro Líquido"],
		},
		legend: { show: false },
		colors: [
			CORES.azul,
			CORES.vermelho,
			CORES.vermelho,
			dre.lucroLiquido >= 0 ? CORES.verde : CORES.vermelho,
		],
		tooltip: { y: { formatter: (v: number) => formatarMoeda(v) } },
	};
	const series = [{ name: "Valor", data: valores }];
	return (
		<ReactApexChart options={options} series={series} type="bar" height={220} />
	);
}
