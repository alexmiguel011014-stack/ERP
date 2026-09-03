"use client";
import { useEffect, useState } from "react";
import { erpApi } from "@/lib/erpApi";

export default function AlertaVencimentoHoje() {
	const [total, setTotal] = useState<number | null>(null);

	useEffect(() => {
		erpApi.financeiro
			.lancamentosVencendoHoje()
			.then((linhas) => setTotal(linhas.length))
			.catch(() => setTotal(null));
	}, []);

	if (!total) return null;

	return (
		<div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-800 dark:bg-warning-500/10 dark:text-warning-400">
			{total === 1
				? "1 lançamento vence hoje."
				: `${total} lançamentos vencem hoje.`}
		</div>
	);
}
