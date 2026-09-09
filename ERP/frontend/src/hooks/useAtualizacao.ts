"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { erpApi } from "@/lib/erpApi";

// `autoUpdater` fala com o renderer via push (main.js#webContents.send ->
// preload.js redespacha como CustomEvent "update-status" em window), não
// request/response — por isso esse hook assina um listener de DOM em vez de
// só chamar erpApi uma vez, diferente de todo hook anterior deste app.
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
};

type Mensagem = {
	tipo: "success" | "info" | "warning" | "error";
	texto: string;
};

export function useAtualizacao() {
	const [versao, setVersao] = useState("--");
	const [status, setStatus] = useState("Verificando...");
	const [statusCor, setStatusCor] = useState<"normal" | "vermelho" | "verde">(
		"normal",
	);
	const [progresso, setProgresso] = useState<number | null>(null);
	const [mensagem, setMensagem] = useState<Mensagem | null>(null);
	const [baixando, setBaixando] = useState(false);
	const [baixado, setBaixado] = useState(false);
	const [disponivel, setDisponivel] = useState(false);
	const [botaoDesabilitado, setBotaoDesabilitado] = useState(false);
	const [confirmando, setConfirmando] = useState(false);
	const baixandoRef = useRef(false);

	function mostrarMensagem(tipo: Mensagem["tipo"], texto: string) {
		setMensagem({ tipo, texto });
		setTimeout(() => setMensagem(null), 8000);
	}

	useEffect(() => {
		function handler(e: Event) {
			const data = (e as CustomEvent<EventoStatus>).detail;
			if (!data) return;
			const s = data.status;
			if (s === "checking") {
				if (!baixandoRef.current) {
					setStatus("Verificando...");
					setStatusCor("normal");
				}
			} else if (s === "available") {
				setDisponivel(true);
				setBaixado(false);
				setProgresso(null);
				setStatus("Nova versão disponível para atualizar");
				setStatusCor("vermelho");
				mostrarMensagem(
					"warning",
					"Nova versão disponível. Clique em Atualizar.",
				);
				setBotaoDesabilitado(false);
			} else if (s === "not-available") {
				setDisponivel(false);
				setBaixado(false);
				setProgresso(null);
				setStatus("Aplicativo atualizado");
				setStatusCor("verde");
				mostrarMensagem("success", "Seu aplicativo está atualizado.");
				setBotaoDesabilitado(false);
			} else if (s === "download-progress") {
				baixandoRef.current = true;
				setBaixando(true);
				setStatus(`Baixando... ${Math.round(data.progress || 0)}%`);
				setStatusCor("normal");
				setBotaoDesabilitado(true);
				setProgresso(Math.round(data.progress || 0));
			} else if (s === "update-downloaded") {
				baixandoRef.current = false;
				setBaixando(false);
				setBaixado(true);
				// Achado real (2026-09-01): electron-updater não garante que o
				// último evento "download-progress" chegue exatamente em 100%
				// antes de "update-downloaded" disparar — a barra desta página
				// ficava visualmente travada em qualquer que fosse o último valor
				// (às vezes 0%), mesmo com o texto já dizendo "concluído".
				setProgresso(100);
				setStatus("Download concluído. Clique para instalar.");
				setStatusCor("normal");
				mostrarMensagem(
					"success",
					"Atualização pronta. Clique em Atualizar para instalar.",
				);
				setBotaoDesabilitado(false);
			} else if (s === "error") {
				baixandoRef.current = false;
				setBaixando(false);
				setProgresso(null);
				setBotaoDesabilitado(false);
				setStatus("Erro");
				setStatusCor("vermelho");
				mostrarMensagem(
					"error",
					"Erro na atualização: " + (data.message || "desconhecido"),
				);
			}
		}
		window.addEventListener("update-status", handler);
		return () => window.removeEventListener("update-status", handler);
	}, []);

	const check = useCallback(() => {
		if (!window.api?.checkForUpdates) return;
		setStatus("Verificando...");
		setStatusCor("normal");
		erpApi.sistema.checkForUpdates().catch((e: unknown) => {
			// Sem isso, uma falha aqui (timeout de rede, ver ipc/sistema.js)
			// deixava a tela presa em "Verificando..." pra sempre, sem erro e
			// sem jeito de tentar de novo — bug real reportado ("travou" ao
			// clicar em Atualizações).
			setStatus("Erro ao verificar");
			setStatusCor("vermelho");
			setBotaoDesabilitado(false);
			mostrarMensagem("error", e instanceof Error ? e.message : String(e));
		});
	}, []);

	const download = useCallback(() => {
		if (!window.api?.downloadUpdate) return;
		baixandoRef.current = true;
		setBaixando(true);
		setProgresso(0);
		setBotaoDesabilitado(true);
		setStatus("Baixando atualização...");
		setStatusCor("normal");
		erpApi.sistema
			.downloadUpdate()
			.then(() => {
				baixandoRef.current = false;
				setBaixando(false);
				setStatus("Download concluído. Clique para instalar.");
				mostrarMensagem("success", "Atualização baixada com sucesso.");
				setBotaoDesabilitado(false);
			})
			.catch((err: unknown) => {
				baixandoRef.current = false;
				setBaixando(false);
				const texto = err instanceof Error ? err.message : String(err);
				const msg =
					texto.indexOf("latest.yml") !== -1
						? "Nenhuma atualização encontrada."
						: "Erro ao baixar. Verifique sua conexão.";
				setBotaoDesabilitado(false);
				setStatus("Erro no download");
				setStatusCor("vermelho");
				mostrarMensagem("error", msg);
			});
	}, []);

	// Instalar precisa de uma confirmação explícita ("reinicia o app, deseja
	// prosseguir?") antes de disparar — pedido do dono. Este hook abre o
	// diálogo; clicarBotao() nunca chama install direto.
	function clicarBotao() {
		if (baixando) return;
		if (baixado) {
			setConfirmando(true);
		} else if (disponivel) {
			download();
		} else {
			check();
		}
	}

	function confirmarInstalacao() {
		setConfirmando(false);
		setBaixado(false);
		// package.json -> build.nsis tem oneClick:true — a partir daqui o
		// instalador NSIS assume sozinho (fecha o app, mostra sua própria janela
		// de progresso automática, reabre o app), sem nenhuma etapa manual e sem
		// nenhuma UI nossa nesse meio-tempo. Só resta tratar o caso em que a
		// PRÓPRIA chamada falha (ex.: download não confirmado no processo
		// principal) — aí o app nem chega a fechar, e o erro aparece aqui como
		// qualquer outro erro desta tela.
		erpApi.sistema.quitAndInstall().catch((e: unknown) => {
			setStatus("Erro ao instalar");
			setStatusCor("vermelho");
			mostrarMensagem("error", e instanceof Error ? e.message : String(e));
		});
	}

	function cancelarInstalacao() {
		setConfirmando(false);
	}

	// Texto do botão reflete o estado atual em vez do "Atualizar" fixo de
	// antes — pedido explícito do dono (2026-09-08): precisa dizer "Baixar
	// atualização" quando há uma nova versão, e virar "Instalar" (mesmo botão,
	// mesmo lugar) assim que o download termina.
	const textoBotao = baixando
		? `Baixando... ${progresso ?? 0}%`
		: baixado
			? "Instalar"
			: disponivel
				? "Baixar atualização"
				: "Verificar atualizações";

	useEffect(() => {
		if (window.api?.getAppVersion) {
			erpApi.sistema
				.getAppVersion()
				.then((v) => setVersao(v))
				.catch(() => {
					setStatus("Versão não identificada");
					setStatusCor("vermelho");
				});
		}
		check();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return {
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
	};
}
