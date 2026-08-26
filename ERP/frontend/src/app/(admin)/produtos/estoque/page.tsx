"use client";
import { useState } from "react";
import Button from "@/components/ui/button/Button";
import EstoqueReposicaoForm from "@/components/produtos/EstoqueReposicaoForm";
import EstoqueBaixaForm from "@/components/produtos/EstoqueBaixaForm";
import MovimentacoesList from "@/components/produtos/MovimentacoesList";
import EstoqueListaView from "@/components/produtos/EstoqueListaView";

export default function EstoquePage() {
	const [listaAberta, setListaAberta] = useState(false);
	const [buscaLista, setBuscaLista] = useState("");
	const [movimentacoesAbertas, setMovimentacoesAbertas] = useState(false);
	const [mensagem, setMensagem] = useState<{
		texto: string;
		sucesso: boolean;
	} | null>(null);

	function mostrarMensagem(texto: string, sucesso: boolean) {
		setMensagem({ texto, sucesso });
		setTimeout(() => setMensagem(null), 4500);
	}

	function abrirLista(buscaInicial: string) {
		setBuscaLista(buscaInicial);
		setListaAberta(true);
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<div>
				<h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
					Estoque
				</h1>
				<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Entradas, ajustes e histórico de movimentações.
				</p>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<div>
					<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
						Lista completa do estoque
					</h2>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						Todos os SKUs, estoque atual, mínimo e valorização, em uma aba
						própria.
					</p>
				</div>
				<Button onClick={() => abrirLista("")}>Ver Lista de Estoque</Button>
			</div>

			<EstoqueReposicaoForm
				onConfirmado={() => {}}
				onMensagem={mostrarMensagem}
				onAbrirLista={abrirLista}
			/>

			{mensagem && (
				<div
					className={
						mensagem.sucesso
							? "rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-700 dark:border-success-800 dark:bg-success-500/10 dark:text-success-400"
							: "rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400"
					}
				>
					{mensagem.texto}
				</div>
			)}

			<EstoqueBaixaForm
				onConfirmado={() => {}}
				onMensagem={mostrarMensagem}
				onAbrirLista={abrirLista}
			/>

			<div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<div>
					<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
						Últimas movimentações
					</h2>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						Histórico de entradas, baixas e ajustes, com filtro por categoria.
					</p>
				</div>
				<Button variant="outline" onClick={() => setMovimentacoesAbertas(true)}>
					Ver movimentações
				</Button>
			</div>

			<EstoqueListaView
				isOpen={listaAberta}
				onClose={() => setListaAberta(false)}
				buscaInicial={buscaLista}
			/>
			<MovimentacoesList
				isOpen={movimentacoesAbertas}
				onClose={() => setMovimentacoesAbertas(false)}
			/>
		</div>
	);
}
