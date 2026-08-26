"use client";
import { useState } from "react";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { useBancoAdmin } from "@/hooks/useBancoAdmin";

export default function BancoPage() {
	const {
		autorizado,
		autorizando,
		erroSenha,
		confirmarSenha,
		resumo,
		carregandoResumo,
		tabelaSelecionada,
		dadosTabela,
		carregandoTabela,
		erroTabela,
		consultar,
		atualizar,
		exportando,
		resultadoExportacao,
		erroExportacao,
		exportarJSON,
	} = useBancoAdmin();
	const [senha, setSenha] = useState("");

	if (!autorizado) {
		return (
			<div className="mx-auto mt-16 max-w-sm">
				<div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
					<h1 className="text-lg font-semibold text-gray-800 dark:text-white/90">
						Banco de Dados
					</h1>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						Área sensível — confirme sua senha para ver os dados crus.
					</p>
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

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
						Banco de Dados
					</h1>
					<p className="text-sm text-gray-500 dark:text-gray-400">
						Visão crua das tabelas do banco — use com cuidado
					</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" onClick={atualizar}>
						Atualizar
					</Button>
					<Button onClick={exportarJSON} disabled={exportando}>
						{exportando ? "Exportando..." : "Exportar Banco (JSON)"}
					</Button>
				</div>
			</div>

			{resultadoExportacao && (
				<div className="rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-700 dark:border-success-800 dark:bg-success-500/10 dark:text-success-400">
					{resultadoExportacao}
				</div>
			)}
			{erroExportacao && (
				<div className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
					Erro ao exportar: {erroExportacao}
				</div>
			)}

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
				{carregandoResumo ? (
					<div className="col-span-full animate-pulse text-sm text-gray-400">
						Carregando tabelas...
					</div>
				) : resumo.length === 0 ? (
					<div className="col-span-full text-sm text-gray-400">
						Nenhuma tabela encontrada.
					</div>
				) : (
					resumo.map((r) => (
						<button
							key={r.tabela}
							type="button"
							onClick={() => consultar(r.tabela)}
							className={`rounded-xl border p-3 text-left transition-colors ${
								tabelaSelecionada === r.tabela
									? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
									: "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:bg-white/5"
							}`}
						>
							<div className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">
								{r.tabela}
							</div>
							<div className="text-lg font-semibold text-gray-800 dark:text-white/90">
								{r.total}
							</div>
						</button>
					))
				)}
			</div>

			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<select
					value={tabelaSelecionada}
					onChange={(e) => e.target.value && consultar(e.target.value)}
					className="h-10 w-full max-w-xs rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
				>
					<option value="">Selecione a tabela...</option>
					{resumo.map((r) => (
						<option key={r.tabela} value={r.tabela}>
							{r.tabela}
						</option>
					))}
				</select>

				{tabelaSelecionada && (
					<p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
						<strong className="text-gray-800 dark:text-white/90">
							{tabelaSelecionada}
						</strong>
						{dadosTabela &&
							` · ${dadosTabela.total} registros (exibindo até ${dadosTabela.limite})`}
					</p>
				)}

				<div className="mt-3 overflow-x-auto">
					{carregandoTabela ? (
						<div className="py-8 text-center text-sm text-gray-400">
							Consultando {tabelaSelecionada}...
						</div>
					) : erroTabela ? (
						<div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
							{erroTabela}
						</div>
					) : !tabelaSelecionada ? (
						<div className="py-8 text-center text-sm text-gray-400">
							Selecione uma tabela acima para visualizar os registros.
						</div>
					) : !dadosTabela ||
						!dadosTabela.colunas.length ||
						!dadosTabela.linhas.length ? (
						<div className="py-8 text-center text-sm text-gray-400">
							Tabela vazia.
						</div>
					) : (
						<table className="w-full text-left text-sm">
							<thead>
								<tr className="border-b border-gray-100 dark:border-gray-800">
									{dadosTabela.colunas.map((c) => (
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
								{dadosTabela.linhas.map((linha, i) => (
									<tr
										key={i}
										className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
									>
										{dadosTabela.colunas.map((c) => {
											const v = linha[c];
											const texto =
												v && typeof v === "object"
													? JSON.stringify(v)
													: String(v ?? "");
											return (
												<td
													key={c}
													className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300"
												>
													{texto}
												</td>
											);
										})}
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			</div>
		</div>
	);
}
