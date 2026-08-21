"use client";

import { useEffect, useState } from "react";

// Componente descartável da Fase 0 (spike) — prova que window.api (exposto
// via preload/contextBridge) continua acessível quando a página é servida
// pelo protocolo customizado app://renderer/ em vez de file://. Remover
// quando a Fase 1 substituir isso por telas reais.
export default function IpcSmokeTest() {
	const [status, setStatus] = useState("verificando...");

	useEffect(() => {
		if (typeof window === "undefined" || !window.api) {
			setStatus("window.api indisponível (aberto fora do Electron?)");
			return;
		}
		const getAppVersion = window.api.getAppVersion;
		if (typeof getAppVersion !== "function") {
			setStatus("window.api existe, mas getAppVersion não foi encontrado");
			return;
		}
		getAppVersion()
			.then((versao) => setStatus("OK — versão via IPC: " + String(versao)))
			.catch((err) => setStatus("erro IPC: " + String(err)));
	}, []);

	return (
		<div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm font-mono text-yellow-900 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-200">
			[spike Fase 0] IPC smoke test: {status}
		</div>
	);
}
