const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { getConexao, runOn, allAsync, getAsync } = require("./conexao");
const { registrarVendaFiadoHistorica } = require("./vendas");

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

	// A chave recebida pelo preview não informa a entidade. Como a gravação
	// prefixa produto/variação/etc., verificamos todas as formas que o motor
	// efetivamente persiste para não prometer um registro como "novo".
	const chavesPersistidas = [
		...new Set(
			chaves.flatMap((chave) => [
				chave,
				chaveMapeamento("produto", chave),
				chaveMapeamento("variacao", chave),
				chaveMapeamento("estoque", chave),
				chaveMapeamento("cliente", chave),
				chaveMapeamento("lancamento", chave),
			]),
		),
	];
	const placeholders = chavesPersistidas.map(() => "?").join(",");
	const linhas = await allAsync(
		`SELECT DISTINCT chave_externa FROM MapeamentoChaveExterna WHERE chave_externa IN (${placeholders})`,
		chavesPersistidas,
	);
	const existentesPersistidas = new Set(linhas.map((l) => l.chave_externa));
	const existentes = chaves.filter((chave) =>
		[
			chave,
			chaveMapeamento("produto", chave),
			chaveMapeamento("variacao", chave),
			chaveMapeamento("estoque", chave),
			chaveMapeamento("cliente", chave),
			chaveMapeamento("lancamento", chave),
		].some((persistida) => existentesPersistidas.has(persistida)),
	);
	const novas = chaves.filter((chave) => !existentes.includes(chave));

	return { existentes, novas };
}

function chaveMapeamento(tipo, chaveExterna) {
	const prefixos = {
		categoria: "",
		produto: "produto_",
		variacao: "variacao_",
		estoque: "estoque_",
		cliente: "cliente_",
		lancamento: "lancamento_",
	};
	return `${prefixos[tipo] || ""}${chaveExterna}`;
}

function getOn(conn, sql, parametros = []) {
	return new Promise((resolve, reject) => {
		conn.get(sql, parametros, (erro, linha) => {
			if (erro) return reject(erro);
			resolve(linha || null);
		});
	});
}

function allOn(conn, sql, parametros = []) {
	return new Promise((resolve, reject) => {
		conn.all(sql, parametros, (erro, linhas) => {
			if (erro) return reject(erro);
			resolve(linhas || []);
		});
	});
}

async function obterEntidadeMapeada(conn, tipo, chaveExterna) {
	const linha = await getOn(
		conn,
		"SELECT entidade_id FROM MapeamentoChaveExterna WHERE chave_externa = ?",
		[chaveMapeamento(tipo, chaveExterna)],
	);
	return linha?.entidade_id || null;
}

async function vincularChaveExterna(
	conn,
	tipo,
	chaveExterna,
	entidadeId,
	batchId,
) {
	await runOn(
		conn,
		`INSERT INTO MapeamentoChaveExterna
		(chave_externa, entidade_tipo, entidade_id, batch_id)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(chave_externa) DO NOTHING`,
		[chaveMapeamento(tipo, chaveExterna), tipo, entidadeId, batchId],
	);
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
	let ignoradas = 0;
	let importadas = 0;

	for (const item of dados) {
		try {
			const categoriaMapeada = await obterEntidadeMapeada(
				conn,
				"categoria",
				item.chave_externa,
			);
			if (categoriaMapeada) {
				const existente = await getOn(
					conn,
					"SELECT id FROM Categorias WHERE id = ?",
					[categoriaMapeada],
				);
				if (existente) {
					mapa.set(item.chave_externa, existente.id);
					mapaPorNome.set(item.nome, existente.id);
					ignoradas++;
					continue;
				}
			}

			const chavePai = item.categoria_pai;
			let paiId = null;

			if (chavePai) {
				if (mapaPorNome.has(chavePai)) {
					paiId = mapaPorNome.get(chavePai);
				} else {
					const paiExistente = await getOn(
						conn,
						"SELECT id FROM Categorias WHERE nome = ?",
						[chavePai],
					);
					if (paiExistente) {
						paiId = paiExistente.id;
						mapaPorNome.set(chavePai, paiId);
					}
				}
			}

			const categoriaComMesmoNome = await getOn(
				conn,
				"SELECT id FROM Categorias WHERE nome = ? ORDER BY id LIMIT 1",
				[item.nome],
			);
			let resultado = categoriaComMesmoNome?.id;
			if (!resultado) {
				resultado = await new Promise((resolve, reject) => {
					conn.run(
						"INSERT INTO Categorias (nome, categoria_pai_id, ativo) VALUES (?, ?, 1)",
						[item.nome, paiId],
						function (erro) {
							if (erro) return reject(erro);
							resolve(this.lastID);
						},
					);
				});
				importadas++;
			}

			mapa.set(item.chave_externa, resultado);
			mapaPorNome.set(item.nome, resultado);

			await vincularChaveExterna(
				conn,
				"categoria",
				item.chave_externa,
				resultado,
				batchId,
			);
			if (categoriaComMesmoNome) ignoradas++;
		} catch (erro) {
			erros.push({
				chave_externa: item.chave_externa,
				motivo: erro.message,
			});
		}
	}

	// Produtos chegam com o nome da categoria (por exemplo, "Kimonos"),
	// enquanto o mapa público acima é indexado pela chave externa da migração.
	// Retornamos os dois índices sem misturá-los, para que a categoria do
	// produto seja preservada no ERP.
	return { mapa, mapaPorNome, erros, ignoradas, importadas };
}

