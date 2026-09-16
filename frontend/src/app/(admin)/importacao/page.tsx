"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { usePageHeader } from "@/context/PageHeaderContext";
import {
	erpApi,
	type ArquivoFonteImportacao,
	type AvisoFonteImportacao,
	type ConflitosImportacao,
	type DetalhesLoteImportacao,
	type EntradaImportacao,
	type LoteImportacao,
	type PreviewDryRunImportacao,
	type PreviewImportacao,
	type ResultadoImportacaoLote,
	type StatusLoteImportacao,
	type ValidacaoArquivoExcelImportacao,
	type ValidacaoJsonImportacao,
} from "@/lib/erpApi";

type Modo = "json" | "excel";
type ValidacaoJsonOk = Extract<ValidacaoJsonImportacao, { formato: "json" }>;
type ValidacaoExcelOk = Extract<ValidacaoArquivoExcelImportacao, { formato: "excel" }>;
type ValidacaoFonte = ValidacaoJsonOk | ValidacaoExcelOk;

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

const ROTULOS_PAPEL: Record<string, string> = {
	categorias: "Categorias",
	produtosVariacoes: "Produtos e variações",
	estoqueInicial: "Estoque inicial",
	clientes: "Clientes",
	financeiroHistorico: "Financeiro histórico",
	contasAbertas: "Contas abertas",
	vendasHistoricas: "Vendas históricas",
	pendenciasOrigem: "Pendências de origem",
};

const TITULO_POR_MODO: Record<Modo, string> = {
	json: "Importação de dados — JSON",
	excel: "Importação de dados — Excel",
};

const DESCRICAO_POR_MODO: Record<Modo, string> = {
	json: "Uma única fonte para categorias, produtos, estoque, clientes, financeiro e histórico.",
	excel: "Importa as abas conhecidas da planilha Loja House pelo mesmo fluxo de conferência.",
};

