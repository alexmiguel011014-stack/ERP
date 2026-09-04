"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { usePageHeader } from "@/context/PageHeaderContext";
import {
	erpApi,
	type ConflitosImportacao,
	type DetalhesLoteImportacao,
	type EntradaImportacao,
	type LinhaImportacaoVenda,
	type LoteImportacao,
	type PreviewDryRunImportacao,
	type PreviewImportacao,
	type ResultadoImportacaoLote,
	type StatusLoteImportacao,
} from "@/lib/erpApi";

type Modo = "loja_house" | "excel" | "legado";

function formatarDataHora(iso: string | null | undefined): string {
	if (!iso) return "---";
	const data = new Date(iso);
	if (Number.isNaN(data.getTime())) return iso;
	return data.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

const BADGE_POR_STATUS: Record<
	StatusLoteImportacao,
	"success" | "warning" | "error" | "info"
> = {
	sucesso: "success",
	parcial: "warning",
	erro: "error",
	em_progresso: "info",
};

const LABEL_POR_STATUS: Record<StatusLoteImportacao, string> = {
	sucesso: "Sucesso",
	parcial: "Parcial",
	erro: "Erro",
	em_progresso: "Em progresso",
};

const TITULO_POR_MODO: Record<Modo, string> = {
	loja_house: "Importação de Dados — Loja House",
	excel: "Importação de Dados — Planilha Excel",
	legado: "Importação de Vendas Históricas",
};

const DESCRICAO_POR_MODO: Record<Modo, string> = {
	loja_house:
		"Importa categorias, produtos, estoque, clientes e financeiro a partir da pasta exportada do sistema antigo.",
	excel:
		"Importa categorias, produtos, estoque e financeiro diretamente da planilha .xlsx da Loja House, sem passar pelos JSONs intermediários.",
	legado: "Popula o histórico de vendas a partir de um arquivo já normalizado.",
};

const OPCOES_MODO: { modo: Modo; rotulo: string }[] = [
	{ modo: "loja_house", rotulo: "Importação de dados (Loja House)" },
	{ modo: "excel", rotulo: "Importar de planilha Excel (.xlsx)" },
	{ modo: "legado", rotulo: "Importação de vendas históricas (legado)" },
];

export default function ImportacaoPage() {
	const [modo, setModo] = useState<Modo>("loja_house");

	usePageHeader(TITULO_POR_MODO[modo], DESCRICAO_POR_MODO[modo]);

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="flex flex-wrap gap-2">
				{OPCOES_MODO.map((opcao) => (
					<button
						key={opcao.modo}
						type="button"
						onClick={() => setModo(opcao.modo)}
						className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
							modo === opcao.modo
								? "bg-brand-500 text-white"
								: "bg-white text-gray-600 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03]"
						}`}
					>
						{opcao.rotulo}
					</button>
				))}
			</div>

			{modo === "legado" ? (
				<ImportacaoLegado />
			) : (
				<ImportacaoLojaHouse modo={modo} />
			)}
		</div>
	);
}

type Passo = 1 | 2 | 3;

function IndicadorPassos({ passo }: { passo: Passo }) {
	const passos: { numero: Passo; titulo: string }[] = [
		{ numero: 1, titulo: "Selecionar origem" },
		{ numero: 2, titulo: "Conferir prévia" },
		{ numero: 3, titulo: "Confirmar e importar" },
	];

	return (
		<div className="flex flex-wrap items-center gap-2 text-sm">
			{passos.map((p, i) => (
				<div key={p.numero} className="flex items-center gap-2">
					<div
						className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
							passo === p.numero
								? "bg-brand-500 text-white"
								: passo > p.numero
									? "bg-success-500 text-white"
									: "bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-gray-500"
						}`}
					>
						{p.numero}
					</div>
					<span
						className={
							passo === p.numero
								? "font-medium text-gray-800 dark:text-white/90"
								: "text-gray-400 dark:text-gray-500"
						}
					>
						{p.titulo}
					</span>
					{i < passos.length - 1 && (
						<span className="mx-1 h-px w-8 bg-gray-200 dark:bg-gray-700" />
					)}
				</div>
			))}
		</div>
	);
}

