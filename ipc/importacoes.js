const path = require("path");
const fs = require("fs");
const { dialog } = require("electron");
const {
	executarImportacaoLojHouse,
	executarImportacaoFinanceiroMensal,
	obterHistoricoLotes,
	obterDetalhesLote,
	normalizarConteudoArquivoImportacao,
	parseExcelLojaHouse,
	parseFinanceiroHistoricoMensal,
	criarModeloFinanceiroMensal,
	validarModeloFinanceiroMensal,
	serializarModeloFinanceiroMensal,
} = require("../database");

function lerModeloFinanceiroMensal(caminho) {
	if (!caminho || path.extname(caminho).toLowerCase() !== ".json") {
		throw new Error("Selecione o JSON financeiro de janeiro.");
	}
	if (!fs.existsSync(caminho)) {
		throw new Error("Arquivo JSON não encontrado: " + caminho);
	}
	let modelo;
	try {
		modelo = JSON.parse(fs.readFileSync(caminho, "utf8"));
	} catch (erro) {
		throw new Error("JSON financeiro inválido: " + erro.message);
	}
	return validarModeloFinanceiroMensal(modelo);
}

// parseExcelLojaHouse já devolve exatamente o shape de 8 arrays que
// executarImportacaoLojHouse espera de um `arquivos["0X_....json"]` — então
// em vez de ensinar o motor de importação (db/importacoes.js) a entender
// mais um formato de entrada, convertemos aqui para o formato de array de
// {arquivo, conteudo} que ele já aceita (upload de JSONs individuais).
// Zero mudança no motor testado; o Excel só vira "JSONs já carregados em
// memória" antes de chegar lá.
function converterExcelParaArquivos(caminho) {
	const dados = parseExcelLojaHouse(caminho);
	return [
		{ arquivo: "01_categorias.json", conteudo: dados.categorias },
		{
			arquivo: "02_produtos_variacoes.json",
			conteudo: dados.produtosVariacoes,
		},
		{ arquivo: "03_estoque_inicial.json", conteudo: dados.estoqueInicial },
		{ arquivo: "04_clientes.json", conteudo: dados.clientes },
		// O caminho completo continua útil para catálogo e estoque, mas não pode
		// gravar o financeiro desta planilha: ENTRADA ali não é automaticamente
		// um recebível. O modo mensal dedicado faz essa classificação com prévia.
		{ arquivo: "05_financeiro_historico.json", conteudo: [] },
		{ arquivo: "06_contas_abertas.json", conteudo: [] },
		{ arquivo: "07_vendas_historicas.json", conteudo: dados.vendasHistoricas },
		{ arquivo: "99_pendencias.json", conteudo: dados.pendenciasOrigem },
	];
}

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

	ipcMain.handle(
		"importacoes:validar-arquivo-excel",
		async (event, caminho) => {
			try {
				exigirSessao("admin");

				if (!caminho) {
					const resultado = await dialog.showOpenDialog(getMainWindow(), {
						title: "Selecionar planilha Excel (.xlsx) da Loja House",
						properties: ["openFile"],
						filters: [{ name: "Excel", extensions: ["xlsx"] }],
					});

					if (resultado.canceled || !resultado.filePaths[0]) {
						return { cancelado: true };
					}

					caminho = resultado.filePaths[0];
				}

				if (!fs.existsSync(caminho)) {
					throw new Error("Arquivo não encontrado: " + caminho);
				}

				let dados;
				try {
					dados = parseExcelLojaHouse(caminho);
				} catch (erro) {
					return {
						erro: `Planilha inválida: ${erro.message}`,
					};
				}

				const preview = {
					categorias: dados.categorias.length,
					produtos: dados.produtosVariacoes.length,
					variacoes: dados.produtosVariacoes.reduce(
						(acc, p) =>
							acc + (Array.isArray(p.variacoes) ? p.variacoes.length : 0),
						0,
					),
					estoque: dados.estoqueInicial.length,
					clientes: dados.clientes.length,
					lancamentos: 0,
					pendencias: dados.pendenciasOrigem.length,
				};

				return {
					formato: "excel",
					caminho,
					preview,
				};
			} catch (erro) {
				return {
					erro: erro.message,
				};
			}
		},
	);

	ipcMain.handle(
		"importacoes:gerar-modelo-financeiro-janeiro",
		async (event, caminhoPlanilha, caminhoDestino) => {
			try {
				exigirSessao("admin");
				if (!caminhoPlanilha) {
					const resultado = await dialog.showOpenDialog(getMainWindow(), {
						title: "Selecionar planilha para gerar o JSON financeiro de janeiro",
						properties: ["openFile"],
						filters: [{ name: "Excel", extensions: ["xlsx"] }],
					});
					if (resultado.canceled || !resultado.filePaths[0]) return { cancelado: true };
					caminhoPlanilha = resultado.filePaths[0];
				}
				const modelo = criarModeloFinanceiroMensal(
					parseFinanceiroHistoricoMensal(caminhoPlanilha, "JANEIRO"),
				);
				if (!caminhoDestino) {
					const resultado = await dialog.showSaveDialog(getMainWindow(), {
						title: "Salvar JSON financeiro de janeiro para revisão",
						defaultPath: "loja-house-financeiro-2026-01.json",
						filters: [{ name: "JSON", extensions: ["json"] }],
					});
					if (resultado.canceled || !resultado.filePath) return { cancelado: true };
					caminhoDestino = resultado.filePath;
				}
				if (path.extname(caminhoDestino).toLowerCase() !== ".json") {
					caminhoDestino += ".json";
				}
				fs.writeFileSync(caminhoDestino, serializarModeloFinanceiroMensal(modelo), "utf8");
				const validacao = lerModeloFinanceiroMensal(caminhoDestino);
				return {
					formato: "json_financeiro_mes",
					caminho: caminhoDestino,
					checksum: validacao.checksum,
					preview: validacao.dados,
				};
			} catch (erro) {
				return { erro: erro.message };
			}
		},
	);

	ipcMain.handle(
		"importacoes:validar-modelo-financeiro-janeiro",
		async (event, caminho) => {
			try {
				exigirSessao("admin");
				if (!caminho) {
					const resultado = await dialog.showOpenDialog(getMainWindow(), {
						title: "Selecionar JSON financeiro de janeiro revisado",
						properties: ["openFile"],
						filters: [{ name: "JSON", extensions: ["json"] }],
					});
					if (resultado.canceled || !resultado.filePaths[0]) return { cancelado: true };
					caminho = resultado.filePaths[0];
				}
				const validacao = lerModeloFinanceiroMensal(caminho);
				return {
					formato: "json_financeiro_mes",
					caminho,
					checksum: validacao.checksum,
					preview: validacao.dados,
				};
			} catch (erro) {
				return { erro: erro.message };
			}
		},
	);

	ipcMain.handle("importacoes:executar", async (event, pasta, opcoes = {}) => {
		try {
			exigirSessao("admin");

			if (!pasta) {
				throw new Error("Pasta de importação não informada");
			}

			// Terceiro formato de entrada: planilha .xlsx nativa
			// ({ tipo: "excel", caminho }, ver db/excel-loja-house.js), convertida
			// aqui para o array de {arquivo, conteudo} que
			// executarImportacaoLojHouse já entende (mesmo caminho do upload de
			// JSONs individuais) — o motor de importação em si não muda.
			if (pasta && typeof pasta === "object" && pasta.tipo === "excel_financeiro_mes") {
				throw new Error(
					"A planilha só gera o rascunho. Revise e selecione o JSON financeiro antes de importar.",
				);
			}
			const ehFinanceiroMensal =
				pasta &&
				typeof pasta === "object" &&
				pasta.tipo === "json_financeiro_mes";
			const modeloFinanceiro = ehFinanceiroMensal
				? lerModeloFinanceiroMensal(pasta.caminho)
				: null;
			if (
				modeloFinanceiro &&
				(!pasta.checksum || pasta.checksum !== modeloFinanceiro.checksum)
			) {
				throw new Error(
					"O JSON mudou desde a prévia. Selecione-o novamente e execute uma nova simulação.",
				);
			}
			const resultado = ehFinanceiroMensal
				? await executarImportacaoFinanceiroMensal(
						modeloFinanceiro.dados,
						getSessao()?.id ?? null,
						{ dryRun: opcoes.dryRun !== false },
					)
				: await executarImportacaoLojHouse(
						pasta && typeof pasta === "object" && pasta.tipo === "excel"
							? converterExcelParaArquivos(pasta.caminho)
							: pasta,
						getSessao()?.id ?? null,
						{
							dryRun: opcoes.dryRun !== false,
							dataMovimentacao:
								opcoes.dataMovimentacao || new Date().toISOString().split("T")[0],
						},
					);

			if (opcoes.dryRun === false) {
				log(
					ehFinanceiroMensal
						? "importar-financeiro-historico-janeiro"
						: "importar-loja-house",
					"ImportacaoBatch",
					resultado.batchId,
					ehFinanceiroMensal
						? `${resultado.importadas.vendasHistoricas} vendas históricas, ${resultado.importadas.pagamentosHistoricos} pagamentos históricos`
						: `${resultado.importadas.categorias} categorias, ${resultado.importadas.produtos} produtos`,
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
