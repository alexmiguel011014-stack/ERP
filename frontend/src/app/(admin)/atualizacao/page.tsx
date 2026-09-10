"use client";
import { useMemo } from "react";
import Button from "@/components/ui/button/Button";
import { usePageHeader } from "@/context/PageHeaderContext";
import { useAtualizacao } from "@/hooks/useAtualizacao";
import ConfirmarInstalacaoModal from "@/components/atualizacao/ConfirmarInstalacaoModal";

// Cores pro status no header — fundo azul-marinho fixo, não usa o par
// light/dark que os cards no corpo da página usam.
const COR_STATUS_HEADER: Record<string, string> = {
	normal: "text-gray-300",
	vermelho: "font-semibold text-error-400",
	verde: "font-semibold text-success-400",
};

// Mesmo status, cores pro corpo da página (fundo claro/escuro normal) — ver
// COR_STATUS_HEADER acima pro porquê de existirem os dois.
const COR_STATUS_CORPO: Record<string, string> = {
	normal: "text-gray-500 dark:text-gray-400",
	vermelho: "font-semibold text-error-600 dark:text-error-400",
	verde: "font-semibold text-success-600 dark:text-success-400",
};

const COR_MENSAGEM: Record<string, string> = {
	success:
		"border-success-200 bg-success-50 text-success-700 dark:border-success-800 dark:bg-success-500/10 dark:text-success-400",
	info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-500/10 dark:text-blue-400",
	warning:
		"border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-800 dark:bg-warning-500/10 dark:text-warning-400",
	error:
		"border-error-200 bg-error-50 text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400",
};

export default function AtualizacaoPage() {
	const {
		versao,
		status,
		statusCor,
		progresso,
		mensagem,
		botaoDesabilitado,
		textoBotao,
		clicarBotao,
		confirmando,
		confirmarInstalacao,
		cancelarInstalacao,
	} = useAtualizacao();

	// Achado real (2026-08-29, investigação do travamento de navegação): sem
	// useMemo, esse JSX é um objeto NOVO a cada render — a dependência do
	// efeito dentro de usePageHeader (`[titulo, subtitulo]`) nunca era igual
	// à anterior, então o efeito reexecutava (setCabecalho(null) seguido de
	// setCabecalho({...})) a CADA render desta página. Como AtualizacaoPage
	// fica genuinamente montada mesmo escondida (AbasAtivasWrapper) e
	// useAtualizacao() mantém o listener de "update-status" vivo pra sempre,
	// cada evento reacendia esse ciclo — e PageHeaderProvider embrulha a
	// árvore inteira (TabsProvider/AppHeader/AbasAtivasWrapper), sem memo em
	// nenhum filho, então cada setCabecalho re-renderiza TODAS as abas em
	// cache, inclusive competindo com o commit da aba pra qual o usuário
	// acabou de navegar. Confirmado ao vivo: instrumentação temporária neste
	// arquivo (ver GOALS.md) mostrou o ciclo disparando repetidamente numa
	// aba escondida bem no momento em que a navegação pra outra aba travava.
	const subtituloHeader = useMemo(
		() => (
			<>
				Versão atual: <strong className="text-white">{versao}</strong>
				{" · "}
				<span className={COR_STATUS_HEADER[statusCor]}>{status}</span>
			</>
		),
		[versao, statusCor, status],
	);
	usePageHeader("Atualizações", subtituloHeader);

	return (
		<div className="grid grid-cols-1 gap-4">
			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
					Status
				</h2>
				<p className={`mt-1 text-sm ${COR_STATUS_CORPO[statusCor]}`}>
					{status}
				</p>
				{progresso !== null && (
					<>
						<div className="mt-3.5 h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
							<div
								className="h-full origin-left rounded-full bg-brand-500 transition-transform duration-300"
								style={{ transform: `scaleX(${progresso / 100})` }}
							/>
						</div>
						<p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
							{progresso}%
						</p>
					</>
				)}
			</div>

			{mensagem && (
				<div
					className={`rounded-xl border p-4 text-sm ${COR_MENSAGEM[mensagem.tipo]}`}
				>
					{mensagem.texto}
				</div>
			)}

			<div className="text-center">
				<Button onClick={clicarBotao} disabled={botaoDesabilitado}>
					{textoBotao}
				</Button>
			</div>

			<ConfirmarInstalacaoModal
				isOpen={confirmando}
				onClose={cancelarInstalacao}
				onConfirmar={confirmarInstalacao}
			/>
		</div>
	);
}
