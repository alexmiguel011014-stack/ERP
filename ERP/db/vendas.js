const {
	getConexao,
	allAsync,
	runAsync,
	runOn,
	normalizarBusca,
} = require("./conexao");
const { criarLancamentoInterno } = require("./financeiro");
const { getCaixaAberto } = require("./caixa");

// eslint-disable-next-line no-unused-vars
async function finalizarVendaPDV02(dados) {
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
			conn.get(sql, params, (erro, linha) =>
				erro ? reject(erro) : resolve(linha),
			);
		});

	const requestId = String((dados && dados.requestId) || "").trim();
	if (!requestId) throw new Error("Identificador da venda ausente.");

	const tipo = dados.tipo === "orcamento" ? "orcamento" : "finalizada";
	const pagamento =
		tipo === "orcamento" ? null : String(dados.formaPagamento || "").trim();
	const pagamentosAceitos = ["PIX", "Cartão", "Dinheiro", "Fiado"];
	if (tipo === "finalizada" && pagamentosAceitos.indexOf(pagamento) === -1) {
		throw new Error("Forma de pagamento inválida.");
	}

	const entrada = Array.isArray(dados.itens) ? dados.itens : [];
	const mapa = new Map();
	entrada.forEach((item) => {
		const id = Number(item && item.variacaoId);
		const quantidade = Number(item && item.quantidade);
		if (
			!Number.isInteger(id) ||
			id <= 0 ||
			!Number.isInteger(quantidade) ||
			quantidade <= 0
		) {
			throw new Error("Item inválido no carrinho.");
		}
		mapa.set(id, (mapa.get(id) || 0) + quantidade);
	});
	if (!mapa.size) throw new Error("A venda precisa de pelo menos um item.");

	const clienteId = dados.clienteId ? Number(dados.clienteId) : null;
	const desconto = Number(dados.desconto || 0);
	if (!Number.isFinite(desconto) || desconto < 0)
		throw new Error("Desconto inválido.");

	await run("BEGIN TRANSACTION");
	try {
		const repetida = await get("SELECT id FROM Vendas WHERE request_id = ?", [
			requestId,
		]);
		if (repetida) {
			await run("ROLLBACK");
			return { success: true, vendaId: repetida.id, repetida: true };
		}

		if (clienteId) {
			const cliente = await get("SELECT id FROM Clientes WHERE id = ?", [
				clienteId,
			]);
			if (!cliente) throw new Error("Cliente não encontrado.");
		}

		const itens = [];
		let subtotal = 0;
		for (const [variacaoId, quantidade] of mapa) {
			const item = await get(
				`SELECT v.id, v.sku, v.preco, v.quantidade_estoque, p.nome
         FROM Variacoes v JOIN Produtos p ON p.id = v.produto_id WHERE v.id = ?`,
				[variacaoId],
			);
			if (!item) throw new Error("Produto não encontrado: " + variacaoId + ".");
			if (
				tipo === "finalizada" &&
				Number(item.quantidade_estoque) < quantidade
			) {
				throw new Error(
					"Estoque insuficiente para " + item.nome + " (" + item.sku + ").",
				);
			}
			subtotal += Number(item.preco) * quantidade;
			itens.push({ ...item, quantidade });
		}

		if (desconto > subtotal)
			throw new Error("O desconto não pode superar o subtotal.");
		const total = subtotal - desconto;
		const observacao = String(dados.observacao || "").trim() || null;
		const result = await run(
			`INSERT INTO Vendas
       (cliente_id, total, forma_pagamento, data_venda, desconto, observacao, status, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				clienteId,
				total,
				pagamento,
				new Date().toISOString(),
				desconto,
				observacao,
				tipo,
				requestId,
			],
		);
		const vendaId = result.lastID;

		for (const item of itens) {
			await run(
				"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)",
				[vendaId, item.id, item.quantidade, item.preco],
			);
			if (tipo === "finalizada") {
				const baixa = await run(
					"UPDATE Variacoes SET quantidade_estoque = quantidade_estoque - ? WHERE id = ? AND quantidade_estoque >= ?",
					[item.quantidade, item.id, item.quantidade],
				);
				if (baixa.changes !== 1)
					throw new Error("Estoque alterado durante a venda. Tente novamente.");
				await run(
					`INSERT INTO MovimentacoesEstoque
           (variacao_id, tipo, quantidade, custo_unitario, origem, referencia_id, observacao, data)
           VALUES (?, 'saida', ?, ?, 'venda', ?, ?, ?)`,
					[
						item.id,
						-item.quantidade,
						item.preco,
						vendaId,
						"PDV02",
						new Date().toISOString(),
					],
				);
			}
		}

		if (tipo === "finalizada" && pagamento === "Fiado") {
			await criarLancamentoInterno(run, {
				tipo: "receber",
				descricao: "Venda #" + vendaId + " (fiado)",
				valor: total,
				data_vencimento: new Date().toISOString(),
				origem: "venda",
				referencia_id: vendaId,
				forma_pagamento: pagamento,
			});
		}
		await run("COMMIT");
		return { success: true, vendaId, subtotal, desconto, total };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

async function finalizarVenda(dados, usuarioId) {
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

	const itens = Array.isArray(dados.itens) ? dados.itens : [];
	if (itens.length === 0)
		throw new Error("A venda precisa de pelo menos um item.");

	const status = dados.status === "orcamento" ? "orcamento" : "finalizada";

	// Guarda de caixa: só se aplica a venda finalizada de verdade (dinheiro/
	// pagamento passando pelo caixa) — orçamento não move dinheiro nenhum,
	// só reserva estoque, então não precisa de caixa aberto pra existir.
	// Endurecido a pedido do dono: no vanilla isso era só um indicador
	// visual no PDV, sem nenhum bloqueio real no backend — dinheiro podia
	// ficar fora da conciliação do caixa sem ninguém perceber.
	if (status === "finalizada") {
		const caixaAberto = await getCaixaAberto();
		if (!caixaAberto) {
			throw new Error(
				"Não é possível finalizar a venda com o caixa fechado. Abra o caixa antes de continuar.",
			);
		}
	}

	const desconto = Math.max(0, Number(dados.desconto) || 0);
	const total = Math.max(0, Number(dados.total) || 0);
	const clienteId = dados.cliente_id ? Number(dados.cliente_id) : null;
	const formaPagamento = dados.forma_pagamento || null;
	const observacao = dados.observacao || null;
	// origem='orcamento' fica gravado mesmo depois de converterOrcamento() virar
	// 'finalizada' (esse UPDATE nunca toca em origem) — é o único jeito de saber,
	// depois do fato, que uma venda nasceu como orçamento (usado por
	// getConversaoOrcamentos em db/relatorios.js). Sem isso: default 'pdv',
	// igual sempre foi antes desta coluna existir ganhar esse terceiro valor.
	const origemVenda = status === "orcamento" ? "orcamento" : "pdv";

	await run("BEGIN TRANSACTION");

	try {
		const result = await run(
			"INSERT INTO Vendas (cliente_id, total, forma_pagamento, data_venda, desconto, observacao, status, usuario_id, origem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			[
				clienteId,
				total,
				formaPagamento,
				new Date().toISOString(),
				desconto,
				observacao,
				status,
				usuarioId || null,
				origemVenda,
			],
		);
		const vendaId = result.lastID;

		for (const item of itens) {
			await run(
				"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)",
				[vendaId, item.variacao_id, item.quantidade, item.preco_unitario],
			);

			// Orçamento não baixa estoque, mas reserva a quantidade para que não
			// seja vendida por outra frente enquanto o orçamento está em aberto.
			if (status === "orcamento") {
				const reserva = await run(
					"UPDATE Variacoes SET quantidade_reservada = quantidade_reservada + ? WHERE id = ? AND (quantidade_estoque - quantidade_reservada) >= ?",
					[item.quantidade, item.variacao_id, item.quantidade],
				);
				if (reserva.changes === 0) {
					const varRow = await get(
						"SELECT v.sku, v.quantidade_estoque, v.quantidade_reservada, p.nome FROM Variacoes v JOIN Produtos p ON p.id = v.produto_id WHERE v.id = ?",
						[item.variacao_id],
					);
					const rotulo = varRow
						? varRow.nome + " (" + varRow.sku + ")"
						: "item " + item.variacao_id;
					const disponivel = varRow
						? varRow.quantidade_estoque - varRow.quantidade_reservada
						: 0;
					throw new Error(
						"Estoque disponível insuficiente para reservar " +
							rotulo +
							". Disponível: " +
							disponivel +
							".",
					);
				}
				continue;
			}

			// Baixa atômica com guarda: falha (e faz ROLLBACK) se o estoque não for suficiente.
			const baixa = await run(
				"UPDATE Variacoes SET quantidade_estoque = quantidade_estoque - ? WHERE id = ? AND quantidade_estoque >= ?",
				[item.quantidade, item.variacao_id, item.quantidade],
			);
			if (baixa.changes === 0) {
				const varRow = await get(
					"SELECT v.sku, v.quantidade_estoque, p.nome FROM Variacoes v JOIN Produtos p ON p.id = v.produto_id WHERE v.id = ?",
					[item.variacao_id],
				);
				const rotulo = varRow
					? varRow.nome + " (" + varRow.sku + ")"
					: "item " + item.variacao_id;
				const saldo = varRow ? varRow.quantidade_estoque : 0;
				throw new Error(
					"Estoque insuficiente para " +
						rotulo +
						". Saldo atual: " +
						saldo +
						".",
				);
			}
		}

		// Venda a prazo gera conta a receber automaticamente.
		if (status === "finalizada" && formaPagamento === "Fiado") {
			await criarLancamentoInterno(run, {
				tipo: "receber",
				descricao: "Venda #" + vendaId + " (fiado)",
				valor: total,
				data_vencimento: new Date().toISOString(),
				origem: "venda",
				referencia_id: vendaId,
				forma_pagamento: formaPagamento,
			});
		}

		await run("COMMIT");
		return { success: true, vendaId };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

// Converte um orçamento em venda efetiva: valida estoque, baixa e muda o status.
async function converterOrcamento(vendaId) {
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

	const all = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.all(sql, params, (erro, linhas) => {
				if (erro) return reject(erro);
				resolve(linhas);
			});
		});

	await run("BEGIN TRANSACTION");

	try {
		const venda = await get("SELECT * FROM Vendas WHERE id = ?", [vendaId]);
		if (!venda) throw new Error("Orçamento não encontrado.");
		if (venda.status !== "orcamento")
			throw new Error("Esta venda não é um orçamento.");

		const itens = await all("SELECT * FROM ItensVenda WHERE venda_id = ?", [
			vendaId,
		]);

		for (const item of itens) {
			// A quantidade já estava reservada desde a criação do orçamento:
			// libera a reserva e baixa o estoque real na mesma operação.
			const baixa = await run(
				"UPDATE Variacoes SET quantidade_estoque = quantidade_estoque - ?, quantidade_reservada = MAX(0, quantidade_reservada - ?) WHERE id = ? AND quantidade_estoque >= ?",
				[item.quantidade, item.quantidade, item.variacao_id, item.quantidade],
			);
			if (baixa.changes === 0) {
				const varRow = await get(
					"SELECT v.sku, v.quantidade_estoque, p.nome FROM Variacoes v JOIN Produtos p ON p.id = v.produto_id WHERE v.id = ?",
					[item.variacao_id],
				);
				const rotulo = varRow
					? varRow.nome + " (" + varRow.sku + ")"
					: "item " + item.variacao_id;
				const saldo = varRow ? varRow.quantidade_estoque : 0;
				throw new Error(
					"Estoque insuficiente para " +
						rotulo +
						". Saldo atual: " +
						saldo +
						".",
				);
			}
		}

		await run(
			"UPDATE Vendas SET status = 'finalizada', data_venda = ? WHERE id = ?",
			[new Date().toISOString(), vendaId],
		);

		if (venda.forma_pagamento === "Fiado") {
			await criarLancamentoInterno(run, {
				tipo: "receber",
				descricao: "Venda #" + vendaId + " (fiado)",
				valor: venda.total,
				data_vencimento: new Date().toISOString(),
				origem: "venda",
				referencia_id: vendaId,
				forma_pagamento: venda.forma_pagamento,
			});
		}

		await run("COMMIT");
		return { success: true, vendaId };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

// Cancela um orçamento em aberto, liberando a reserva de estoque associada.
async function cancelarOrcamento(vendaId) {
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

	const all = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.all(sql, params, (erro, linhas) => {
				if (erro) return reject(erro);
				resolve(linhas);
			});
		});

	await run("BEGIN TRANSACTION");

	try {
		const venda = await get("SELECT * FROM Vendas WHERE id = ?", [vendaId]);
		if (!venda) throw new Error("Orçamento não encontrado.");
		if (venda.status !== "orcamento")
			throw new Error("Esta venda não é um orçamento em aberto.");

		const itens = await all("SELECT * FROM ItensVenda WHERE venda_id = ?", [
			vendaId,
		]);
		for (const item of itens) {
			await run(
				"UPDATE Variacoes SET quantidade_reservada = MAX(0, quantidade_reservada - ?) WHERE id = ?",
				[item.quantidade, item.variacao_id],
			);
		}

		await run("UPDATE Vendas SET status = 'cancelado' WHERE id = ?", [vendaId]);

		await run("COMMIT");
		return { success: true };
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

/* ============ Busca global ============ */

// Busca combinada em Clientes, Produtos (via SKU/nome) e Vendas (por número),
// usada pela barra de busca da navbar. Limita a poucos resultados por
// categoria — é um atalho de navegação, não um relatório.
async function buscaGlobal(termo) {
	const texto = String(termo || "").trim();
	if (!texto) return { clientes: [], produtos: [], vendas: [] };
	const alvo = normalizarBusca(texto);
	const like = "%" + texto.toUpperCase() + "%";

	const clientes = await allAsync(
		`SELECT id, codigo, nome, telefone FROM Clientes
     WHERE ativo = 1 AND (UPPER(nome) LIKE ? OR UPPER(COALESCE(codigo,'')) LIKE ? OR UPPER(COALESCE(cpf_cnpj,'')) LIKE ?)
     ORDER BY nome LIMIT 6`,
		[like, like, like],
	);

	const produtosBrutos = await allAsync(
		`SELECT v.id, v.sku, p.nome, v.tamanho, v.cor, v.preco
     FROM Variacoes v JOIN Produtos p ON p.id = v.produto_id
     WHERE p.ativo = 1
     ORDER BY p.nome LIMIT 500`,
	);
	const produtos = produtosBrutos
		.filter(
			(p) =>
				normalizarBusca(p.nome).indexOf(alvo) !== -1 ||
				normalizarBusca(p.sku).indexOf(alvo) !== -1,
		)
		.slice(0, 6);

	let vendas = [];
	const numero = parseInt(texto.replace(/\D/g, ""), 10);
	if (Number.isInteger(numero) && numero > 0) {
		vendas = await allAsync(
			`SELECT v.id, v.total, v.data_venda, v.status, c.nome AS cliente_nome
       FROM Vendas v LEFT JOIN Clientes c ON c.id = v.cliente_id
       WHERE v.id = ? LIMIT 1`,
			[numero],
		);
	}

	return { clientes, produtos, vendas };
}

/* ============ Devolução / troca ============ */

// Devolve item(ns) de uma venda finalizada: estorna a quantidade ao estoque,
// registra a movimentação e devolve o valor ao cliente (ajuste no financeiro
// se a venda original foi fiado, senão é considerado ressarcido fora do sistema).
async function registrarDevolucao(dados, usuarioId) {
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

	const vendaId = Number(dados && dados.venda_id);
	const itens = Array.isArray(dados && dados.itens) ? dados.itens : [];
	const motivo = (dados && dados.motivo) || null;
	if (!Number.isInteger(vendaId) || vendaId <= 0)
		throw new Error("Venda inválida.");
	if (itens.length === 0)
		throw new Error("Selecione ao menos um item para devolver.");

	await run("BEGIN TRANSACTION");

	try {
		const venda = await get("SELECT * FROM Vendas WHERE id = ?", [vendaId]);
		if (!venda) throw new Error("Venda não encontrada.");
		if (venda.status !== "finalizada")
			throw new Error("Só é possível devolver itens de uma venda finalizada.");

		const result = await run(
			"INSERT INTO Devolucoes (venda_id, motivo, valor_total, usuario_id, data) VALUES (?, ?, 0, ?, ?)",
			[vendaId, motivo, usuarioId || null, new Date().toISOString()],
		);
		const devolucaoId = result.lastID;
		let valorTotal = 0;

		for (const item of itens) {
			const itemVendaId = Number(item.item_venda_id);
			const quantidade = Number(item.quantidade);
			if (!Number.isInteger(itemVendaId) || itemVendaId <= 0)
				throw new Error("Item de venda inválido.");
			if (!Number.isInteger(quantidade) || quantidade <= 0)
				throw new Error("Quantidade de devolução inválida.");

			const itemVenda = await get(
				"SELECT * FROM ItensVenda WHERE id = ? AND venda_id = ?",
				[itemVendaId, vendaId],
			);
			if (!itemVenda) throw new Error("Item não pertence a esta venda.");

			const jaDevolvido = await get(
				"SELECT COALESCE(SUM(quantidade), 0) AS total FROM ItensDevolucao WHERE item_venda_id = ?",
				[itemVendaId],
			);
			const disponivel =
				itemVenda.quantidade - (jaDevolvido ? jaDevolvido.total : 0);
			if (quantidade > disponivel)
				throw new Error(
					"Quantidade maior que o disponível para devolução (" +
						disponivel +
						").",
				);

			await run(
				"INSERT INTO ItensDevolucao (devolucao_id, item_venda_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?, ?)",
				[
					devolucaoId,
					itemVendaId,
					itemVenda.variacao_id,
					quantidade,
					itemVenda.preco_unitario,
				],
			);

			await run(
				"UPDATE Variacoes SET quantidade_estoque = quantidade_estoque + ? WHERE id = ?",
				[quantidade, itemVenda.variacao_id],
			);

			await run(
				"INSERT INTO MovimentacoesEstoque (variacao_id, tipo, quantidade, custo_unitario, origem, referencia_id, observacao, data) VALUES (?, 'entrada', ?, NULL, 'devolucao', ?, ?, ?)",
				[
					itemVenda.variacao_id,
					quantidade,
					devolucaoId,
					"Devolução da venda #" + vendaId + (motivo ? " — " + motivo : ""),
					new Date().toISOString(),
				],
			);

			valorTotal += quantidade * itemVenda.preco_unitario;
		}

		await run("UPDATE Devolucoes SET valor_total = ? WHERE id = ?", [
			Math.round(valorTotal * 100) / 100,
			devolucaoId,
		]);

		// Venda fiado com conta a receber ainda aberta: abate o valor devolvido.
		if (venda.forma_pagamento === "Fiado") {
			const lancamento = await get(
				"SELECT * FROM LancamentosFinanceiros WHERE origem = 'venda' AND referencia_id = ? AND tipo = 'receber' AND status = 'aberto'",
				[vendaId],
			);
			if (lancamento) {
				const novoValor = Math.max(0, lancamento.valor - valorTotal);
				if (novoValor <= 0.005) {
					await run(
						"UPDATE LancamentosFinanceiros SET status = 'pago', data_pagamento = ?, valor = 0 WHERE id = ?",
						[new Date().toISOString(), lancamento.id],
					);
				} else {
					await run(
						"UPDATE LancamentosFinanceiros SET valor = ? WHERE id = ?",
						[Math.round(novoValor * 100) / 100, lancamento.id],
					);
				}
			}
		}

		await run("COMMIT");
		return {
			success: true,
			devolucaoId,
			valorTotal: Math.round(valorTotal * 100) / 100,
		};
	} catch (erro) {
		await run("ROLLBACK");
		throw erro;
	}
}

async function getDevolucoes(filtro) {
	filtro = filtro || {};
	let sql = `SELECT d.*, v.cliente_id, c.nome AS cliente_nome
     FROM Devolucoes d
     JOIN Vendas v ON v.id = d.venda_id
     LEFT JOIN Clientes c ON c.id = v.cliente_id`;
	const where = [];
	const params = [];
	if (filtro.vendaId) {
		where.push("d.venda_id = ?");
		params.push(filtro.vendaId);
	}
	if (where.length > 0) sql += " WHERE " + where.join(" AND ");
	sql += " ORDER BY d.id DESC LIMIT 200";
	return allAsync(sql, params);
}

async function getItensDevolucao(devolucaoId) {
	return allAsync(
		`SELECT idv.*, v.sku, p.nome AS produto_nome
     FROM ItensDevolucao idv
     JOIN Variacoes v ON v.id = idv.variacao_id
     JOIN Produtos p ON p.id = v.produto_id
     WHERE idv.devolucao_id = ?
     ORDER BY idv.id`,
		[devolucaoId],
	);
}

async function getVendas(filtro) {
	const conn = getConexao();
	return new Promise((resolver, rejeitar) => {
		let sql =
			"SELECT v.id, v.total, v.forma_pagamento, v.data_venda, v.desconto, v.observacao, v.status, v.nota_status, v.nota_numero, c.nome AS cliente_nome FROM Vendas v LEFT JOIN Clientes c ON c.id = v.cliente_id";
		const params = [];
		const where = [];

		// Compatibilidade: string simples filtra por data exata (frontend antigo).
		const filtroObj = filtro && typeof filtro === "object" ? filtro : {};
		const filtroData =
			typeof filtro === "string" ? filtro : filtroObj.data || null;
		const filtroDataInicio = filtroObj.dataInicio || null;
		const filtroDataFim = filtroObj.dataFim || null;
		const filtroStatus = filtroObj.status || null;
		const filtroFormaPagamento = filtroObj.formaPagamento || null;

		if (filtroData) {
			where.push("DATE(v.data_venda) = ?");
			params.push(filtroData);
		}
		if (filtroDataInicio) {
			where.push("DATE(v.data_venda) >= ?");
			params.push(filtroDataInicio);
		}
		if (filtroDataFim) {
			where.push("DATE(v.data_venda) <= ?");
			params.push(filtroDataFim);
		}
		if (filtroStatus) {
			where.push("v.status = ?");
			params.push(filtroStatus);
		}
		if (filtroFormaPagamento) {
			where.push("v.forma_pagamento = ?");
			params.push(filtroFormaPagamento);
		}
		if (where.length > 0) {
			sql += " WHERE " + where.join(" AND ");
		}

		sql += " ORDER BY v.data_venda DESC LIMIT 100";

		conn.all(sql, params, (erro, linhas) => {
			if (erro) return rejeitar(erro.message);
			resolver(linhas);
		});
	});
}

// Importa vendas históricas já normalizadas (ver ferramenta externa de tratamento
// de planilhas do cliente — o ERP não faz parsing/mapeamento de coluna, só recebe
// {sku, quantidade, valorUnitario, data} prontos). Usado para popular o histórico
// de faturamento (getFaturamentoMedioHistorico) sem esperar um mês real de uso.
// Diferente de finalizarVenda: NÃO mexe em Variacoes.quantidade_estoque, pois é
// histórico de um período passado — o estoque atual não deve ser afetado.
async function importarVendasHistoricas(linhas) {
	if (!Array.isArray(linhas) || linhas.length === 0) {
		throw new Error("Nenhuma linha para importar.");
	}
	const conn = getConexao();

	const get = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.get(sql, params, (erro, linha) => {
				if (erro) return reject(erro);
				resolve(linha);
			});
		});

	let importadas = 0;
	let puladas = 0;
	await runOn(conn, "BEGIN TRANSACTION");
	try {
		for (const linha of linhas) {
			const sku = String(linha.sku || "")
				.trim()
				.toUpperCase();
			const quantidade = Number(linha.quantidade);
			const valorUnitario = Number(linha.valorUnitario);
			const data = linha.data ? String(linha.data) : null;
			if (
				!sku ||
				!Number.isFinite(quantidade) ||
				quantidade <= 0 ||
				!Number.isFinite(valorUnitario) ||
				valorUnitario < 0 ||
				!data
			) {
				puladas++;
				continue;
			}
			const variacao = await get(
				"SELECT id FROM Variacoes WHERE UPPER(sku) = ?",
				[sku],
			);
			if (!variacao) {
				puladas++;
				continue;
			}
			const total = quantidade * valorUnitario;
			const vendaResult = await runOn(
				conn,
				"INSERT INTO Vendas (total, forma_pagamento, data_venda, status, origem) VALUES (?, NULL, ?, 'finalizada', 'importado')",
				[total, data],
			);
			await runOn(
				conn,
				"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)",
				[vendaResult.lastID, variacao.id, quantidade, valorUnitario],
			);
			importadas++;
		}
		await runOn(conn, "COMMIT");
	} catch (erro) {
		await runOn(conn, "ROLLBACK");
		throw erro;
	}
	return { importadas, puladas, total: linhas.length };
}

// Crediário histórico com vínculo real (GOALS.md "4. Crediário histórico"):
// mesma base de importarVendasHistoricas (sem caixa aberto, sem baixar
// Variacoes.quantidade_estoque, aceita data no passado — é histórico, não
// deve mexer no estoque/caixa atuais) + cliente_id obrigatório +
// forma_pagamento fixo 'Fiado' + cria o LancamentosFinanceiros a receber
// vinculado (cliente_id + referencia_id=vendaId, mesmo vínculo que
// criarLancamentoInterno usa pra Fiado normal em finalizarVenda/
// converterOrcamento). statusRecebivel é decidido pelo dono no formulário
// ('aberto' ou 'pago') — a dívida pode já ter sido quitada depois do fato.
//
// Aceita um `db` opcional: quando chamada isolada (IPC/testes) abre e
// gerencia sua própria transação; quando chamada por dentro de
// executarImportacaoLojHouse (db/importacoes.js), que já roda tudo dentro de
// UMA transação própria via executarComTransacao, reusa essa conexão sem
// abrir um BEGIN aninhado (SQLite não suporta transação dentro de transação).
async function registrarVendaFiadoHistorica(dados, db) {
	const conn = db || getConexao();
	const gerenciaTransacao = !db;

	const get = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.get(sql, params, (erro, linha) => {
				if (erro) return reject(erro);
				resolve(linha);
			});
		});
	const run = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.run(sql, params, function (erro) {
				if (erro) return reject(erro);
				resolve(this);
			});
		});

	const clienteId = Number(dados && dados.cliente_id);
	if (!Number.isInteger(clienteId) || clienteId <= 0) {
		throw new Error(
			"Cliente é obrigatório para lançar uma venda fiado histórica.",
		);
	}
	const sku = String((dados && dados.sku) || "")
		.trim()
		.toUpperCase();
	if (!sku) throw new Error("SKU é obrigatório.");
	const quantidade = Number(dados && dados.quantidade);
	if (!Number.isFinite(quantidade) || quantidade <= 0) {
		throw new Error("Quantidade inválida.");
	}
	const valorUnitario = Number(dados && dados.valorUnitario);
	if (!Number.isFinite(valorUnitario) || valorUnitario < 0) {
		throw new Error("Valor unitário inválido.");
	}
	const data = dados && dados.data ? String(dados.data) : null;
	if (!data) throw new Error("Data é obrigatória.");
	const statusRecebivel = dados && dados.statusRecebivel;
	if (statusRecebivel !== "aberto" && statusRecebivel !== "pago") {
		throw new Error("Status do recebível deve ser 'aberto' ou 'pago'.");
	}

	if (gerenciaTransacao) await runOn(conn, "BEGIN TRANSACTION");
	try {
		const variacao = await get(
			"SELECT v.id, v.sku, p.nome FROM Variacoes v JOIN Produtos p ON p.id = v.produto_id WHERE UPPER(v.sku) = ?",
			[sku],
		);
		if (!variacao) {
			throw new Error(`SKU "${sku}" não encontrado.`);
		}

		const total = quantidade * valorUnitario;
		const vendaResult = await run(
			"INSERT INTO Vendas (cliente_id, total, forma_pagamento, data_venda, status, origem) VALUES (?, ?, 'Fiado', ?, 'finalizada', 'importado')",
			[clienteId, total, data],
		);
		const vendaId = vendaResult.lastID;

		await run(
			"INSERT INTO ItensVenda (venda_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)",
			[vendaId, variacao.id, quantidade, valorUnitario],
		);

		const rotuloProduto = variacao.nome
			? variacao.nome + " (" + variacao.sku + ")"
			: variacao.sku;
		const dataPagamento = statusRecebivel === "pago" ? data : null;
		await run(
			"INSERT INTO LancamentosFinanceiros (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, referencia_id, forma_pagamento, cliente_id, data_criacao) VALUES ('receber', ?, ?, ?, ?, ?, 'manual', ?, 'Fiado', ?, ?)",
			[
				"Crediário histórico - " + rotuloProduto,
				total,
				data,
				dataPagamento,
				statusRecebivel,
				vendaId,
				clienteId,
				new Date().toISOString(),
			],
		);

		if (gerenciaTransacao) await runOn(conn, "COMMIT");
		return { success: true, vendaId, total };
	} catch (erro) {
		if (gerenciaTransacao) await runOn(conn, "ROLLBACK");
		throw erro;
	}
}

async function getVendasHoje() {
	const conn = getConexao();
	const hoje = new Date().toISOString().slice(0, 10);
	return new Promise((resolver, rejeitar) => {
		conn.all(
			"SELECT v.id, v.total, v.forma_pagamento, c.nome AS cliente_nome FROM Vendas v LEFT JOIN Clientes c ON c.id = v.cliente_id WHERE DATE(v.data_venda) = ? ORDER BY v.data_venda DESC",
			[hoje],
			(erro, linhas) => {
				if (erro) return rejeitar(erro.message);
				resolver(linhas);
			},
		);
	});
}

async function getItensVenda(vendaId) {
	const conn = getConexao();
	return new Promise((resolver, rejeitar) => {
		const sql =
			"SELECT iv.id, iv.variacao_id, p.nome AS produto_nome, v.tamanho, v.cor, v.atributos, v.sku, iv.quantidade, iv.preco_unitario, (iv.quantidade * iv.preco_unitario) AS subtotal, " +
			"p.ncm, p.cfop_padrao, p.csosn, p.unidade_fiscal, p.origem_mercadoria, " +
			"(SELECT COALESCE(SUM(idv.quantidade), 0) FROM ItensDevolucao idv WHERE idv.item_venda_id = iv.id) AS quantidade_devolvida " +
			"FROM ItensVenda iv JOIN Variacoes v ON v.id = iv.variacao_id JOIN Produtos p ON p.id = v.produto_id WHERE iv.venda_id = ? ORDER BY iv.id";
		conn.all(sql, [vendaId], (erro, linhas) => {
			if (erro) return rejeitar(erro.message);
			resolver(linhas);
		});
	});
}
const STATUS_NOTA_VALIDOS = [
	"nao_emitida",
	"emitida_externa",
	"emitida_erp",
	"erro",
	"cancelada",
];

// Atualiza o rastreamento fiscal de uma venda. Funciona hoje sem nenhuma
// integração — "emitida_externa" é pra marcar que a nota já foi emitida por
// fora do ERP (ex.: sistema do contador), evitando emissão duplicada quando
// a integração de verdade (integracoes/fiscal/) entrar em uso.
async function atualizarNotaFiscal(vendaId, dados) {
	const status = STATUS_NOTA_VALIDOS.includes(dados && dados.status)
		? dados.status
		: "nao_emitida";
	const resultado = await runAsync(
		"UPDATE Vendas SET nota_status = ?, nota_numero = ?, nota_chave_acesso = ?, nota_provedor = ?, nota_erro = ? WHERE id = ?",
		[
			status,
			(dados && dados.numero) || null,
			(dados && dados.chaveAcesso) || null,
			(dados && dados.provedor) || null,
			(dados && dados.erro) || null,
			vendaId,
		],
	);
	if (resultado.changes === 0) throw new Error("Venda não encontrada.");
	return { success: true };
}

module.exports = {
	finalizarVenda,
	converterOrcamento,
	cancelarOrcamento,
	getVendas,
	getVendasHoje,
	importarVendasHistoricas,
	registrarVendaFiadoHistorica,
	getItensVenda,
	buscaGlobal,
	registrarDevolucao,
	getDevolucoes,
	getItensDevolucao,
	atualizarNotaFiscal,
};
// finalizarVendaPDV02 é código morto herdado do database.js original (nunca
// era chamado nem exportado ali). Mantido sem exportar, mesmo critério usado
// para buscarProdutosPDV02/buscarClientesPDV02.
