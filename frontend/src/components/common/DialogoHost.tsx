"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
	registrarHostDeDialogos,
	type PedidoDialogo,
	type TipoAviso,
} from "@/lib/dialogo";

const COR_TITULO: Record<TipoAviso, string> = {
	erro: "text-error-600 dark:text-error-400",
	info: "text-gray-800 dark:text-white/90",
	sucesso: "text-success-600 dark:text-success-400",
};

const BTN_BASE =
	"inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-medium transition focus:outline-hidden focus-visible:ring-3 focus-visible:ring-brand-500/40";
const BTN_PRIMARIO = `${BTN_BASE} bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600`;
const BTN_SECUNDARIO = `${BTN_BASE} bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03] dark:hover:text-gray-300`;
const BTN_PERIGO = `${BTN_BASE} bg-error-500 text-white shadow-theme-xs hover:bg-error-600`;

// Renderiza o diálogo da vez (fila FIFO: chamadas simultâneas nunca se
// atropelam). Montado uma vez no layout autenticado, fora do host de abas — um
// diálogo nunca fica escondido por um `display:none` de aba e aparece por cima
// de qualquer modal aberto.
export default function DialogoHost() {
	const [fila, setFila] = useState<PedidoDialogo[]>([]);
	const raiz = useRef<HTMLDivElement>(null);
	const atual = fila[0] ?? null;

	useEffect(
		() =>
			registrarHostDeDialogos((pedido) => setFila((f) => [...f, pedido])),
		[],
	);

	// Foco inicial no botão certo (ver OpcoesConfirmar.destrutivo). O efeito
	// roda depois do commit, então os botões já existem no DOM.
	useEffect(() => {
		if (!atual) return;
		raiz.current
			?.querySelector<HTMLButtonElement>("[data-foco-inicial]")
			?.focus();
	}, [atual]);

	function responder(confirmou: boolean) {
		if (!atual) return;
		if (atual.tipo === "confirmar") atual.resolver(confirmou);
		else atual.resolver();
		setFila((f) => f.slice(1));
	}

	if (!atual) return null;

	const confirmando = atual.tipo === "confirmar";
	const destrutivo = confirmando && atual.opcoes.destrutivo === true;
	const titulo =
		atual.opcoes.titulo ?? (confirmando ? "Confirmar" : "Aviso");
	const tipoAviso: TipoAviso = confirmando
		? "info"
		: (atual.opcoes.tipo ?? "info");

	return (
		// Uma só instância do Modal enquanto a fila não esvazia: o foco do
		// teclado volta pra quem estava focado ANTES do primeiro diálogo (ver
		// Modal), não pro botão do diálogo anterior.
		<Modal
			isOpen
			onClose={() => responder(false)}
			showCloseButton={false}
			className="max-w-[420px] p-6"
		>
			<div ref={raiz} role="alertdialog" aria-modal="true" aria-label={titulo}>
				<h2
					className={`mb-2 text-lg font-semibold ${COR_TITULO[tipoAviso]}`}
				>
					{titulo}
				</h2>
				<p className="mb-5 whitespace-pre-line break-words text-sm text-gray-500 dark:text-gray-400">
					{atual.opcoes.mensagem}
				</p>
				<div className="flex justify-end gap-3">
					{confirmando ? (
						<>
							<button
								type="button"
								className={BTN_SECUNDARIO}
								onClick={() => responder(false)}
								{...(destrutivo ? { "data-foco-inicial": "" } : {})}
							>
								{atual.opcoes.cancelarLabel ?? "Cancelar"}
							</button>
							<button
								type="button"
								className={destrutivo ? BTN_PERIGO : BTN_PRIMARIO}
								onClick={() => responder(true)}
								{...(destrutivo ? {} : { "data-foco-inicial": "" })}
							>
								{atual.opcoes.confirmarLabel ?? "Confirmar"}
							</button>
						</>
					) : (
						<button
							type="button"
							className={BTN_PRIMARIO}
							onClick={() => responder(true)}
							data-foco-inicial=""
						>
							OK
						</button>
					)}
				</div>
			</div>
		</Modal>
	);
}