async function importarProdutosVariacoes(dados, batchId, categoriasMapa, db) {
	const conn = db || getConexao();
	const produtosMapa = new Map();
	const variacoesMapa = new Map();
	const erros = [];
	const pendencias = [];
	let ignoradas = 0;
	let produtosImportados = 0;
	let variacoesImportadas = 0;

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
			const nomeCategoria = item.subcategoria || item.categoria;
			const categoriaId = nomeCategoria
				? categoriasMapa?.mapaPorNome?.get(nomeCategoria) || null
				: null;
			const produtoMapeado = await obterEntidadeMapeada(
				conn,
				"produto",
				item.chave_externa,
			);
			const produtoJaMapeado = produtoMapeado
				? await getOn(conn, "SELECT id FROM Produtos WHERE id = ?", [
						produtoMapeado,
					])
				: null;
			if (produtoJaMapeado) {
				produtoResult = produtoJaMapeado.id;
				ignoradas++;
			} else {
				const skusProntos = (item.variacoes || [])
					.filter((variacao) => variacao.pronto_para_importacao !== false)
					.map((variacao) => variacao.sku)
					.filter(Boolean);
				let produtoPorSku = null;
				if (skusProntos.length > 0) {
					const encontrados = await new Promise((resolve, reject) => {
						const marcadores = skusProntos.map(() => "?").join(",");
						conn.all(
							`SELECT DISTINCT produto_id FROM Variacoes WHERE sku IN (${marcadores})`,
							skusProntos,
							(erro, linhas) => (erro ? reject(erro) : resolve(linhas)),
						);
					});
					if (encontrados.length > 1) {
						pendencias.push({
							chave_externa: item.chave_externa,
							tipo_entidade: "produto",
							descricao: item.nome,
							motivo_rejeicao:
								"Os SKUs deste produto já pertencem a produtos diferentes no ERP",
							sugestao:
								"Revisar a mesclagem manualmente; nenhum produto foi criado ou alterado",
						});
						continue;
					}
					produtoPorSku = encontrados[0]?.produto_id || null;
				}
				const produtoComMesmoNome = produtoPorSku
					? null
					: await getOn(
							conn,
							`SELECT id FROM Produtos
							 WHERE nome = ? AND (categoria_id = ? OR (categoria_id IS NULL AND ? IS NULL))
							 ORDER BY id LIMIT 1`,
							[item.nome, categoriaId, categoriaId],
						);
				produtoResult = produtoPorSku || produtoComMesmoNome?.id;
				if (!produtoResult) {
					produtoResult = await new Promise((resolve, reject) => {
						conn.run(
							"INSERT INTO Produtos (nome, categoria_id, ativo) VALUES (?, ?, 1)",
							[item.nome, categoriaId],
							function (erro) {
								if (erro) return reject(erro);
								resolve(this.lastID);
							},
						);
					});
					produtosImportados++;
				} else {
					ignoradas++;
				}
				await vincularChaveExterna(
					conn,
					"produto",
					item.chave_externa,
					produtoResult,
					batchId,
				);
			}

			produtosMapa.set(item.chave_externa, produtoResult);
		} catch (erro) {
			erros.push({
				chave_externa: item.chave_externa,
				motivo: erro.message,
			});
			continue; // produto falhou: não faz sentido tentar suas variações
		}

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
				const variacaoMapeada = await obterEntidadeMapeada(
					conn,
					"variacao",
					variacao.chave_externa,
				);
				const variacaoExistente = variacaoMapeada
					? await getOn(
							conn,
							"SELECT id, produto_id FROM Variacoes WHERE id = ?",
							[variacaoMapeada],
						)
					: await getOn(
							conn,
							"SELECT id, produto_id FROM Variacoes WHERE sku = ?",
							[variacao.sku],
						);
				if (
					variacaoExistente &&
					variacaoExistente.produto_id !== produtoResult
				) {
					pendencias.push({
						chave_externa: variacao.chave_externa,
						tipo_entidade: "variacao",
						descricao: `${item.nome} - SKU: ${variacao.sku}`,
						motivo_rejeicao:
							"SKU já está vinculado a outro produto no ERP; não foi movido automaticamente",
						sugestao:
							"Revisar a mesclagem manualmente para não deslocar estoque ou histórico de vendas",
					});
					continue;
				}
				let variacaoResult = variacaoExistente?.id;
				if (!variacaoResult) {
					variacaoResult = await new Promise((resolve, reject) => {
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
					variacoesImportadas++;
				}

				variacoesMapa.set(variacao.sku, variacaoResult);
				await vincularChaveExterna(
					conn,
					"variacao",
					variacao.chave_externa,
					variacaoResult,
					batchId,
				);
				if (variacaoExistente) ignoradas++;
			} catch (erro) {
				erros.push({
					chave_externa: variacao.chave_externa,
					motivo: erro.message,
				});
			}
		}
	}

	return {
		produtosMapa,
		variacoesMapa,
		erros,
		pendencias,
		ignoradas,
		produtosImportados,
		variacoesImportadas,
	};
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
	let ignoradas = 0;

	for (const item of dados) {
		try {
			const estoqueMapeado = await obterEntidadeMapeada(
				conn,
				"estoque",
				item.chave_externa,
			);
			if (estoqueMapeado) {
				ignoradas++;
				continue;
			}

			if (item.quantidade_saldo === 0) {
				skipped.push({
					chave_externa: item.chave_externa,
					motivo: "quantidade_saldo = 0",
				});
				continue;
			}

			const variacaoExistente = await getOn(
				conn,
				"SELECT id FROM Variacoes WHERE sku = ?",
				[item.sku],
			);
			const variacaoId = variacoesMapa.get(item.sku) || variacaoExistente?.id;
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
					item.movimentacao?.custo_unitario || 0,
					dataMovimentacao,
					"Importação Loja House - estoque inicial",
				],
			);

			await vincularChaveExterna(
				conn,
				"estoque",
				item.chave_externa,
				variacaoId,
				batchId,
			);

			importados++;
		} catch (erro) {
			erros.push({
				chave_externa: item.chave_externa,
				motivo: erro.message,
			});
		}
	}

	return { erros, skipped, pendencias, importados, ignoradas };
}

