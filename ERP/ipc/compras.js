const {
	criarPedidoCompra,
	getPedidosCompra,
	getItensPedidoCompra,
	receberPedidoCompra,
	cancelarPedidoCompra,
} = require("../database");

function registrar(ipcMain, deps) {
	const { exigirPermissao, log } = deps;

	ipcMain.handle("criar-pedido-compra", async (event, dados) => {
		try {
			exigirPermissao("compras");
			const resultado = await criarPedidoCompra(dados);
			log("criar-pedido-compra", "PedidosCompra", resultado.pedidoId, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-pedidos-compra", async () => {
		try {
			exigirPermissao("compras");
			return await getPedidosCompra();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-itens-pedido-compra", async (event, pedidoId) => {
		try {
			exigirPermissao("compras");
			return await getItensPedidoCompra(pedidoId);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle(
		"receber-pedido-compra",
		async (event, pedidoId, itensRecebidos) => {
			try {
				exigirPermissao("compras");
				const resultado = await receberPedidoCompra(pedidoId, itensRecebidos);
				log(
					"receber-pedido-compra",
					"PedidosCompra",
					pedidoId,
					resultado.status === "parcial" ? "recebimento parcial" : null,
				);
				return resultado;
			} catch (erro) {
				throw erro.message;
			}
		},
	);

	ipcMain.handle("cancelar-pedido-compra", async (event, pedidoId) => {
		try {
			exigirPermissao("compras");
			const resultado = await cancelarPedidoCompra(pedidoId);
			log("cancelar-pedido-compra", "PedidosCompra", pedidoId, null);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