function IndicadorPassos({ passo }: { passo: 1 | 2 | 3 }) {
	const passos = [
		[1, "Selecionar origem"],
		[2, "Conferir prévia"],
		[3, "Confirmar e importar"],
	] as const;

	return (
		<div className="flex flex-wrap items-center gap-2 text-sm">
			{passos.map(([numero, titulo], indice) => (
				<div key={numero} className="flex items-center gap-2">
					<div
						className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
							passo === numero
								? "bg-brand-500 text-white"
								: passo > numero
									? "bg-success-500 text-white"
									: "bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-gray-500"
						}`}
					>
						{numero}
					</div>
					<span
						className={
							passo === numero
								? "font-medium text-gray-800 dark:text-white/90"
								: "text-gray-400 dark:text-gray-500"
						}
					>
						{titulo}
					</span>
					{indice < passos.length - 1 && (
						<span className="mx-1 h-px w-8 bg-gray-200 dark:bg-gray-700" />
					)}
				</div>
			))}
		</div>
	);
}

function ContagemGrid({ preview }: { preview: PreviewImportacao }) {
	const itens = [
		["Categorias", preview.categorias],
		["Produtos", preview.produtos],
		["Variações", preview.variacoes],
		["Estoque", preview.estoque],
		["Clientes", preview.clientes],
		["Lançamentos", preview.lancamentos],
		["Vendas históricas", preview.vendasHistoricas || 0],
		["Pendências", preview.pendencias],
	] as const;

	return (
		<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
			{itens.map(([rotulo, valor]) => (
				<div
					key={rotulo}
					className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-800 dark:bg-white/[0.02]"
				>
					<div className="text-lg font-semibold text-gray-800 dark:text-white/90">
						{valor}
					</div>
					<div className="text-xs text-gray-500 dark:text-gray-400">{rotulo}</div>
				</div>
			))}
		</div>
	);
}

function ArquivosFonte({ arquivos }: { arquivos: ArquivoFonteImportacao[] }) {
	return (
		<div className="mt-4 overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
			<table className="w-full text-left text-sm">
				<thead>
					<tr className="border-b border-gray-100 dark:border-gray-800">
						{["Arquivo", "Papel", "Competência", "Itens", "Situação"].map((coluna) => (
							<th
								key={coluna}
								className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400"
							>
								{coluna}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{arquivos.map((arquivo) => (
						<tr key={`${arquivo.arquivo}-${arquivo.papel || arquivo.tipo}`} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
							<td className="max-w-xs break-all px-3 py-2 text-gray-700 dark:text-gray-300">
								{arquivo.arquivo}
							</td>
							<td className="px-3 py-2 text-gray-600 dark:text-gray-300">
								{arquivo.papel
									? ROTULOS_PAPEL[arquivo.papel] || arquivo.papel
									: arquivo.tipo === "metadado"
										? "Metadado"
										: "Desconhecido"}
							</td>
							<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
								{arquivo.competencia || "---"}
							</td>
							<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
								{arquivo.itens ?? "---"}
							</td>
							<td className="px-3 py-2 text-gray-500 dark:text-gray-400">
								{arquivo.tipo === "metadado" ? "Ignorado com aviso" : arquivo.motivo || "Reconhecido"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function AvisosFonte({ validacao }: { validacao: ValidacaoFonte | null }) {
	if (!validacao) return null;
	const mensagens: { texto: string; bloqueia: boolean }[] = [];
	if (validacao.formato === "json") {
		for (const erro of validacao.errosFonte) {
			mensagens.push({ texto: `${erro.arquivo}: ${erro.motivo}`, bloqueia: true });
		}
		const erros = new Set(validacao.errosFonte.map((erro) => `${erro.arquivo}:${erro.motivo}`));
		for (const aviso of validacao.avisos) {
			if (!erros.has(`${aviso.arquivo}:${aviso.motivo}`)) {
				mensagens.push({ texto: `${aviso.arquivo}: ${aviso.motivo}`, bloqueia: false });
			}
		}
	} else {
		for (const aviso of validacao.avisos || []) mensagens.push({ texto: aviso, bloqueia: false });
	}
	if (!mensagens.length) return null;

	return (
		<div className="mt-4 space-y-2">
			{mensagens.map((aviso, indice) => (
				<div
					key={`${aviso.texto}-${indice}`}
					className={`rounded-lg border px-3 py-2 text-sm ${
						aviso.bloqueia
							? "border-error-200 bg-error-50 text-error-700 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400"
							: "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-800 dark:bg-warning-500/10 dark:text-orange-400"
					}`}
				>
					{aviso.bloqueia ? "Importação bloqueada: " : "Atenção: "}
					{aviso.texto}
				</div>
			))}
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
			<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Histórico de importações</h2>
			<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
				Clique em um lote para ver as pendências geradas por ele.
			</p>
			<div className="mt-3 overflow-x-auto">
				{carregando ? (
					<div className="py-8 text-center text-sm text-gray-400">Carregando histórico...</div>
				) : erro ? (
					<div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">{erro}</div>
				) : historico.length === 0 ? (
					<div className="py-8 text-center text-sm text-gray-400">Nenhuma importação registrada ainda.</div>
				) : (
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-gray-100 dark:border-gray-800">
								{["Data", "Status", "Total", "Importados", "Ignorados", "Erros"].map((coluna) => (
									<th key={coluna} className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400">{coluna}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{historico.map((lote) => (
								<Fragment key={lote.id}>
									<tr className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50 dark:border-gray-800/60 dark:hover:bg-white/5" onClick={() => onSelecionarLote(lote.id)}>
										<td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">{formatarDataHora(lote.data_importacao)}</td>
										<td className="whitespace-nowrap px-3 py-2"><Badge size="sm" color={BADGE_POR_STATUS[lote.status]}>{LABEL_POR_STATUS[lote.status]}</Badge></td>
										<td className="px-3 py-2 text-gray-600 dark:text-gray-300">{lote.total_itens}</td>
										<td className="px-3 py-2 text-gray-600 dark:text-gray-300">{lote.itens_importados}</td>
										<td className="px-3 py-2 text-gray-600 dark:text-gray-300">{lote.itens_ignorados}</td>
										<td className="px-3 py-2 text-gray-600 dark:text-gray-300">{lote.itens_erro}</td>
									</tr>
									{loteExpandidoId === lote.id && (
										<tr><td colSpan={6} className="bg-gray-50 px-3 py-3 dark:bg-white/[0.02]">
											{carregandoDetalhes ? <p className="text-sm text-gray-400">Carregando detalhes...</p> : erroDetalhes ? <p className="text-sm text-error-600 dark:text-error-400">{erroDetalhes}</p> : detalhesLote ? <DetalhesLote detalhes={detalhesLote} /> : null}
										</td></tr>
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

function DetalhesLote({ detalhes }: { detalhes: DetalhesLoteImportacao }) {
	return (
		<div className="space-y-2">
			<p className="break-all text-xs text-gray-500 dark:text-gray-400">Checksum: {detalhes.batch.checksum}</p>
			{detalhes.pendencias.length === 0 ? (
				<p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma pendência neste lote.</p>
			) : (
				<div className="max-h-64 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800">
					<table className="w-full text-left text-xs">
						<thead><tr className="border-b border-gray-200 dark:border-gray-700"><th className="px-2 py-1 font-medium uppercase text-gray-400">Tipo</th><th className="px-2 py-1 font-medium uppercase text-gray-400">Descrição</th><th className="px-2 py-1 font-medium uppercase text-gray-400">Motivo</th></tr></thead>
						<tbody>{detalhes.pendencias.map((pendencia) => <tr key={pendencia.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800"><td className="px-2 py-1 text-gray-600 dark:text-gray-300">{pendencia.tipo_entidade}</td><td className="px-2 py-1 text-gray-600 dark:text-gray-300">{pendencia.descricao || "---"}</td><td className="px-2 py-1 text-gray-600 dark:text-gray-300">{pendencia.motivo_rejeicao || "---"}</td></tr>)}</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

function origemTexto(origem: EntradaImportacao | null, validacao: ValidacaoFonte | null): string {
	if (!origem || !validacao) return "Nenhuma origem selecionada.";
	if (validacao.formato === "excel") return validacao.caminho;
	if (typeof origem === "string") return origem;
	if (origem.tipo !== "json") return "Planilha Excel selecionada";
	if (origem.pasta) return `Pasta: ${origem.pasta}`;
	return `${origem.caminhos?.length || 0} arquivo(s) JSON selecionado(s)`;
}

function AvisosResultado({ avisos }: { avisos?: AvisoFonteImportacao[] }) {
	if (!avisos?.length) return null;
	return <ul className="mt-3 space-y-1 text-xs text-warning-700 dark:text-orange-300">{avisos.map((aviso, indice) => <li key={`${aviso.arquivo}-${indice}`}>{aviso.arquivo}: {aviso.motivo}</li>)}</ul>;
}

function ImportacaoWizard({ modo }: { modo: Modo }) {
	const [passo, setPasso] = useState<1 | 2 | 3>(1);
	const [origem, setOrigem] = useState<EntradaImportacao | null>(null);
	const [validacaoFonte, setValidacaoFonte] = useState<ValidacaoFonte | null>(null);
	const [previaDetalhada, setPreviaDetalhada] = useState<{ preview: PreviewDryRunImportacao; conflitos: ConflitosImportacao; checksum: string } | null>(null);
	const [dataMovimentacao, setDataMovimentacao] = useState(() => new Date().toISOString().slice(0, 10));
	const [carregando, setCarregando] = useState(false);
	const [erro, setErro] = useState<string | null>(null);
	const [resultadoFinal, setResultadoFinal] = useState<ResultadoImportacaoLote | null>(null);
	const [historico, setHistorico] = useState<LoteImportacao[]>([]);
	const [carregandoHistorico, setCarregandoHistorico] = useState(false);
	const [erroHistorico, setErroHistorico] = useState<string | null>(null);
	const [loteExpandidoId, setLoteExpandidoId] = useState<string | null>(null);
	const [detalhesLote, setDetalhesLote] = useState<DetalhesLoteImportacao | null>(null);
	const [carregandoDetalhes, setCarregandoDetalhes] = useState(false);
	const [erroDetalhes, setErroDetalhes] = useState<string | null>(null);

	const carregarHistorico = useCallback(async () => {
		setCarregandoHistorico(true);
		setErroHistorico(null);
		try {
			setHistorico(await erpApi.importacoes.historico());
		} catch (e) {
			setErroHistorico(e instanceof Error ? e.message : "Erro ao carregar histórico.");
		} finally {
			setCarregandoHistorico(false);
		}
	}, []);

	useEffect(() => { carregarHistorico(); }, [carregarHistorico]);

	function limparFonte() {
		setPasso(1);
		setOrigem(null);
		setValidacaoFonte(null);
		setPreviaDetalhada(null);
		setErro(null);
		setResultadoFinal(null);
		setDataMovimentacao(new Date().toISOString().slice(0, 10));
	}

	async function selecionarJson(selecao: "files" | "folder") {
		setCarregando(true);
		setErro(null);
		setOrigem(null);
		setValidacaoFonte(null);
		setPreviaDetalhada(null);
		setResultadoFinal(null);
		try {
			const resposta = await erpApi.importacoes.validarJson({ selecao });
			if ("cancelado" in resposta) return;
			if ("erro" in resposta) { setErro(resposta.erro); return; }
			const novaOrigem: EntradaImportacao = { ...resposta.origem, checksum: resposta.checksum };
			setOrigem(novaOrigem);
			setValidacaoFonte(resposta);
			setPasso(resposta.bloqueado ? 1 : 2);
		} catch (e) {
			setErro(e instanceof Error ? e.message : "Erro ao validar os JSONs.");
		} finally {
			setCarregando(false);
		}
	}

	async function selecionarExcel() {
		setCarregando(true);
		setErro(null);
		setOrigem(null);
		setValidacaoFonte(null);
		setPreviaDetalhada(null);
		setResultadoFinal(null);
		try {
			const resposta = await erpApi.importacoes.validarExcel();
			if ("cancelado" in resposta) return;
			if ("erro" in resposta) { setErro(resposta.erro); return; }
			setOrigem({ tipo: "excel", caminho: resposta.caminho });
			setValidacaoFonte(resposta);
			setPasso(2);
		} catch (e) {
			setErro(e instanceof Error ? e.message : "Erro ao validar a planilha.");
		} finally {
			setCarregando(false);
		}
	}

	async function executarDryRun() {
		if (!origem) return;
		setCarregando(true);
		setErro(null);
		try {
			const resposta = await erpApi.importacoes.executar(origem, { dryRun: true, dataMovimentacao });
			if ("erro" in resposta) { setErro(resposta.erro); return; }
			if (!("dryRun" in resposta)) { setErro("Resposta inesperada ao simular a importação."); return; }
			setPreviaDetalhada(resposta);
		} catch (e) {
			setErro(e instanceof Error ? e.message : "Erro ao simular a importação.");
		} finally {
			setCarregando(false);
		}
	}

	async function importarAgora() {
		if (!origem) return;
		setCarregando(true);
		setErro(null);
		try {
			const resposta = await erpApi.importacoes.executar(origem, { dryRun: false, dataMovimentacao });
			if ("erro" in resposta) { setErro(resposta.erro); return; }
			if (!("batchId" in resposta)) { setErro("Resposta inesperada ao importar."); return; }
			setResultadoFinal(resposta);
			setPasso(3);
			await carregarHistorico();
		} catch (e) {
			setErro(e instanceof Error ? e.message : "Erro ao importar.");
		} finally {
			setCarregando(false);
		}
	}

	async function alternarDetalhesLote(batchId: string) {
		if (loteExpandidoId === batchId) { setLoteExpandidoId(null); return; }
		setLoteExpandidoId(batchId);
		setCarregandoDetalhes(true);
		setErroDetalhes(null);
		try {
			setDetalhesLote(await erpApi.importacoes.detalhes(batchId));
		} catch (e) {
			setErroDetalhes(e instanceof Error ? e.message : "Erro ao carregar detalhes.");
		} finally {
			setCarregandoDetalhes(false);
		}
	}

	const previewFonte = validacaoFonte?.preview || null;
	const bloqueado = validacaoFonte?.formato === "json" && validacaoFonte.bloqueado;
	const temEstoque = Boolean(previewFonte?.estoque);
	const temDryRun = Boolean(previaDetalhada);

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-700 dark:border-brand-800 dark:bg-brand-500/10 dark:text-brand-300">
				{modo === "json" ? "Selecione um ou mais JSONs, ou uma pasta; o sistema identifica cada papel e competência antes de importar." : "A planilha usa o parser conhecido da Loja House. Abas financeiras mensais ficam explícitas como revisão e não viram lançamentos automaticamente."}
			</div>

			<IndicadorPassos passo={passo} />

			{passo === 1 && (
				<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
					<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Passo 1 — Selecionar origem</h2>
					<p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">{DESCRICAO_POR_MODO[modo]} A prévia é lida no processo principal e fica protegida por checksum.</p>
					<div className="mt-4 rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-4 dark:border-brand-700 dark:bg-brand-500/5">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<div className="text-sm font-semibold text-gray-800 dark:text-white/90">{modo === "json" ? "Fonte JSON" : "Planilha Excel"}</div>
								<div className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">{origemTexto(origem, validacaoFonte)}</div>
							</div>
							<div className="flex flex-wrap gap-2">
								{modo === "json" ? <>
									<Button variant="outline" onClick={() => selecionarJson("files")} disabled={carregando}>Arquivo(s) JSON</Button>
									<Button variant="outline" onClick={() => selecionarJson("folder")} disabled={carregando}>Pasta de JSONs</Button>
								</> : <Button onClick={selecionarExcel} disabled={carregando}>{carregando ? "Lendo planilha..." : "Selecionar planilha .xlsx"}</Button>}
							</div>
						</div>
						{carregando && <p className="mt-3 text-sm text-brand-600 dark:text-brand-300">Validando a origem...</p>}
					</div>
					{erro && <div className="mt-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">{erro}</div>}
					{validacaoFonte?.formato === "json" && <>
						<ArquivosFonte arquivos={validacaoFonte.arquivos} />
						<AvisosFonte validacao={validacaoFonte} />
					</>}
					{validacaoFonte?.formato === "excel" && <AvisosFonte validacao={validacaoFonte} />}
					{previewFonte && !bloqueado && <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-success-700 dark:text-success-400">Origem reconhecida. Confira a prévia para continuar.</p><Button onClick={() => setPasso(2)}>Próximo: conferir prévia</Button></div>}
				</div>
			)}

			{passo === 2 && previewFonte && validacaoFonte && (
				<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
					<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Passo 2 — Conferir prévia</h2>
					<p className="mt-1 break-all text-sm text-gray-500 dark:text-gray-400">{origemTexto(origem, validacaoFonte)}</p>
					{validacaoFonte.formato === "json" && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Competências detectadas: {validacaoFonte.competencias.length ? validacaoFonte.competencias.join(", ") : "nenhuma"} · checksum {validacaoFonte.checksum}</p>}
					<ContagemGrid preview={previewFonte} />
					{validacaoFonte.formato === "json" && <ArquivosFonte arquivos={validacaoFonte.arquivos} />}
					<AvisosFonte validacao={validacaoFonte} />
					{temEstoque && <div className="mt-4 max-w-xs"><Label>Data da movimentação de estoque</Label><Input type="date" value={dataMovimentacao} onChange={(event) => setDataMovimentacao(event.target.value)} /></div>}
					{previaDetalhada && <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.02]"><div className="font-medium text-gray-800 dark:text-white/90">Simulação pronta</div><div className="mt-1">{previaDetalhada.preview.vendasHistoricas} venda(s) histórica(s), {previaDetalhada.preview.lancamentosHistoricos} lançamento(s) financeiro(s) e {previaDetalhada.preview.pendenciasOrigem} pendência(s).</div><div className="mt-1 break-all text-xs">Checksum: {previaDetalhada.checksum}</div></div>}
					{erro && <div className="mt-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">{erro}</div>}
					<div className="mt-6 flex flex-wrap gap-2"><Button variant="outline" onClick={limparFonte} disabled={carregando}>Trocar origem</Button><Button onClick={executarDryRun} disabled={carregando}>{carregando ? "Simulando..." : "Simular sem alterar o banco"}</Button><Button onClick={() => setPasso(3)} disabled={!temDryRun || bloqueado || carregando}>Confirmar importação</Button></div>
				</div>
			)}

			{passo === 3 && !resultadoFinal && previewFonte && (
				<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
					<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Passo 3 — Confirmar e importar</h2>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">A fonte será relida e comparada com o checksum da prévia antes do commit atômico.</p>
					{erro && <div className="mt-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">{erro}</div>}
					<div className="mt-6 flex gap-2"><Button variant="outline" onClick={() => setPasso(2)} disabled={carregando}>Voltar</Button><Button onClick={importarAgora} disabled={carregando}>{carregando ? "Importando..." : "Importar agora"}</Button></div>
				</div>
			)}

			{resultadoFinal && (
				<div className="rounded-xl border border-success-200 bg-success-50 p-4 dark:border-success-800 dark:bg-success-500/10">
					<h2 className="text-base font-semibold text-success-700 dark:text-success-400">Importação concluída</h2>
					<p className="mt-1 break-all text-sm text-success-700 dark:text-success-400">Lote <span className="font-mono">{resultadoFinal.batchId}</span></p>
					<ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700 dark:text-gray-300 sm:grid-cols-3"><li>Categorias: {resultadoFinal.importadas.categorias}</li><li>Produtos: {resultadoFinal.importadas.produtos}</li><li>Variações: {resultadoFinal.importadas.variacoes}</li><li>Estoque: {resultadoFinal.importadas.estoque}</li><li>Clientes: {resultadoFinal.importadas.clientes}</li><li>Lançamentos: {resultadoFinal.importadas.lancamentos}</li><li>Vendas históricas: {resultadoFinal.importadas.vendasHistoricas}</li></ul>
					<p className="mt-3 text-sm text-gray-700 dark:text-gray-300">Ignoradas: {resultadoFinal.ignoradas} · Pendências criadas: {resultadoFinal.pendencias}</p>
					<AvisosResultado avisos={resultadoFinal.avisos} />
					<div className="mt-4"><Button onClick={limparFonte}>Nova importação</Button></div>
				</div>
			)}

			<HistoricoImportacoes historico={historico} carregando={carregandoHistorico} erro={erroHistorico} loteExpandidoId={loteExpandidoId} detalhesLote={detalhesLote} carregandoDetalhes={carregandoDetalhes} erroDetalhes={erroDetalhes} onSelecionarLote={alternarDetalhesLote} />
		</div>
	);
}

export default function ImportacaoPage() {
	const [modo, setModo] = useState<Modo>("json");
	usePageHeader(TITULO_POR_MODO[modo], DESCRICAO_POR_MODO[modo]);

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="flex flex-wrap gap-2">
				{(["json", "excel"] as const).map((opcao) => (
					<button key={opcao} type="button" aria-pressed={modo === opcao} onClick={() => setModo(opcao)} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${modo === opcao ? "bg-brand-500 text-white" : "bg-white text-gray-600 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03]"}`}>
						{opcao === "json" ? "Importar JSON" : "Importar Excel (.xlsx)"}
					</button>
				))}
			</div>
			<ImportacaoWizard key={modo} modo={modo} />
		</div>
	);
}
