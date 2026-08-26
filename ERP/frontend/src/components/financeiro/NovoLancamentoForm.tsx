"use client";
import { useState } from "react";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { erpApi, type NovoLancamento } from "@/lib/erpApi";

export default function NovoLancamentoForm({
	onSalvo,
	onErro,
}: {
	onSalvo: (tipo: "receber" | "pagar", mensagem: string) => void;
	onErro: (mensagem: string) => void;
}) {
	const [tipo, setTipo] = useState<"receber" | "pagar">("receber");
	const [descricao, setDescricao] = useState("");
	const [valor, setValor] = useState("");
	const [vencimento, setVencimento] = useState("");
	const [parcelas, setParcelas] = useState("1");
	const [salvando, setSalvando] = useState(false);

	async function adicionar() {
		const parcelasNum = Math.max(1, parseInt(parcelas, 10) || 1);
		const dados: NovoLancamento = {
			tipo,
			descricao: descricao.trim(),
			valor: Number(valor),
			data_vencimento: vencimento || null,
			parcelas: parcelasNum,
		};
		if (!dados.descricao) {
			onErro("Informe a descrição.");
			return;
		}
		if (!Number.isFinite(dados.valor) || dados.valor <= 0) {
			onErro("Valor inválido.");
			return;
		}
		setSalvando(true);
		try {
			await erpApi.financeiro.criarLancamento(dados);
			onSalvo(
				tipo,
				parcelasNum > 1
					? `Lançamento adicionado em ${parcelasNum} parcelas.`
					: "Lançamento adicionado.",
			);
			setDescricao("");
			setValor("");
			setVencimento("");
			setParcelas("1");
		} catch (e) {
			onErro(e instanceof Error ? e.message : String(e));
		} finally {
			setSalvando(false);
		}
	}

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
			<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
				Novo lançamento manual
			</h2>
			<div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
				<div>
					<Label>Tipo</Label>
					<select
						value={tipo}
						onChange={(e) =>
							setTipo(e.target.value === "pagar" ? "pagar" : "receber")
						}
						className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
					>
						<option value="receber">A receber</option>
						<option value="pagar">A pagar</option>
					</select>
				</div>
				<div className="col-span-2 sm:col-span-1">
					<Label>Descrição</Label>
					<Input
						value={descricao}
						onChange={(e) => setDescricao(e.target.value)}
						placeholder="Ex: Aluguel, energia, venda a prazo..."
					/>
				</div>
				<div>
					<Label>Valor (R$)</Label>
					<Input
						type="number"
						value={valor}
						onChange={(e) => setValor(e.target.value)}
						min="0.01"
						step={0.01}
					/>
				</div>
				<div>
					<Label>1º Vencimento</Label>
					<Input
						type="date"
						value={vencimento}
						onChange={(e) => setVencimento(e.target.value)}
					/>
				</div>
				<div>
					<Label>Parcelas</Label>
					<Input
						type="number"
						value={parcelas}
						onChange={(e) => setParcelas(e.target.value)}
						min="1"
						step={1}
					/>
				</div>
			</div>
			<div className="mt-4 flex justify-end">
				<Button onClick={adicionar} disabled={salvando}>
					{salvando ? "Adicionando..." : "Adicionar"}
				</Button>
			</div>
		</div>
	);
}
