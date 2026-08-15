const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const {
	getConexao,
	runAsync,
	getAsync,
	runOn,
	normalizarBusca,
} = require("./conexao");

function obterAtributoLegado(atributos, chaveProcurada) {
	if (!Array.isArray(atributos)) return null;
	const alvo = chaveProcurada.toLowerCase();
	for (const a of atributos) {
		if (
			a &&
			a.chave &&
			a.valor &&
			String(a.chave).trim().toLowerCase() === alvo
		) {
			return String(a.valor).trim();
		}
	}
	return null;
}

async function criarVariacoesPadrao(conn) {
	const produtos = await new Promise((resolve, reject) => {
		conn.all(
			`SELECT p.id
       FROM Produtos p
       LEFT JOIN Variacoes v ON v.produto_id = p.id
       GROUP BY p.id
       HAVING COUNT(v.id) = 0`,
			[],
			(erro, linhas) => (erro ? reject(erro) : resolve(linhas)),
		);
	});
	for (const produto of produtos) {
		await runOn(
			conn,
			`INSERT INTO Variacoes
       (produto_id, sku, tamanho, cor, preco, preco_custo, quantidade_estoque, estoque_minimo, atributos)
       VALUES (?, ?, NULL, NULL, 0, 0, 0, 5, ?)`,
			[
				produto.id,
				"PRODUTO-" + produto.id,
				JSON.stringify([{ chave: "Unidade", valor: "Padrão" }]),
			],
		);
	}
}

