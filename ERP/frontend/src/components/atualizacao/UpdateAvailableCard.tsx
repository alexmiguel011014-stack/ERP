"use client";
import { useEffect, useState } from "react";
import { erpApi } from "@/lib/erpApi";

// Card global (fora da página /atualizacao) — pedido do dono: a checagem
// automática roda 1x/dia em qualquer tela (main.js), então o aviso "existe
// atualização, deseja instalar?" também precisa aparecer em qualquer tela,
// não só pra quem está olhando /atualizacao naquele momento.
type EventoStatus = {
	status:
		| "checking"
		| "available"
		| "not-available"
		| "download-progress"
		| "update-downloaded"
		| "error";
	progress?: number;
	message?: string;
	version?: string;
};

type Fase = "oculto" | "disponivel" | "baixando" | "erro";

export default function UpdateAvailableCard() {
	const [fase, setFase] = useState<Fase>("oculto");
	const [versao, setVersao] = useState<string | null>(null);
	const [progresso, setProgresso] = useState(0);
	const [erro, setErro] = useState<string | null>(null);

	useEffect(() => {
		function handler(e: Event) {
			const data = (e as CustomEvent<EventoStatus>).detail;
			if (!data) return;
			if (data.status === "available") {
				setVersao(data.version ?? null);
				setErro(null);
				setFase("disponivel");
			} else if (data.status === "download-progress") {
				setProgresso(Math.round(data.progress || 0));
			} else if (data.status === "update-downloaded") {
				// electron-updater não garante progress-event=100 antes deste
				// evento (ver useAtualizacao.ts) — força a barra pra cheia antes
				// de continuar, mesmo que o app feche/reabra rápido em seguida.
				setProgresso(100);
				// Continua sozinho pro install, sem esperar um segundo clique —
				// pedido explícito: "termina de atualizar depois inicia o app
				// sozinho".
				erpApi.sistema.quitAndInstall().catch(() => {});
			} else if (data.status === "error") {
				setFase((atual) => {
					if (atual === "oculto") return atual; // erro de checagem em segundo plano, sem fluxo aberto pro usuário — não interrompe
					setErro(data.message || "Erro desconhecido");
					return "erro";
				});
			}
		}
		window.addEventListener("update-status", handler);
		return () => window.removeEventListener("update-status", handler);
	}, []);

	if (fase === "oculto") return null;

	async function confirmar() {
		setFase("baixando");
		setProgresso(0);
		try {
			await erpApi.sistema.downloadUpdate();
			// "update-downloaded" chega pelo evento e dispara o install sozinho.
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
			setFase("erro");
		}
	}

	function dispensar() {
		setFase("oculto");
	}

	return (
		<div className="fixed bottom-4 right-4 z-[100000] w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900">
			{fase === "disponivel" && (
				<>
					<p className="text-sm font-medium text-gray-800 dark:text-white/90">
						Existe uma atualização{versao ? ` (v${versao})` : ""} disponível.
					</p>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						Deseja instalar agora?
					</p>
					<div className="mt-3 flex justify-end gap-2">
						<button
							type="button"
							onClick={dispensar}
							className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
						>
							Agora não
						</button>
						<button
							type="button"
							onClick={confirmar}
							className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
						>
							Sim, atualizar
						</button>
					</div>
				</>
			)}
			{fase === "baixando" && (
				<>
					<p className="text-sm font-medium text-gray-800 dark:text-white/90">
						Baixando atualização...
					</p>
					<div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
						<div
							className="h-full origin-left rounded-full bg-brand-500 transition-transform duration-300"
							style={{ transform: `scaleX(${progresso / 100})` }}
						/>
					</div>
					<p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
						{progresso}% — o app vai fechar e reabrir sozinho ao terminar.
					</p>
				</>
			)}
			{fase === "erro" && (
				<>
					<p className="text-sm font-medium text-error-600 dark:text-error-400">
						Erro ao atualizar
					</p>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{erro}
					</p>
					<div className="mt-3 flex justify-end">
						<button
							type="button"
							onClick={dispensar}
							className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
						>
							Fechar
						</button>
					</div>
				</>
			)}
		</div>
	);
}
