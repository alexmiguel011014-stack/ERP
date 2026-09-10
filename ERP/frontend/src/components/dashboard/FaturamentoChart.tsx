"use client";
import { useEffect, useState } from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { formatarMoeda } from "./formatos";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
	ssr: false,
});

type EscopoPeriodo = "7d" | "1m" | "6m" | "1a" | "5a" | "tudo";
type Granularidade = "dia" | "semana" | "mes";
type Ponto = { periodo: string; faturamento: number };

const ESCOPOS: { chave: EscopoPeriodo; label: string }[] = [
	{ chave: "7d", label: "7 dias" },
	{ chave: "1m", label: "1 mês" },
	{ chave: "6m", label: "6 meses" },
	{ chave: "1a", label: "1 ano" },
	{ chave: "5a", label: "5 anos" },
	{ chave: "tudo", label: "Todo o período" },
];

const MESES_ABREV = [
	"jan",
	"fev",
	"mar",
	"abr",
	"mai",
	"jun",
	"jul",
	"ago",
	"set",
	"out",
	"nov",
	"dez",
];

function formatarPeriodo(iso: string, granularidade: Granularidade): string {
	const [ano, mes, dia] = iso.split("-");
	if (granularidade === "mes") {
		return `${MESES_ABREV[Number(mes) - 1]}/${ano.slice(2)}`;
	}
	return `${dia}/${mes}`;
}

export default function FaturamentoChart() {
	const [escopo, setEscopo] = useState<EscopoPeriodo>("7d");
	const [granularidade, setGranularidade] = useState<Granularidade>("dia");
	const [dados, setDados] = useState<Ponto[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	useEffect(() => {
		if (!window.api?.dashboardFaturamentoPeriodo) {
			setErro("window.api indisponível.");
			setCarregando(false);
			return;
		}
		let cancelado = false;
		setCarregando(true);
		window.api
			.dashboardFaturamentoPeriodo(escopo)
			.then((resultado) => {
				if (cancelado) return;
				setGranularidade(resultado.granularidade);
				setDados(resultado.dados);
				setErro(null);
			})
			.catch((e) => {
				if (cancelado) return;
				setErro(e instanceof Error ? e.message : String(e));
			})
			.finally(() => {
				if (!cancelado) setCarregando(false);
			});
		return () => {
			cancelado = true;
		};
	}, [escopo]);

	const options: ApexOptions = {
		colors: ["#00006b"],
		chart: {
			fontFamily: "Outfit, sans-serif",
			type: "area",
			height: 190,
			toolbar: { show: false },
			animations: { enabled: true },
		},
		stroke: { curve: "smooth", width: 2 },
		fill: {
			type: "gradient",
			gradient: {
				shadeIntensity: 1,
				opacityFrom: 0.4,
				opacityTo: 0,
				stops: [0, 90, 100],
			},
		},
		markers: { size: 0, hover: { size: 5 } },
		dataLabels: { enabled: false },
		xaxis: {
			categories: dados.map((p) => formatarPeriodo(p.periodo, granularidade)),
			axisBorder: { show: false },
			axisTicks: { show: false },
			tickAmount: Math.max(0, Math.min(dados.length - 1, 8)),
			labels: { rotate: 0 },
		},
		grid: {
			xaxis: { lines: { show: false } },
			yaxis: { lines: { show: true } },
		},
		tooltip: {
			y: { formatter: (val: number) => formatarMoeda(val) },
		},
	};
	const series = [
		{ name: "Faturamento", data: dados.map((p) => p.faturamento) },
	];

	const labelEscopo = ESCOPOS.find((e) => e.chave === escopo)?.label ?? "";

	return (
		<div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
					Faturamento — {labelEscopo}
				</h3>
				<div className="flex flex-wrap gap-1">
					{ESCOPOS.map((opcao) => (
						<button
							key={opcao.chave}
							type="button"
							onClick={() => setEscopo(opcao.chave)}
							className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
								opcao.chave === escopo
									? "bg-brand-500 text-white"
									: "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.05]"
							}`}
						>
							{opcao.label}
						</button>
					))}
				</div>
			</div>
			{erro ? (
				<p className="mt-4 text-sm text-warning-600 dark:text-warning-400">
					{erro}
				</p>
			) : (
				<div className="max-w-full overflow-x-auto custom-scrollbar">
					<div
						className={`-ml-4 mt-2 min-w-[500px] pl-2 xl:min-w-full ${carregando ? "opacity-50" : ""}`}
					>
						<ReactApexChart
							options={options}
							series={series}
							type="area"
							height={190}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