async function salvarProduto(produto, variacoes) {
	const conn = getConexao();

	if (!produto || !String(produto.nome || "").trim()) {
		throw new Error("O nome do produto é obrigatório.");
	}
	// Produtos básicos podem ser salvos sem variações; a grade de variações
	// será gerida futuramente na aba comercial.
	variacoes = Array.isArray(variacoes) ? variacoes : [];

	const run = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.run(sql, params, function (erro) {
				if (erro) return reject(erro);
				resolve(this);
			});
		});

	const get = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.get(sql, params, (erro, linha) => {
				if (erro) return reject(erro);
				resolve(linha);
			});
		});

	await run("BEGIN TRANSACTION");

	try {
		let proximoSku = null;
		for (const v of variacoes) {
			if (String(v.sku || "").trim()) continue;
			if (proximoSku === null) {
				const linhaSku = await get(
					"SELECT COALESCE(MAX(CASE WHEN UPPER(sku) GLOB 'P[0-9]*' THEN CAST(SUBSTR(sku, 2) AS INTEGER) ELSE 0 END), 0) + 1 AS proximo FROM Variacoes",
				);
				proximoSku = Number(linhaSku && linhaSku.proximo) || 1;
			}
			v.sku = "P" + String(proximoSku++).padStart(4, "0");
		}

		// SKUs únicos: sem duplicatas na grade e sem conflito com o banco.
		const skusVistos = new Set();
		for (const v of variacoes) {
			const sku = String(v.sku || "")
				.trim()
				.toUpperCase();
			if (!sku) throw new Error("Todas as variações precisam de um SKU.");
			const preco = Number(v.preco);
			const precoCusto = Number(v.preco_custo || 0);
			const estoque = Number(v.quantidade_estoque);
			const atributos = Array.isArray(v.atributos) ? v.atributos : [];
			if (!Number.isFinite(preco) || preco < 0)
				throw new Error("Preço de venda inválido.");
			if (!Number.isFinite(precoCusto) || precoCusto < 0)
				throw new Error("Preço de custo inválido.");
			if (!Number.isInteger(estoque) || estoque < 0)
				throw new Error("Estoque inválido.");
			if (atributos.length === 0)
				throw new Error("Cada variação precisa de pelo menos um atributo.");
			if (
				atributos.some(
					(a) =>
						!a ||
						!String(a.chave || "").trim() ||
						!String(a.valor || "").trim(),
				)
			) {
				throw new Error("Todos os atributos precisam de chave e valor.");
			}
			if (skusVistos.has(sku))
				throw new Error("SKU duplicado na grade: " + sku);
			skusVistos.add(sku);
			const existente = await get(
				"SELECT id FROM Variacoes WHERE UPPER(sku) = ?",
				[sku],
			);
			if (existente)
				throw new Error("Já existe uma variação com o SKU: " + sku);
		}

		// Integridade da subcategoria: precisa pertencer à categoria escolhida.
		if (produto.categoria_id && produto.subcategoria_id) {
			const sub = await get(
				"SELECT id, categoria_pai_id FROM Categorias WHERE id = ?",
				[produto.subcategoria_id],
			);
			if (!sub || sub.categoria_pai_id !== produto.categoria_id) {
				throw new Error(
					"A subcategoria selecionada não pertence à categoria escolhida.",
				);
			}
		}

		const result = await run(
			"INSERT INTO Produtos (nome, categoria, categoria_id, subcategoria_id) VALUES (?, ?, ?, ?)",
			[
				produto.nome,
				produto.categoria || null,
				produto.categoria_id || null,
				produto.subcategoria_id || null,
			],
		);
		const produtoId = result.lastID;

		// Associa as categorias/atributos selecionados no checklist (múltipla seleção).
		// Cria a tabela de junção se o banco foi aberto por uma versão antiga do app
		// (migração defensive - normalmente criada em iniciarBanco).
		await run(
			`CREATE TABLE IF NOT EXISTS ProdutoCategorias (
        produto_id INTEGER NOT NULL,
        categoria_id INTEGER NOT NULL,
        PRIMARY KEY (produto_id, categoria_id),
        FOREIGN KEY (produto_id) REFERENCES Produtos(id) ON DELETE CASCADE,
        FOREIGN KEY (categoria_id) REFERENCES Categorias(id) ON DELETE CASCADE
      )`,
		);
		const categoriasSelecionadas = Array.isArray(produto.categoriasSelecionadas)
			? produto.categoriasSelecionadas
					.map((id) => Number(id))
					.filter((id) => Number.isInteger(id) && id > 0)
			: [];
		for (const catId of categoriasSelecionadas) {
			await run(
				"INSERT OR IGNORE INTO ProdutoCategorias (produto_id, categoria_id) VALUES (?, ?)",
				[produtoId, catId],
			);
		}

		// Sincronização automática: insere produto na tabela de precificação
		// com status 'pendente' (preço de custo e venda vêm das variações).
		await run(
			`CREATE TABLE IF NOT EXISTS Precificacao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER NOT NULL UNIQUE,
        preco_custo REAL NOT NULL DEFAULT 0,
        impostos_extras REAL NOT NULL DEFAULT 0,
        margem_percentual REAL,
        preco_venda REAL NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        FOREIGN KEY (produto_id) REFERENCES Produtos(id) ON DELETE CASCADE
      )`,
		);
		await run(
			"INSERT OR IGNORE INTO Precificacao (produto_id, preco_custo, impostos_extras, preco_venda, status) VALUES (?, 0, 0, 0, ?)",
			[produtoId, "pendente"],
		);

		for (const v of variacoes) {
			const atributos = Array.isArray(v.atributos) ? v.atributos : [];
			// Fallback legado: se os atributos contêm Tamanho/Cor, espelha nas colunas antigas.
			const tamanho =
				obterAtributoLegado(atributos, "tamanho") || v.tamanho || null;
			const cor = obterAtributoLegado(atributos, "cor") || v.cor || null;
			await run(
				"INSERT INTO Variacoes (produto_id, sku, tamanho, cor, preco, preco_custo, quantidade_estoque, estoque_minimo, atributos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
				[
					produtoId,
					String(v.sku).trim().toUpperCase(),
					tamanho,
					cor,
					v.preco,
					v.preco_custo || 0,
					v.quantidade_estoque,
					Number.isInteger(Number(v.estoque_minimo)) &&
					Number(v.estoque_minimo) >= 0
						? Number(v.estoque_minimo)
						: 5,
					JSON.stringify(atributos),
				],
			);
		}

		await run("COMMIT");
		return { success: true, produtoId };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}
