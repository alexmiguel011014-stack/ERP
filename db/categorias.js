const { getConexao, runAsync, allAsync, getAsync } = require("./conexao");

async function getProximoCodigoCategoria() {
	const conn = getConexao();
	const get = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.get(sql, params, (erro, linha) => {
				if (erro) return reject(erro);
				resolve(linha);
			});
		});
	const row = await get(
		"SELECT COALESCE(MAX(id), 0) + 1 AS proximo FROM Categorias",
	);
	const n = row ? row.proximo : 1;
	return "CAT" + String(n).padStart(4, "0");
}

async function getListCategoriasWithUsage(incluirInativas) {
	// Garante a tabela de junção mesmo em bancos abertos antes da migração
	// (p.ex. app em execução antes da atualização que introduziu o checklist).
	await runAsync(
		`CREATE TABLE IF NOT EXISTS ProdutoCategorias (
      produto_id INTEGER NOT NULL,
      categoria_id INTEGER NOT NULL,
      PRIMARY KEY (produto_id, categoria_id),
      FOREIGN KEY (produto_id) REFERENCES Produtos(id) ON DELETE CASCADE,
      FOREIGN KEY (categoria_id) REFERENCES Categorias(id) ON DELETE CASCADE
    )`,
	);

	const linhas = await allAsync(
		`SELECT c.id, c.nome, c.categoria_pai_id, c.ativo,
            p.nome AS categoria_pai_nome,
            (SELECT COUNT(*) FROM ProdutoCategorias pc WHERE pc.categoria_id = c.id) AS uso_checklist,
            (SELECT COUNT(*) FROM Produtos pr WHERE pr.categoria_id = c.id OR pr.subcategoria_id = c.id) AS uso_legado,
            (SELECT COUNT(*) FROM ProdutoCategorias pc JOIN Produtos pr2 ON pr2.id = pc.produto_id WHERE pc.categoria_id = c.id AND pr2.ativo = 1) AS uso_ativo_checklist,
            (SELECT COUNT(*) FROM Produtos pr3 WHERE (pr3.categoria_id = c.id OR pr3.subcategoria_id = c.id) AND pr3.ativo = 1) AS uso_ativo_legado
     FROM Categorias c
     LEFT JOIN Categorias p ON p.id = c.categoria_pai_id
     WHERE ? OR c.ativo = 1
     ORDER BY (CASE WHEN c.categoria_pai_id IS NULL THEN 0 ELSE 1 END), c.nome COLLATE NOCASE`,
		[incluirInativas ? 1 : 0],
	);

	return linhas.map((l) => ({
		id: l.id,
		codigo: "CAT" + String(l.id).padStart(4, "0"),
		nome: l.nome,
		categoria_pai_id: l.categoria_pai_id,
		categoria_pai_nome: l.categoria_pai_nome,
		tipo: l.categoria_pai_id ? "subcategoria" : "categoria",
		ativo: Number(l.ativo) !== 0,
		uso_count: Number(l.uso_checklist || 0) + Number(l.uso_legado || 0),
		uso_ativo_count:
			Number(l.uso_ativo_checklist || 0) + Number(l.uso_ativo_legado || 0),
	}));
}

// Diferente de removerCategoria (bloqueia com QUALQUER vínculo, mesmo
// histórico/inativo): inativar só bloqueia se existir produto ATIVO usando a
// categoria — pedido explícito do dono, pensado pra permitir aposentar uma
// categoria sem quebrar o histórico de produtos já descontinuados que a usam.
async function inativarCategoria(id) {
	const alvo = await getAsync(
		"SELECT id, categoria_pai_id FROM Categorias WHERE id = ?",
		[id],
	);
	if (!alvo) throw new Error("Categoria não encontrada.");

	const vinculadoAtivoChecklist = await getAsync(
		"SELECT COUNT(*) AS n FROM ProdutoCategorias pc JOIN Produtos p ON p.id = pc.produto_id WHERE pc.categoria_id = ? AND p.ativo = 1",
		[id],
	);
	const vinculadoAtivoLegado = await getAsync(
		"SELECT COUNT(*) AS n FROM Produtos WHERE (categoria_id = ? OR subcategoria_id = ?) AND ativo = 1",
		[id, id],
	);
	if (
		(vinculadoAtivoChecklist && vinculadoAtivoChecklist.n > 0) ||
		(vinculadoAtivoLegado && vinculadoAtivoLegado.n > 0)
	) {
		throw new Error(
			"Categoria vinculada a produto(s) ativo(s). Inative ou reclassifique os produtos antes.",
		);
	}

	const result = await runAsync(
		"UPDATE Categorias SET ativo = 0 WHERE id = ?",
		[id],
	);
	if (result.changes === 0) throw new Error("Categoria não encontrada.");
	return { success: true };
}

