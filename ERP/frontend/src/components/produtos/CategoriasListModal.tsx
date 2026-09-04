"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import ConfirmarSenhaModal from "@/components/common/ConfirmarSenhaModal";
import { useCategorias } from "@/hooks/useCategorias";
import { erpApi, type CategoriaComUso } from "@/lib/erpApi";

export default function CategoriasListModal({
	isOpen,
	onClose,
	onAlterado,
}: {
	isOpen: boolean;
	onClose: () => void;
	onAlterado: () => void;
}) {
	const [verInativas, setVerInativas] = useState(false);
	const { categorias, carregando, erro, recarregar } = useCategorias(true);
	const [busca, setBusca] = useState("");
	const [tipoFiltro, setTipoFiltro] = useState<string[]>([]);
	const [filtroComUso, setFiltroComUso] = useState(false);
	const [filtroSemUso, setFiltroSemUso] = useState(false);
	const [processandoId, setProcessandoId] = useState<number | null>(null);
	const [categoriaParaExcluir, setCategoriaParaExcluir] =
		useState<CategoriaComUso | null>(null);
	const [categoriaEditando, setCategoriaEditando] =
		useState<CategoriaComUso | null>(null);
	const [nomeEdit, setNomeEdit] = useState("");
	const [paiIdEdit, setPaiIdEdit] = useState("");
	const [salvandoEdit, setSalvandoEdit] = useState(false);
	const [erroEdit, setErroEdit] = useState<string | null>(null);

	useEffect(() => {
		if (isOpen) recarregar();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	function toggleTipoFiltro(tipo: string) {
		setTipoFiltro((atual) =>
			atual.includes(tipo) ? atual.filter((t) => t !== tipo) : [...atual, tipo],
		);
	}

	function limparFiltros() {
		setTipoFiltro([]);
		setFiltroComUso(false);
		setFiltroSemUso(false);
		setBusca("");
	}

	const q = busca.trim().toLowerCase();
	const filtradas = categorias.filter((c) => {
		if (!verInativas && !c.ativo) return false;
		if (tipoFiltro.length > 0 && !tipoFiltro.includes(c.tipo)) return false;
		if (filtroComUso && c.uso_count === 0) return false;
		if (filtroSemUso && c.uso_count > 0) return false;
		if (!q) return true;
		return [c.codigo, c.nome, c.categoria_pai_nome || ""]
			.join(" ")
			.toLowerCase()
			.includes(q);
	});

	async function inativar(c: CategoriaComUso) {
		if (c.uso_ativo_count > 0) {
			alert(
				`A categoria "${c.nome}" está vinculada a ${c.uso_ativo_count} produto(s) ativo(s). Inative ou reclassifique os produtos antes.`,
			);
			return;
		}
		setProcessandoId(c.id);
		try {
			await erpApi.categorias.inativar(c.id);
			recarregar();
			onAlterado();
		} catch (e) {
			alert(
				"Erro ao inativar: " + (e instanceof Error ? e.message : String(e)),
			);
		} finally {
			setProcessandoId(null);
		}
	}

	async function reativar(c: CategoriaComUso) {
		setProcessandoId(c.id);
		try {
			await erpApi.categorias.reativar(c.id);
			recarregar();
			onAlterado();
		} catch (e) {
			alert(
				"Erro ao reativar: " + (e instanceof Error ? e.message : String(e)),
			);
		} finally {
			setProcessandoId(null);
		}
	}

	function temFilhos(id: number) {
		return categorias.some((c) => c.categoria_pai_id === id);
	}

	function abrirEdicao(c: CategoriaComUso) {
		setCategoriaEditando(c);
		setNomeEdit(c.nome);
		setPaiIdEdit(c.categoria_pai_id ? String(c.categoria_pai_id) : "");
		setErroEdit(null);
	}

	async function salvarEdicao() {
		if (!categoriaEditando) return;
		const nome = nomeEdit.trim();
		if (!nome) {
			setErroEdit("Informe o nome.");
			return;
		}
		setSalvandoEdit(true);
		setErroEdit(null);
		try {
			await erpApi.categorias.atualizar(categoriaEditando.id, {
				nome,
				categoriaPaiId: paiIdEdit ? Number(paiIdEdit) : null,
			});
			setCategoriaEditando(null);
			recarregar();
			onAlterado();
		} catch (e) {
			setErroEdit(e instanceof Error ? e.message : String(e));
		} finally {
			setSalvandoEdit(false);
		}
	}

	async function excluirConfirmado() {
		if (!categoriaParaExcluir) return;
		if (categoriaParaExcluir.uso_count > 0) {
			alert(
				`A categoria "${categoriaParaExcluir.nome}" está vinculada a ${categoriaParaExcluir.uso_count} produto(s). Remova as vinculações antes.`,
			);
			return;
		}
		setProcessandoId(categoriaParaExcluir.id);
		try {
			await erpApi.categorias.remover(categoriaParaExcluir.id);
			recarregar();
			onAlterado();
		} catch (e) {
			alert("Erro ao excluir: " + (e instanceof Error ? e.message : String(e)));
		} finally {
			setProcessandoId(null);
		}
	}

	return (
		<>
			<Modal isOpen={isOpen} onClose={onClose} className="max-w-[960px] p-0">
				<div className="flex items-center justify-between gap-3 border-b border-gray-100 p-4 dark:border-gray-800">
					<h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
						Categorias Cadastradas
					</h2>
					<div className="flex flex-wrap items-center gap-2">
						<input
							type="text"
							value={busca}
							onChange={(e) => setBusca(e.target.value)}
							placeholder="Buscar por nome..."
							className="h-9 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
						/>
						<Button
							size="sm"
							variant={verInativas ? "primary" : "outline"}
							onClick={() => setVerInativas((v) => !v)}
						>
							{verInativas ? "Ver ativas" : "Ver inativas"}
						</Button>
					</div>
				</div>

				<div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-4 sm:flex-row">
					<aside className="w-full shrink-0 sm:w-52">
						<div className="mb-2 text-xs font-semibold uppercase text-gray-400">
							Filtros
						</div>
						<div className="mb-4">
							<div className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
								Tipo
							</div>
							<label className="flex items-center gap-2 py-0.5 text-sm text-gray-600 dark:text-gray-300">
								<input
									type="checkbox"
									checked={tipoFiltro.includes("categoria")}
									onChange={() => toggleTipoFiltro("categoria")}
								/>
								Grupo
							</label>
							<label className="flex items-center gap-2 py-0.5 text-sm text-gray-600 dark:text-gray-300">
								<input
									type="checkbox"
									checked={tipoFiltro.includes("subcategoria")}
									onChange={() => toggleTipoFiltro("subcategoria")}
								/>
								Atributo
							</label>
						</div>
						<div className="mb-4">
							<div className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
								Uso
							</div>
							<label className="flex items-center gap-2 py-0.5 text-sm text-gray-600 dark:text-gray-300">
								<input
									type="checkbox"
									checked={filtroComUso}
									onChange={(e) => setFiltroComUso(e.target.checked)}
								/>
								Com produtos vinculados
							</label>
							<label className="flex items-center gap-2 py-0.5 text-sm text-gray-600 dark:text-gray-300">
								<input
									type="checkbox"
									checked={filtroSemUso}
									onChange={(e) => setFiltroSemUso(e.target.checked)}
								/>
								Sem produtos vinculados
							</label>
						</div>
						<button
							type="button"
							onClick={limparFiltros}
							className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
						>
							Limpar filtros
						</button>
					</aside>

					<div className="flex-1 overflow-x-auto">
						{erro && (
							<div className="mb-3 rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
								{erro}
							</div>
						)}
						<table className="w-full text-left text-sm">
							<thead>
								<tr className="border-b border-gray-100 dark:border-gray-800">
									{[
										"Código",
										"Nome",
										"Tipo",
										"Uso (produtos)",
										"Status",
										"Ações",
									].map((c) => (
										<th
											key={c}
											className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase text-gray-400"
										>
											{c}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{carregando ? (
									<tr>
										<td
											colSpan={6}
											className="px-3 py-8 text-center text-sm text-gray-400"
										>
											Carregando...
										</td>
									</tr>
								) : filtradas.length === 0 ? (
									<tr>
										<td
											colSpan={6}
											className="px-3 py-8 text-center text-sm text-gray-400"
										>
											{categorias.length === 0
												? "Nenhuma categoria cadastrada ainda."
												: "Nenhuma categoria encontrada."}
										</td>
									</tr>
								) : (
									filtradas.map((c) => {
										const processando = processandoId === c.id;
										return (
											<tr
												key={c.id}
												className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
											>
												<td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">
													{c.codigo}
												</td>
												<td className="px-3 py-2 text-gray-800 dark:text-white/90">
													{c.nome}
													{c.categoria_pai_nome && (
														<span className="ml-1.5 text-xs text-gray-400">
															(em {c.categoria_pai_nome})
														</span>
													)}
												</td>
												<td className="whitespace-nowrap px-3 py-2">
													{c.tipo === "subcategoria" ? (
														<span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
															atributo
														</span>
													) : (
														<span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
															grupo
														</span>
													)}
												</td>
												<td className="whitespace-nowrap px-3 py-2">
													<span
														className={
															c.uso_count > 0
																? "rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-600 dark:bg-success-500/10 dark:text-success-400"
																: "rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500 dark:bg-white/5 dark:text-gray-400"
														}
													>
														{c.uso_count}
													</span>
												</td>
												<td className="whitespace-nowrap px-3 py-2">
													{c.ativo ? (
														<span className="rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-600 dark:bg-success-500/10 dark:text-success-400">
															Ativa
														</span>
													) : (
														<span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500 dark:bg-white/5 dark:text-gray-400">
															Inativa
														</span>
													)}
												</td>
												<td className="whitespace-nowrap px-3 py-2">
													<div className="flex gap-2">
														<button
															onClick={() => abrirEdicao(c)}
															disabled={processando}
															className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:bg-white/5 dark:text-gray-300"
														>
															Editar
														</button>
														{c.ativo ? (
															<button
																onClick={() => inativar(c)}
																disabled={processando}
																className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:bg-white/5 dark:text-gray-300"
															>
																Inativar
															</button>
														) : (
															<button
																onClick={() => reativar(c)}
																disabled={processando}
																className="rounded-lg bg-success-50 px-3 py-1.5 text-xs font-semibold text-success-600 hover:bg-success-100 disabled:opacity-50 dark:bg-success-500/10 dark:text-success-400"
															>
																Reativar
															</button>
														)}
														<button
															onClick={() => setCategoriaParaExcluir(c)}
															disabled={processando}
															className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-semibold text-error-600 hover:bg-error-100 disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400"
														>
															Excluir
														</button>
													</div>
												</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>
				</div>
			</Modal>

			<ConfirmarSenhaModal
				isOpen={!!categoriaParaExcluir}
				titulo="Excluir categoria"
				descricao={
					categoriaParaExcluir
						? `Excluir "${categoriaParaExcluir.nome}"? Esta ação não pode ser desfeita.`
						: ""
				}
				onClose={() => setCategoriaParaExcluir(null)}
				onConfirmado={excluirConfirmado}
			/>

			<Modal
				isOpen={!!categoriaEditando}
				onClose={() => setCategoriaEditando(null)}
				className="max-w-[420px] p-6"
			>
				<h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
					Editar categoria
				</h2>
				{categoriaEditando && (
					<div className="space-y-4">
						<div>
							<Label>Nome</Label>
							<Input
								value={nomeEdit}
								onChange={(e) => setNomeEdit(e.target.value)}
							/>
						</div>
						<div>
							<Label>Agrupar em</Label>
							{temFilhos(categoriaEditando.id) ? (
								<p className="text-xs text-gray-500 dark:text-gray-400">
									Esta categoria tem subcategorias vinculadas — não pode virar
									uma subcategoria de outro grupo.
								</p>
							) : (
								<select
									value={paiIdEdit}
									onChange={(e) => setPaiIdEdit(e.target.value)}
									className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
								>
									<option value="">Nenhum (grupo principal)</option>
									{categorias
										.filter(
											(g) =>
												!g.categoria_pai_id && g.id !== categoriaEditando.id,
										)
										.map((g) => (
											<option key={g.id} value={g.id}>
												{g.nome}
											</option>
										))}
								</select>
							)}
						</div>
						{erroEdit && (
							<div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
								{erroEdit}
							</div>
						)}
						<div className="flex justify-end gap-3">
							<Button
								variant="outline"
								type="button"
								onClick={() => setCategoriaEditando(null)}
							>
								Cancelar
							</Button>
							<Button
								type="button"
								onClick={salvarEdicao}
								disabled={salvandoEdit}
							>
								{salvandoEdit ? "Salvando..." : "Salvar"}
							</Button>
						</div>
					</div>
				)}
			</Modal>
		</>
	);
}
