"use client";
import { formatarMoeda } from "@/components/dashboard/formatos";
import PeriodoRelatorioControles, {
	type PeriodoRelatorio,
} from "@/components/relatorios/PeriodoRelatorioControles";
import type {
	FluxoCaixa,
	FluxoCaixaGrupo,
	RelatorioFluxoCaixaResultado,
} from "@/lib/erpApi";

function formatarData(data: string): string {
	try {
		return new Date(`${data.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
	} catch {
		return data;
	}
}

function origemTexto(origem: string): string {
	return (
		{
			venda: "Venda",
			manual: "Manual",
			compra: "Compra",
			recorrente: "Recorrente",
			devolucao: "Devolução",
			importacao_migracao: "Importação",
			importacao_financeiro_historico: "Histórico financeiro",
		}[origem] || origem
	);
}

const CORES_CARD: Record<string, string> = {
	success: "text-success-600 dark:text-success-400",
	error: "text-error-600 dark:text-error-400",
	primary: "text-brand-600 dark:text-brand-400",
	warning: "text-warning-600 dark:text-warning-400",
};

function TabelaDias({ dados, titulo }: { dados: FluxoCaixa; titulo: string }) {
	const maiorMovimento = Math.max(
		1,
		...dados.dias.map((dia) => Math.max(dia.entradas, dia.saidas)),
	);

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
					{titulo}
				</h3>
				<span className="text-xs text-gray-400">
					{formatarData(dados.periodo.inicio)} — {formatarData(dados.periodo.fim)}
				</span>
			</div>
			{dados.dias.length === 0 ? (
				<div className="py-6 text-center text-sm text-gray-400">
					Nenhuma movimentação nesse período.
				</div>
			) : (
				<div className="mt-3 overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-gray-100 dark:border-gray-800">
								{["Data", "Movimento", "Entradas", "Saídas", "Saldo", "Acumulado"].map(
									(coluna) => (
										<th
											key={coluna}
											className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400"
										>
											{coluna}
										</th>
									),
								)}
							</tr>
						</thead>
						<tbody>
							{dados.dias.map((dia) => (
								<tr
									key={dia.dia}
									className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
								>
									<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
										{formatarData(dia.dia)}
									</td>
									<td className="min-w-[150px] px-3 py-2">
										<div className="flex h-1.5 gap-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
											<div
												className="bg-success-500"
												style={{
													width: `${(dia.entradas / maiorMovimento) * 100}%`,
												}}
											/>
											<div
												className="bg-error-500"
												style={{
													width: `${(dia.saidas / maiorMovimento) * 100}%`,
												}}
											/>
										</div>
									</td>
									<td className="whitespace-nowrap px-3 py-2 text-right text-success-600 dark:text-success-400">
										{formatarMoeda(dia.entradas)}
									</td>
									<td className="whitespace-nowrap px-3 py-2 text-right text-error-600 dark:text-error-400">
										{formatarMoeda(dia.saidas)}
									</td>
									<td className="whitespace-nowrap px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-200">
										{formatarMoeda(dia.saldo)}
									</td>
									<td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-gray-800 dark:text-white/90">
										{formatarMoeda(dia.saldoAcumulado)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

function TabelaGrupos({
	titulo,
	grupos,
}: {
	titulo: string;
	grupos: FluxoCaixaGrupo[];
}) {
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
				{titulo}
			</h3>
		{grupos.length === 0 ? (
				<div className="py-5 text-sm text-gray-400">Sem dados para agrupar.</div>
			) : (
				<div className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
					{grupos.map((grupo) => (
						<div
							key={grupo.chave}
							className="flex items-center justify-between gap-3 py-2 text-sm"
						>
							<div>
								<div className="font-medium text-gray-700 dark:text-gray-200">
									{origemTexto(grupo.chave)}
								</div>
								<div className="text-xs text-gray-400">
									{grupo.quantidade} movimento(s)
								</div>
							</div>
							<div className="text-right">
								<div className="font-semibold text-gray-800 dark:text-white/90">
									{formatarMoeda(grupo.saldo)}
								</div>
								<div className="text-xs text-gray-400">
									+ {formatarMoeda(grupo.entradas)} / − {formatarMoeda(grupo.saidas)}
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export default function PainelFluxoCaixa({
	dados,
	dataInicio,
	setDataInicio,
	dataFim,
	setDataFim,
	onGerar,
	carregando,
}: {
	dados: RelatorioFluxoCaixaResultado | null;
	dataInicio: string;
	setDataInicio: (valor: string) => void;
	dataFim: string;
	setDataFim: (valor: string) => void;
	onGerar: (periodo: PeriodoRelatorio) => void;
	carregando: boolean;
}) {
	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<PeriodoRelatorioControles
					dataInicio={dataInicio}
					setDataInicio={setDataInicio}
					dataFim={dataFim}
					setDataFim={setDataFim}
					onAplicar={onGerar}
					carregando={carregando}
					idBase="fluxo-caixa"
				/>
			</div>

			{!dados ? (
				<div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]">
					Nenhum relatório de fluxo disponível para o período.
				</div>
			) : (
				<>
					<div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-700 dark:border-brand-800 dark:bg-brand-500/10 dark:text-brand-300">
						Este relatório mostra movimento de caixa, não lucro, DRE ou
						faturamento. O realizado e o projetado usam períodos e eventos separados.
					</div>

					<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						{[
							["Entradas realizadas", dados.realizado.totalEntradas, "success"],
							["Saídas realizadas", dados.realizado.totalSaidas, "error"],
							["Saldo realizado", dados.realizado.saldo, "primary"],
							["Saldo projetado", dados.projetado.saldo, "warning"],
						].map(([label, valor, cor]) => (
							<div
								key={String(label)}
								className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
							>
								<div
									className={`text-xl font-semibold ${CORES_CARD[String(cor)]}`}
								>
									{formatarMoeda(Number(valor))}
								</div>
								<div className="text-xs text-gray-500 dark:text-gray-400">
									{label}
								</div>
							</div>
						))}
					</div>

					<TabelaDias dados={dados.realizado} titulo="Movimento realizado por dia" />
					<TabelaDias dados={dados.projetado} titulo="Movimento projetado por vencimento" />

					<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
						<TabelaGrupos titulo="Por origem" grupos={dados.realizado.porOrigem} />
						<TabelaGrupos titulo="Por tipo" grupos={dados.realizado.porTipo} />
						<TabelaGrupos titulo="Por categoria" grupos={dados.realizado.porCategoria} />
					</div>

					<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
						<h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
							Detalhamento dos eventos realizados
						</h3>
						{dados.realizado.eventos.length === 0 ? (
							<div className="py-5 text-sm text-gray-400">
								Nenhum evento realizado para detalhar.
							</div>
						) : (
							<div className="mt-3 overflow-x-auto">
								<table className="w-full text-left text-sm">
									<thead>
										<tr className="border-b border-gray-100 dark:border-gray-800">
											{["Data", "Tipo", "Origem", "Descrição", "Categoria", "Valor"].map(
												(coluna) => (
													<th
														key={coluna}
														className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400"
													>
														{coluna}
													</th>
												),
											)}
										</tr>
									</thead>
									<tbody>
										{dados.realizado.eventos.map((evento) => (
											<tr
												key={`${evento.data}-${evento.tipo}-${evento.origem}-${evento.referenciaId}-${evento.descricao}`}
												className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
											>
												<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
													{formatarData(evento.data)}
												</td>
												<td className="px-3 py-2">
													{evento.tipo === "entrada" ? "Entrada" : "Saída"}
												</td>
												<td className="px-3 py-2 text-gray-500 dark:text-gray-400">
													{origemTexto(evento.origem)}
												</td>
												<td className="px-3 py-2 font-medium text-gray-800 dark:text-white/90">
													{evento.descricao}
												</td>
												<td className="px-3 py-2 text-gray-500 dark:text-gray-400">
													{evento.categoria || "Sem categoria"}
												</td>
												<td
													className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${evento.tipo === "entrada" ? "text-success-600 dark:text-success-400" : "text-error-600 dark:text-error-400"}`}
												>
													{evento.tipo === "entrada" ? "+ " : "− "}
													{formatarMoeda(evento.valor)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>

					<details className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
						<summary className="cursor-pointer text-sm font-semibold text-gray-800 dark:text-white/90">
							O que entra neste cálculo?
						</summary>
						<ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-500 dark:text-gray-400">
							{dados.politica.map((texto) => (
								<li key={texto}>{texto}</li>
							))}
						</ul>
					</details>
				</>
			)}
		</div>
	);
}
