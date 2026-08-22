"use client";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { formatarMoeda } from "./formatos";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
	ssr: false,
});

type Ponto = { dia: string; faturamento: number };

function formatarDiaCurto(iso: string): string {
	const [, mes, dia] = iso.split("-");
	return `${dia}/${mes}`;
}

export default function FaturamentoChart({ dados }: { dados: Ponto[] }) {
	const options: ApexOptions = {
		colors: ["#00006b"],
		chart: {
			fontFamily: "Outfit, sans-serif",
			type: "bar",
			height: 190,
			toolbar: { show: false },
		},
		plotOptions: {
			bar: {
				horizontal: false,
				columnWidth: "45%",
				borderRadius: 5,
				borderRadiusApplication: "end",
			},
		},
		dataLabels: { enabled: false },
		stroke: { show: true, width: 4, colors: ["transparent"] },
		xaxis: {
			categories: dados.map((p) => formatarDiaCurto(p.dia)),
			axisBorder: { show: false },
			axisTicks: { show: false },
		},
		grid: { yaxis: { lines: { show: true } } },
		fill: { opacity: 1 },
		tooltip: {
			y: { formatter: (val: number) => formatarMoeda(val) },
		},
	};
	const series = [
		{ name: "Faturamento", data: dados.map((p) => p.faturamento) },
	];

	return (
		<div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
				Faturamento — últimos 7 dias
			</h3>
			<div className="max-w-full overflow-x-auto custom-scrollbar">
				<div className="-ml-4 min-w-[500px] xl:min-w-full pl-2">
					<ReactApexChart
						options={options}
						series={series}
						type="bar"
						height={190}
					/>
				</div>
			</div>
		</div>
	);
}