async function buscarSKU(sku) {
	const conn = getConexao();

	const get = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.get(sql, params, (erro, linha) => {
				if (erro) return reject(erro);
				resolve(linha);
			});
		});

	const row = await get(
		`SELECT v.id AS id, p.id AS produto_id, p.nome, p.categoria AS categoria_legada,
            c.nome AS categoria_nome, s.nome AS subcategoria_nome,
            v.tamanho, v.cor, v.preco, v.preco_custo, v.quantidade_estoque, v.quantidade_reservada,
            (v.quantidade_estoque - v.quantidade_reservada) AS quantidade_disponivel,
            v.estoque_minimo, v.sku, v.atributos, p.imagem
     FROM Variacoes v
     JOIN Produtos p ON p.id = v.produto_id
     LEFT JOIN Categorias c ON c.id = p.categoria_id
     LEFT JOIN Categorias s ON s.id = p.subcategoria_id
     WHERE UPPER(v.sku) = ? AND p.ativo = 1`,
		[String(sku).trim().toUpperCase()],
	);

	return row || null;
}

async function buscarProdutosPorTermo(termo) {
	const conn = getConexao();
	const all = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.all(sql, params, (erro, linhas) => {
				if (erro) return reject(erro.message);
				resolve(linhas);
			});
		});
	const texto = String(termo).trim();
	const codigo = Number(texto.replace(/^#/, ""));
	const alvo = normalizarBusca(texto);
	const linhas = await all(
		`SELECT v.id AS id, p.id AS produto_id, v.sku, p.nome, v.tamanho, v.cor, v.preco,
              v.quantidade_estoque, v.quantidade_reservada,
              (v.quantidade_estoque - v.quantidade_reservada) AS quantidade_disponivel,
              v.estoque_minimo, v.atributos, p.imagem
       FROM Variacoes v
       JOIN Produtos p ON p.id = v.produto_id
       WHERE p.ativo = 1
        ORDER BY p.nome`,
	);
	if (!alvo) return linhas.slice(0, 100);
	return linhas
		.filter(
			(l) =>
				normalizarBusca(l.nome).indexOf(alvo) !== -1 ||
				normalizarBusca(l.sku).indexOf(alvo) !== -1 ||
				(Number.isInteger(codigo) && l.produto_id === codigo),
		)
		.slice(0, 100);
}

function validarVariacao(v) {
	const sku = String(v.sku || "")
		.trim()
		.toUpperCase();
	if (!sku) throw new Error("Todas as variações precisam de um SKU.");
	const preco = Number(v.preco);
	const precoCusto = Number(v.preco_custo || 0);
	const estoque = Number(v.quantidade_estoque);
	const atributos = Array.isArray(v.atributos) ? v.atributos : [];
	if (!Number.isFinite(preco) || preco < 0)
		throw new Error("Preço de venda inválido.");
	if (!Number.isFinite(precoCusto) || precoCusto < 0)
		throw new Error("Preço de custo inválido.");
	if (!Number.isInteger(estoque) || estoque < 0)
		throw new Error("Estoque inválido.");
	if (atributos.length === 0)
		throw new Error("Cada variação precisa de pelo menos um atributo.");
	if (
		atributos.some(
			(a) =>
				!a || !String(a.chave || "").trim() || !String(a.valor || "").trim(),
		)
	) {
		throw new Error("Todos os atributos precisam de chave e valor.");
	}

	return { sku, preco, precoCusto, estoque, atributos };
}

async function buscarProdutosPDV02(termo) {
	const conn = getConexao();
	const texto = String(termo || "").trim();
	const like = "%" + texto.toUpperCase() + "%";
	return new Promise((resolve, reject) => {
		conn.all(
			`SELECT v.id AS variacao_id, v.sku, p.nome, v.tamanho, v.cor,
              v.preco, v.quantidade_estoque, v.atributos
       FROM Variacoes v
       JOIN Produtos p ON p.id = v.produto_id
       WHERE ? = '' OR UPPER(v.sku) LIKE ? OR UPPER(p.nome) LIKE ?
       ORDER BY p.nome, v.sku
       LIMIT 50`,
			[texto, like, like],
			(erro, linhas) => (erro ? reject(erro) : resolve(linhas)),
		);
	});
}

async function listProdutosDetalhados(incluirInativos) {
	const conn = getConexao();

	const all = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.all(sql, params, (erro, linhas) => {
				if (erro) return reject(erro);
				resolve(linhas);
			});
		});

	const produtos = await all(
		`SELECT p.id, p.nome, p.categoria AS categoria_legada,
            c.nome AS categoria_nome, s.nome AS subcategoria_nome,
            p.categoria_id, p.subcategoria_id, p.imagem, p.ativo
     FROM Produtos p
     LEFT JOIN Categorias c ON c.id = p.categoria_id
     LEFT JOIN Categorias s ON s.id = p.subcategoria_id
     WHERE ? OR p.ativo = 1
     ORDER BY p.nome COLLATE NOCASE`,
		[incluirInativos ? 1 : 0],
	);
	const variacoes = await all(
		`SELECT v.produto_id, v.id AS variacao_id, v.sku, v.tamanho, v.cor,
            v.preco, v.preco_custo, v.quantidade_estoque, v.atributos
     FROM Variacoes v
     ORDER BY v.id`,
	);

	const catsProd = await all(
		`SELECT pc.produto_id, c.id AS categoria_id, c.nome AS categoria_nome,
            c.categoria_pai_id, p.nome AS categoria_pai_nome
     FROM ProdutoCategorias pc
     JOIN Categorias c ON c.id = pc.categoria_id
     LEFT JOIN Categorias p ON p.id = c.categoria_pai_id
     ORDER BY c.nome COLLATE NOCASE`,
	);

	return produtos.map((p) => ({
		id: p.id,
		nome: p.nome,
		categoria_legada: p.categoria_legada,
		categoria_nome: p.categoria_nome,
		subcategoria_nome: p.subcategoria_nome,
		categoria_id: p.categoria_id,
		subcategoria_id: p.subcategoria_id,
		imagem: p.imagem,
		ativo: p.ativo,
		categorias_selecionadas: catsProd
			.filter((c) => c.produto_id === p.id)
			.map((c) => ({
				id: c.categoria_id,
				nome: c.categoria_nome,
				categoria_pai_id: c.categoria_pai_id,
				categoria_pai_nome: c.categoria_pai_nome,
			})),
		variacoes: variacoes
			.filter((v) => v.produto_id === p.id)
			.map((v) => ({
				variacao_id: v.variacao_id,
				sku: v.sku,
				tamanho: v.tamanho,
				cor: v.cor,
				preco: v.preco,
				preco_custo: v.preco_custo,
				quantidade_estoque: v.quantidade_estoque,
				atributos: v.atributos,
			})),
	}));
}

