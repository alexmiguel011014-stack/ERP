"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type ProdutoBusca } from "@/lib/erpApi";
import { formatarAtributos } from "@/lib/utils/formatos";

export type ItemCarrinho = {
	variacao_id: number;
	nome: string;
	detalhes: string;
	preco_unitario: number;
	quantidade: number;
	estoque: number;
	imagem: string | null;
};

export type AlertaCarrinho = {
	tipo: "preco" | "sem-estoque" | "estoque-baixo" | "limite";
	mensagem: string;
} | null;

const CHAVE_LOCALSTORAGE = "pdv_carrinho";

function carregarDoStorage(): ItemCarrinho[] {
	if (typeof window === "undefined") return [];
	try {
		const bruto = window.localStorage.getItem(CHAVE_LOCALSTORAGE);
		if (!bruto) return [];
		const dados = JSON.parse(bruto);
		return Array.isArray(dados) ? dados : [];
	} catch {
		return [];
	}
}

export function useCarrinho() {
	const [itens, setItens] = useState<ItemCarrinho[]>([]);
	const [alerta, setAlerta] = useState<AlertaCarrinho>(null);
	const [carregado, setCarregado] = useState(false);

	// Carrinho sobrevive a reload/navegação — mesmo comportamento da vanilla,
	// que salva em localStorage a cada mutação.
	useEffect(() => {
		setItens(carregarDoStorage());
		setCarregado(true);
	}, []);

	useEffect(() => {
		if (!carregado) return;
		try {
			window.localStorage.setItem(CHAVE_LOCALSTORAGE, JSON.stringify(itens));
		} catch {
			// localStorage indisponível (modo privado etc.) — carrinho só não
			// sobrevive a um reload, não é motivo pra quebrar o PDV.
		}
	}, [itens, carregado]);

	// Alerta some sozinho depois de 10s — antes ficava preso na tela até ser
	// sobrescrito por outro alerta (bug reportado pelo dono).
	useEffect(() => {
		if (!alerta) return;
		const timer = setTimeout(() => setAlerta(null), 10000);
		return () => clearTimeout(timer);
	}, [alerta]);

	const adicionar = useCallback(
		async (produto: ProdutoBusca, clienteId: number | null) => {
			if (produto.preco <= 0) {
				setAlerta({
					tipo: "preco",
					mensagem: `"${produto.nome}" está sem preço definido — cadastre o preço antes de vender.`,
				});
				return;
			}
			if (produto.quantidade_disponivel <= 0) {
				setAlerta({
					tipo: "sem-estoque",
					mensagem: `"${produto.nome}" está sem estoque disponível.`,
				});
				return;
			}

			let precoUnitario = produto.preco;
			if (clienteId) {
				try {
					const precoEspecial = await erpApi.clientes.precoEspecial(
						clienteId,
						produto.id,
					);
					if (precoEspecial !== null) precoUnitario = precoEspecial;
				} catch {
					// Sem preço especial disponível — segue com o preço normal.
				}
			}

			setItens((atual) => {
				const existente = atual.find((i) => i.variacao_id === produto.id);
				if (existente) {
					if (existente.quantidade >= produto.quantidade_disponivel) {
						setAlerta({
							tipo: "limite",
							mensagem: `Não há mais estoque disponível de "${produto.nome}".`,
						});
						return atual;
					}
					return atual.map((i) =>
						i.variacao_id === produto.id
							? { ...i, quantidade: i.quantidade + 1 }
							: i,
					);
				}
				return [
					...atual,
					{
						variacao_id: produto.id,
						nome: produto.nome,
						detalhes: formatarAtributos(
							produto.atributos,
							produto.tamanho,
							produto.cor,
						),
						preco_unitario: precoUnitario,
						quantidade: 1,
						estoque: produto.quantidade_disponivel,
						imagem: produto.imagem,
					},
				];
			});

			const minimo = produto.estoque_minimo || 5;
			if (produto.quantidade_disponivel <= minimo) {
				setAlerta({
					tipo: "estoque-baixo",
					mensagem: `Estoque baixo de "${produto.nome}" (${produto.quantidade_disponivel} disponível).`,
				});
			}
		},
		[],
	);

	function aumentar(variacaoId: number) {
		setItens((atual) =>
			atual.map((i) =>
				i.variacao_id === variacaoId && i.quantidade < i.estoque
					? { ...i, quantidade: i.quantidade + 1 }
					: i,
			),
		);
	}

	function diminuir(variacaoId: number) {
		setItens((atual) =>
			atual
				.map((i) =>
					i.variacao_id === variacaoId
						? { ...i, quantidade: i.quantidade - 1 }
						: i,
				)
				.filter((i) => i.quantidade > 0),
		);
	}

	function remover(variacaoId: number) {
		setItens((atual) => atual.filter((i) => i.variacao_id !== variacaoId));
	}

	function limpar() {
		setItens([]);
	}

	async function reprecificarParaCliente(clienteId: number) {
		const atualizados = await Promise.all(
			itens.map(async (item) => {
				try {
					const precoEspecial = await erpApi.clientes.precoEspecial(
						clienteId,
						item.variacao_id,
					);
					return precoEspecial !== null
						? { ...item, preco_unitario: precoEspecial }
						: item;
				} catch {
					return item;
				}
			}),
		);
		setItens(atualizados);
	}

	const subtotal = itens.reduce(
		(soma, i) => soma + i.preco_unitario * i.quantidade,
		0,
	);

	return {
		itens,
		alerta,
		limparAlerta: () => setAlerta(null),
		adicionar,
		aumentar,
		diminuir,
		remover,
		limpar,
		reprecificarParaCliente,
		subtotal,
	};
}
