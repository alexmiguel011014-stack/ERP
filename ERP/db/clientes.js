const {
	getConexao,
	runAsync,
	allAsync,
	getAsync,
	normalizarBusca,
} = require("./conexao");

async function buscarClientesPDV02(termo) {
	const conn = getConexao();
	const texto = String(termo || "").trim();
	const like = "%" + texto.toUpperCase() + "%";
	return new Promise((resolve, reject) => {
		conn.all(
			`SELECT id, codigo, nome, cpf_cnpj, telefone
       FROM Clientes
       WHERE ? = '' OR UPPER(nome) LIKE ? OR UPPER(COALESCE(codigo, '')) LIKE ?
          OR UPPER(COALESCE(cpf_cnpj, '')) LIKE ?
       ORDER BY nome
       LIMIT 30`,
			[texto, like, like, like],
			(erro, linhas) => (erro ? reject(erro) : resolve(linhas)),
		);
	});
}

async function getProximoCodigoCliente() {
	const conn = getConexao();
	const get = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.get(sql, params, (erro, linha) => {
				if (erro) return reject(erro);
				resolve(linha);
			});
		});
	const row = await get(
		"SELECT COALESCE(MAX(id), 0) + 1 AS proximo FROM Clientes",
	);
	const n = row ? row.proximo : 1;
	return "C" + String(n).padStart(4, "0");
}

function getClientes(incluirInativos) {
	const conn = getConexao();
	return new Promise((resolver, rejeitar) => {
		conn.all(
			"SELECT id, codigo, nome, cpf_cnpj, telefone, email, endereco, academia, faixa, ativo FROM Clientes WHERE ? OR ativo = 1 ORDER BY nome",
			[incluirInativos ? 1 : 0],
			(erro, linhas) => {
				if (erro) return rejeitar(erro.message);
				resolver(linhas);
			},
		);
	});
}

