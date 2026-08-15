const {
	getProximoCodigoCategoria,
	getCategorias,
	getListCategoriasWithUsage,
	removerCategoria,
	salvarCategoria,
	salvarCategoriaComSubcategorias,
} = require("../database");

function registrar(ipcMain, deps) {
	const { exigirPermissao, getMainWindow } = deps;

	ipcMain.handle("proximo-codigo-categoria", async () => {
		try {
			exigirPermissao("produtos");
			return await getProximoCodigoCategoria();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("get-categorias", async () => {
		try {
			exigirPermissao("produtos");
			return await getCategorias();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("categorias-with-usage", async () => {
		try {
			exigirPermissao("produtos");
			return await getListCategoriasWithUsage();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("remover-categoria", async (event, id) => {
		try {
			exigirPermissao("produtos");
			const resultado = await removerCategoria(id);
			const mainWindow = getMainWindow();
			if (mainWindow) mainWindow.webContents.send("categorias-changed");
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("salvar-categoria", async (event, nome, categoriaPaiId) => {
		try {
			exigirPermissao("produtos");
			const resultado = await salvarCategoria(nome, categoriaPaiId);
			const mainWindow = getMainWindow();
			if (mainWindow) mainWindow.webContents.send("categorias-changed");
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("salvar-categoria-com-subcategorias", async (event, dados) => {
		try {
			exigirPermissao("produtos");
			const resultado = await salvarCategoriaComSubcategorias(dados);
			const mainWindow = getMainWindow();
			if (mainWindow) mainWindow.webContents.send("categorias-changed");
			return resultado;
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
