"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import EstoqueProdutoSelector from "@/components/produtos/EstoqueProdutoSelector";
import type { ItemReposicao } from "@/hooks/useEstoqueReposicao";
import { erpApi, type ProdutoVariacao } from "@/lib/erpApi";
import { formatarMoeda } from "@/components/dashboard/formatos";
import {
	formatarAtributos,
	lerDecimalInformado,
} from "@/lib/utils/formatos";


export function EntradaUnica({
	variacao_id,
	sku,
	quantidade_estoque,
	onSucesso,
	onEstadoSujo,
	onRegistrandoChange,
	onMensagem,
}: {
	variacao_id: number;
	sku: string;
	quantidade_estoque: number;
	onSucesso: (quantidade: number) => void;
	onEstadoSujo: (sujo: boolean) => void;
	onRegistrandoChange: (registrando: boolean) => void;
	onMensagem: (texto: string, sucesso: boolean) => void;
}) {
	const [quantidade, setQuantidade] = useState("1");
	const [custo, setCusto] = useState("");
	const [observacaoUnica, setObservacaoUnica] = useState("");
	const [saldoAtual, setSaldoAtual] = useState(quantidade_estoque);
	const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
	const [registrando, setRegistrando] = useState(false);
	const envioEmCurso = useRef(false);
	const idCampos = useId();
	const botaoRegistrarRef = useRef<HTMLButtonElement>(null);
	const restaurarFocoRegistrarRef = useRef(false);
	const sujo = quantidade !== "1" || custo !== "" || observacaoUnica !== "";
	const qtdNum = Number(quantidade);
	const saldoEstimado = Number.isInteger(qtdNum) && qtdNum > 0
		? saldoAtual + qtdNum
		: null;

	useEffect(() => {
		onEstadoSujo(sujo);
	}, [onEstadoSujo, sujo]);

	useEffect(() => {
		setSaldoAtual(quantidade_estoque);
	}, [quantidade_estoque]);

	useLayoutEffect(() => {
		if (confirmacaoAberta || !restaurarFocoRegistrarRef.current) return;
		restaurarFocoRegistrarRef.current = false;
		botaoRegistrarRef.current?.focus();
	}, [confirmacaoAberta]);

	async function confirmarEntrada() {
		if (envioEmCurso.current) return;
		const quantidadeValidada = Number(quantidade);
		if (!Number.isInteger(quantidadeValidada) || quantidadeValidada <= 0) {
			onMensagem("Quantidade inválida.", false);
			return;
		}
		const custoValidado = custo.trim() ? lerDecimalInformado(custo) : null;
		if (
			custo.trim() &&
			(custoValidado === null || !Number.isFinite(custoValidado) || custoValidado < 0)
		) {
			onMensagem("Custo inválido.", false);
			return;
		}

		envioEmCurso.current = true;
		setRegistrando(true);
		onRegistrandoChange(true);
		setConfirmacaoAberta(false);
		try {
			await erpApi.estoque.registrarEntrada({
				itens: [{
					variacao_id,
					quantidade: quantidadeValidada,
					custo_unitario: custoValidado,
				}],
				observacao: observacaoUnica.trim() || null,
				origem: "manual",
			});
		} catch (erro) {
			const texto = erro instanceof Error ? erro.message : String(erro);
			onMensagem("Erro ao registrar entrada: " + texto, false);
			setRegistrando(false);
			onRegistrandoChange(false);
			envioEmCurso.current = false;
			return;
		}

		setSaldoAtual((atual) => atual + quantidadeValidada);
		setQuantidade("1");
		setCusto("");
		setObservacaoUnica("");
		try {
			onSucesso(quantidadeValidada);
		} catch {
			onMensagem("Entrada registrada; não foi possível atualizar os dados exibidos.", false);
		}
		setRegistrando(false);
		onRegistrandoChange(false);
		envioEmCurso.current = false;
	}

	return (
		<div className="mt-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<div>
					<Label htmlFor={`${idCampos}-quantidade`}>Quantidade recebida</Label>
					<Input id={`${idCampos}-quantidade`} type="number" min="1" step={1} value={quantidade} disabled={registrando} onChange={(evento) => setQuantidade(evento.target.value)} />
				</div>
				<div>
					<Label htmlFor={`${idCampos}-custo`}>Custo unitário (R$)</Label>
					<Input id={`${idCampos}-custo`} type="text" inputMode="decimal" placeholder="opcional" value={custo} disabled={registrando} onChange={(evento) => setCusto(evento.target.value)} />
				</div>
				<div>
					<Label htmlFor={`${idCampos}-observacao`}>Observação</Label>
					<Input id={`${idCampos}-observacao`} value={observacaoUnica} placeholder="Ex: NF 1234" disabled={registrando} onChange={(evento) => setObservacaoUnica(evento.target.value)} />
				</div>
			</div>
			<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
				<span className="text-gray-600 dark:text-gray-300">Saldo atual: {saldoAtual} · SKU: {sku}</span>
				<strong className="text-gray-800 dark:text-white/90">Saldo estimado: {saldoEstimado ?? "—"}</strong>
			</div>
			{sujo && <p className="mt-2 text-sm text-warning-700 dark:text-warning-400" role="status">Alterações não salvas</p>}
			{confirmacaoAberta ? (
				<div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-500/10" role="group" aria-label="Confirmar entrada individual">
					<p className="text-sm text-gray-800 dark:text-white/90">Adicionar {quantidadeValidadaLabel(quantidade)} unidade(s) ao SKU {sku}?</p>
					<div className="mt-3 flex gap-3">
						<Button onClick={confirmarEntrada} disabled={registrando}>{registrando ? "Registrando..." : "Confirmar entrada"}</Button>
						<Button variant="outline" type="button" onClick={() => {
							restaurarFocoRegistrarRef.current = true;
							setConfirmacaoAberta(false);
						}} disabled={registrando}>Voltar</Button>
					</div>
				</div>
			) : (
				<Button ref={botaoRegistrarRef} className="mt-4" type="button" onClick={() => setConfirmacaoAberta(true)} disabled={registrando}>Registrar entrada individual</Button>
			)}
		</div>
	);
}

