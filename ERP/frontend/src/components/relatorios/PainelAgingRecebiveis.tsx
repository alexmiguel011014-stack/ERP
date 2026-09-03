"use client";
import type { AgingGrupo, AgingRecebiveisResultado } from "@/lib/erpApi";
import { formatarMoeda } from "./formatos";

const GRUPOS: {
	chave: keyof AgingRecebiveisResultado;
	rotulo: string;
	cor: string;
}[] = [
	{
		chave: "aVencer",
		rotulo: "A vencer",
		cor: "text-gray-800 dark:text-white/90",
	},
	{
		chave: "atraso0a30",
		rotulo: "1-30 dias",
		cor: "text-warning-600 dark:text-warning-400",
	},
	{
		chave: "atraso31a60",
		rotulo: "31-60 dias",
		cor: "text-warning-600 dark:text-warning-400",
	},
	{
		chave: "atraso61a90",
		rotulo: "61-90 dias",
		cor: "text-error-600 dark:text-error-400",
	},
	{
		chave: "atraso90mais",
		rotulo: "90+ dias",
		cor: "text-error-600 dark:text-error-400",
	},
];

export default function PainelAgingRecebiveis({
	dados,
}: {
	dados: AgingRecebiveisResultado | null;
}) {
	if (!dados) return null;

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
				Aging de Recebíveis
			</h3>
			<p className="mt-1 text-xs text-gray-400">
				Contas a receber em aberto, por tempo desde o vencimento — inclui o
				crediário (venda Fiado) já lançado automaticamente.
			</p>
			<div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
				{GRUPOS.map((g) => {
					const grupo = dados[g.chave] as AgingGrupo;
					return (
						<div key={g.chave} className="text-center">
							<div className={`text-lg font-semibold ${g.cor}`}>
								{formatarMoeda(grupo.total)}
							</div>
							<div className="text-xs text-gray-500 dark:text-gray-400">
								{g.rotulo} ({grupo.quantidade})
							</div>
						</div>
					);
				})}
			</div>
			<p className="mt-4 text-sm font-medium text-gray-800 dark:text-white/90">
				Total em aberto: {formatarMoeda(dados.totalGeral)}
			</p>
		</div>
	);
}
