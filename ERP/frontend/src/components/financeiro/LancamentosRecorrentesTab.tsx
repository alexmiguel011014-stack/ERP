"use client";
import { useEffect, useState } from "react";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import {
	erpApi,
	CATEGORIAS_FINANCEIRAS,
	type LancamentoRecorrente,
	type NovoLancamentoRecorrente,
} from "@/lib/erpApi";
import { formatarMoeda } from "@/components/dashboard/formatos";

export default function LancamentosRecorrentesTab() {
	const [lista, setLista] = useState<LancamentoRecorrente[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);
	const [mensagem, setMensagem] = useState<string | null>(null);

	const [tipo, setTipo] = useState<"receber" | "pagar">("pagar");
	const [descricao, setDescricao] = useState("");
	const [valor, setValor] = useState("");
	const [diaMes, setDiaMes] = useState("5");
	const [categoria, setCategoria] = useState("");
	const [salvando, setSalvando] = useState(false);

	function carregar() {
		setCarregando(true);
		erpApi.financeiro
			.lancamentosRecorrentes()
			.then(setLista)
			.catch((e) => setErro(e instanceof Error ? e.message : String(e)))
			.finally(() => setCarregando(false));
	}

	useEffect(() => {
		carregar();
	}, []);

	function mostrarMensagem(texto: string) {
		setMensagem(texto);
		setTimeout(() => setMensagem(null), 3500);
	}

	async function criar() {
		const dados: NovoLancamentoRecorrente = {
			tipo,
			descricao: descricao.trim(),
			valor: Number(valor),
			dia_mes: parseInt(diaMes, 10),
			categoria: categoria || null,
		};
		if (!dados.descricao) {
			setErro("Informe a descrição.");
			return;
		}
		if (!Number.isFinite(dados.valor) || dados.valor <= 0) {
			setErro("Valor inválido.");
			return;
		}
		setSalvando(true);
		setErro(null);
		try {
			await erpApi.financeiro.criarLancamentoRecorrente(dados);
			mostrarMensagem("Lançamento recorrente criado!");
			setDescricao("");
			setValor("");
			setCategoria("");
			carregar();
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setSalvando(false);
		}
	}

	async function alternar(item: LancamentoRecorrente) {
		try {
			await erpApi.financeiro.alternarLancamentoRecorrente(
				item.id,
				!item.ativo,
			);
			carregar();
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		}
	}

	async function remover(id: number) {
		if (!confirm("Remover este lançamento recorrente?")) return;
		try {
			await erpApi.financeiro.removerLancamentoRecorrente(id);
			mostrarMensagem("Removido.");
			carregar();
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		}
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
					Novo lançamento recorrente
				</h2>
				<p className="mt-1 text-xs text-gray-400">
					Gerado automaticamente todo mês no primeiro login do mês (mesmo padrão
					do backup automático) — não precisa lembrar de lançar de novo.
				</p>
				<div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
					<div>
						<Label>Tipo</Label>
						<select
							value={tipo}
							onChange={(e) =>
								setTipo(e.target.value === "receber" ? "receber" : "pagar")
							}
							className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
						>
							<option value="pagar">A pagar</option>
							<option value="receber">A receber</option>
						</select>
					</div>
					<div>
						<Label>Descrição</Label>
						<Input
							value={descricao}
							onChange={(e) => setDescricao(e.target.value)}
							placeholder="Ex: Aluguel"
						/>
					</div>
					<div>
						<Label>Valor (R$)</Label>
						<Input
							type="number"
							value={valor}
							onChange={(e) => setValor(e.target.value)}
							min="0.01"
							step={0.01}
						/>
					</div>
					<div>
						<Label>Dia do mês</Label>
						<Input
							type="number"
							value={diaMes}
							onChange={(e) => setDiaMes(e.target.value)}
							min="1"
							max="31"
							step={1}
						/>
					</div>
					<div>
						<Label>Categoria (opcional)</Label>
						<select
							value={categoria}
							onChange={(e) => setCategoria(e.target.value)}
							className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
						>
							<option value="">Sem categoria</option>
							{CATEGORIAS_FINANCEIRAS.map((c) => (
								<option key={c} value={c}>
									{c}
								</option>
							))}
						</select>
					</div>
				</div>
				<div className="mt-4 flex justify-end">
					<Button onClick={criar} disabled={salvando}>
						{salvando ? "Salvando..." : "Adicionar"}
					</Button>
				</div>
			</div>

			{mensagem && (
				<div className="rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-700 dark:border-success-800 dark:bg-success-500/10 dark:text-success-400">
					{mensagem}
				</div>
			)}
			{erro && (
				<div className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
					{erro}
				</div>
			)}

			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
					Lançamentos recorrentes cadastrados
				</h2>
				{carregando ? (
					<div className="py-6 text-center text-sm text-gray-400">
						Carregando...
					</div>
				) : lista.length === 0 ? (
					<div className="py-6 text-center text-sm text-gray-400">
						Nenhum lançamento recorrente cadastrado.
					</div>
				) : (
					<div className="mt-3 overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead>
								<tr className="border-b border-gray-100 dark:border-gray-800">
									<th className="px-3 py-2 text-xs font-medium uppercase text-gray-400">
										Descrição
									</th>
									<th className="px-3 py-2 text-xs font-medium uppercase text-gray-400">
										Tipo
									</th>
									<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
										Valor
									</th>
									<th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-400">
										Dia
									</th>
									<th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-400">
										Status
									</th>
									<th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-400">
										Ações
									</th>
								</tr>
							</thead>
							<tbody>
								{lista.map((item) => (
									<tr
										key={item.id}
										className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
									>
										<td className="px-3 py-2 font-medium text-gray-800 dark:text-white/90">
											{item.descricao}
											{item.categoria && (
												<span className="ml-2 text-xs text-gray-400">
													({item.categoria})
												</span>
											)}
										</td>
										<td className="px-3 py-2 text-gray-500 dark:text-gray-400">
											{item.tipo === "pagar" ? "A pagar" : "A receber"}
										</td>
										<td className="px-3 py-2 text-right">
											{formatarMoeda(item.valor)}
										</td>
										<td className="px-3 py-2 text-center">{item.dia_mes}</td>
										<td className="px-3 py-2 text-center">
											<button
												type="button"
												onClick={() => alternar(item)}
												className={
													item.ativo
														? "rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700 dark:bg-success-500/10 dark:text-success-400"
														: "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-white/5 dark:text-gray-400"
												}
											>
												{item.ativo ? "Ativo" : "Pausado"}
											</button>
										</td>
										<td className="px-3 py-2 text-right">
											<button
												type="button"
												onClick={() => remover(item.id)}
												className="text-xs font-semibold text-error-600 hover:text-error-700 dark:text-error-400"
											>
												Remover
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}
