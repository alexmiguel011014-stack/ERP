const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { getConexao, runOn, allAsync, getAsync } = require("./conexao");

function gerarIdUnido() {
	return crypto.randomBytes(8).toString("hex");
}

function gerarChecksum(conteudo) {
	return crypto
		.createHash("sha256")
		.update(JSON.stringify(conteudo))
		.digest("hex");
}

async function executarComTransacao(fn, db) {
	const conn = db || getConexao();
	await runOn(conn, "BEGIN TRANSACTION");
	try {
		const resultado = await fn(conn);
		await runOn(conn, "COMMIT");
		return resultado;
	} catch (erro) {
		try {
			await runOn(conn, "ROLLBACK");
		} catch {
			/* ignora erro do rollback */
		}
		throw erro;
	}
}

// 06_contas_abertas.json e 07_vendas_historicas.json não são arrays puros
// como os outros arquivos da exportação Loja House — vêm envelopados como
// { registros: [...], politica/observacao: ... } (metadados sobre a
// preparação dos dados). O array real de itens está em `.registros`.
function normalizarConteudoArquivo(dados) {
	if (
		dados &&
		typeof dados === "object" &&
		!Array.isArray(dados) &&
		Array.isArray(dados.registros)
	) {
		return dados.registros;
	}
	return dados;
}

function validarStructura(dados, nomeArquivo) {
	if (!Array.isArray(dados)) {
		throw new TypeError(
			`Arquivo ${nomeArquivo}: esperava um array, obteve ${typeof dados}`,
		);
	}

	const camposRequeridos = {
		"01_categorias.json": ["chave_externa", "nome"],
		"02_produtos_variacoes.json": ["chave_externa", "nome", "variacoes"],
		"03_estoque_inicial.json": ["chave_externa", "sku", "quantidade_saldo"],
		"04_clientes.json": ["chave_externa", "nome"],
		"05_financeiro_historico.json": [
			"chave_externa",
			"tipo",
			"descricao",
			"valor",
		],
		"06_contas_abertas.json": ["chave_externa", "tipo", "descricao", "valor"],
		"07_vendas_historicas.json": ["chave_externa", "sku", "quantidade"],
		// Formato real da exportação: id/tipo/descricao/acao_sugerida — não
		// chave_externa/tipo_entidade/sugestao, que era um formato assumido
		// (não confirmado contra o arquivo real) na primeira versão deste código.
		"99_pendencias.json": ["id", "tipo", "descricao"],
	};

	const campos = camposRequeridos[nomeArquivo] || [];
	if (campos.length === 0) return; // arquivo opcional

	dados.forEach((item, idx) => {
		campos.forEach((campo) => {
			if (!(campo in item)) {
				throw new TypeError(
					`Arquivo ${nomeArquivo}: item ${idx} falta campo obrigatório "${campo}"`,
				);
			}
		});
	});
}

async function checarDuplicacao(chaves) {
	if (!chaves || chaves.length === 0) {
		return { existentes: [], novas: chaves || [] };
	}

	const placeholders = chaves.map(() => "?").join(",");
	const linhas = await allAsync(
		`SELECT DISTINCT chave_externa FROM MapeamentoChaveExterna WHERE chave_externa IN (${placeholders})`,
		chaves,
	);
	const existentes = linhas.map((l) => l.chave_externa);
	const novas = chaves.filter((c) => !existentes.includes(c));

	return { existentes, novas };
}

