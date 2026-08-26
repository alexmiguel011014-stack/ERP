"use client";
import { useRef, useState } from "react";
import Button from "@/components/ui/button/Button";
import { erpApi, type LinhaImportacaoVenda } from "@/lib/erpApi";

function validarFormato(dados: unknown): string | null {
	if (!Array.isArray(dados))
		return "O arquivo precisa conter uma lista (array) de vendas.";
	if (dados.length === 0) return "A lista está vazia.";
	for (let i = 0; i < dados.length; i++) {
		const l = dados[i] as Partial<LinhaImportacaoVenda> | null;
		if (!l || typeof l !== "object") return `Linha ${i + 1} inválida.`;
		if (!l.sku || !l.quantidade || l.valorUnitario === undefined || !l.data) {
			return `Linha ${i + 1} está com campos faltando (sku, quantidade, valorUnitario, data).`;
		}
	}
	return null;
}

export default function ImportacaoPage() {
	const inputRef = useRef<HTMLInputElement>(null);
	const [linhas, setLinhas] = useState<LinhaImportacaoVenda[] | null>(null);
	const [previa, setPrevia] = useState("");
	const [mensagem, setMensagem] = useState<{
		texto: string;
		tipo: "sucesso" | "erro";
	} | null>(null);
	const [importando, setImportando] = useState(false);

	function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
		setLinhas(null);
		setPrevia("");
		setMensagem(null);
		const arquivo = e.target.files?.[0];
		if (!arquivo) return;

		const leitor = new FileReader();
		leitor.onload = () => {
			let dados: unknown;
			try {
				dados = JSON.parse(String(leitor.result));
			} catch {
				setMensagem({ texto: "Arquivo não é um JSON válido.", tipo: "erro" });
				return;
			}
			const erroFormato = validarFormato(dados);
			if (erroFormato) {
				setMensagem({ texto: erroFormato, tipo: "erro" });
				return;
			}
			const validas = dados as LinhaImportacaoVenda[];
			setLinhas(validas);
			setPrevia(
				`${validas.length} linha(s) reconhecida(s) no arquivo. Linhas com SKU não cadastrado serão puladas na importação.`,
			);
		};
		leitor.onerror = () => {
			setMensagem({ texto: "Erro ao ler o arquivo.", tipo: "erro" });
		};
		leitor.readAsText(arquivo);
	}

	async function confirmarImportacao() {
		if (!linhas) return;
		if (
			!confirm(
				`Importar ${linhas.length} linha(s) de venda histórica? Essa ação não altera o estoque atual.`,
			)
		)
			return;
		setImportando(true);
		try {
			const resultado = await erpApi.vendas.importarHistorico(linhas);
			setMensagem({
				texto: `Importação concluída: ${resultado.importadas} venda(s) importada(s), ${resultado.puladas} pulada(s) de ${resultado.total} linha(s) no total.`,
				tipo: "sucesso",
			});
			setLinhas(null);
			setPrevia("");
			if (inputRef.current) inputRef.current.value = "";
		} catch (e) {
			setMensagem({
				texto:
					"Erro ao importar: " + (e instanceof Error ? e.message : String(e)),
				tipo: "erro",
			});
		} finally {
			setImportando(false);
		}
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<div>
				<h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
					Importação de Vendas Históricas
				</h1>
				<p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
					Popula o histórico de vendas a partir de um arquivo já normalizado,
					para que o cálculo automático de Custos Fixos e outros relatórios
					tenham dado real desde já — sem esperar um mês de uso do sistema.
				</p>
			</div>

			<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
				<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
					Selecionar arquivo
				</h2>
				<p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
					Arquivo <strong>.json</strong> com uma lista de vendas já tratadas, no
					formato:{" "}
					<code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-white/10">
						{
							'[{"sku": "P0001", "quantidade": 2, "valorUnitario": 150.00, "data": "2026-05-10"}, ...]'
						}
					</code>
					. Linhas com SKU não cadastrado são puladas automaticamente — esse
					tratamento de dado (mapear planilha, corrigir SKU, etc.) é feito
					antes, fora do ERP.
				</p>

				<div className="mt-4 max-w-md">
					<input
						ref={inputRef}
						type="file"
						accept="application/json,.json"
						onChange={handleArquivo}
						className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-600 hover:file:bg-brand-100 dark:text-gray-300 dark:file:bg-brand-500/10 dark:file:text-brand-400"
					/>
				</div>

				{previa && (
					<p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
						{previa}
					</p>
				)}

				<div className="mt-4">
					<Button
						onClick={confirmarImportacao}
						disabled={!linhas || importando}
					>
						{importando ? "Importando..." : "Confirmar Importação"}
					</Button>
				</div>
			</div>

			{mensagem && (
				<div
					className={
						mensagem.tipo === "sucesso"
							? "rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-700 dark:border-success-800 dark:bg-success-500/10 dark:text-success-400"
							: "rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400"
					}
				>
					{mensagem.texto}
				</div>
			)}
		</div>
	);
}
