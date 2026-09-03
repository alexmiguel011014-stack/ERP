const path = require("path");
const fs = require("fs");
const { dialog } = require("electron");
const {
	executarImportacaoLojHouse,
	obterHistoricoLotes,
	obterDetalhesLote,
	normalizarConteudoArquivoImportacao,
} = require("../database");

function registrar(ipcMain, deps) {
	const { exigirSessao, log, getMainWindow, getSessao } = deps;

	ipcMain.handle(
		"importacoes:validar-pasta-loja-house",
		async (event, pasta) => {
			try {
				exigirSessao("admin");

				if (!pasta) {
					const resultado = await dialog.showOpenDialog(getMainWindow(), {
						title: "Selecionar pasta com JSONs de importação",
						properties: ["openDirectory"],
					});

					if (resultado.canceled || !resultado.filePaths[0]) {
						return { cancelado: true };
					}

					pasta = resultado.filePaths[0];
				}

				if (!fs.existsSync(pasta)) {
					throw new Error("Pasta não encontrada: " + pasta);
				}

				// Detectar formato e arquivos
				const nomesProcurados = [
					"01_categorias.json",
					"02_produtos_variacoes.json",
					"03_estoque_inicial.json",
					"04_clientes.json",
					"05_financeiro_historico.json",
					"06_contas_abertas.json",
					"07_vendas_historicas.json",
					"99_pendencias.json",
				];

				const arquivosEncontrados = [];
				const preview = {
					categorias: 0,
					produtos: 0,
					variacoes: 0,
					estoque: 0,
					clientes: 0,
					lancamentos: 0,
					pendencias: 0,
				};

				for (const nome of nomesProcurados) {
					const caminho = path.join(pasta, nome);
					if (fs.existsSync(caminho)) {
						try {
							const conteudo = fs.readFileSync(caminho, "utf8");
							const dados = normalizarConteudoArquivoImportacao(
								JSON.parse(conteudo),
							);

							if (Array.isArray(dados)) {
								arquivosEncontrados.push(nome);

								// Contar itens
								if (nome === "01_categorias.json") {
									preview.categorias = dados.length;
								} else if (nome === "02_produtos_variacoes.json") {
									preview.produtos = dados.length;
									preview.variacoes = dados.reduce(
										(acc, p) =>
											acc +
											(Array.isArray(p.variacoes) ? p.variacoes.length : 0),
										0,
									);
								} else if (nome === "03_estoque_inicial.json") {
									preview.estoque = dados.length;
								} else if (nome === "04_clientes.json") {
									preview.clientes = dados.length;
								} else if (
									nome === "05_financeiro_historico.json" ||
									nome === "06_contas_abertas.json"
								) {
									preview.lancamentos += dados.length;
								} else if (nome === "99_pendencias.json") {
									preview.pendencias = dados.length;
								}
							}
						} catch (erro) {
							return {
								erro: `Arquivo ${nome} inválido: ${erro.message}`,
							};
						}
					}
				}

				if (arquivosEncontrados.length === 0) {
					throw new Error(
						"Nenhum arquivo de importação encontrado na pasta. Esperados: " +
							nomesProcurados.join(", "),
					);
				}

				return {
					formato: "loja_house",
					pasta,
					arquivos: arquivosEncontrados,
					preview,
				};
			} catch (erro) {
				return {
					erro: erro.message,
				};
			}
		},
	);

	ipcMain.handle("importacoes:executar", async (event, pasta, opcoes = {}) => {
		try {
			exigirSessao("admin");

			if (!pasta) {
				throw new Error("Pasta de importação não informada");
			}

			const resultado = await executarImportacaoLojHouse(
				pasta,
				getSessao()?.id ?? null,
				{
					dryRun: opcoes.dryRun !== false,
					dataMovimentacao:
						opcoes.dataMovimentacao || new Date().toISOString().split("T")[0],
				},
			);

			if (opcoes.dryRun === false) {
				log(
					"importar-loja-house",
					"ImportacaoBatch",
					resultado.batchId,
					`${resultado.importadas.categorias} categorias, ${resultado.importadas.produtos} produtos`,
				);
			}

			return resultado;
		} catch (erro) {
			return {
				erro: erro.message,
			};
		}
	});

	ipcMain.handle("importacoes:historico-lotes", async () => {
		try {
			exigirSessao("admin");
			return await obterHistoricoLotes();
		} catch (erro) {
			throw erro.message;
		}
	});

	ipcMain.handle("importacoes:detalhes-lote", async (event, batchId) => {
		try {
			exigirSessao("admin");
			return await obterDetalhesLote(batchId);
		} catch (erro) {
			throw erro.message;
		}
	});
}

module.exports = { registrar };