async function salvarCliente(dados) {
	const run = (sql, params = []) =>
		new Promise((resolve, reject) => {
			const conn = getConexao();
			conn.run(sql, params, function (erro) {
				if (erro) return reject(erro);
				resolve(this);
			});
		});

	await run("BEGIN TRANSACTION");
	try {
		const result = await run(
			"INSERT INTO Clientes (codigo, nome, cpf_cnpj, telefone, email, academia, faixa, endereco) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			[
				dados.codigo || null,
				dados.nome,
				dados.cpf_cnpj || null,
				dados.telefone || null,
				dados.email || null,
				dados.academia || null,
				dados.faixa || null,
				dados.endereco || null,
			],
		);
		await run("COMMIT");
		return { success: true, clienteId: result.lastID };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

async function atualizarCliente(id, dados) {
	const run = (sql, params = []) =>
		new Promise((resolve, reject) => {
			const conn = getConexao();
			conn.run(sql, params, function (erro) {
				if (erro) return reject(erro);
				resolve(this);
			});
		});

	await run("BEGIN TRANSACTION");
	try {
		await run(
			"UPDATE Clientes SET codigo=?, nome=?, cpf_cnpj=?, telefone=?, email=?, academia=?, faixa=?, endereco=? WHERE id=?",
			[
				dados.codigo || null,
				dados.nome,
				dados.cpf_cnpj || null,
				dados.telefone || null,
				dados.email || null,
				dados.academia || null,
				dados.faixa || null,
				dados.endereco || null,
				id,
			],
		);
		await run("COMMIT");
		return { success: true };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

// Exclusão é lógica (ativo=0): cliente some das listas/buscas normais mas
// fica recuperável na Lixeira, e vendas antigas continuam com a referência
// (Vendas.cliente_id não é tocado).
async function removerCliente(id) {
	const existente = await getAsync("SELECT id FROM Clientes WHERE id = ?", [
		id,
	]);
	if (!existente) throw new Error("Cliente não encontrado.");

	await runAsync("UPDATE Clientes SET ativo = 0 WHERE id = ?", [id]);
	return { success: true };
}

async function restaurarCliente(id) {
	const existente = await getAsync("SELECT id FROM Clientes WHERE id = ?", [
		id,
	]);
	if (!existente) throw new Error("Cliente não encontrado.");

	await runAsync("UPDATE Clientes SET ativo = 1 WHERE id = ?", [id]);
	return { success: true };
}

async function excluirClientePermanente(id) {
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
		const existente = await get("SELECT id, ativo FROM Clientes WHERE id = ?", [
			id,
		]);
		if (!existente) throw new Error("Cliente não encontrado.");
		if (Number(existente.ativo) === 1)
			throw new Error(
				"Envie o cliente para a lixeira antes de excluir definitivamente.",
			);

		const vendido = await get(
			"SELECT COUNT(*) AS n FROM Vendas WHERE cliente_id = ?",
			[id],
		);
		if (vendido.n > 0) {
			throw new Error(
				"Este cliente não pode ser excluído pois possui vendas registradas.",
			);
		}

		await run("DELETE FROM Clientes WHERE id = ?", [id]);
		await run("COMMIT");
		return { success: true };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

async function buscarCliente(filtro) {
	const conn = getConexao();
	return new Promise((resolver, rejeitar) => {
		const sql =
			"SELECT id, codigo, nome, cpf_cnpj, telefone, email, endereco, academia, faixa FROM Clientes WHERE ativo = 1 ORDER BY nome";
		const alvo = normalizarBusca(filtro);
		conn.all(sql, [], (erro, linhas) => {
			if (erro) return rejeitar(erro.message);
			if (!alvo) return resolver(linhas);
			resolver(
				linhas.filter((l) =>
					["nome", "telefone", "codigo", "cpf_cnpj"].some(
						(campo) => normalizarBusca(l[campo]).indexOf(alvo) !== -1,
					),
				),
			);
		});
	});
}

async function getMovimentacoesCliente(clienteId) {
	const conn = getConexao();
	const all = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.all(sql, params, (erro, linhas) => {
				if (erro) return reject(erro.message);
				resolve(linhas);
			});
		});
	const linhasVendas = await all(
		`SELECT v.id, v.total, v.forma_pagamento, v.data_venda, v.desconto, v.observacao, v.status
     FROM Vendas v WHERE v.cliente_id = ? ORDER BY v.data_venda DESC`,
		[Number(clienteId)],
	);
	const movimentacoes = [];
	for (const venda of linhasVendas) {
		const itens = await all(
			`SELECT p.nome AS produto_nome, v.tamanho, v.cor, v.sku,
              iv.quantidade, iv.preco_unitario,
              (iv.quantidade * iv.preco_unitario) AS subtotal
       FROM ItensVenda iv
       JOIN Variacoes v ON v.id = iv.variacao_id
       JOIN Produtos p ON p.id = v.produto_id
       WHERE iv.venda_id = ? ORDER BY iv.id`,
			[venda.id],
		);
		movimentacoes.push({ venda: venda, itens: itens });
	}
	return movimentacoes;
}

/* ============ Tabela de preço por cliente ============ */

async function listarPrecosCliente(clienteId) {
	if (!clienteId) return [];
	return allAsync(
		`SELECT pc.id, pc.cliente_id, pc.variacao_id, pc.preco,
            v.sku, v.tamanho, v.cor, v.atributos, v.preco AS preco_padrao, p.nome AS produto_nome
     FROM PrecoCliente pc
     JOIN Variacoes v ON v.id = pc.variacao_id
     JOIN Produtos p ON p.id = v.produto_id
     WHERE pc.cliente_id = ?
     ORDER BY p.nome COLLATE NOCASE`,
		[Number(clienteId)],
	);
}

async function salvarPrecoCliente(dados) {
	const clienteId = Number(dados && dados.cliente_id);
	const variacaoId = Number(dados && dados.variacao_id);
	const preco = Number(dados && dados.preco);
	if (!clienteId) throw new Error("Cliente inválido.");
	if (!variacaoId) throw new Error("SKU inválido.");
	if (!Number.isFinite(preco) || preco < 0) throw new Error("Preço inválido.");

	await runAsync(
		`INSERT OR REPLACE INTO PrecoCliente (id, cliente_id, variacao_id, preco)
     VALUES ((SELECT id FROM PrecoCliente WHERE cliente_id = ? AND variacao_id = ?), ?, ?, ?)`,
		[
			clienteId,
			variacaoId,
			clienteId,
			variacaoId,
			Math.round(preco * 100) / 100,
		],
	);
	return { success: true };
}

async function removerPrecoCliente(id) {
	const result = await runAsync("DELETE FROM PrecoCliente WHERE id = ?", [id]);
	if (result.changes === 0) throw new Error("Preço especial não encontrado.");
	return { success: true };
}

// Consultado pelo PDV ao escanear um SKU com cliente já selecionado: retorna
// o preço combinado com este cliente para esta variação, ou null se não houver.
async function getPrecoCliente(clienteId, variacaoId) {
	if (!clienteId || !variacaoId) return null;
	const row = await getAsync(
		"SELECT preco FROM PrecoCliente WHERE cliente_id = ? AND variacao_id = ?",
		[Number(clienteId), Number(variacaoId)],
	);
	return row ? row.preco : null;
}
module.exports = {
	getClientes,
	salvarCliente,
	atualizarCliente,
	removerCliente,
	restaurarCliente,
	excluirClientePermanente,
	buscarCliente,
	getProximoCodigoCliente,
	getMovimentacoesCliente,
	listarPrecosCliente,
	salvarPrecoCliente,
	removerPrecoCliente,
	getPrecoCliente,
};
// buscarClientesPDV02 é código morto herdado do database.js original (nunca
// era chamado nem exportado ali). Mantido sem exportar, mesmo critério usado
// para buscarProdutosPDV02 em db/produtos.js.