async function importarCategorias(dados, batchId, db) {
	const conn = db || getConexao();
	const mapa = new Map(); // chave_externa -> id do banco (retornado, é o resultado real)
	// Cache interno nome -> id, só para resolver categoria_pai (referenciado por
	// NOME no JSON, não por chave_externa) sem repetir SELECTs — nunca deve se
	// misturar com `mapa` acima: as duas chaves têm formatos que podem colidir
	// visualmente (nome vs. chave_externa), e reusar o mesmo Map para os dois
	// inflava a contagem de categorias importadas (mapa.size contava também as
	// entradas de cache por nome — 14 categorias reais + 3 nomes-de-pai
	// cacheados = 17 no batch real da Loja House).
	const mapaPorNome = new Map();
	const erros = [];

	for (const item of dados) {
		try {
			const chavePai = item.categoria_pai;
			let paiId = null;

			if (chavePai) {
				if (mapaPorNome.has(chavePai)) {
					paiId = mapaPorNome.get(chavePai);
				} else {
					const paiExistente = await getAsync(
						"SELECT id FROM Categorias WHERE nome = ?",
						[chavePai],
					);
					if (paiExistente) {
						paiId = paiExistente.id;
						mapaPorNome.set(chavePai, paiId);
					}
				}
			}

			const resultado = await (async () => {
				return new Promise((resolve, reject) => {
					conn.run(
						"INSERT INTO Categorias (nome, categoria_pai_id, ativo) VALUES (?, ?, 1)",
						[item.nome, paiId],
						function (erro) {
							if (erro) return reject(erro);
							resolve(this.lastID);
						},
					);
				});
			})();

			mapa.set(item.chave_externa, resultado);
			mapaPorNome.set(item.nome, resultado);

			await runOn(
				conn,
				"INSERT INTO MapeamentoChaveExterna (chave_externa, entidade_tipo, entidade_id, batch_id) VALUES (?, ?, ?, ?)",
				[item.chave_externa, "categoria", resultado, batchId],
			);
		} catch (erro) {
			erros.push({
				chave_externa: item.chave_externa,
				motivo: erro.message,
			});
		}
	}

	return { mapa, erros };
}