async function getProximoSkuProduto() {
	const conn = getConexao();
	const linhas = await new Promise((resolve, reject) => {
		conn.all(
			"SELECT sku FROM Variacoes WHERE UPPER(sku) LIKE 'P%'",
			[],
			(erro, rows) => {
				if (erro) return reject(erro);
				resolve(rows);
			},
		);
	});
	const maior = linhas.reduce((max, linha) => {
		const match = /^P(\d+)$/.exec(String(linha.sku || "").toUpperCase());
		return match ? Math.max(max, Number(match[1])) : max;
	}, 0);
	return "P" + String(maior + 1).padStart(4, "0");
}

async function atualizarProduto(id, produto, variacoes) {
	const conn = getConexao();

	if (!produto || !String(produto.nome || "").trim()) {
		throw new Error("O nome do produto é obrigatório.");
	}

	const variacoesLista = Array.isArray(variacoes) ? variacoes : [];

	const run = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.run(sql, params, function (erro) {
				if (erro) return reject(erro);
				resolve(this);
			});
		});

	const get = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.get(sql, params, (erro, linha) => {
				if (erro) return reject(erro);
				resolve(linha);
			});
		});

	await run("BEGIN TRANSACTION");

	try {
		const existente = await get("SELECT id FROM Produtos WHERE id = ?", [id]);
		if (!existente) throw new Error("Produto não encontrado.");

		// Integridade da subcategoria: precisa pertencer à categoria escolhida.
		if (produto.categoria_id && produto.subcategoria_id) {
			const sub = await get(
				"SELECT id, categoria_pai_id FROM Categorias WHERE id = ?",
				[produto.subcategoria_id],
			);
			if (!sub || sub.categoria_pai_id !== produto.categoria_id) {
				throw new Error(
					"A subcategoria selecionada não pertence à categoria escolhida.",
				);
			}
		}

		// Substitui as associações de categorias/atributos (checklist de múltipla seleção).
		// Cria a tabela de junção se o banco foi aberto por uma versão antiga do app.
		await run(
			`CREATE TABLE IF NOT EXISTS ProdutoCategorias (
        produto_id INTEGER NOT NULL,
        categoria_id INTEGER NOT NULL,
        PRIMARY KEY (produto_id, categoria_id),
        FOREIGN KEY (produto_id) REFERENCES Produtos(id) ON DELETE CASCADE,
        FOREIGN KEY (categoria_id) REFERENCES Categorias(id) ON DELETE CASCADE
      )`,
		);
		const categoriasSelecionadas = Array.isArray(produto.categoriasSelecionadas)
			? produto.categoriasSelecionadas
					.map((id) => Number(id))
					.filter((id) => Number.isInteger(id) && id > 0)
			: [];
		await run("DELETE FROM ProdutoCategorias WHERE produto_id = ?", [id]);
		for (const catId of categoriasSelecionadas) {
			await run(
				"INSERT OR IGNORE INTO ProdutoCategorias (produto_id, categoria_id) VALUES (?, ?)",
				[id, catId],
			);
		}

		if (variacoesLista.length === 0) {
			// Atualização em nível de produto: apenas nome/categoria/subcategoria,
			// preservando as variações existentes (inclusive as com vendas).
			await run(
				"UPDATE Produtos SET nome = ?, categoria = ?, categoria_id = ?, subcategoria_id = ? WHERE id = ?",
				[
					produto.nome,
					produto.categoria || null,
					produto.categoria_id || null,
					produto.subcategoria_id || null,
					id,
				],
			);
			await run("COMMIT");
			return { success: true, produtoId: id, variacoesPreservadas: true };
		}

		// Sincronização por SKU: variações que já existiam são preservadas (o
		// mesmo id, então histórico de movimentações e vendas continua íntegro);
		// só SKUs novos na grade viram INSERT e só os removidos viram DELETE.
		let proximoSku = null;
		for (const v of variacoesLista) {
			if (String(v.sku || "").trim()) continue;
			if (proximoSku === null) {
				const linhaSku = await get(
					"SELECT COALESCE(MAX(CASE WHEN UPPER(sku) GLOB 'P[0-9]*' THEN CAST(SUBSTR(sku, 2) AS INTEGER) ELSE 0 END), 0) + 1 AS proximo FROM Variacoes",
				);
				proximoSku = Number(linhaSku && linhaSku.proximo) || 1;
			}
			v.sku = "P" + String(proximoSku++).padStart(4, "0");
		}

		// SKUs únicos: sem duplicatas na grade e sem conflito com outros produtos.
		const skusVistos = new Set();
		const validadas = [];
		for (const v of variacoesLista) {
			const validada = validarVariacao(v);
			if (skusVistos.has(validada.sku))
				throw new Error("SKU duplicado na grade: " + validada.sku);
			skusVistos.add(validada.sku);
			const outro = await get(
				"SELECT id FROM Variacoes WHERE UPPER(sku) = ? AND produto_id != ?",
				[validada.sku, id],
			);
			if (outro)
				throw new Error("Já existe uma variação com o SKU: " + validada.sku);
			validadas.push({ ...validada, estoque_minimo: v.estoque_minimo });
		}

		const existentes = await new Promise((resolve, reject) => {
			conn.all(
				"SELECT id, sku, preco, preco_custo, estoque_minimo FROM Variacoes WHERE produto_id = ?",
				[id],
				(erro, linhas) => (erro ? reject(erro) : resolve(linhas)),
			);
		});
		const existentesPorSku = new Map(
			existentes.map((e) => [String(e.sku).toUpperCase(), e]),
		);
		const skusMantidos = new Set(validadas.map((v) => v.sku));

		// Remove variações que saíram da grade — bloqueado se já tiverem vendas.
		for (const e of existentes) {
			if (skusMantidos.has(String(e.sku).toUpperCase())) continue;
			const vendida = await get(
				"SELECT COUNT(*) AS n FROM ItensVenda WHERE variacao_id = ?",
				[e.id],
			);
			if (vendida.n > 0) {
				throw new Error(
					"Não é possível remover a variação " +
						e.sku +
						" pois ela possui vendas registradas.",
				);
			}
			await run("DELETE FROM Variacoes WHERE id = ?", [e.id]);
		}

		await run(
			"UPDATE Produtos SET nome = ?, categoria = ?, categoria_id = ?, subcategoria_id = ? WHERE id = ?",
			[
				produto.nome,
				produto.categoria || null,
				produto.categoria_id || null,
				produto.subcategoria_id || null,
				id,
			],
		);

		for (const v of validadas) {
			// Fallback legado: se os atributos contêm Tamanho/Cor, espelha nas colunas antigas.
			const tamanho = obterAtributoLegado(v.atributos, "tamanho") || null;
			const cor = obterAtributoLegado(v.atributos, "cor") || null;
			const existente = existentesPorSku.get(v.sku);
			const estoqueMinimo =
				Number.isInteger(Number(v.estoque_minimo)) &&
				Number(v.estoque_minimo) >= 0
					? Number(v.estoque_minimo)
					: existente
						? existente.estoque_minimo
						: 5;

			if (existente) {
				// Já existia: preserva id, preço e saldo de estoque (quantidade só
				// muda pela aba Estoque) — só os dados descritivos são atualizados.
				await run(
					"UPDATE Variacoes SET tamanho = ?, cor = ?, atributos = ?, estoque_minimo = ? WHERE id = ?",
					[
						tamanho,
						cor,
						JSON.stringify(v.atributos),
						estoqueMinimo,
						existente.id,
					],
				);
			} else {
				// Variação nova: herda preço/custo de uma irmã já cadastrada para
				// não nascer com preço zerado enquanto as demais já têm preço.
				const irma = existentes[0];
				await run(
					"INSERT INTO Variacoes (produto_id, sku, tamanho, cor, preco, preco_custo, quantidade_estoque, estoque_minimo, atributos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
					[
						id,
						v.sku,
						tamanho,
						cor,
						irma ? irma.preco : 0,
						irma ? irma.preco_custo : 0,
						v.estoque,
						estoqueMinimo,
						JSON.stringify(v.atributos),
					],
				);
			}
		}

		await run("COMMIT");
		return { success: true, produtoId: id };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

// Exclusão é lógica (ativo=0): produto some das listas/buscas normais mas
// fica recuperável na Lixeira, e vendas antigas continuam referenciando as
// variações sem quebrar (nada em Variacoes/ItensVenda é tocado).
async function removerProduto(id) {
	const existente = await getAsync("SELECT id FROM Produtos WHERE id = ?", [
		id,
	]);
	if (!existente) throw new Error("Produto não encontrado.");

	await runAsync("UPDATE Produtos SET ativo = 0 WHERE id = ?", [id]);
	return { success: true };
}

async function restaurarProduto(id) {
	const existente = await getAsync("SELECT id FROM Produtos WHERE id = ?", [
		id,
	]);
	if (!existente) throw new Error("Produto não encontrado.");

	await runAsync("UPDATE Produtos SET ativo = 1 WHERE id = ?", [id]);
	return { success: true };
}

async function excluirProdutoPermanente(id) {
	const conn = getConexao();

	const run = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.run(sql, params, function (erro) {
				if (erro) return reject(erro);
				resolve(this);
			});
		});

	const get = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.get(sql, params, (erro, linha) => {
				if (erro) return reject(erro);
				resolve(linha);
			});
		});

	await run("BEGIN TRANSACTION");

	try {
		const existente = await get("SELECT id, ativo FROM Produtos WHERE id = ?", [
			id,
		]);
		if (!existente) throw new Error("Produto não encontrado.");
		if (Number(existente.ativo) === 1)
			throw new Error(
				"Envie o produto para a lixeira antes de excluir definitivamente.",
			);

		const vendido = await get(
			`SELECT COUNT(*) AS n FROM ItensVenda iv
       JOIN Variacoes v ON v.id = iv.variacao_id
       WHERE v.produto_id = ?`,
			[id],
		);
		if (vendido.n > 0) {
			throw new Error(
				"Este produto não pode ser excluído pois possui variações com vendas registradas.",
			);
		}

		await run("DELETE FROM Variacoes WHERE produto_id = ?", [id]);
		await run("DELETE FROM Produtos WHERE id = ?", [id]);
		await run("COMMIT");
		return { success: true };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

/* ============ Imagem do produto ============ */

function pastaImagensProdutos() {
	const dir = path.join(app.getPath("userData"), "produto-imagens");
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	return dir;
}

// Copia o arquivo escolhido (caminho absoluto já validado pelo diálogo nativo
// do main.js) para a pasta de imagens do app e grava o nome do arquivo salvo.
// Remove a imagem anterior do produto, se houver, para não acumular lixo.
async function salvarImagemProduto(produtoId, caminhoOrigem) {
	const id = Number(produtoId);
	if (!Number.isInteger(id) || id <= 0) throw new Error("Produto inválido.");
	if (!caminhoOrigem || !fs.existsSync(caminhoOrigem))
		throw new Error("Arquivo de imagem não encontrado.");

	const extensoesPermitidas = [".png", ".jpg", ".jpeg", ".webp"];
	const ext = path.extname(caminhoOrigem).toLowerCase();
	if (!extensoesPermitidas.includes(ext))
		throw new Error("Formato de imagem não suportado. Use PNG, JPG ou WEBP.");

	const produto = await getAsync("SELECT imagem FROM Produtos WHERE id = ?", [
		id,
	]);
	if (!produto) throw new Error("Produto não encontrado.");

	const dir = pastaImagensProdutos();
	const nomeArquivo = "produto-" + id + "-" + Date.now() + ext;
	fs.copyFileSync(caminhoOrigem, path.join(dir, nomeArquivo));

	if (produto.imagem) {
		try {
			fs.unlinkSync(path.join(dir, produto.imagem));
		} catch (e) {
			/* já não existe */
		}
	}

	await runAsync("UPDATE Produtos SET imagem = ? WHERE id = ?", [
		nomeArquivo,
		id,
	]);
	return {
		success: true,
		imagem: nomeArquivo,
		caminho: path.join(dir, nomeArquivo),
	};
}

async function removerImagemProduto(produtoId) {
	const id = Number(produtoId);
	const produto = await getAsync("SELECT imagem FROM Produtos WHERE id = ?", [
		id,
	]);
	if (!produto) throw new Error("Produto não encontrado.");
	if (produto.imagem) {
		try {
			fs.unlinkSync(path.join(pastaImagensProdutos(), produto.imagem));
		} catch (e) {
			/* já não existe */
		}
	}
	await runAsync("UPDATE Produtos SET imagem = NULL WHERE id = ?", [id]);
	return { success: true };
}

function getCaminhoImagemProduto(nomeArquivo) {
	if (!nomeArquivo) return null;
	return path.join(pastaImagensProdutos(), nomeArquivo);
}
module.exports = {
	salvarProduto,
	atualizarProduto,
	removerProduto,
	restaurarProduto,
	excluirProdutoPermanente,
	listProdutosDetalhados,
	getProximoSkuProduto,
	buscarSKU,
	buscarProdutosPorTermo,
	salvarImagemProduto,
	removerImagemProduto,
	getCaminhoImagemProduto,
	pastaImagensProdutos,
	validarVariacao,
	obterAtributoLegado,
	criarVariacoesPadrao,
};
// buscarProdutosPDV02 é código morto herdado do database.js original: nunca
// era chamado nem exportado ali. Mantido aqui (sem exportar, igual ao
// original) só porque o escopo desta refatoração é mover código, não podá-lo.
