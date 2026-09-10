"use client";
import { useEffect, useState } from "react";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { usePageHeader } from "@/context/PageHeaderContext";
import { useGerenciarImagens } from "@/hooks/useGerenciarImagens";
import ConfirmarSenhaModal from "@/components/common/ConfirmarSenhaModal";
import { erpApi, type ImagemMeta } from "@/lib/erpApi";

function formatarTamanho(bytes: number): string {
	if (bytes < 1024) return bytes + " B";
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
	return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function ImagensPage() {
	const {
		autorizado,
		autorizando,
		erroSenha,
		confirmarSenha,
		imagens,
		total,
		carregando,
		erro,
		abaOrfas,
		setAbaOrfas,
		orfas,
		carregandoOrfas,
		visualizando,
		visualizar,
		fecharVisualizacao,
		paraExcluir,
		pedirExclusao,
		cancelarExclusao,
		confirmarExclusao,
		excluindo,
		resultadoExclusao,
		orfasParaExcluir,
		pedirExclusaoOrfasEmLote,
		cancelarExclusaoOrfasEmLote,
		confirmarExclusaoOrfasEmLote,
	} = useGerenciarImagens();
	const [senha, setSenha] = useState("");

	usePageHeader(
		"Gerenciar Imagens",
		autorizado
			? "Ver, substituir e excluir as imagens salvas no banco de dados"
			: "Área sensível — confirme sua senha para ver as imagens.",
	);

	if (!autorizado) {
		return (
			<div className="mx-auto mt-16 max-w-sm">
				<div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
					<form
						className="mt-4 space-y-3"
						onSubmit={(e) => {
							e.preventDefault();
							confirmarSenha(senha);
						}}
					>
						<div>
							<Label>Sua senha</Label>
							<Input
								type="password"
								value={senha}
								onChange={(e) => setSenha(e.target.value)}
								placeholder="Senha do seu login"
							/>
						</div>
						{erroSenha && (
							<div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
								{erroSenha}
							</div>
						)}
						<Button type="submit" disabled={autorizando} className="w-full">
							{autorizando ? "Confirmando..." : "Confirmar"}
						</Button>
					</form>
				</div>
			</div>
		);
	}

	const lista = abaOrfas ? orfas : imagens;
	const carregandoLista = abaOrfas ? carregandoOrfas : carregando;

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex gap-2">
					<button
						type="button"
						onClick={() => setAbaOrfas(false)}
						className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
							!abaOrfas
								? "bg-brand-50 text-brand-600 dark:bg-brand-500/10"
								: "text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5"
						}`}
					>
						Todas ({total})
					</button>
					<button
						type="button"
						onClick={() => setAbaOrfas(true)}
						className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
							abaOrfas
								? "bg-brand-50 text-brand-600 dark:bg-brand-500/10"
								: "text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5"
						}`}
					>
						Órfãs ({orfas.length})
					</button>
				</div>
				{abaOrfas && orfas.length > 0 && (
					<button
						type="button"
						disabled={excluindo}
						onClick={pedirExclusaoOrfasEmLote}
						className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-semibold text-error-600 hover:bg-error-100 disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400"
					>
						Excluir todas as órfãs
					</button>
				)}
			</div>

			{abaOrfas && (
				<p className="text-sm text-gray-500 dark:text-gray-400">
					Imagens cuja entidade dona (ex.: um produto) não existe mais — sobram
					aqui porque a exclusão não tinha como limpá-las automaticamente antes
					desta tela existir.
				</p>
			)}

			{resultadoExclusao && (
				<div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-800 dark:bg-success-500/10 dark:text-success-400">
					{resultadoExclusao}
				</div>
			)}
			{erro && (
				<div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
					{erro}
				</div>
			)}

			{carregandoLista ? (
				<div className="py-8 text-center text-sm text-gray-400">
					Carregando...
				</div>
			) : lista.length === 0 ? (
				<div className="py-8 text-center text-sm text-gray-400">
					{abaOrfas ? "Nenhuma imagem órfã." : "Nenhuma imagem salva ainda."}
				</div>
			) : (
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
					{lista.map((imagem) => (
						<CartaoImagemComPreview
							key={imagem.id}
							imagem={imagem}
							onVisualizar={() => visualizar(imagem.id)}
							onExcluir={() => pedirExclusao(imagem)}
						/>
					))}
				</div>
			)}

			<Modal
				isOpen={!!visualizando}
				onClose={fecharVisualizacao}
				className="max-w-[600px] p-6"
			>
				{visualizando && (
					<img
						src={visualizando.dataUrl}
						alt="Imagem em tamanho grande"
						className="max-h-[70vh] w-full rounded-lg object-contain"
					/>
				)}
			</Modal>

			<ConfirmarSenhaModal
				isOpen={!!paraExcluir}
				titulo="Excluir imagem"
				descricao={
					paraExcluir
						? `Remover a imagem de "${paraExcluir.entidade_nome || "#" + paraExcluir.entidade_id}"? Esta ação não pode ser desfeita.`
						: ""
				}
				onClose={cancelarExclusao}
				onConfirmado={confirmarExclusao}
			/>

			<ConfirmarSenhaModal
				isOpen={orfasParaExcluir}
				titulo="Excluir imagens órfãs"
				descricao={`Remover as ${orfas.length} imagem(ns) órfã(s) listada(s)? Esta ação não pode ser desfeita.`}
				onClose={cancelarExclusaoOrfasEmLote}
				onConfirmado={confirmarExclusaoOrfasEmLote}
			/>
		</div>
	);
}

// Miniatura carregada sob demanda (nunca o BLOB inteiro em todo o grid de
// uma vez, só a imagem cujo cartão está montado) — mesmo princípio de
// ProdutoThumbnail.tsx, mas por id de imagem em vez de produto.
function CartaoImagemComPreview({
	imagem,
	onVisualizar,
	onExcluir,
}: {
	imagem: ImagemMeta;
	onVisualizar: () => void;
	onExcluir: () => void;
}) {
	const [dataUrl, setDataUrl] = useState<string | null>(null);

	useEffect(() => {
		let cancelado = false;
		erpApi.imagens
			.obterPorId(imagem.id)
			.then((url) => {
				if (!cancelado) setDataUrl(url);
			})
			.catch(() => {
				if (!cancelado) setDataUrl(null);
			});
		return () => {
			cancelado = true;
		};
	}, [imagem.id]);

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]">
			<button
				type="button"
				onClick={onVisualizar}
				className="block h-28 w-full rounded-lg border border-gray-100 bg-gray-50 bg-cover bg-center dark:border-gray-800 dark:bg-white/5"
				style={dataUrl ? { backgroundImage: `url('${dataUrl}')` } : undefined}
				title="Ver em tamanho grande"
			/>
			<div className="mt-2 truncate text-sm font-medium text-gray-800 dark:text-white/90">
				{imagem.entidade_nome || `#${imagem.entidade_id}`}
			</div>
			<div className="text-xs text-gray-400">
				{imagem.mimetype} · {formatarTamanho(imagem.tamanho_bytes)}
			</div>
			<div className="mt-2 flex justify-end">
				<button
					type="button"
					onClick={onExcluir}
					className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-semibold text-error-600 hover:bg-error-100 dark:bg-error-500/10 dark:text-error-400"
				>
					Excluir
				</button>
			</div>
		</div>
	);
}
