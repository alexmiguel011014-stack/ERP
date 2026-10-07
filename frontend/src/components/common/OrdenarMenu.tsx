"use client";
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/button/Button";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import type { OpcaoOrdenacao } from "@/lib/utils/ordenacao";

// Botão "Ordenar" no estilo do Explorador do Windows: abre um menu de opções
// (rádio) com a ativa marcada. Usado pelas listas de Produtos e Categorias
// (GOALS 30). Vive na barra do cabeçalho do modal — fora das regiões com
// overflow — pra o menu não ser cortado.
export default function OrdenarMenu({
	opcoes,
	valor,
	onChange,
}: {
	opcoes: OpcaoOrdenacao[];
	valor: string;
	onChange: (id: string) => void;
}) {
	const [aberto, setAberto] = useState(false);
	const raiz = useRef<HTMLDivElement>(null);
	const atual = opcoes.find((o) => o.id === valor);

	function itens(): HTMLButtonElement[] {
		return Array.from(
			raiz.current?.querySelectorAll<HTMLButtonElement>(
				'[role="menuitemradio"]',
			) ?? [],
		);
	}

	function devolverFocoAoBotao() {
		raiz.current?.querySelector<HTMLButtonElement>(".dropdown-toggle")?.focus();
	}

	function fechar() {
		setAberto(false);
	}

	function escolher(id: string) {
		onChange(id);
		setAberto(false);
		devolverFocoAoBotao();
	}

	// Ao abrir, foca a opção ativa — é daí que as setas e o Esc passam a valer.
	useEffect(() => {
		if (!aberto) return;
		const lista = itens();
		const ativo = lista.find((el) => el.getAttribute("aria-checked") === "true");
		(ativo ?? lista[0])?.focus();
	}, [aberto]);

	function aoTeclar(e: React.KeyboardEvent<HTMLDivElement>) {
		if (!aberto) return;
		if (e.key === "Escape") {
			// O Modal escuta Esc no `document` e fecharia a lista inteira junto com
			// o menu. No App Router o React hidrata o próprio `document`, então o
			// listener dele e o do Modal ficam no MESMO nó (stopPropagation não
			// separa os dois) — só stopImmediatePropagation, e o do React foi
			// registrado primeiro, barra o do Modal. Comprovado por e2e/
			// ordenacao-listas.spec.ts (Esc no menu mantém a lista aberta).
			e.nativeEvent.stopImmediatePropagation();
			e.preventDefault();
			fechar();
			devolverFocoAoBotao();
			return;
		}
		const lista = itens();
		const i = lista.findIndex((el) => el === document.activeElement);
		if (e.key === "ArrowDown") {
			e.preventDefault();
			lista[(i + 1) % lista.length]?.focus();
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			lista[(i - 1 + lista.length) % lista.length]?.focus();
		} else if (e.key === "Home") {
			e.preventDefault();
			lista[0]?.focus();
		} else if (e.key === "End") {
			e.preventDefault();
			lista[lista.length - 1]?.focus();
		}
	}

	return (
		<div ref={raiz} className="relative" onKeyDown={aoTeclar}>
			<Button
				size="sm"
				variant="outline"
				className="dropdown-toggle"
				title={atual ? `Ordenado por: ${atual.label}` : "Ordenar"}
				aria-haspopup="menu"
				aria-expanded={aberto}
				onClick={() => setAberto((v) => !v)}
				startIcon={
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<path d="M7 4v16M7 20l-3-3M7 20l3-3" />
						<path d="M17 20V4M17 4l-3 3M17 4l3 3" />
					</svg>
				}
			>
				Ordenar
			</Button>
			<Dropdown isOpen={aberto} onClose={fechar} className="w-72 p-2">
				<div role="menu" aria-label="Ordenar por">
					{opcoes.map((o, i) => {
						const ativa = o.id === valor;
						const novoGrupo = o.grupo !== "" && o.grupo !== opcoes[i - 1]?.grupo;
						return (
							<div key={o.id}>
								{novoGrupo && (
									<div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase text-gray-400">
										{o.grupo}
									</div>
								)}
								<button
									type="button"
									role="menuitemradio"
									aria-checked={ativa}
									onClick={() => escolher(o.id)}
									className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-hidden dark:hover:bg-white/5 dark:focus:bg-white/5 ${
										ativa
											? "font-semibold text-brand-600 dark:text-brand-400"
											: "text-gray-700 dark:text-gray-300"
									}`}
								>
									<span className="inline-flex w-4 justify-center" aria-hidden="true">
										{ativa ? "✓" : ""}
									</span>
									{o.label}
								</button>
							</div>
						);
					})}
				</div>
			</Dropdown>
		</div>
	);
}