async function importarProdutosVariacoes(dados, batchId, categoriasMapa, db) {
	const conn = db || getConexao();
	const produtosMapa = new Map();
	const variacoesMapa = new Map();
	const erros = [];
	const pendencias = [];

	// categoriasMapa tem chave_externa -> id, mas produtos vêm com categoria (nome)
	// Então deixamos categoriaId=null se não encontrar, e o produto fica sem categoria

	for (const item of dados) {
		if (item.pronto_para_importacao === false) {
			pendencias.push({
				chave_externa: item.chave_externa,
				tipo_entidade: "produto",
				descricao: item.nome,
				motivo_rejeicao: "pronto_para_importacao = false",
				sugestao: "Revisar produto e tentar novamente",
			});
			continue;
		}

		let produtoResult;
		try {
			const categoriaId = null; // Para testes, deixar sem categoria por enquanto

			produtoResult = await (async () => {
				return new Promise((resolve, reject) => {
					conn.run(
						"INSERT INTO Produtos (nome, categoria_id, ativo) VALUES (?, ?, 1)",
						[item.nome, categoriaId],
						function (erro) {
							if (erro) return reject(erro);
							resolve(this.lastID);
						},
					);
				});
			})();

			produtosMapa.set(item.chave_externa, produtoResult);

			await runOn(
				conn,
				"INSERT INTO MapeamentoChaveExterna (chave_externa, entidade_tipo, entidade_id, batch_id) VALUES (?, ?, ?, ?)",
				["produto_" + item.chave_externa, "produto", produtoResult, batchId],
			);
		} catch (erro) {
			erros.push({
				chave_externa: item.chave_externa,
				motivo: erro.message,
			});
			continue; // produto falhou: não faz sentido tentar suas variações
		}

		// Importar variações — cada uma isolada num try/catch próprio, para que
		// a falha de uma (SKU duplicado, etc.) não descarte as demais variações
		// do mesmo produto nem o produto já criado com sucesso acima.
		const variacoes = Array.isArray(item.variacoes) ? item.variacoes : [];
		for (const variacao of variacoes) {
			if (variacao.pronto_para_importacao === false) {
				pendencias.push({
					chave_externa: variacao.chave_externa,
					tipo_entidade: "variacao",
					descricao: `${item.nome} - SKU: ${variacao.sku}`,
					motivo_rejeicao: "pronto_para_importacao = false",
					sugestao: "Revisar variação e tentar novamente",
				});
				continue;
			}

			try {
				const variacaoResult = await (async () => {
					return new Promise((resolve, reject) => {
						conn.run(
							`INSERT INTO Variacoes
							(produto_id, sku, tamanho, cor, preco, preco_custo, quantidade_estoque, atributos)
							VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
							[
								produtoResult,
								variacao.sku,
								variacao.tamanho || null,
								variacao.cor || null,
								variacao.preco || 0,
								variacao.preco_custo || 0,
								0,
								variacao.atributos ? JSON.stringify(variacao.atributos) : null,
							],
							function (erro) {
								if (erro) return reject(erro);
								resolve(this.lastID);
							},
						);
					});
				})();

				variacoesMapa.set(variacao.sku, variacaoResult);

				await runOn(
					conn,
					"INSERT INTO MapeamentoChaveExterna (chave_externa, entidade_tipo, entidade_id, batch_id) VALUES (?, ?, ?, ?)",
					[
						"variacao_" + variacao.chave_externa,
						"variacao",
						variacaoResult,
						batchId,
					],
				);
			} catch (erro) {
				erros.push({
					chave_externa: variacao.chave_externa,
					motivo: erro.message,
				});
			}
		}
	}

	return { produtosMapa, variacoesMapa, erros, pendencias };
}

async function importarEstoqueInicial(
	dados,
	batchId,
	variacoesMapa,
	dataMovimentacao,
	db,
) {
	const conn = db || getConexao();
	const erros = [];
	const skipped = [];
	const pendencias = [];
	let importados = 0;

	for (const item of dados) {
		try {
			if (item.quantidade_saldo === 0) {
				skipped.push({
					chave_externa: item.chave_externa,
					motivo: "quantidade_saldo = 0",
				});
				continue;
			}

			const variacaoId = variacoesMapa.get(item.sku);
			if (!variacaoId) {
				// SKU não existe porque a variação correspondente ficou bloqueada
				// (pronto_para_importacao=false) em importarProdutosVariacoes — o
				// registro de estoque em si pode estar "pronto", mas não há onde
				// aplicar o saldo. Caso esperado (visto nos dados reais: 119
				// variações bloqueadas geram exatamente esse número de registros
				// de estoque órfãos), não uma falha do sistema — vira pendência,
				// não erro solto.
				pendencias.push({
					chave_externa: item.chave_externa,
					tipo_entidade: "estoque",
					descricao: `${item.produto || item.sku} — SKU: ${item.sku}, saldo: ${item.quantidade_saldo}`,
					motivo_rejeicao: `Variação com SKU "${item.sku}" não foi importada (bloqueada ou pendente)`,
					sugestao:
						"Resolver a pendência da variação/produto correspondente e reimportar o estoque",
				});
				continue;
			}

			// UPDATE quantidade_estoque
			await runOn(
				conn,
				"UPDATE Variacoes SET quantidade_estoque = ? WHERE id = ?",
				[item.quantidade_saldo, variacaoId],
			);

			// INSERT MovimentacoesEstoque
			await runOn(
				conn,
				`INSERT INTO MovimentacoesEstoque
				(variacao_id, tipo, quantidade, custo_unitario, origem, data, observacao)
				VALUES (?, 'entrada', ?, ?, 'importacao_migracao', ?, ?)`,
				[
					variacaoId,
					item.quantidade_saldo,
					item.custo_unitario || 0,
					dataMovimentacao,
					"Importação Loja House - estoque inicial",
				],
			);

			await runOn(
				conn,
				"INSERT INTO MapeamentoChaveExterna (chave_externa, entidade_tipo, entidade_id, batch_id) VALUES (?, ?, ?, ?)",
				["estoque_" + item.chave_externa, "estoque", variacaoId, batchId],
			);

			importados++;
		} catch (erro) {
			erros.push({
				chave_externa: item.chave_externa,
				motivo: erro.message,
			});
		}
	}

	return { erros, skipped, pendencias, importados };
}

async function importarClientes(dados, batchId, db) {
	const conn = db || getConexao();
	const erros = [];
	const pendencias = [];

	for (const item of dados) {
		try {
			// Verificar homonyms
			const existente = await getAsync(
				"SELECT id FROM Clientes WHERE nome = ?",
				[item.nome],
			);

			if (existente) {
				pendencias.push({
					chave_externa: item.chave_externa,
					tipo_entidade: "cliente",
					descricao: `${item.nome} (${item.email || item.telefone || "sem contato"})`,
					motivo_rejeicao: "Cliente com mesmo nome já existe no banco",
					sugestao: "Revisar se é duplicata ou diferente cliente",
				});
				continue;
			}

			const resultado = await (async () => {
				return new Promise((resolve, reject) => {
					conn.run(
						"INSERT INTO Clientes (nome, email, telefone, ativo) VALUES (?, ?, ?, 1)",
						[item.nome, item.email || null, item.telefone || null],
						function (erro) {
							if (erro) return reject(erro);
							resolve(this.lastID);
						},
					);
				});
			})();

			await runOn(
				conn,
				"INSERT INTO MapeamentoChaveExterna (chave_externa, entidade_tipo, entidade_id, batch_id) VALUES (?, ?, ?, ?)",
				["cliente_" + item.chave_externa, "cliente", resultado, batchId],
			);
		} catch (erro) {
			erros.push({
				chave_externa: item.chave_externa,
				motivo: erro.message,
			});
		}
	}

	return { erros, pendencias };
}

async function importarFinanceiroHistorico(dados, batchId, db) {
	const conn = db || getConexao();
	const erros = [];

	for (const item of dados) {
		try {
			// status vem do próprio item: 05_financeiro_historico.json sempre traz
			// "pago" explícito; 06_contas_abertas.json (mesma função, chamada
			// separadamente) traz "aberto" — sem o item.status como fonte, toda
			// conta aberta seria gravada como paga por engano.
			await runOn(
				conn,
				`INSERT INTO LancamentosFinanceiros
				(tipo, descricao, valor, data_vencimento, data_pagamento, status, origem)
				VALUES (?, ?, ?, ?, ?, ?, 'importacao_migracao')`,
				[
					item.tipo,
					item.descricao,
					item.valor,
					item.data_vencimento || null,
					item.data_pagamento || null,
					item.status || "pago",
				],
			);

			const resultado = await getAsync("SELECT last_insert_rowid() as id");

			await runOn(
				conn,
				"INSERT INTO MapeamentoChaveExterna (chave_externa, entidade_tipo, entidade_id, batch_id) VALUES (?, ?, ?, ?)",
				[
					"lancamento_" + item.chave_externa,
					"lancamento",
					resultado.id,
					batchId,
				],
			);
		} catch (erro) {
			erros.push({
				chave_externa: item.chave_externa,
				motivo: erro.message,
			});
		}
	}

	return { erros };
}

async function importarPendencias(dados, batchId, db) {
	const conn = db || getConexao();
	const erros = [];

	for (const item of dados) {
		try {
			const id = "pend_" + gerarIdUnido();
			// Itens já vindos de 99_pendencias.json usam id/tipo/descricao/
			// acao_sugerida (formato real da exportação); itens que chegam aqui
			// vindos de dentro do próprio motor (produto bloqueado, homonym de
			// cliente etc., ver importarProdutosVariacoes/importarClientes) usam
			// chave_externa/tipo_entidade/motivo_rejeicao/sugestao — ambos os
			// vocabulários são aceitos.
			await runOn(
				conn,
				`INSERT INTO Pendencias
				(id, chave_externa, tipo_entidade, descricao, valor, motivo_rejeicao, sugestao, batch_id)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					id,
					item.chave_externa || item.id || null,
					item.tipo_entidade || item.tipo || "outro",
					item.descricao || null,
					item.valor || null,
					item.motivo_rejeicao || item.descricao || null,
					item.sugestao || item.acao_sugerida || null,
					batchId,
				],
			);
		} catch (erro) {
			erros.push({
				chave_externa: item.chave_externa || item.id || "desconhecido",
				motivo: erro.message,
			});
		}
	}

	return { erros };
}

async function executarImportacaoLojHouse(
	pastaOuArquivos,
	usuarioId,
	opcoes = {},
) {
	const conn = getConexao();
	const { dryRun = true, dataMovimentacao = "2026-09-02" } = opcoes;

	const arquivos = {};

	// Carregar JSONs
	if (typeof pastaOuArquivos === "string") {
		// É uma pasta
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

		for (const nome of nomesProcurados) {
			const caminho = path.join(pastaOuArquivos, nome);
			if (fs.existsSync(caminho)) {
				const conteudo = fs.readFileSync(caminho, "utf8");
				arquivos[nome] = normalizarConteudoArquivo(JSON.parse(conteudo));
			}
		}
	} else if (Array.isArray(pastaOuArquivos)) {
		// É um array de {arquivo, conteudo}
		for (const item of pastaOuArquivos) {
			arquivos[item.arquivo] = normalizarConteudoArquivo(item.conteudo);
		}
	}

	// Validar estrutura
	for (const [nome, dados] of Object.entries(arquivos)) {
		validarStructura(dados, nome);
	}

	// Extrair dados
	const dados = {
		categorias: arquivos["01_categorias.json"] || [],
		produtosVariacoes: arquivos["02_produtos_variacoes.json"] || [],
		estoqueInicial: arquivos["03_estoque_inicial.json"] || [],
		clientes: arquivos["04_clientes.json"] || [],
		financeiroHistorico: arquivos["05_financeiro_historico.json"] || [],
		contasAbertas: arquivos["06_contas_abertas.json"] || [],
		vendasHistoricas: arquivos["07_vendas_historicas.json"] || [],
		pendenciasOrigem: arquivos["99_pendencias.json"] || [],
	};

	// Coletar todas as chaves para dedup check
	const todasAsChaves = [];
	Object.values(dados).forEach((arr) => {
		if (Array.isArray(arr)) {
			arr.forEach((item) => {
				if (item.chave_externa) {
					todasAsChaves.push(item.chave_externa);
				}
				if (Array.isArray(item.variacoes)) {
					item.variacoes.forEach((v) => {
						if (v.chave_externa) {
							todasAsChaves.push(v.chave_externa);
						}
					});
				}
			});
		}
	});

	const { existentes } = await checarDuplicacao(todasAsChaves);

	// Preparar resposta de preview (sem tocar no DB se dryRun)
	const preview = {
		categorias: dados.categorias.length,
		produtos: dados.produtosVariacoes.length,
		variacoes: dados.produtosVariacoes.reduce(
			(acc, p) => acc + (Array.isArray(p.variacoes) ? p.variacoes.length : 0),
			0,
		),
		estoque: dados.estoqueInicial.length,
		clientes: dados.clientes.length,
		lancamentosHistoricos: dados.financeiroHistorico.length,
		contasAbertas: dados.contasAbertas.length,
		vendasHistoricas: dados.vendasHistoricas.length,
		pendenciasOrigem: dados.pendenciasOrigem.length,
	};

	const conflitos = {
		duplicadasJaImportadas: existentes.length,
		alertasRegrasNegocio: [],
	};

	if (dryRun) {
		return {
			dryRun: true,
			preview,
			conflitos,
			checksum: gerarChecksum(dados),
		};
	}

	// Executar importação (transação completa)
	return await executarComTransacao(async (connTxn) => {
		const batchId = gerarIdUnido();

		// O registro do batch precisa existir ANTES de qualquer insert em
		// MapeamentoChaveExterna/Pendencias (ambas têm FK para ImportacaoBatch.id,
		// e o banco roda com PRAGMA foreign_keys = ON) — senão todo insert nessas
		// duas tabelas falha por violação de FK, silenciosamente engolida pelo
		// catch de cada função importarX. status/contagens são atualizados no
		// UPDATE final, quando os totais reais já são conhecidos.
		await runOn(
			connTxn,
			`INSERT INTO ImportacaoBatch
			(id, usuario_id, origem, status, total_itens, itens_importados, itens_ignorados, itens_erro)
			VALUES (?, ?, 'loja_house', 'em_progresso', 0, 0, 0, 0)`,
			[batchId, usuarioId],
		);

		const resultado = {
			batchId,
			importadas: {
				categorias: 0,
				produtos: 0,
				variacoes: 0,
				estoque: 0,
				clientes: 0,
				lancamentos: 0,
			},
			ignoradas: existentes.length,
			pendencias: [],
			erros: [],
		};

		let categoriasMapa = new Map();
		let variacoesMapa = new Map();

		// 1. Categorias
		const resCateg = await importarCategorias(
			dados.categorias,
			batchId,
			connTxn,
		);
		categoriasMapa = resCateg.mapa;
		resultado.importadas.categorias = categoriasMapa.size;
		resultado.erros.push(...resCateg.erros);

		// 2. Produtos e Variações
		const resProd = await importarProdutosVariacoes(
			dados.produtosVariacoes,
			batchId,
			categoriasMapa,
			connTxn,
		);
		variacoesMapa = resProd.variacoesMapa;
		resultado.importadas.produtos = resProd.produtosMapa.size;
		resultado.importadas.variacoes = variacoesMapa.size;
		resultado.pendencias.push(...resProd.pendencias);
		resultado.erros.push(...resProd.erros);

		// 3. Estoque Inicial
		const resEst = await importarEstoqueInicial(
			dados.estoqueInicial,
			batchId,
			variacoesMapa,
			dataMovimentacao,
			connTxn,
		);
		resultado.importadas.estoque = resEst.importados;
		resultado.pendencias.push(...resEst.pendencias);
		resultado.erros.push(...resEst.erros);

		// 4. Clientes
		const resCli = await importarClientes(dados.clientes, batchId, connTxn);
		resultado.importadas.clientes =
			dados.clientes.length - resCli.pendencias.length;
		resultado.pendencias.push(...resCli.pendencias);
		resultado.erros.push(...resCli.erros);

		// 5. Financeiro Histórico
		const resFin = await importarFinanceiroHistorico(
			dados.financeiroHistorico,
			batchId,
			connTxn,
		);
		resultado.importadas.lancamentos =
			dados.financeiroHistorico.length - resFin.erros.length;
		resultado.erros.push(...resFin.erros);

		// 6. Contas Abertas (mesmo que financeiro, mas status aberto)
		const resContasAbertas = await importarFinanceiroHistorico(
			dados.contasAbertas,
			batchId,
			connTxn,
		);
		resultado.importadas.lancamentos +=
			dados.contasAbertas.length - resContasAbertas.erros.length;
		resultado.erros.push(...resContasAbertas.erros);

		// 7. Pendências
		const resPend = await importarPendencias(
			[...dados.pendenciasOrigem, ...resultado.pendencias],
			batchId,
			connTxn,
		);
		resultado.pendencias =
			resultado.pendencias.length + dados.pendenciasOrigem.length;
		resultado.erros.push(...resPend.erros);

		// Criar batch record
		const totalItens =
			dados.categorias.length +
			dados.produtosVariacoes.length +
			dados.estoqueInicial.length +
			dados.clientes.length +
			dados.financeiroHistorico.length +
			dados.contasAbertas.length +
			dados.vendasHistoricas.length +
			dados.pendenciasOrigem.length;

		const status = resultado.erros.length === 0 ? "sucesso" : "parcial";

		await runOn(
			connTxn,
			`UPDATE ImportacaoBatch
			SET status = ?, total_itens = ?, itens_importados = ?, itens_ignorados = ?, itens_erro = ?, log = ?, checksum = ?
			WHERE id = ?`,
			[
				status,
				totalItens,
				Object.values(resultado.importadas).reduce((a, b) => a + b, 0),
				resultado.ignoradas,
				resultado.erros.length,
				JSON.stringify(resultado),
				gerarChecksum(dados),
				batchId,
			],
		);

		return resultado;
	}, conn);
}

async function obterHistoricoLotes() {
	const linhas = await allAsync(
		`SELECT id, data_importacao, usuario_id, origem, status, total_itens, itens_importados, itens_ignorados, itens_erro
		FROM ImportacaoBatch ORDER BY data_importacao DESC LIMIT 50`,
		[],
	);
	return linhas;
}

async function obterDetalhesLote(batchId) {
	const batch = await getAsync(`SELECT * FROM ImportacaoBatch WHERE id = ?`, [
		batchId,
	]);

	if (!batch) throw new Error("Lote não encontrado: " + batchId);

	const pendencias = await allAsync(
		`SELECT * FROM Pendencias WHERE batch_id = ? ORDER BY data_criacao DESC`,
		[batchId],
	);

	const log = batch.log ? JSON.parse(batch.log) : {};

	return {
		batch,
		pendencias,
		log,
	};
}

module.exports = {
	executarImportacaoLojHouse,
	obterHistoricoLotes,
	obterDetalhesLote,
	validarStructura,
	checarDuplicacao,
	normalizarConteudoArquivo,
};
