"use client";

import { useEffect, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { Modal } from "@/components/ui/modal";
import { useAbaVisivel } from "@/context/AbaVisivelContext";

interface EstoqueDialogProps {
	isOpen: boolean;
	title: string;
	onClose: () => void;
	busy: boolean;
	initialFocusRef?: RefObject<HTMLElement | null>;
	children: ReactNode;
}

export function EstoqueDialog({
	isOpen,
	title,
	onClose,
	busy,
	initialFocusRef,
	children,
}: EstoqueDialogProps) {
	const titleId = useId();
	const dialogRef = useRef<HTMLElement>(null);
	const titleRef = useRef<HTMLHeadingElement>(null);
	const busyRef = useRef(busy);
	const onCloseRef = useRef(onClose);
	const visivel = useAbaVisivel();
	const ativo = isOpen && visivel;

	useLayoutEffect(() => {
		busyRef.current = busy;
		onCloseRef.current = onClose;
	}, [busy, onClose]);

	useEffect(() => {
		if (!ativo) return;
		const frame = requestAnimationFrame(() => {
			(initialFocusRef?.current ?? titleRef.current)?.focus();
		});
		return () => cancelAnimationFrame(frame);
	}, [ativo, initialFocusRef]);

	useEffect(() => {
		if (!ativo) return;
		const conterTab = (event: KeyboardEvent) => {
			if (event.key !== "Tab") return;
			const dialog = dialogRef.current;
			if (!dialog) return;
			const modalAtual = dialog.closest(".modal");
			const modalDeOrigem =
				event.target instanceof Element ? event.target.closest(".modal") : null;
			if (modalDeOrigem && modalDeOrigem !== modalAtual) return;
			const focaveis = Array.from(
				dialog.querySelectorAll<HTMLElement>(
					'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
				),
			).filter(
				(element) =>
					element.getClientRects().length > 0 &&
					getComputedStyle(element).visibility !== "hidden" &&
					!element.closest("[inert], [aria-hidden='true']"),
			);
			if (focaveis.length === 0) {
				event.preventDefault();
				dialog.focus();
				return;
			}

			const atual = document.activeElement;
			const indice = focaveis.indexOf(atual as HTMLElement);
			if (indice === -1) {
				event.preventDefault();
				focaveis[event.shiftKey ? focaveis.length - 1 : 0].focus();
			} else if (event.shiftKey && indice === 0) {
				event.preventDefault();
				focaveis[focaveis.length - 1].focus();
			} else if (!event.shiftKey && indice === focaveis.length - 1) {
				event.preventDefault();
				focaveis[0].focus();
			}
		};
		document.addEventListener("keydown", conterTab, true);
		return () => document.removeEventListener("keydown", conterTab, true);
	}, [ativo]);

	const fechar = () => {
		if (!busyRef.current) onCloseRef.current();
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={fechar}
			className="max-w-[960px] p-0"
			showCloseButton={false}
		>
			<section
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				aria-busy={busy}
				tabIndex={-1}
				className="flex max-h-[calc(100dvh-3rem)] min-h-0 flex-col"
			>
				<header className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 p-4 dark:border-gray-800">
					<h2
						ref={(element) => {
							titleRef.current = element;
							if (initialFocusRef) initialFocusRef.current = element;
						}}
						id={titleId}
						tabIndex={-1}
						className="text-lg font-semibold text-gray-800 dark:text-white/90"
					>
						{title}
					</h2>
					<button
						type="button"
						onClick={fechar}
						disabled={busy}
						className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
					>
						Fechar
					</button>
				</header>
				<div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
			</section>
		</Modal>
	);
}
