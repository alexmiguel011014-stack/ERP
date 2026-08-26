"use client";
import { useState } from "react";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { useCategorias } from "@/hooks/useCategorias";
import { erpApi } from "@/lib/erpApi";
import CategoriasListModal from "@/components/produtos/CategoriasListModal";

export default function CategoriasPage() {
	const { categorias, recarregar } = useCategorias();
	const [nome, setNome] = useState("");
	const [paiId, setPaiId] = useState("");
	const [mensagem, setMensagem] = useState<{
		texto: string;
		sucesso: boolean;
	} | null>(null);
	const [salvando, setSalvando] = useState(false);
	const [modalAberto, setModalAberto] = useState(false);

	const temPai = !!paiId;
	const gruposPrincipais = categorias.filter((c) => !c.categoria_pai_id);

	async function salvar(e: React.FormEvent) {
		e.preventDefault();
		if (salvando) return;
		const nomeVal = nome.trim();
		if (!nomeVal) {
			setMensagem({
				texto: temPai
					? "Informe o nome do atributo."
					: "Informe o nome da categoria.",
				sucesso: false,
			});
			return;
		}
		setSalvando(true);
		setMensagem(null);
		try {
			await erpApi.categorias.salvar(nomeVal, temPai ? Number(paiId) : null);
			setMensagem({
				texto: temPai ? "Atributo adicionado!" : "Categoria criada!",
				sucesso: true,
			});
			setNome("");
			setPaiId("");
			recarregar();
		} catch (e) {
			setMensagem({
				texto:
					"Erro ao salvar: " + (e instanceof Error ? e.message : String(e)),
				sucesso: false,
			});
		} finally {
			setSalvando(false);
		}
	}

	function limpar() {
		setNome("");
		setPaiId("");
		setMensagem(null);
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<div>
				<h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
					Categorias
				</h1>
				<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Gerencie grupos e atributos (tamanhos, cores, etc.)
				</p>
			</div>

			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
					Nova Categoria / Atributo
				</h2>
				<form onSubmit={salvar} className="mt-3 space-y-4">
					<div>
						<Label>{temPai ? "Nome do atributo" : "Nome"}</Label>
						<Input
							value={nome}
							onChange={(e) => setNome(e.target.value)}
							placeholder="Ex: Tamanhos, Cores, A1, Azul..."
						/>
					</div>
					<div>
						<Label>Agrupar em</Label>
						<select
							value={paiId}
							onChange={(e) => setPaiId(e.target.value)}
							className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
						>
							<option value="">Categoria principal (cria novo grupo)</option>
							{gruposPrincipais.map((c) => (
								<option key={c.id} value={c.id}>
									{c.nome}
								</option>
							))}
						</select>
						<p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
							{temPai
								? `Os novos atributos serão adicionados a: ${
										gruposPrincipais.find((c) => String(c.id) === paiId)
											?.nome ?? ""
									} (máx. 2 níveis). Preencha o nome e salve.`
								: "Selecione um grupo para adicionar atributos a ele (máx. 2 níveis)."}
						</p>
					</div>
					{mensagem && (
						<div
							className={
								mensagem.sucesso
									? "rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-800 dark:bg-success-500/10 dark:text-success-400"
									: "rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400"
							}
						>
							{mensagem.texto}
						</div>
					)}
					<div className="flex flex-wrap gap-3">
						<Button type="submit" disabled={salvando}>
							{salvando
								? "Salvando..."
								: temPai
									? "Adicionar Atributo"
									: "Salvar"}
						</Button>
						<Button type="button" variant="outline" onClick={limpar}>
							Limpar
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() => setModalAberto(true)}
						>
							Categorias Cadastradas
						</Button>
					</div>
				</form>
			</div>

			<CategoriasListModal
				isOpen={modalAberto}
				onClose={() => setModalAberto(false)}
				onAlterado={recarregar}
			/>
		</div>
	);
}
