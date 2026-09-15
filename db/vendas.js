const {
	getConexao,
	allAsync,
	getAsync,
	runAsync,
	runOn,
	normalizarBusca,
} = require("./conexao");
const { criarLancamentoInterno } = require("./financeiro");
const { getCaixaAberto } = require("./caixa");
const {
	calcularParcelamento,
	calcularVendaParcelada,
	calcularVendaMista,
} = require("./parcelamento");

const FORMAS_PAGAMENTO_HISTORICA = [
	"PIX",
	"Cartão",
	"Dinheiro",
	"Fiado",
	"Genérico",
];

function normalizarRequestId(valor) {
	if (valor == null || valor === "") return null;
	const requestId = String(valor).trim();
	if (!requestId || requestId.length > 128) {
		throw new Error("Identificador da venda inválido.");
	}
	return requestId;
}

async function buscarVendaIdempotente(requestId) {
	if (!requestId) return null;
	const venda = await getAsync(
		"SELECT id, total, status FROM Vendas WHERE request_id = ?",
		[requestId],
	);
	if (!venda) return null;
	const parcelas = await allAsync(
		"SELECT parcela_num AS numero, valor, data_vencimento AS vencimento FROM LancamentosFinanceiros WHERE venda_id = ? ORDER BY parcela_num, id",
		[venda.id],
	);
	return {
		success: true,
		vendaId: venda.id,
		total: venda.total,
		parcelas,
		status: venda.status,
		idempotente: true,
	};
}

function alocacoesDoCalculo(calculo) {
	if (Array.isArray(calculo.pagamentos) && calculo.pagamentos.length > 0) {
		return calculo.pagamentos;
	}
	return [
		{
			forma_pagamento: calculo.formaPagamento,
			valorBase: calculo.valorBase,
			valorFinal: calculo.total,
			acrescimoPercentual: calculo.acrescimoPercentual,
			acrescimo: calculo.acrescimo,
			condicao: calculo.condicao,
			parcelas: calculo.parcelas || [],
		},
	];
}