async function importarClientes(dados, batchId, db) {
	const conn = db || getConexao();
	const erros = [];
	const pendencias = [];
	let ignoradas = 0;
	let importados = 0;

	for (const item of dados) {
		try {
			if (await obterEntidadeMapeada(conn, "cliente", item.chave_externa)) {
				ignoradas++;
				continue;
			}

			// Verificar homonyms
			const existente = await getOn(
				conn,
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

			await vincularChaveExterna(
				conn,
				"cliente",
				item.chave_externa,
				resultado,
				batchId,
			);
			importados++;
		} catch (erro) {
			erros.push({
				chave_externa: item.chave_externa,
				motivo: erro.message,
			});
		}
	}

	return { erros, pendencias, ignoradas, importados };
}

async function importarFinanceiroHistorico(dados, batchId, db) {
	const conn = db || getConexao();
	const erros = [];
	let importados = 0;
	let ignoradas = 0;

	for (const item of dados) {
		try {
			if (await obterEntidadeMapeada(conn, "lancamento", item.chave_externa)) {
				ignoradas++;
				continue;
			}

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

			const resultado = await getOn(conn, "SELECT last_insert_rowid() as id");

			await vincularChaveExterna(
				conn,
				"lancamento",
				item.chave_externa,
				resultado.id,
				batchId,
			);
			importados++;
		} catch (erro) {
			erros.push({
				chave_externa: item.chave_externa,
				motivo: erro.message,
			});
		}
	}

	return { erros, importados, ignoradas };
}

// Vendas históricas de crediário (Fiado) já vinculadas a um cliente real —
// completa o passo que antes só contava dados.vendasHistoricas sem nunca
// importar (ver GOALS.md "4. Crediário histórico" e
// IMPORT_LOJA_HOUSE.md, que documentava isso como "0 ready in this batch,
// skip for now"). Cada item precisa trazer cliente_id+sku+data prontos —
// sem isso vira pendência, mesma regra de aceitar/rejeitar que toda outra
// entidade deste arquivo já segue (produto bloqueado, cliente homônimo etc.).
// Reusa `db` (a conexão já em transação de executarComTransacao) — por isso
// registrarVendaFiadoHistorica recebe esse `db` e não abre um BEGIN próprio.
async function importarVendasHistoricasFiado(dados, batchId, db) {
	const conn = db || getConexao();
	const erros = [];
	const pendencias = [];
	let importadas = 0;

	for (const item of dados) {
		const temCamposObrigatorios = item.cliente_id && item.sku && item.data;
		if (!temCamposObrigatorios) {
			pendencias.push({
				chave_externa: item.chave_externa,
				tipo_entidade: "venda_historica",
				descricao: `SKU: ${item.sku || "?"} — ${item.data || "sem data"}`,
				motivo_rejeicao:
					"Faltam cliente_id, sku ou data para registrar a venda histórica",
				sugestao:
					"Informar cliente_id (id do cliente já importado), sku e data e reimportar",
			});
			continue;
		}

		try {
			await registrarVendaFiadoHistorica(
				{
					cliente_id: item.cliente_id,
					sku: item.sku,
					quantidade: item.quantidade,
					valorUnitario: item.valorUnitario ?? item.valor_unitario,
					data: item.data,
					statusRecebivel:
						item.statusRecebivel || item.status_recebivel || "aberto",
				},
				conn,
			);
			importadas++;
		} catch (erro) {
			erros.push({
				chave_externa: item.chave_externa,
				motivo: erro.message,
			});
		}
	}

	return { erros, pendencias, importadas };
}

async function importarPendencias(dados, batchId, db) {
	const conn = db || getConexao();
	const erros = [];
	let ignoradas = 0;
	let importadas = 0;

	for (const item of dados) {
		try {
			const chaveExterna = item.chave_externa || item.id || null;
			const tipo = item.tipo_entidade || item.tipo || "outro";
			if (
				chaveExterna &&
				(await getOn(
					conn,
					"SELECT id FROM Pendencias WHERE chave_externa = ? AND tipo_entidade = ? LIMIT 1",
					[chaveExterna, tipo],
				))
			) {
				ignoradas++;
				continue;
			}
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
					chaveExterna,
					tipo,
					item.descricao || null,
					item.valor || null,
					item.motivo_rejeicao || item.descricao || null,
					item.sugestao || item.acao_sugerida || null,
					batchId,
				],
			);
			importadas++;
		} catch (erro) {
			erros.push({
				chave_externa: item.chave_externa || item.id || "desconhecido",
				motivo: erro.message,
			});
		}
	}

	return { erros, ignoradas, importadas };
}