function ContagemGrid({ preview }: { preview: PreviewImportacao }) {
	const itens: { rotulo: string; valor: number }[] = [
		{ rotulo: "Categorias", valor: preview.categorias },
		{ rotulo: "Produtos", valor: preview.produtos },
		{ rotulo: "Variações", valor: preview.variacoes },
		{ rotulo: "Estoque", valor: preview.estoque },
		{ rotulo: "Clientes", valor: preview.clientes },
		{ rotulo: "Lançamentos", valor: preview.lancamentos },
		{ rotulo: "Pendências", valor: preview.pendencias },
	];

	return (
		<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
			{itens.map((item) => (
				<div
					key={item.rotulo}
					className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-800 dark:bg-white/[0.02]"
				>
					<div className="text-lg font-semibold text-gray-800 dark:text-white/90">
						{item.valor}
					</div>
					<div className="text-xs text-gray-500 dark:text-gray-400">
						{item.rotulo}
					</div>
				</div>
			))}
		</div>
	);
}

function DetalhesLote({ detalhes }: { detalhes: DetalhesLoteImportacao }) {
	return (
		<div className="space-y-2">
			<p className="break-all text-xs text-gray-500 dark:text-gray-400">
				Checksum: {detalhes.batch.checksum}
			</p>

			{detalhes.pendencias.length === 0 ? (
				<p className="text-sm text-gray-500 dark:text-gray-400">
					Nenhuma pendência neste lote.
				</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-left text-xs">
						<thead>
							<tr className="border-b border-gray-200 dark:border-gray-700">
								<th className="px-2 py-1 font-medium uppercase text-gray-400">
									Tipo
								</th>
								<th className="px-2 py-1 font-medium uppercase text-gray-400">
									Descrição
								</th>
								<th className="px-2 py-1 font-medium uppercase text-gray-400">
									Motivo
								</th>
								<th className="px-2 py-1 font-medium uppercase text-gray-400">
									Sugestão
								</th>
							</tr>
						</thead>
						<tbody>
							{detalhes.pendencias.map((p) => (
								<tr
									key={p.id}
									className="border-b border-gray-100 last:border-0 dark:border-gray-800"
								>
									<td className="px-2 py-1 text-gray-600 dark:text-gray-300">
										{p.tipo_entidade}
									</td>
									<td className="px-2 py-1 text-gray-600 dark:text-gray-300">
										{p.descricao || "---"}
									</td>
									<td className="px-2 py-1 text-gray-600 dark:text-gray-300">
										{p.motivo_rejeicao || "---"}
									</td>
									<td className="px-2 py-1 text-gray-600 dark:text-gray-300">
										{p.sugestao || "---"}
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

function HistoricoImportacoes({
	historico,
	carregando,
	erro,
	loteExpandidoId,
	detalhesLote,
	carregandoDetalhes,
	erroDetalhes,
	onSelecionarLote,
}: {
	historico: LoteImportacao[];
	carregando: boolean;
	erro: string | null;
	loteExpandidoId: string | null;
	detalhesLote: DetalhesLoteImportacao | null;
	carregandoDetalhes: boolean;
	erroDetalhes: string | null;
	onSelecionarLote: (batchId: string) => void;
}) {
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
				Histórico de importações
			</h2>
			<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
				Clique em um lote para ver as pendências geradas por ele.
			</p>

			<div className="mt-3 overflow-x-auto">
				{carregando ? (
					<div className="py-8 text-center text-sm text-gray-400">
						Carregando histórico...
					</div>
				) : erro ? (
					<div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
						{erro}
					</div>
				) : historico.length === 0 ? (
					<div className="py-8 text-center text-sm text-gray-400">
						Nenhuma importação registrada ainda.
					</div>
				) : (
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-gray-100 dark:border-gray-800">
								<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
									Data
								</th>
								<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
									Status
								</th>
								<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
									Total
								</th>
								<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
									Importados
								</th>
								<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
									Ignorados
								</th>
								<th className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">
									Erros
								</th>
							</tr>
						</thead>
						<tbody>
							{historico.map((lote) => (
								<Fragment key={lote.id}>
									<tr
										className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50 dark:border-gray-800/60 dark:hover:bg-white/5"
										onClick={() => onSelecionarLote(lote.id)}
									>
										<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
											{formatarDataHora(lote.data_importacao)}
										</td>
										<td className="whitespace-nowrap px-3 py-2">
											<Badge size="sm" color={BADGE_POR_STATUS[lote.status]}>
												{LABEL_POR_STATUS[lote.status]}
											</Badge>
										</td>
										<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
											{lote.total_itens}
										</td>
										<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
											{lote.itens_importados}
										</td>
										<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
											{lote.itens_ignorados}
										</td>
										<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
											{lote.itens_erro}
										</td>
									</tr>
									{loteExpandidoId === lote.id && (
										<tr>
											<td
												colSpan={6}
												className="bg-gray-50 px-3 py-3 dark:bg-white/[0.02]"
											>
												{carregandoDetalhes ? (
													<p className="text-sm text-gray-400">
														Carregando detalhes...
													</p>
												) : erroDetalhes ? (
													<p className="text-sm text-error-600 dark:text-error-400">
														{erroDetalhes}
													</p>
												) : detalhesLote ? (
													<DetalhesLote detalhes={detalhesLote} />
												) : null}
											</td>
										</tr>
									)}
								</Fragment>
							))}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}

function ImportacaoLojaHouse({ modo }: { modo: "loja_house" | "excel" }) {
	const [passo, setPasso] = useState<Passo>(1);
	const [carregandoSelecao, setCarregandoSelecao] = useState(false);
	const [erroSelecao, setErroSelecao] = useState<string | null>(null);

	// `origem` é o valor bruto passado pra erpApi.importacoes.executar (pasta
	// string no modo loja_house, { tipo: "excel", caminho } no modo excel).
	// `caminhoExibicao` é só o texto mostrado pro usuário — precisa existir
	// separado porque `origem` no modo excel não é uma string.
	const [origem, setOrigem] = useState<EntradaImportacao | null>(null);
	const [caminhoExibicao, setCaminhoExibicao] = useState<string | null>(null);
	const [arquivos, setArquivos] = useState<string[]>([]); // só populado no modo loja_house
	const [previewPasta, setPreviewPasta] = useState<PreviewImportacao | null>(
		null,
	);

	const [mostrarPreviaDetalhada, setMostrarPreviaDetalhada] = useState(false);
	const [carregandoPreviaDetalhada, setCarregandoPreviaDetalhada] =
		useState(false);
	const [erroPreviaDetalhada, setErroPreviaDetalhada] = useState<string | null>(
		null,
	);
	const [previaDetalhada, setPreviaDetalhada] = useState<{
		preview: PreviewDryRunImportacao;
		conflitos: ConflitosImportacao;
		checksum: string;
	} | null>(null);

	const [dataMovimentacao, setDataMovimentacao] = useState(() =>
		new Date().toISOString().slice(0, 10),
	);
	const [executando, setExecutando] = useState(false);
	const [erroExecucao, setErroExecucao] = useState<string | null>(null);
	const [resultadoFinal, setResultadoFinal] =
		useState<ResultadoImportacaoLote | null>(null);

	const [historico, setHistorico] = useState<LoteImportacao[]>([]);
	const [carregandoHistorico, setCarregandoHistorico] = useState(false);
	const [erroHistorico, setErroHistorico] = useState<string | null>(null);
	const [loteExpandidoId, setLoteExpandidoId] = useState<string | null>(null);
	const [detalhesLote, setDetalhesLote] =
		useState<DetalhesLoteImportacao | null>(null);
	const [carregandoDetalhes, setCarregandoDetalhes] = useState(false);
	const [erroDetalhes, setErroDetalhes] = useState<string | null>(null);

	const carregarHistorico = useCallback(async () => {
		setCarregandoHistorico(true);
		setErroHistorico(null);
		try {
			const linhas = await erpApi.importacoes.historico();
			setHistorico(linhas);
		} catch (e) {
			setErroHistorico(
				e instanceof Error ? e.message : "Erro ao carregar histórico.",
			);
		} finally {
			setCarregandoHistorico(false);
		}
	}, []);

	useEffect(() => {
		carregarHistorico();
	}, [carregarHistorico]);

	function resetarWizard() {
		setPasso(1);
		setOrigem(null);
		setCaminhoExibicao(null);
		setArquivos([]);
		setPreviewPasta(null);
		setErroSelecao(null);
		setMostrarPreviaDetalhada(false);
		setPreviaDetalhada(null);
		setErroPreviaDetalhada(null);
		setDataMovimentacao(new Date().toISOString().slice(0, 10));
		setErroExecucao(null);
		setResultadoFinal(null);
	}

	async function selecionarOrigem() {
		setCarregandoSelecao(true);
		setErroSelecao(null);
		try {
			if (modo === "excel") {
				const resultado = await erpApi.importacoes.validarExcel();
				if ("cancelado" in resultado) {
					return;
				}
				if ("erro" in resultado) {
					setErroSelecao(resultado.erro);
					return;
				}
				setOrigem({ tipo: "excel", caminho: resultado.caminho });
				setCaminhoExibicao(resultado.caminho);
				setArquivos([]);
				setPreviewPasta(resultado.preview);
				setPasso(2);
				return;
			}

			const resultado = await erpApi.importacoes.validarPasta();
			if ("cancelado" in resultado) {
				return;
			}
			if ("erro" in resultado) {
				setErroSelecao(resultado.erro);
				return;
			}
			setOrigem(resultado.pasta);
			setCaminhoExibicao(resultado.pasta);
			setArquivos(resultado.arquivos);
			setPreviewPasta(resultado.preview);
			setPasso(2);
		} catch (e) {
			setErroSelecao(
				e instanceof Error
					? e.message
					: modo === "excel"
						? "Erro ao selecionar a planilha."
						: "Erro ao selecionar a pasta.",
			);
		} finally {
			setCarregandoSelecao(false);
		}
	}

	async function verPreviaDetalhada() {
		if (!origem) return;
		setMostrarPreviaDetalhada((atual) => !atual);
		if (previaDetalhada) return; // já carregada nesta sessão — só alterna a exibição
		setCarregandoPreviaDetalhada(true);
		setErroPreviaDetalhada(null);
		try {
			const resultado = await erpApi.importacoes.executar(origem, {
				dryRun: true,
			});
			if ("erro" in resultado) {
				setErroPreviaDetalhada(resultado.erro);
				return;
			}
			if ("dryRun" in resultado) {
				setPreviaDetalhada({
					preview: resultado.preview,
					conflitos: resultado.conflitos,
					checksum: resultado.checksum,
				});
				return;
			}
			setErroPreviaDetalhada("Resposta inesperada do backend.");
		} catch (e) {
			setErroPreviaDetalhada(
				e instanceof Error ? e.message : "Erro ao gerar prévia detalhada.",
			);
		} finally {
			setCarregandoPreviaDetalhada(false);
		}
	}

	async function importarAgora() {
		if (!origem) return;
		setExecutando(true);
		setErroExecucao(null);
		try {
			const resultado = await erpApi.importacoes.executar(origem, {
				dryRun: false,
				dataMovimentacao,
			});
			if ("erro" in resultado) {
				setErroExecucao(resultado.erro);
				return;
			}
			if (!("batchId" in resultado)) {
				setErroExecucao("Resposta inesperada do backend.");
				return;
			}
			setResultadoFinal(resultado);
			carregarHistorico();
		} catch (e) {
			setErroExecucao(
				e instanceof Error ? e.message : "Erro ao executar a importação.",
			);
		} finally {
			setExecutando(false);
		}
	}

	async function alternarDetalhesLote(batchId: string) {
		if (loteExpandidoId === batchId) {
			setLoteExpandidoId(null);
			setDetalhesLote(null);
			return;
		}
		setLoteExpandidoId(batchId);
		setDetalhesLote(null);
		setErroDetalhes(null);
		setCarregandoDetalhes(true);
		try {
			const detalhes = await erpApi.importacoes.detalhes(batchId);
			setDetalhesLote(detalhes);
		} catch (e) {
			setErroDetalhes(
				e instanceof Error ? e.message : "Erro ao carregar detalhes do lote.",
			);
		} finally {
			setCarregandoDetalhes(false);
		}
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<p className="max-w-2xl text-sm text-gray-500 dark:text-gray-400">
				{modo === "excel"
					? "Importa os dados diretamente da planilha .xlsx exportada pela loja (categorias, produtos, estoque inicial e financeiro), sem passar pelos JSONs intermediários."
					: "Importa os dados exportados da Loja House (categorias, produtos e variações, estoque inicial, clientes e financeiro) a partir de uma pasta com os arquivos JSON gerados na migração."}
			</p>

			<IndicadorPassos passo={passo} />

			{passo === 1 && (
				<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
					<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
						{modo === "excel"
							? "Passo 1 — Selecionar planilha"
							: "Passo 1 — Selecionar pasta"}
					</h2>
					{modo === "excel" ? (
						<p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
							Selecione o arquivo{" "}
							<code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-white/10">
								.xlsx
							</code>{" "}
							exportado pela loja (a mesma planilha usada para gerar os JSONs da
							migração).
						</p>
					) : (
						<p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
							Selecione a pasta com os arquivos JSON exportados (
							<code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-white/10">
								01_categorias.json
							</code>
							,{" "}
							<code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-white/10">
								02_produtos_variacoes.json
							</code>{" "}
							e demais arquivos numerados da migração).
						</p>
					)}

					<div className="mt-4">
						<Button onClick={selecionarOrigem} disabled={carregandoSelecao}>
							{carregandoSelecao
								? "Selecionando..."
								: modo === "excel"
									? "Selecionar planilha..."
									: "Selecionar pasta..."}
						</Button>
					</div>

					{erroSelecao && (
						<div className="mt-4 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
							{erroSelecao}
						</div>
					)}
				</div>
			)}

			{passo === 2 && previewPasta && (
				<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
					<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
						Passo 2 — Conferir prévia
					</h2>
					<p className="mt-1 max-w-2xl break-all text-sm text-gray-500 dark:text-gray-400">
						{modo === "excel" ? "Arquivo selecionado" : "Pasta selecionada"}:{" "}
						<span className="font-medium text-gray-700 dark:text-gray-300">
							{caminhoExibicao}
						</span>
						{modo === "loja_house" && (
							<>
								{" · "}
								{arquivos.length} arquivo(s) reconhecido(s).
							</>
						)}
					</p>

					<ContagemGrid preview={previewPasta} />

					{previewPasta.pendencias > 0 && (
						<div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-800 dark:bg-warning-500/10 dark:text-orange-400">
							{previewPasta.pendencias} item(ns) serão movidos para revisão
							manual (Pendências) por não atenderem às regras de negócio.
						</div>
					)}

					<div className="mt-4">
						<button
							type="button"
							onClick={verPreviaDetalhada}
							className="text-sm font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
						>
							{mostrarPreviaDetalhada
								? "Ocultar prévia detalhada"
								: "Ver prévia detalhada (não altera o banco)"}
						</button>

						{mostrarPreviaDetalhada && (
							<div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.02]">
								{carregandoPreviaDetalhada ? (
									<p className="text-sm text-gray-500 dark:text-gray-400">
										Gerando prévia...
									</p>
								) : erroPreviaDetalhada ? (
									<p className="text-sm text-error-600 dark:text-error-400">
										{erroPreviaDetalhada}
									</p>
								) : previaDetalhada ? (
									<div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
										<p>
											Chaves já importadas anteriormente (serão ignoradas):{" "}
											<strong>
												{previaDetalhada.conflitos.duplicadasJaImportadas}
											</strong>
										</p>
										<ul className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
											<li>Categorias: {previaDetalhada.preview.categorias}</li>
											<li>Produtos: {previaDetalhada.preview.produtos}</li>
											<li>Variações: {previaDetalhada.preview.variacoes}</li>
											<li>Estoque: {previaDetalhada.preview.estoque}</li>
											<li>Clientes: {previaDetalhada.preview.clientes}</li>
											<li>
												Financeiro (histórico):{" "}
												{previaDetalhada.preview.lancamentosHistoricos}
											</li>
											<li>
												Contas em aberto:{" "}
												{previaDetalhada.preview.contasAbertas}
											</li>
											<li>
												Vendas históricas:{" "}
												{previaDetalhada.preview.vendasHistoricas}
											</li>
											<li>
												Pendências de origem:{" "}
												{previaDetalhada.preview.pendenciasOrigem}
											</li>
										</ul>
										<p className="break-all text-xs text-gray-400">
											Checksum: {previaDetalhada.checksum}
										</p>
									</div>
								) : null}
							</div>
						)}
					</div>

					<div className="mt-6 flex gap-2">
						<Button variant="outline" onClick={resetarWizard}>
							Cancelar
						</Button>
						<Button onClick={() => setPasso(3)}>Confirmar Importação</Button>
					</div>
				</div>
			)}

			{passo === 3 && previewPasta && !resultadoFinal && (
				<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
					<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
						Passo 3 — Confirmar e importar
					</h2>
					<p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
						Confira o resumo abaixo antes de importar. Essa ação grava os dados
						no banco.
					</p>

					<ContagemGrid preview={previewPasta} />

					<div className="mt-4 max-w-xs">
						<Label>Data da movimentação de estoque</Label>
						<Input
							type="date"
							value={dataMovimentacao}
							onChange={(e) => setDataMovimentacao(e.target.value)}
						/>
					</div>

					{erroExecucao && (
						<div className="mt-4 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
							{erroExecucao}
						</div>
					)}

					<div className="mt-6 flex gap-2">
						<Button
							variant="outline"
							onClick={() => setPasso(2)}
							disabled={executando}
						>
							Voltar
						</Button>
						<Button onClick={importarAgora} disabled={executando}>
							{executando ? (
								<>
									<span className="inline-block size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
									Importando...
								</>
							) : (
								"Importar Agora"
							)}
						</Button>
					</div>
				</div>
			)}

			{resultadoFinal && (
				<div className="rounded-xl border border-success-200 bg-success-50 p-4 dark:border-success-800 dark:bg-success-500/10">
					<h2 className="text-base font-semibold text-success-700 dark:text-success-400">
						Importação concluída
					</h2>
					<p className="mt-1 break-all text-sm text-success-700 dark:text-success-400">
						Lote <span className="font-mono">{resultadoFinal.batchId}</span>
					</p>

					<ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700 dark:text-gray-300 sm:grid-cols-3">
						<li>Categorias: {resultadoFinal.importadas.categorias}</li>
						<li>Produtos: {resultadoFinal.importadas.produtos}</li>
						<li>Variações: {resultadoFinal.importadas.variacoes}</li>
						<li>Estoque: {resultadoFinal.importadas.estoque}</li>
						<li>Clientes: {resultadoFinal.importadas.clientes}</li>
						<li>Lançamentos: {resultadoFinal.importadas.lancamentos}</li>
					</ul>

					<p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
						Ignoradas (já importadas antes): {resultadoFinal.ignoradas}
						{" · "}
						Pendências criadas: {resultadoFinal.pendencias}
					</p>

					{resultadoFinal.erros.length > 0 && (
						<div className="mt-3">
							<p className="text-sm font-medium text-error-600 dark:text-error-400">
								{resultadoFinal.erros.length} erro(s) durante a importação:
							</p>
							<ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-xs text-error-600 dark:text-error-400">
								{resultadoFinal.erros.map((erro, i) => (
									<li key={i}>
										{erro.chave_externa}: {erro.motivo}
									</li>
								))}
							</ul>
						</div>
					)}

					<div className="mt-4">
						<Button onClick={resetarWizard}>Nova importação</Button>
					</div>
				</div>
			)}

			<HistoricoImportacoes
				historico={historico}
				carregando={carregandoHistorico}
				erro={erroHistorico}
				loteExpandidoId={loteExpandidoId}
				detalhesLote={detalhesLote}
				carregandoDetalhes={carregandoDetalhes}
				erroDetalhes={erroDetalhes}
				onSelecionarLote={alternarDetalhesLote}
			/>
		</div>
	);
}

function validarFormatoVendas(dados: unknown): string | null {
	if (!Array.isArray(dados))
		return "O arquivo precisa conter uma lista (array) de vendas.";
	if (dados.length === 0) return "A lista está vazia.";
	for (let i = 0; i < dados.length; i++) {
		const l = dados[i] as Partial<LinhaImportacaoVenda> | null;
		if (!l || typeof l !== "object") return `Linha ${i + 1} inválida.`;
		if (!l.sku || !l.quantidade || l.valorUnitario === undefined || !l.data) {
			return `Linha ${i + 1} está com campos faltando (sku, quantidade, valorUnitario, data).`;
		}
	}
	return null;
}

function ImportacaoLegado() {
	const inputRef = useRef<HTMLInputElement>(null);
	const [linhas, setLinhas] = useState<LinhaImportacaoVenda[] | null>(null);
	const [previa, setPrevia] = useState("");
	const [mensagem, setMensagem] = useState<{
		texto: string;
		tipo: "sucesso" | "erro";
	} | null>(null);
	const [importando, setImportando] = useState(false);

	function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
		setLinhas(null);
		setPrevia("");
		setMensagem(null);
		const arquivo = e.target.files?.[0];
		if (!arquivo) return;

		const leitor = new FileReader();
		leitor.onload = () => {
			let dados: unknown;
			try {
				dados = JSON.parse(String(leitor.result));
			} catch {
				setMensagem({ texto: "Arquivo não é um JSON válido.", tipo: "erro" });
				return;
			}
			const erroFormato = validarFormatoVendas(dados);
			if (erroFormato) {
				setMensagem({ texto: erroFormato, tipo: "erro" });
				return;
			}
			const validas = dados as LinhaImportacaoVenda[];
			setLinhas(validas);
			setPrevia(
				`${validas.length} linha(s) reconhecida(s) no arquivo. Linhas com SKU não cadastrado serão puladas na importação.`,
			);
		};
		leitor.onerror = () => {
			setMensagem({ texto: "Erro ao ler o arquivo.", tipo: "erro" });
		};
		leitor.readAsText(arquivo);
	}

	async function confirmarImportacao() {
		if (!linhas) return;
		if (
			!confirm(
				`Importar ${linhas.length} linha(s) de venda histórica? Essa ação não altera o estoque atual.`,
			)
		)
			return;
		setImportando(true);
		try {
			const resultado = await erpApi.vendas.importarHistorico(linhas);
			setMensagem({
				texto: `Importação concluída: ${resultado.importadas} venda(s) importada(s), ${resultado.puladas} pulada(s) de ${resultado.total} linha(s) no total.`,
				tipo: "sucesso",
			});
			setLinhas(null);
			setPrevia("");
			if (inputRef.current) inputRef.current.value = "";
		} catch (e) {
			setMensagem({
				texto:
					"Erro ao importar: " + (e instanceof Error ? e.message : String(e)),
				tipo: "erro",
			});
		} finally {
			setImportando(false);
		}
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<p className="max-w-2xl text-sm text-gray-500 dark:text-gray-400">
				Popula o histórico de vendas a partir de um arquivo já normalizado, para
				que o cálculo automático de Custos Fixos e outros relatórios tenham dado
				real desde já — sem esperar um mês de uso do sistema.
			</p>

			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
					Selecionar arquivo
				</h2>
				<p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
					Arquivo <strong>.json</strong> com uma lista de vendas já tratadas, no
					formato:{" "}
					<code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-white/10">
						{
							'[{"sku": "P0001", "quantidade": 2, "valorUnitario": 150.00, "data": "2026-05-10"}, ...]'
						}
					</code>
					. Linhas com SKU não cadastrado são puladas automaticamente — esse
					tratamento de dado (mapear planilha, corrigir SKU, etc.) é feito
					antes, fora do ERP.
				</p>

				<div className="mt-4 max-w-md">
					<input
						ref={inputRef}
						type="file"
						accept="application/json,.json"
						onChange={handleArquivo}
						className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-600 hover:file:bg-brand-100 dark:text-gray-300 dark:file:bg-brand-500/10 dark:file:text-brand-400"
					/>
				</div>

				{previa && (
					<p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
						{previa}
					</p>
				)}

				<div className="mt-4">
					<Button
						onClick={confirmarImportacao}
						disabled={!linhas || importando}
					>
						{importando ? "Importando..." : "Confirmar Importação"}
					</Button>
				</div>
			</div>

			{mensagem && (
				<div
					className={
						mensagem.tipo === "sucesso"
							? "rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-700 dark:border-success-800 dark:bg-success-500/10 dark:text-success-400"
							: "rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400"
					}
				>
					{mensagem.texto}
				</div>
			)}
		</div>
	);
}