async function reativarCategoria(id) {
	const result = await runAsync(
		"UPDATE Categorias SET ativo = 1 WHERE id = ?",
		[id],
	);
	if (result.changes === 0) throw new Error("Categoria não encontrada.");
	return { success: true };
}

async function removerCategoria(id) {
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
		const alvo = await get(
			"SELECT id, categoria_pai_id FROM Categorias WHERE id = ?",
			[id],
		);
		if (!alvo) throw new Error("Categoria não encontrada.");

		// Subcategorias: bloqueia se houver vinculações em algum nível.
		const temSub = await get(
			"SELECT id FROM Categorias WHERE categoria_pai_id = ? LIMIT 1",
			[id],
		);
		if (temSub) {
			throw new Error(
				"Exclua as subcategorias vinculadas antes de remover esta categoria.",
			);
		}

		const vinculadoChecklist = await get(
			"SELECT COUNT(*) AS n FROM ProdutoCategorias WHERE categoria_id = ?",
			[id],
		);
		const vinculadoLegado = await get(
			"SELECT COUNT(*) AS n FROM Produtos WHERE categoria_id = ? OR subcategoria_id = ?",
			[id, id],
		);
		if (
			(vinculadoChecklist && vinculadoChecklist.n > 0) ||
			(vinculadoLegado && vinculadoLegado.n > 0)
		) {
			throw new Error(
				"Categoria vinculada a produtos. Remova as vinculações antes de excluí-la.",
			);
		}

		await run("DELETE FROM Categorias WHERE id = ?", [id]);
		await run("COMMIT");
		return { success: true };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

async function getCategorias() {
	const linhas = await allAsync("SELECT * FROM Categorias ORDER BY nome");
	const subcategorias = linhas.filter((l) => l.categoria_pai_id);
	return linhas
		.filter((l) => !l.categoria_pai_id)
		.map((c) => ({
			id: c.id,
			nome: c.nome,
			subcategorias: subcategorias
				.filter((s) => s.categoria_pai_id === c.id)
				.map((s) => ({ id: s.id, nome: s.nome })),
		}));
}

async function salvarCategoria(nome, categoriaPaiId) {
	const nomeLimpo = String(nome || "").trim();
	if (!nomeLimpo) throw new Error("Informe o nome da categoria.");

	const paiId = categoriaPaiId || null;
	if (paiId) {
		const pai = await getAsync(
			"SELECT id, categoria_pai_id FROM Categorias WHERE id = ?",
			[paiId],
		);
		if (!pai) throw new Error("Categoria pai não encontrada.");
		if (pai.categoria_pai_id)
			throw new Error("Só é permitido um nível de subcategoria.");
	}

	const existente = await getAsync(
		"SELECT id FROM Categorias WHERE UPPER(nome) = ? AND IFNULL(categoria_pai_id, 0) = ?",
		[nomeLimpo.toUpperCase(), paiId || 0],
	);
	if (existente) throw new Error("Categoria já cadastrada.");

	const result = await runAsync(
		"INSERT INTO Categorias (nome, categoria_pai_id) VALUES (?, ?)",
		[nomeLimpo, paiId],
	);
	return { success: true, id: result.lastID };
}

// Diferente de salvarCategoria: permite trocar nome e/ou categoria_pai_id de
// uma categoria já existente — inclusive desvinculá-la do grupo (paiId nulo
// vira grupo principal de novo). Faltava qualquer forma de editar depois de
// criada (só existia inativar/reativar/remover).
async function atualizarCategoria(id, dados) {
	const catId = Number(id);
	const atual = await getAsync(
		"SELECT id, categoria_pai_id FROM Categorias WHERE id = ?",
		[catId],
	);
	if (!atual) throw new Error("Categoria não encontrada.");

	const nomeLimpo = String((dados && dados.nome) || "").trim();
	if (!nomeLimpo) throw new Error("Informe o nome da categoria.");

	const paiId =
		dados && dados.categoriaPaiId ? Number(dados.categoriaPaiId) || null : null;

	if (paiId === catId) {
		throw new Error("Uma categoria não pode ser pai dela mesma.");
	}

	if (paiId) {
		const pai = await getAsync(
			"SELECT id, categoria_pai_id FROM Categorias WHERE id = ?",
			[paiId],
		);
		if (!pai) throw new Error("Categoria pai não encontrada.");
		if (pai.categoria_pai_id)
			throw new Error("Só é permitido um nível de subcategoria.");

		const temFilhos = await getAsync(
			"SELECT id FROM Categorias WHERE categoria_pai_id = ? LIMIT 1",
			[catId],
		);
		if (temFilhos) {
			throw new Error(
				"Esta categoria tem subcategorias vinculadas — não pode virar uma subcategoria (máx. 2 níveis).",
			);
		}
	}

	const duplicata = await getAsync(
		"SELECT id FROM Categorias WHERE UPPER(nome) = ? AND IFNULL(categoria_pai_id, 0) = ? AND id != ?",
		[nomeLimpo.toUpperCase(), paiId || 0, catId],
	);
	if (duplicata) throw new Error("Categoria já cadastrada: " + nomeLimpo);

	await runAsync(
		"UPDATE Categorias SET nome = ?, categoria_pai_id = ? WHERE id = ?",
		[nomeLimpo, paiId, catId],
	);
	return { success: true };
}

async function salvarCategoriaComSubcategorias(dados) {
	const conn = getConexao();

	const nome = String((dados && dados.nome) || "").trim();
	const paiId =
		dados && dados.categoriaPaiId ? Number(dados.categoriaPaiId) || null : null;
	const subcategorias = Array.isArray(dados && dados.subcategorias)
		? dados.subcategorias
		: [];

	const nomesSubs = [];
	for (const s of subcategorias) {
		const n = String(
			(s && s.nome) || (typeof s === "string" ? s : "") || "",
		).trim();
		if (n) nomesSubs.push(n);
	}

	if (!nome && nomesSubs.length === 0) {
		throw new Error(
			"Informe o nome da categoria ou ao menos uma subcategoria.",
		);
	}
	// Máximo de 2 níveis: não é possível criar subcategorias dentro de uma subcategoria.
	if (nome && paiId && nomesSubs.length > 0) {
		throw new Error(
			"Não é possível criar subcategorias dentro de uma subcategoria (máximo de 2 níveis).",
		);
	}

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
		let pai = null;
		if (paiId) {
			pai = await get(
				"SELECT id, categoria_pai_id FROM Categorias WHERE id = ?",
				[paiId],
			);
			if (!pai) throw new Error("Categoria principal não encontrada.");
			if (pai.categoria_pai_id)
				throw new Error("Só é permitido um nível de subcategoria.");
		}

		const existeDuplicata = async (nomeCandidato, nivelPai) => {
			const dup = await get(
				"SELECT id FROM Categorias WHERE UPPER(nome) = ? AND IFNULL(categoria_pai_id, 0) = ?",
				[nomeCandidato.toUpperCase(), nivelPai],
			);
			return !!dup;
		};

		let paiAlvo = null;
		const criados = [];

		if (nome) {
			if (await existeDuplicata(nome, paiId || 0)) {
				throw new Error("Categoria já cadastrada: " + nome);
			}
			const result = await run(
				"INSERT INTO Categorias (nome, categoria_pai_id) VALUES (?, ?)",
				[nome, paiId || null],
			);
			paiAlvo = result.lastID;
			criados.push(paiAlvo);
		} else {
			// Modo "adicionar subcategorias a uma categoria existente".
			paiAlvo = paiId;
		}

		for (const n of nomesSubs) {
			if (await existeDuplicata(n, paiAlvo)) {
				throw new Error("Subcategoria já cadastrada: " + n);
			}
			const r = await run(
				"INSERT INTO Categorias (nome, categoria_pai_id) VALUES (?, ?)",
				[n, paiAlvo],
			);
			criados.push(r.lastID);
		}

		await run("COMMIT");
		return { success: true, id: paiAlvo, criados };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}
module.exports = {
	getCategorias,
	getListCategoriasWithUsage,
	removerCategoria,
	inativarCategoria,
	reativarCategoria,
	salvarCategoria,
	atualizarCategoria,
	salvarCategoriaComSubcategorias,
	getProximoCodigoCategoria,
};