function precificacoesIguais(a, b) {
	return [
		"preco_custo",
		"impostos_extras",
		"margem_percentual",
		"preco_venda",
		"status",
	].every((campo) => a[campo] === b[campo]);
}

async function mesclarDuplicidadesImportacao(db) {
	const conn = db || getConexao();
	const resultado = {
		categoriasMescladas: 0,
		produtosMesclados: 0,
		produtosComConflitoDePreco: 0,
	};

	const gruposCategoria = await allOn(
		conn,
		`SELECT nome, categoria_pai_id
		 FROM Categorias
		 GROUP BY nome, categoria_pai_id
		 HAVING COUNT(*) > 1`,
	);
	for (const grupo of gruposCategoria) {
		const categorias = await allOn(
			conn,
			`SELECT id FROM Categorias
			 WHERE nome = ? AND (categoria_pai_id = ? OR (categoria_pai_id IS NULL AND ? IS NULL))
			 ORDER BY id`,
			[grupo.nome, grupo.categoria_pai_id, grupo.categoria_pai_id],
		);
		const [principal, ...duplicadas] = categorias;
		for (const duplicada of duplicadas) {
			await runOn(
				conn,
				"UPDATE Produtos SET categoria_id = ? WHERE categoria_id = ?",
				[principal.id, duplicada.id],
			);
			await runOn(
				conn,
				"UPDATE Produtos SET subcategoria_id = ? WHERE subcategoria_id = ?",
				[principal.id, duplicada.id],
			);
			await runOn(
				conn,
				"UPDATE Categorias SET categoria_pai_id = ? WHERE categoria_pai_id = ?",
				[principal.id, duplicada.id],
			);
			await runOn(
				conn,
				`INSERT OR IGNORE INTO ProdutoCategorias (produto_id, categoria_id)
				 SELECT produto_id, ? FROM ProdutoCategorias WHERE categoria_id = ?`,
				[principal.id, duplicada.id],
			);
			await runOn(
				conn,
				"DELETE FROM ProdutoCategorias WHERE categoria_id = ?",
				[duplicada.id],
			);
			await runOn(
				conn,
				"UPDATE MapeamentoChaveExterna SET entidade_id = ? WHERE entidade_tipo = 'categoria' AND entidade_id = ?",
				[principal.id, duplicada.id],
			);
			await runOn(conn, "DELETE FROM Categorias WHERE id = ?", [duplicada.id]);
			resultado.categoriasMescladas++;
		}
	}

	const gruposProduto = await allOn(
		conn,
		`SELECT nome, categoria_id
		 FROM Produtos
		 GROUP BY nome, categoria_id
		 HAVING COUNT(*) > 1`,
	);
	for (const grupo of gruposProduto) {
		const produtos = await allOn(
			conn,
			`SELECT p.id, COUNT(v.id) AS variacoes
			 FROM Produtos p LEFT JOIN Variacoes v ON v.produto_id = p.id
			 WHERE p.nome = ? AND (p.categoria_id = ? OR (p.categoria_id IS NULL AND ? IS NULL))
			 GROUP BY p.id ORDER BY variacoes DESC, p.id`,
			[grupo.nome, grupo.categoria_id, grupo.categoria_id],
		);
		const [principal, ...duplicados] = produtos;
		for (const duplicado of duplicados) {
			const precoPrincipal = await getOn(
				conn,
				"SELECT * FROM Precificacao WHERE produto_id = ?",
				[principal.id],
			);
			const precoDuplicado = await getOn(
				conn,
				"SELECT * FROM Precificacao WHERE produto_id = ?",
				[duplicado.id],
			);
			if (
				precoPrincipal &&
				precoDuplicado &&
				!precificacoesIguais(precoPrincipal, precoDuplicado)
			) {
				resultado.produtosComConflitoDePreco++;
				continue;
			}
			if (!precoPrincipal && precoDuplicado) {
				await runOn(
					conn,
					"UPDATE Precificacao SET produto_id = ? WHERE produto_id = ?",
					[principal.id, duplicado.id],
				);
			}
			await runOn(
				conn,
				`INSERT OR IGNORE INTO ProdutoCategorias (produto_id, categoria_id)
				 SELECT ?, categoria_id FROM ProdutoCategorias WHERE produto_id = ?`,
				[principal.id, duplicado.id],
			);
			await runOn(conn, "DELETE FROM ProdutoCategorias WHERE produto_id = ?", [
				duplicado.id,
			]);
			await runOn(
				conn,
				"UPDATE Variacoes SET produto_id = ? WHERE produto_id = ?",
				[principal.id, duplicado.id],
			);
			await runOn(
				conn,
				"UPDATE MapeamentoChaveExterna SET entidade_id = ? WHERE entidade_tipo = 'produto' AND entidade_id = ?",
				[principal.id, duplicado.id],
			);
			await runOn(conn, "DELETE FROM Produtos WHERE id = ?", [duplicado.id]);
			resultado.produtosMesclados++;
		}
	}

	return resultado;
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
				vendasHistoricas: 0,
			},
			ignoradas: 0,
			pendencias: [],
			erros: [],
		};
		resultado.reconciliacao = await mesclarDuplicidadesImportacao(connTxn);

		let categoriasMapa = { mapa: new Map(), mapaPorNome: new Map() };
		let variacoesMapa = new Map();

		// 1. Categorias
		const resCateg = await importarCategorias(
			dados.categorias,
			batchId,
			connTxn,
		);
		categoriasMapa = resCateg;
		resultado.importadas.categorias = resCateg.importadas;
		resultado.ignoradas += resCateg.ignoradas;
		resultado.erros.push(...resCateg.erros);

		// 2. Produtos e Variações
		const resProd = await importarProdutosVariacoes(
			dados.produtosVariacoes,
			batchId,
			categoriasMapa,
			connTxn,
		);
		variacoesMapa = resProd.variacoesMapa;
		resultado.importadas.produtos = resProd.produtosImportados;
		resultado.importadas.variacoes = resProd.variacoesImportadas;
		resultado.ignoradas += resProd.ignoradas;
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
		resultado.ignoradas += resEst.ignoradas;
		resultado.pendencias.push(...resEst.pendencias);
		resultado.erros.push(...resEst.erros);

		// 4. Clientes
		const resCli = await importarClientes(dados.clientes, batchId, connTxn);
		resultado.importadas.clientes = resCli.importados;
		resultado.ignoradas += resCli.ignoradas;
		resultado.pendencias.push(...resCli.pendencias);
		resultado.erros.push(...resCli.erros);

		// 5. Financeiro Histórico
		const resFin = await importarFinanceiroHistorico(
			dados.financeiroHistorico,
			batchId,
			connTxn,
		);
		resultado.importadas.lancamentos = resFin.importados;
		resultado.ignoradas += resFin.ignoradas;
		resultado.erros.push(...resFin.erros);

		// 6. Contas Abertas (mesmo que financeiro, mas status aberto)
		const resContasAbertas = await importarFinanceiroHistorico(
			dados.contasAbertas,
			batchId,
			connTxn,
		);
		resultado.importadas.lancamentos += resContasAbertas.importados;
		resultado.ignoradas += resContasAbertas.ignoradas;
		resultado.erros.push(...resContasAbertas.erros);

		// 7. Pendências
		const resPend = await importarPendencias(
			[...dados.pendenciasOrigem, ...resultado.pendencias],
			batchId,
			connTxn,
		);
		resultado.pendencias = resPend.importadas;
		resultado.ignoradas += resPend.ignoradas;
		resultado.erros.push(...resPend.erros);

		// 8. Vendas Históricas de Crediário (Fiado com cliente_id vinculado) —
		// completa o gap documentado em IMPORT_LOJA_HOUSE.md ("0 ready in this
		// batch, skip for now"). Cada item precisa trazer cliente_id+sku+data
		// prontos; sem isso vira pendência, mesmo padrão de aceitar/rejeitar de
		// toda outra entidade acima. Fica depois do passo 7 porque suas próprias
		// pendências só existem depois de tentar o registro — por isso persiste
		// com uma segunda chamada a importarPendencias.
		const resVendasHist = await importarVendasHistoricasFiado(
			dados.vendasHistoricas,
			batchId,
			connTxn,
		);
		resultado.importadas.vendasHistoricas = resVendasHist.importadas;
		resultado.erros.push(...resVendasHist.erros);
		if (resVendasHist.pendencias.length > 0) {
			const resPendVendasHist = await importarPendencias(
				resVendasHist.pendencias,
				batchId,
				connTxn,
			);
			resultado.erros.push(...resPendVendasHist.erros);
			resultado.pendencias += resPendVendasHist.importadas;
			resultado.ignoradas += resPendVendasHist.ignoradas;
		}

		if (resultado.erros.length > 0) {
			throw new Error(
				`Importação cancelada para não deixar dados parciais: ${resultado.erros
					.map((erro) => `${erro.chave_externa}: ${erro.motivo}`)
					.join("; ")}`,
			);
		}

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

		const status = "sucesso";

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
	mesclarDuplicidadesImportacao,
};