function quantidadeValidadaLabel(valor: string) {
	const numero = Number(valor);
	return Number.isFinite(numero) ? numero : "a quantidade";
}
export default function EstoqueReposicaoForm({
	itens,
	setItens,
	limparItens,
	observacao,
	setObservacao,
	limparObservacao,
	onRegistrandoChange,
	onConfirmado,
}: {
	itens: ItemReposicao[];
	setItens: Dispatch<SetStateAction<ItemReposicao[]>>;
	limparItens: () => void;
	observacao: string;
	setObservacao: Dispatch<SetStateAction<string>>;
	limparObservacao: () => void;
	onRegistrandoChange: (registrando: boolean) => void;
	onConfirmado: () => void;
}) {
	const [selectorKey, setSelectorKey] = useState(0);
	const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false);
	const [confirmacaoReposicao, setConfirmacaoReposicao] = useState(false);
	const [qtd, setQtd] = useState("1");
	const [custo, setCusto] = useState("");
	const [produtoAtual, setProdutoAtual] = useState<ProdutoVariacao | null>(
		null,
	);
	const [itemInativo, setItemInativo] = useState<number | null>(null);
	const [mensagemErro, setMensagemErro] = useState<string | null>(null);
	const envioEmCurso = useRef(false);
	const [confirmando, setConfirmando] = useState(false);
	const idCampos = useId();
	const botaoLimparRef = useRef<HTMLButtonElement>(null);
	const botaoConfirmarReposicaoRef = useRef<HTMLButtonElement>(null);
	const restaurarFocoLimparRef = useRef(false);
	const restaurarFocoReposicaoRef = useRef(false);

	useLayoutEffect(() => {
		if (confirmandoLimpeza || !restaurarFocoLimparRef.current) return;
		restaurarFocoLimparRef.current = false;
		botaoLimparRef.current?.focus();
	}, [confirmandoLimpeza]);

	useLayoutEffect(() => {
		if (confirmacaoReposicao || !restaurarFocoReposicaoRef.current) return;
		restaurarFocoReposicaoRef.current = false;
		botaoConfirmarReposicaoRef.current?.focus();
	}, [confirmacaoReposicao]);

	async function adicionarItem() {
		const p = produtoAtual;
		if (!p) {
			setMensagemErro("Selecione uma variação antes de adicionar.");
			return;
		}
		const qtdNum = Number(qtd);
		if (!Number.isInteger(qtdNum) || qtdNum <= 0) {
			setMensagemErro("Quantidade inválida.");
			return;
		}
		const custoNum = custo.trim() ? lerDecimalInformado(custo) : null;
		if (
			custo.trim() &&
			(custoNum === null || !Number.isFinite(custoNum) || custoNum < 0)
		) {
			setMensagemErro("Custo inválido.");
			return;
		}
		setMensagemErro(null);

		setItens((atual) => {
			const existente = atual.find((i) => i.variacao_id === p!.id);
			if (existente) {
				return atual.map((i) =>
					i.variacao_id === p!.id
						? {
								...i,
								quantidade: i.quantidade + qtdNum,
								custo_unitario: custoNum !== null ? custoNum : i.custo_unitario,
							}
						: i,
				);
			}
			return [
				...atual,
				{
					variacao_id: p!.id,
					nome: p!.nome,
					detalhes: formatarAtributos(p!.atributos, p!.tamanho, p!.cor),
					sku: p!.sku,
					quantidade: qtdNum,
					custo_unitario: custoNum,
				},
			];
		});

		setProdutoAtual(null);
		setSelectorKey((atual) => atual + 1);
		setQtd("1");
		setCusto("");
	}

	function removerItem(variacaoId: number) {
		setItens((atual) => atual.filter((i) => i.variacao_id !== variacaoId));
		if (itemInativo === variacaoId) setItemInativo(null);
		setMensagemErro(null);
	}

	function limparCamposLote() {
		limparItens();
		limparObservacao();
		setItemInativo(null);
		setProdutoAtual(null);
		setQtd("1");
		setCusto("");
		setMensagemErro(null);
		setSelectorKey((atual) => atual + 1);
		setConfirmandoLimpeza(false);
	}

	function limpar() {
		if (itens.length > 0 || observacao.trim()) {
			setConfirmandoLimpeza(true);
			return;
		}
		limparCamposLote();
	}

	function confirmarReposicao() {
		if (itens.length === 0) return;
		setMensagemErro(null);
		setConfirmacaoReposicao(true);
	}

	async function registrarReposicao() {
		if (envioEmCurso.current || itens.length === 0) return;
		envioEmCurso.current = true;
		setConfirmando(true);
		onRegistrandoChange(true);
		setMensagemErro(null);
		setItemInativo(null);
		try {
			await erpApi.estoque.registrarEntrada({
				itens: itens.map((i) => ({
					variacao_id: i.variacao_id,
					quantidade: i.quantidade,
					custo_unitario: i.custo_unitario,
				})),
				observacao: observacao.trim() || null,
				origem: "manual",
			});
		} catch (e) {
			const texto = e instanceof Error ? e.message : String(e);
			const variacaoInativa = /produto inativo.*\(variação (\d+)\)/i.exec(texto);
			if (variacaoInativa) setItemInativo(Number(variacaoInativa[1]));
			setMensagemErro("Erro ao registrar entrada: " + texto);
			setConfirmacaoReposicao(true);
			return;
		} finally {
			setConfirmando(false);
			onRegistrandoChange(false);
			envioEmCurso.current = false;
		}
		limparItens();
		limparObservacao();
		setConfirmacaoReposicao(false);
		setProdutoAtual(null);
		setQtd("1");
		setCusto("");
		setSelectorKey((atual) => atual + 1);
		onConfirmado();
	}

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
		<fieldset disabled={confirmando} className="min-w-0 border-0 p-0">
			<h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
				Repor Estoque
			</h2>
			<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
				Registre mercadoria recebida ou produzida — soma ao saldo atual do SKU.
			</p>
			{mensagemErro && (
				<div className="mt-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400" role="alert">
					{mensagemErro}
				</div>
			)}
			<div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
				<div className="col-span-2 min-w-0">
					<EstoqueProdutoSelector key={selectorKey} onSelecionar={(produto) => {
						setProdutoAtual(produto);
						setCusto("");
						setMensagemErro(null);
					}} />
				</div>
				<div>
					<Label htmlFor={`${idCampos}-quantidade`}>Quantidade recebida</Label>
					<Input
						id={`${idCampos}-quantidade`}
						type="number"
						value={qtd}
						onChange={(e) => setQtd(e.target.value)}
						min="1"
						step={1}
					/>
				</div>
				<div>
					<Label htmlFor={`${idCampos}-custo`}>Custo unitário (R$)</Label>
					<Input
						id={`${idCampos}-custo`}
						type="text"
						inputMode="decimal"
						value={custo}
						onChange={(e) => setCusto(e.target.value)}
						min="0"
						step={0.01}
						placeholder="opcional"
					/>
				</div>
			</div>
			{produtoAtual && (
				<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
					{produtoAtual.nome} ({formatarAtributos(produtoAtual.atributos, produtoAtual.tamanho, produtoAtual.cor)}) — SKU: {produtoAtual.sku} | Estoque atual: {produtoAtual.quantidade_estoque} | Custo médio: {formatarMoeda(produtoAtual.preco_custo)}
				</p>
			)}
			<div className="mt-3">
				<Button type="button" variant="outline" onClick={adicionarItem}>
					Adicionar à reposição
				</Button>
			</div>

			<div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
				{itens.length === 0 ? (
					<div className="py-4 text-center text-sm text-gray-400">
						Nenhum item adicionado.
					</div>
				) : (
					itens.map((item) => (
						<div
							key={item.variacao_id}
							className="flex items-center justify-between gap-3 py-2.5"
						>
							<div>
								<div className="text-sm font-medium text-gray-800 dark:text-white/90">
									{item.nome} ({item.detalhes})
								</div>
								{itemInativo === item.variacao_id && <p className="text-xs text-error-600" role="alert">Produto inativo. Remova este item para registrar os demais.</p>}
								<div className="text-xs text-gray-500 dark:text-gray-400">
									SKU: {item.sku} | Qtd: {item.quantidade} |{" "}
									{item.custo_unitario !== null
										? "Custo: " + formatarMoeda(item.custo_unitario)
										: "Custo: não informado"}
								</div>
							</div>
							<button
								onClick={() => removerItem(item.variacao_id)}
								className="shrink-0 rounded-lg bg-error-50 px-3 py-1.5 text-xs font-semibold text-error-600 hover:bg-error-100 dark:bg-error-500/10 dark:text-error-400"
							>
								Remover
							</button>
						</div>
					))
				)}
			</div>

			<div className="mt-3 max-w-md">
				<Label>Observação</Label>
				<Input
					value={observacao}
					onChange={(e) => setObservacao(e.target.value)}
					placeholder="Ex: NF 1234, reposição semanal..."
				/>
			</div>
			<div className="mt-4 flex gap-3">
				<Button
					ref={botaoConfirmarReposicaoRef}
					variant="primary"
					onClick={confirmarReposicao}
					disabled={itens.length === 0 || confirmando}
				>
					{confirmando ? "Registrando..." : "Confirmar Reposição"}
				</Button>
				<Button ref={botaoLimparRef} variant="outline" type="button" onClick={limpar}>
					Limpar
				</Button>
			</div>
			{confirmacaoReposicao && (
				<div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-500/10" role="group" aria-label="Confirmar reposição">
					<p className="text-sm text-gray-800 dark:text-white/90">Confirmar entrada de {itens.length} item(ns) no estoque?</p>
					<div className="mt-3 flex gap-3">
						<Button type="button" onClick={registrarReposicao} disabled={confirmando}>{confirmando ? "Registrando..." : "Confirmar entrada"}</Button>
						<Button type="button" variant="outline" onClick={() => {
							restaurarFocoReposicaoRef.current = true;
							setConfirmacaoReposicao(false);
						}} disabled={confirmando}>Voltar</Button>
					</div>
				</div>
			)}
			{confirmandoLimpeza && (
				<div className="mt-4 rounded-lg border border-warning-300 bg-warning-50 p-4 dark:border-warning-700 dark:bg-warning-500/10" role="group" aria-label="Descartar rascunho de lote">
					<p className="text-sm text-gray-800 dark:text-white/90">Descartar os itens e a observação ainda não registrados?</p>
					<div className="mt-3 flex gap-3">
						<Button type="button" onClick={limparCamposLote}>Descartar rascunho</Button>
						<Button type="button" variant="outline" onClick={() => {
							restaurarFocoLimparRef.current = true;
							setConfirmandoLimpeza(false);
						}}>Continuar editando</Button>
					</div>
				</div>
			)}
		</fieldset>
		</div>
	);
}
