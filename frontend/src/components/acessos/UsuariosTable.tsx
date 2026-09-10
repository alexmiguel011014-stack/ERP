"use client";
import { useState } from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { erpApi, parsePermissoesUsuario, type Usuario } from "@/lib/erpApi";

const LABEL_PERFIL: Record<string, string> = {
	admin: "ADM",
	dono: "DONO",
	vendedor: "FUNCIONÁRIO",
};

export default function UsuariosTable({
	usuarios,
	onEditar,
	onAlterado,
}: {
	usuarios: Usuario[];
	onEditar: (u: Usuario) => void;
	onAlterado: () => void;
}) {
	const { sessao } = useAuth();
	const [processandoId, setProcessandoId] = useState<number | null>(null);

	async function alternarAtivo(u: Usuario) {
		setProcessandoId(u.id);
		try {
			await erpApi.usuarios.salvar({
				id: u.id,
				login: u.login,
				nome: u.nome,
				perfil: u.perfil,
				comissao_percentual: Number(u.comissao_percentual) || 0,
				permissoes: parsePermissoesUsuario(u.permissoes),
				ativo: Number(u.ativo) !== 1,
				senha: "",
			});
			onAlterado();
		} catch (e) {
			alert("Erro: " + (e instanceof Error ? e.message : String(e)));
		} finally {
			setProcessandoId(null);
		}
	}

	async function excluir(u: Usuario) {
		if (
			!confirm(
				`Excluir o usuário "${u.nome || u.login}" (${u.login})? Esta ação não pode ser desfeita.`,
			)
		)
			return;
		setProcessandoId(u.id);
		try {
			await erpApi.usuarios.remover(u.id);
			onAlterado();
		} catch (e) {
			alert("Erro: " + (e instanceof Error ? e.message : String(e)));
		} finally {
			setProcessandoId(null);
		}
	}

	return (
		<div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
			<div className="overflow-x-auto">
				<Table>
					<TableHeader className="border-b border-gray-100 dark:border-gray-800">
						<TableRow>
							<TableCell
								isHeader
								className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-400"
							>
								Nome
							</TableCell>
							<TableCell
								isHeader
								className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-400"
							>
								Login
							</TableCell>
							<TableCell
								isHeader
								className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-400"
							>
								Perfil
							</TableCell>
							<TableCell
								isHeader
								className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-400"
							>
								Status
							</TableCell>
							<TableCell
								isHeader
								className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-400"
							>
								Ações
							</TableCell>
						</TableRow>
					</TableHeader>
					<TableBody>
						{usuarios.length === 0 ? (
							<TableRow>
								<TableCell className="px-4 py-8 text-center text-sm text-gray-400">
									Nenhum usuário cadastrado.
								</TableCell>
							</TableRow>
						) : (
							usuarios.map((u) => {
								const eu = sessao.usuario?.id === u.id;
								const ativo = Number(u.ativo) === 1;
								const processando = processandoId === u.id;
								return (
									<TableRow
										key={u.id}
										className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
									>
										<TableCell className="px-4 py-2.5 text-sm font-medium text-gray-800 dark:text-white/90">
											{u.nome || u.login}
											{eu && (
												<span className="ml-1 text-xs text-gray-400">
													(você)
												</span>
											)}
										</TableCell>
										<TableCell className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">
											{u.login}
										</TableCell>
										<TableCell className="px-4 py-2.5">
											<span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
												{LABEL_PERFIL[u.perfil] ||
													String(u.perfil).toUpperCase()}
											</span>
										</TableCell>
										<TableCell className="px-4 py-2.5">
											<span
												className={
													ativo
														? "rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-600 dark:bg-success-500/10 dark:text-success-400"
														: "rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500 dark:bg-white/5 dark:text-gray-400"
												}
											>
												{ativo ? "Ativo" : "Desativado"}
											</span>
										</TableCell>
										<TableCell className="px-4 py-2.5">
											<div className="flex flex-wrap gap-2">
												<button
													onClick={() => onEditar(u)}
													className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400"
												>
													Editar
												</button>
												{!eu && (
													<button
														onClick={() => alternarAtivo(u)}
														disabled={processando}
														className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:bg-white/5 dark:text-gray-300"
													>
														{ativo ? "Desativar" : "Ativar"}
													</button>
												)}
												<button
													onClick={() => excluir(u)}
													disabled={eu || processando}
													title={
														eu ? "Você está logado com este usuário" : undefined
													}
													className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-semibold text-error-600 hover:bg-error-100 disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400"
												>
													{processando ? "..." : "Excluir"}
												</button>
											</div>
										</TableCell>
									</TableRow>
								);
							})
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
