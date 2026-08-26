"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type PedidoCompra } from "@/lib/erpApi";

export function usePedidosCompra() {
	const [pedidos, setPedidos] = useState<PedidoCompra[]>([]);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const recarregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			setPedidos(await erpApi.compras.pedidos());
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, []);

	useEffect(() => {
		recarregar();
	}, [recarregar]);

	return { pedidos, carregando, erro, recarregar };
}
