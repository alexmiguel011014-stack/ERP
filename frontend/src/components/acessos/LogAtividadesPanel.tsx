"use client";
import { useState } from "react";
import { useLogAtividades } from "@/hooks/useLogAtividades";
import type { Usuario } from "@/lib/erpApi";

const ACOES_LOG = [
	"login",
	"criar-produto",
	"editar-produto",
	"excluir-produto",
	"restaurar-produto",
	"excluir-produto-permanente",
	"alterar-preco",
	"finalizar-venda",
	"criar-orcamento",
	"excluir-cliente",
	"restaurar-cliente",
	"excluir-cliente-permanente",
	"criar-pedido-compra",
	"receber-pedido-compra",
	"cancelar-pedido-compra",
	"criar-lancamento",
	"baixar-lancamento",
	"excluir-lancamento",
	"abrir-caixa",
	"fechar-caixa",
	"criar-usuario",
	"editar-usuario",
	"excluir-usuario",
];

function formatarDataHora(iso: string) {
	if (!iso) return "---";
	try {
		return new Date(iso).toLocaleString("pt-BR");
	} catch {
		return iso;
	}
}

export default function LogAtividadesPanel({
	usuarios,
}: {
	usuarios: Usuario[];
}) {
	const [usuarioId, setUsuarioId] = useState<number | null>(null);
	const [acao, setAcao] = useState("");
	const { linhas, carregando, erro, recarregar } = useLogAtividades(
		usuarioId,
		acao,
	);

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
				Log de atividades
			</h2>
			<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
				Ações de maior impacto no sistema, com quem fez e quando.
			</p>
			<div className="mt-3 flex flex-wrap items-center gap-2">
				<select
					value={usuarioId ?? ""}
					onChange={(e) =>
						setUsuarioId(e.target.value ? Number(e.target.value) : null)
					}
					className="h-9 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
				>
					<option value="">Todos os usuários</option>
					{usuarios.map((u) => (
						<option key={u.id} value={u.id}>
							{u.nome || u.login}
						</option>
					))}
				</select>
				<select
					value={acao}
					onChange={(e) => setAcao(e.target.value)}
					className="h-9 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
				>
					<option value="">Todas as ações</option>
					{ACOES_LOG.map((a) => (
						<option key={a} value={a}>
							{a}
						</option>
					))}
				</select>
				<button
					type="button"
					onClick={() => recarregar()}
					className="h-9 rounded-lg bg-gray-100 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-300"
				>
					Atualizar
				</button>
			</div>

			{erro && (
				<div className="mt-3 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-800 dark:bg-warning-500/10 dark:text-warning-400">
					{erro}
				</div>
			)}

			<div className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
				{carregando ? (
					<div className="py-6 text-center text-sm text-gray-400">
						Carregando...
					</div>
				) : linhas.length === 0 ? (
					<div className="py-6 text-center text-sm text-gray-400">
						Nenhuma atividade registrada.
					</div>
				) : (
					linhas.map((l) => (
						<div key={l.id} className="py-2.5 text-sm">
							<div className="font-medium text-gray-800 dark:text-white/90">
								{l.usuario_login || "sistema"} — {l.acao}
							</div>
							<div className="text-xs text-gray-500 dark:text-gray-400">
								{[
									formatarDataHora(l.data),
									l.entidade
										? l.entidade + (l.entidade_id ? " #" + l.entidade_id : "")
										: null,
									l.detalhes,
								]
									.filter(Boolean)
									.join(" | ")}
							</div>
						</div>
					))
				)}
			</div>
		</div>
	);
}