async function inserirSnapshotsPagamento(run, vendaId, calculo) {
	const alocacoes = alocacoesDoCalculo(calculo);
	for (const alocacao of alocacoes) {
		if (!alocacao.forma_pagamento) continue;
		const parcelas = Array.isArray(alocacao.parcelas) ? alocacao.parcelas : [];
		await run(
			`INSERT INTO VendaPagamentos
       (venda_id, forma_pagamento, valor_base, valor_final, acrescimo_percentual,
        acrescimo, condicao_parcelamento_id, condicao_parcelamento_nome, parcelas,
        detalhes_parcelas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				vendaId,
				alocacao.forma_pagamento,
				alocacao.valorBase,
				alocacao.valorFinal,
				alocacao.acrescimoPercentual || 0,
				alocacao.acrescimo || 0,
				alocacao.condicao ? alocacao.condicao.id : null,
				alocacao.condicao ? alocacao.condicao.nome : null,
				parcelas.length || 1,
				JSON.stringify(parcelas),
			],
		);
	}
	return alocacoes;
}

async function inserirPagamentosCartao(run, get, vendaId, clienteId, alocacoes) {
	const agora = new Date().toISOString();
	for (let indice = 0; indice < alocacoes.length; indice += 1) {
		const alocacao = alocacoes[indice];
		if (alocacao.forma_pagamento !== "Cartão") continue;
		const valorFinal = alocacao.valorFinal ?? alocacao.valor_final;
		const identificador = `venda-${vendaId}-cartao-${indice + 1}`;
		const existente = await get(
			"SELECT id FROM Pagamentos WHERE venda_id = ? AND metodo = 'Cartão' AND numero_identificador = ?",
			[vendaId, identificador],
		);
		if (existente) continue;
		await run(
			`INSERT INTO Pagamentos
       (venda_id, cliente_id, metodo, numero_identificador, data_recebimento,
        valor_recebido, status, observacao, criado_em)
       VALUES (?, ?, 'Cartão', ?, ?, ?, 'pendente', ?, ?)`,
			[
				vendaId,
				clienteId || null,
				identificador,
				agora,
				valorFinal,
				"Aguardando liquidação da adquirente.",
				agora,
			],
		);
	}
}

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
	const pagamentoMisto =
		Array.isArray(dados.pagamentos) && dados.pagamentos.length > 1;
	const requestId = normalizarRequestId(dados.request_id);
	const vendaExistente = await buscarVendaIdempotente(requestId);
	if (vendaExistente) return vendaExistente;
	if (status === "orcamento" && pagamentoMisto) {
		throw new Error(
			"Pagamento dividido só pode ser usado ao finalizar a venda. Remova a divisão para criar um orçamento.",
		);
	}

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

	const clienteId = dados.cliente_id ? Number(dados.cliente_id) : null;
	const formaPagamento =
		pagamentoMisto
			? "Misto"
			: dados.forma_pagamento || null;
	const observacao = dados.observacao || null;
	// origem='orcamento' fica gravado mesmo depois de converterOrcamento() virar
	// 'finalizada' (esse UPDATE nunca toca em origem) — é o único jeito de saber,
	// depois do fato, que uma venda nasceu como orçamento (usado por
	// getConversaoOrcamentos em db/relatorios.js). Sem isso: default 'pdv',
	// igual sempre foi antes desta coluna existir ganhar esse terceiro valor.
	const origemVenda = status === "orcamento" ? "orcamento" : "pdv";

	await run("BEGIN TRANSACTION");

	try {
		// O processo principal é a fonte de verdade: preços enviados pelo
		// renderer (inclusive total e parcela) são apenas uma prévia visual.
		const calculo =
			pagamentoMisto
				? await calcularVendaMista({
						...dados,
						forma_pagamento: formaPagamento,
					})
				: await calcularVendaParcelada({
						itens,
						cliente_id: clienteId,
						forma_pagamento: formaPagamento,
						condicao_parcelamento_id: dados.condicao_parcelamento_id,
						desconto: dados.desconto,
						data_primeiro_vencimento: dados.data_primeiro_vencimento,
					});
		const desconto = calculo.desconto;
		const total = calculo.total;
		if (pagamentoMisto) {
			const valorDinheiro = calculo.pagamentos
				.filter((pagamento) => pagamento.forma_pagamento === "Dinheiro")
				.reduce((soma, pagamento) => soma + pagamento.valorFinal, 0);
			const valorRecebido = Number(dados.valor_recebido ?? 0);
			if (
				valorDinheiro > 0 &&
				(!Number.isFinite(valorRecebido) || valorRecebido < valorDinheiro)
			) {
				throw new Error(
					"O valor recebido em dinheiro não cobre a parte em dinheiro da venda.",
				);
			}
		}
		const result = await run(
			"INSERT INTO Vendas (cliente_id, total, forma_pagamento, data_venda, desconto, observacao, status, usuario_id, origem, condicao_parcelamento_id, condicao_parcelamento_nome, parcelas, acrescimo_percentual, acrescimo_parcelamento, valor_a_vista, valor_base_parcelamento, total_parcelado, data_primeiro_vencimento, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
				calculo.condicao ? calculo.condicao.id : null,
				calculo.condicao ? calculo.condicao.nome : null,
			calculo.parcelas.length || 1,
				calculo.acrescimoPercentual,
				calculo.acrescimo,
				calculo.valorBase,
				calculo.valorBase,
				calculo.total,
				formaPagamento === "Fiado" ? calculo.parcelas[0].vencimento : null,
				requestId,
			],
		);
		const vendaId = result.lastID;

		for (const item of calculo.itens) {
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

		const alocacoes = await inserirSnapshotsPagamento(run, vendaId, calculo);
		if (status === "finalizada") {
			await inserirPagamentosCartao(run, get, vendaId, clienteId, alocacoes);
		}

		// Só Fiado gera recebíveis do cliente. Cartão parcelado descreve a
		// condição comercial da venda, mas foi confirmado na maquininha no
		// checkout e não pode criar uma agenda fictícia de recebimento.
		if (status === "finalizada" && formaPagamento === "Fiado") {
			const grupoId = "venda-" + vendaId;
			for (const parcela of calculo.parcelas) {
				await criarLancamentoInterno(run, {
					tipo: "receber",
					descricao:
						"Venda #" +
						vendaId +
						" (fiado " +
						parcela.numero +
						"/" +
						calculo.parcelas.length +
						")",
					valor: parcela.valor,
					data_vencimento: parcela.vencimento,
					origem: "venda",
					referencia_id: vendaId,
					venda_id: vendaId,
					cliente_id: clienteId,
					grupo_id: grupoId,
					parcela_num: parcela.numero,
					parcela_total: calculo.parcelas.length,
					forma_pagamento: formaPagamento,
				});
			}
		}

		await run("COMMIT");
		return {
			success: true,
			vendaId,
			total,
			parcelas: calculo.parcelas,
			pagamentos: alocacoes,
		};
	} catch (erro) {
		await run("ROLLBACK");
		if (
			requestId &&
			String(erro && erro.message).includes("Vendas.request_id")
		) {
			const vendaExistente = await buscarVendaIdempotente(requestId);
			if (vendaExistente) return vendaExistente;
		}
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

	const caixaAberto = await getCaixaAberto();
	if (!caixaAberto) {
		throw new Error(
			"Não é possível converter o orçamento com o caixa fechado. Abra o caixa antes de continuar.",
		);
	}

	await run("BEGIN TRANSACTION");

	try {
		const venda = await get("SELECT * FROM Vendas WHERE id = ?", [vendaId]);
		if (!venda) throw new Error("Orçamento não encontrado.");
		if (venda.status !== "orcamento")
			throw new Error("Esta venda não é um orçamento.");

		const itens = await all("SELECT * FROM ItensVenda WHERE venda_id = ?", [
			vendaId,
		]);
		let alocacoes = await all(
			"SELECT * FROM VendaPagamentos WHERE venda_id = ? ORDER BY id",
			[vendaId],
		);
		if (alocacoes.length === 0 && venda.forma_pagamento) {
			const parcelasLegadas = calcularParcelamento({
				valorBase: venda.total,
				numeroParcelas: Number(venda.parcelas) || 1,
				primeiroVencimento: venda.data_primeiro_vencimento || null,
			}).parcelas;
			await run(
				`INSERT INTO VendaPagamentos
         (venda_id, forma_pagamento, valor_base, valor_final,
          acrescimo_percentual, acrescimo, condicao_parcelamento_id,
          condicao_parcelamento_nome, parcelas, detalhes_parcelas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					vendaId,
					venda.forma_pagamento,
					venda.valor_base_parcelamento ?? venda.total,
					venda.total,
					venda.acrescimo_percentual || 0,
					venda.acrescimo_parcelamento || 0,
					venda.condicao_parcelamento_id || null,
					venda.condicao_parcelamento_nome || null,
					Number(venda.parcelas) || 1,
					JSON.stringify(parcelasLegadas),
				],
			);
			alocacoes = await all(
				"SELECT * FROM VendaPagamentos WHERE venda_id = ? ORDER BY id",
				[vendaId],
			);
		}

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
		await inserirPagamentosCartao(run, get, vendaId, venda.cliente_id, alocacoes);

		if (venda.forma_pagamento === "Fiado") {
			if (!venda.cliente_id) {
				throw new Error("Orçamento fiado precisa de cliente antes da conversão.");
			}
			const recebivelExistente = await get(
				"SELECT id FROM LancamentosFinanceiros WHERE tipo = 'receber' AND origem = 'venda' AND (venda_id = ? OR (venda_id IS NULL AND referencia_id = ?)) LIMIT 1",
				[vendaId, vendaId],
			);
			if (recebivelExistente) {
				await run("COMMIT");
				return { success: true, vendaId };
			}
			const parcelas = calcularParcelamento({
				valorBase: venda.total,
				numeroParcelas: Number(venda.parcelas) || 1,
				primeiroVencimento:
					venda.data_primeiro_vencimento ||
					new Date().toISOString().slice(0, 10),
			}).parcelas;
			const grupoId = "venda-" + vendaId;
			for (const parcela of parcelas) {
				await criarLancamentoInterno(run, {
					tipo: "receber",
					descricao:
						"Venda #" +
						vendaId +
						" (fiado " +
						parcela.numero +
						"/" +
						parcelas.length +
						")",
					valor: parcela.valor,
					data_vencimento: parcela.vencimento,
					origem: "venda",
					referencia_id: vendaId,
					venda_id: vendaId,
					cliente_id: venda.cliente_id,
					grupo_id: grupoId,
					parcela_num: parcela.numero,
					parcela_total: parcelas.length,
					forma_pagamento: "Fiado",
				});
			}
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
	const all = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.all(sql, params, (erro, linhas) => {
				if (erro) return reject(erro);
				resolve(linhas);
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

		// Uma devolução de Fiado ainda em aberto reduz as próximas parcelas por
		// vencimento. Parcelas já pagas nunca são reescritas: se o crédito em
		// aberto não cobre a devolução, a operação inteira é bloqueada para um
		// ajuste manual explícito.
		if (venda.forma_pagamento === "Fiado") {
			const abertas = await all(
				`SELECT id, valor FROM LancamentosFinanceiros
         WHERE origem = 'venda' AND tipo = 'receber' AND status = 'aberto'
           AND (venda_id = ? OR (venda_id IS NULL AND referencia_id = ?))
         ORDER BY DATE(data_vencimento), parcela_num, id`,
				[vendaId, vendaId],
			);
			let restanteCentavos = Math.round(valorTotal * 100);
			const saldoAbertoCentavos = abertas.reduce(
				(total, lancamento) => total + Math.round(Number(lancamento.valor) * 100),
				0,
			);
			if (restanteCentavos > saldoAbertoCentavos) {
				throw new Error(
					"A devolução excede o saldo fiado em aberto. Faça um ajuste manual para parcelas já recebidas.",
				);
			}
			for (const lancamento of abertas) {
				if (restanteCentavos === 0) break;
				const valorCentavos = Math.round(Number(lancamento.valor) * 100);
				const abatimento = Math.min(restanteCentavos, valorCentavos);
				const novoValorCentavos = valorCentavos - abatimento;
				await run(
					novoValorCentavos === 0
						? "UPDATE LancamentosFinanceiros SET valor = 0, status = 'cancelado', data_pagamento = NULL WHERE id = ? AND status = 'aberto'"
						: "UPDATE LancamentosFinanceiros SET valor = ? WHERE id = ? AND status = 'aberto'",
					novoValorCentavos === 0
						? [lancamento.id]
						: [novoValorCentavos / 100, lancamento.id],
				);
				restanteCentavos -= abatimento;
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

async function getParcelasVenda(vendaId) {
	const id = Number(vendaId);
	if (!Number.isInteger(id) || id <= 0) throw new Error("Venda inválida.");
	return allAsync(
		`SELECT lf.id, lf.parcela_num AS numero, lf.parcela_total AS total,
            lf.valor, lf.data_vencimento AS vencimento, lf.data_pagamento,
            lf.status, lf.cliente_id, c.nome AS cliente_nome
       FROM LancamentosFinanceiros lf
       LEFT JOIN Clientes c ON c.id = lf.cliente_id
       WHERE lf.origem IN ('venda', 'venda_historica_manual') AND lf.tipo = 'receber'
         AND (lf.venda_id = ? OR (lf.venda_id IS NULL AND lf.referencia_id = ?))
       ORDER BY lf.parcela_num, lf.id`,
		[id, id],
	);
}

async function getVendas(filtro) {
	const conn = getConexao();
	return new Promise((resolver, rejeitar) => {
		let sql =
			"SELECT v.id, v.total, CASE WHEN v.status = 'orcamento' THEN v.forma_pagamento ELSE COALESCE(v.forma_pagamento, 'Genérico') END AS forma_pagamento, v.data_venda, v.desconto, v.observacao, v.status, v.origem, v.nota_status, v.nota_numero, v.condicao_parcelamento_nome, v.parcelas, v.acrescimo_parcelamento, v.data_primeiro_vencimento, c.nome AS cliente_nome FROM Vendas v LEFT JOIN Clientes c ON c.id = v.cliente_id";
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
			where.push(
				"(CASE WHEN v.status = 'orcamento' THEN v.forma_pagamento ELSE COALESCE(v.forma_pagamento, 'Genérico') END) = ?",
			);
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

function normalizarDataVendaHistorica(valor, campo) {
	const data = String(valor || "").trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
		throw new Error(`${campo} deve ser uma data válida.`);
	}
	const [ano, mes, dia] = data.split("-").map(Number);
	const utc = new Date(Date.UTC(ano, mes - 1, dia));
	if (
		utc.getUTCFullYear() !== ano ||
		utc.getUTCMonth() !== mes - 1 ||
		utc.getUTCDate() !== dia
	) {
		throw new Error(`${campo} deve ser uma data válida.`);
	}
	if (data > new Date().toISOString().slice(0, 10)) {
		throw new Error(`${campo} não pode estar no futuro.`);
	}
	return `${data}T12:00:00.000Z`;
}

// Venda histórica resumida: registra o fato comercial passado sem fingir
// produto, custo ou saída de estoque. O fluxo é derivado da própria Vendas
// para meios recebidos e do recebível vinculado quando for Fiado.
async function registrarVendaHistorica(dados) {
	const nome = String(dados && dados.nome ? dados.nome : "").trim();
	if (!nome) throw new Error("Nome/descrição da venda é obrigatório.");
	if (nome.length > 255) {
		throw new Error("Nome/descrição da venda deve ter no máximo 255 caracteres.");
	}

	const totalInformado = Number(dados && dados.total);
	const total = Math.round(totalInformado * 100) / 100;
	if (!Number.isFinite(total) || total <= 0) {
		throw new Error("Valor total inválido.");
	}
	const dataVenda = normalizarDataVendaHistorica(
		dados && dados.data_venda,
		"Data da venda",
	);
	const formaPagamento = String(
		dados && dados.forma_pagamento ? dados.forma_pagamento : "Genérico",
	).trim();
	if (!FORMAS_PAGAMENTO_HISTORICA.includes(formaPagamento)) {
		throw new Error("Forma de pagamento inválida.");
	}

	const clienteId = dados && dados.cliente_id ? Number(dados.cliente_id) : null;
	if (
		clienteId !== null &&
		(!Number.isInteger(clienteId) || clienteId <= 0)
	) {
		throw new Error("Cliente inválido.");
	}
	if (formaPagamento === "Fiado" && !clienteId) {
		throw new Error("Cliente é obrigatório para uma venda histórica fiada.");
	}

	const statusRecebivel = dados && dados.status_recebivel;
	if (
		formaPagamento === "Fiado" &&
		statusRecebivel !== "aberto" &&
		statusRecebivel !== "pago"
	) {
		throw new Error("Informe se o fiado está aberto ou já recebido.");
	}
	const dataVencimento =
		formaPagamento === "Fiado" && statusRecebivel === "aberto"
			? normalizarDataVendaHistorica(
					dados && dados.data_primeiro_vencimento,
					"Primeiro vencimento",
			  )
			: dataVenda;

	const requestId = normalizarRequestId(dados && dados.request_id);
	const existente = await buscarVendaIdempotente(requestId);
	if (existente) return existente;

	const conn = getConexao();
	const get = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.get(sql, params, (erro, linha) =>
				erro ? reject(erro) : resolve(linha),
			);
		});
	const run = (sql, params = []) =>
		new Promise((resolve, reject) => {
			conn.run(sql, params, function (erro) {
				if (erro) return reject(erro);
				resolve(this);
			});
		});

	await run("BEGIN TRANSACTION");
	try {
		const repetida = requestId
			? await get("SELECT id FROM Vendas WHERE request_id = ?", [requestId])
			: null;
		if (repetida) {
			await run("ROLLBACK");
			return buscarVendaIdempotente(requestId);
		}

		if (clienteId) {
			const cliente = await get("SELECT id FROM Clientes WHERE id = ? AND ativo = 1", [
				clienteId,
			]);
			if (!cliente) throw new Error("Cliente não encontrado ou inativo.");
		}

		const vendaResult = await run(
			`INSERT INTO Vendas
       (cliente_id, total, forma_pagamento, data_venda, desconto, observacao,
        status, usuario_id, origem, data_primeiro_vencimento, request_id)
       VALUES (?, ?, ?, ?, 0, ?, 'finalizada', NULL, 'venda_historica_manual', ?, ?)`,
			[
				clienteId,
				total,
				formaPagamento,
				dataVenda,
				nome,
				formaPagamento === "Fiado" ? dataVencimento : null,
				requestId,
			],
		);
		const vendaId = vendaResult.lastID;

		if (formaPagamento === "Fiado") {
			const pago = statusRecebivel === "pago";
			await run(
				`INSERT INTO LancamentosFinanceiros
         (tipo, descricao, valor, data_vencimento, data_pagamento, status,
          origem, referencia_id, forma_pagamento, data_criacao, cliente_id,
          venda_id, parcela_num, parcela_total)
         VALUES ('receber', ?, ?, ?, ?, ?, 'venda_historica_manual', ?, 'Fiado', ?, ?, ?, 1, 1)`,
				[
					`Venda histórica #${vendaId} — ${nome}`,
					total,
					dataVencimento,
					pago ? dataVenda : null,
					pago ? "pago" : "aberto",
					vendaId,
					new Date().toISOString(),
					clienteId,
					vendaId,
				],
			);
		}

		await run("COMMIT");
		return { success: true, vendaId, total, formaPagamento };
	} catch (erro) {
		await run("ROLLBACK");
		if (
			requestId &&
			/unique|request_id|UNIQUE constraint/i.test(String(erro && erro.message))
		) {
			const vendaExistente = await buscarVendaIdempotente(requestId);
			if (vendaExistente) return vendaExistente;
		}
		throw erro;
	}
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
	registrarVendaHistorica,
	registrarVendaFiadoHistorica,
	getItensVenda,
	getParcelasVenda,
	buscaGlobal,
	registrarDevolucao,
	getDevolucoes,
	getItensDevolucao,
	atualizarNotaFiscal,
};
// finalizarVendaPDV02 é código morto herdado do database.js original (nunca
// era chamado nem exportado ali). Mantido sem exportar, mesmo critério usado
// para buscarProdutosPDV02/buscarClientesPDV02.
