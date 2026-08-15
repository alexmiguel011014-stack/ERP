const {
	getPricingData,
	getGlobalMargin,
	saveGlobalMargin,
	getCustoFixoConfig,
	saveCustoFixoConfig,
	saveAplicarCustoFixo,
	saveProductMargin,
	saveProductPrice,
	saveProductCost,
	saveProductTaxes,
	massUpdateMargem,
} = require("../database");

function registrar(ipcMain, deps) {
	const { exigirPermissao, exigirSessao, log } = deps;

	ipcMain.handle("get-pricing-data", async () => {
		try {
			exigirPermissao("produtos");
			return await getPricingData();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-global-margin", async () => {
		try {
			exigirSessao("admin");
			return await getGlobalMargin();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("save-global-margin", async (event, valor) => {
		try {
			exigirSessao("admin");
			return await saveGlobalMargin(valor);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-custo-fixo-config", async () => {
		try {
			exigirSessao("admin");
			return await getCustoFixoConfig();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle(
		"save-custo-fixo-config",
		async (event, mensal, volumeMensal) => {
			try {
				exigirSessao("admin");
				return await saveCustoFixoConfig(mensal, volumeMensal);
			} catch (erro) {
				throw erro.message;
			}
		},
	);

	ipcMain.handle(
		"save-aplicar-custo-fixo",
		async (event, produtoId, aplicar) => {
			try {
				exigirPermissao("produtos");
				return await saveAplicarCustoFixo(produtoId, aplicar);
			} catch (erro) {
				throw erro.message;
			}
		},
	);

	ipcMain.handle("save-product-margin", async (event, produtoId, margem) => {
		try {
			exigirPermissao("produtos");
			return await saveProductMargin(produtoId, margem);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("save-product-price", async (event, produtoId, precoVenda) => {
		try {
			exigirPermissao("produtos");
			const resultado = await saveProductPrice(produtoId, precoVenda);
			log("alterar-preco", "Produtos", produtoId, "Novo preço: " + precoVenda);
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("save-product-cost", async (event, produtoId, precoCusto) => {
		try {
			exigirPermissao("produtos");
			return await saveProductCost(produtoId, precoCusto);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("save-product-taxes", async (event, produtoId, valor) => {
		try {
			exigirPermissao("produtos");
			return await saveProductTaxes(produtoId, valor);
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("mass-update-margem", async (event, produtoIds, margem) => {
		try {
			exigirPermissao("produtos");
			return await massUpdateMargem(produtoIds, margem);
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
