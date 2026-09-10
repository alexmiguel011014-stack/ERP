"use client";
import { useEffect, useRef, useState } from "react";
import { erpApi, type CategoriaComUso } from "@/lib/erpApi";
import { Modal } from "@/components/ui/modal";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";

export default function CategoriaSelector({
	categorias,
	selecionados,
	onChange,
	onCategoriaCriada,
}: {
	categorias: CategoriaComUso[];
	selecionados: string[];
	onChange: (ids: string[]) => void;
	onCategoriaCriada: () => void;
}) {
	const [aberto, setAberto] = useState(false);
	const [busca, setBusca] = useState("");
	const [modalAberto, setModalAberto] = useState(false);
	const [novoNome, setNovoNome] = useState("");
	const [novoPaiId, setNovoPaiId] = useState("");
	const [novoCodigo, setNovoCodigo] = useState("");
	const [salvandoCat, setSalvandoCat] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!aberto) return;
		function handleClickFora(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setAberto(false);
			}
		}
		document.addEventListener("mousedown", handleClickFora, true);
		return () =>
			document.removeEventListener("mousedown", handleClickFora, true);
	}, [aberto]);

	const filtradas = busca.trim()
		? categorias.filter((c) =>
				[c.codigo, c.nome]
					.join(" ")
					.toLowerCase()
					.includes(busca.trim().toLowerCase()),
			)
		: categorias;

	function toggle(id: string) {
		if (selecionados.includes(id)) {
			onChange(selecionados.filter((s) => s !== id));
		} else {
			onChange([...selecionados, id]);
		}
	}

	function abrirModalAddCat() {
		setAberto(false);
		setNovoNome("");
		setNovoPaiId("");
		setModalAberto(true);
		erpApi.categorias
			.proximoCodigo()
			.then(setNovoCodigo)
			.catch(() => setNovoCodigo("---"));
	}

	async function salvarNovaCategoria() {
		const nome = novoNome.trim();
		if (!nome) return;
		setSalvandoCat(true);
		try {
			const resultado = await erpApi.categorias.salvar(
				nome,
				novoPaiId ? Number(novoPaiId) : null,
			);
			setModalAberto(false);
			onCategoriaCriada();
			if (resultado.id) onChange([...selecionados, String(resultado.id)]);
		} catch (e) {
			alert("Erro ao salvar: " + (e instanceof Error ? e.message : String(e)));
		} finally {
			setSalvandoCat(false);
		}
	}

	const label =
		selecionados.length === 0
			? "Selecionar categorias"
			: selecionados.length === 1
				? "1 selecionada"
				: `${selecionados.length} selecionadas`;
	const gruposPrincipais = categorias.filter((c) => !c.categoria_pai_id);

	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				onClick={() => setAberto((a) => !a)}
				className="flex h-11 w-full items-center justify-between rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
			>
				<span>{label}</span>
				<span className="text-gray-400">▾</span>
			</button>
			{aberto && (
				<div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
					<div className="p-2">
						<input
							autoFocus
							value={busca}
							onChange={(e) => setBusca(e.target.value)}
							placeholder="Buscar por código ou nome..."
							className="h-9 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
						/>
					</div>
					<div className="max-h-64 overflow-y-auto px-2">
						{filtradas.length === 0 ? (
							<div className="px-2 py-3 text-sm text-gray-400">
								Nenhuma categoria encontrada.
							</div>
						) : (
							filtradas.map((c) => (
								<label
									key={c.id}
									className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-white/5"
								>
									<input
										type="checkbox"
										checked={selecionados.includes(String(c.id))}
										onChange={() => toggle(String(c.id))}
									/>
									<span className="font-mono text-xs text-gray-400">
										{c.codigo}
									</span>
									<span className="text-gray-800 dark:text-white/90">
										{c.nome}
										{c.categoria_pai_nome && (
											<small className="ml-1 text-gray-400">
												{c.categoria_pai_nome}
											</small>
										)}
									</span>
								</label>
							))
						)}
					</div>
					<div className="border-t border-gray-100 p-2 dark:border-gray-800">
						<button
							type="button"
							onClick={abrirModalAddCat}
							className="w-full rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400"
						>
							+ Adicionar Categoria
						</button>
					</div>
				</div>
			)}

			{selecionados.length > 0 && (
				<div className="mt-2 flex flex-wrap gap-2">
					{selecionados.map((sid) => {
						const cat = categorias.find((c) => String(c.id) === sid);
						if (!cat) return null;
						return (
							<span
								key={sid}
								className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 dark:bg-white/10 dark:text-gray-200"
							>
								{cat.codigo} {cat.nome}
								<button
									type="button"
									onClick={() => toggle(sid)}
									className="text-gray-400 hover:text-gray-600"
								>
									×
								</button>
							</span>
						);
					})}
				</div>
			)}

			<Modal
				isOpen={modalAberto}
				onClose={() => setModalAberto(false)}
				className="max-w-[420px] p-6"
			>
				<h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
					Nova Categoria
				</h2>
				<div className="space-y-4">
					<div>
						<Label>Código</Label>
						<Input value={novoCodigo} disabled />
					</div>
					<div>
						<Label>Nome</Label>
						<Input
							value={novoNome}
							onChange={(e) => setNovoNome(e.target.value)}
							placeholder="Ex: Tamanhos, A1, Azul..."
						/>
					</div>
					<div>
						<Label>Agrupar em (opcional)</Label>
						<select
							value={novoPaiId}
							onChange={(e) => setNovoPaiId(e.target.value)}
							className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
						>
							<option value="">Nenhum (criar grupo principal)</option>
							{gruposPrincipais.map((c) => (
								<option key={c.id} value={c.id}>
									{c.nome}
								</option>
							))}
						</select>
					</div>
				</div>
				<div className="mt-6 flex justify-end gap-3">
					<Button
						variant="outline"
						type="button"
						onClick={() => setModalAberto(false)}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						onClick={salvarNovaCategoria}
						disabled={salvandoCat}
					>
						{salvandoCat ? "Salvando..." : "Salvar"}
					</Button>
				</div>
			</Modal>
		</div>
	);
}
