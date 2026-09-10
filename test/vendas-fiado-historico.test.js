/* Crediário histórico com vínculo real (GOALS.md "4. Crediário histórico") —
   registrarVendaFiadoHistorica: mesma base de importarVendasHistoricas (sem
   caixa aberto, sem baixar Variacoes.quantidade_estoque, aceita data
   passada) + cliente_id obrigatório + LancamentosFinanceiros a receber
   vinculado ao cliente. Roda contra um SQLCipher temporário e descartável
   (mesmo padrão de test/negocio.test.js). */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-fiado-hist-"));
const db = require("../database");
const { runAsync, allAsync, getAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-teste-123");
});

after(async () => {
	await db.bloquearBanco();
	try {
		fs.rmSync(TMP, { recursive: true });
	} catch {
		/* ignora erro de limpeza */
	}
});

let contador = 0;
async function criarVariacao(preco) {
	contador++;
	const produto = await runAsync("INSERT INTO Produtos (nome) VALUES (?)", [
		"Produto Fiado Hist " + contador,
	]);
	const sku = "SKU-FIADO-HIST-" + contador;
	const variacao = await runAsync(
		"INSERT INTO Variacoes (produto_id, sku, preco, quantidade_estoque) VALUES (?, ?, ?, ?)",
		[produto.lastID, sku, preco || 50, 10],
	);
	return { variacaoId: variacao.lastID, sku };
}

async function criarCliente() {
	contador++;
	const cliente = await runAsync(
		"INSERT INTO Clientes (nome, ativo) VALUES (?, 1)",
		["Cliente Fiado Hist " + contador],
	);
	return cliente.lastID;
}

test("registra a venda histórica sem exigir caixa aberto", async () => {
	const { sku } = await criarVariacao(20);
	const clienteId = await criarCliente();
	// Nenhum caixa foi aberto neste teste — se a função checasse caixa, isso
	// já teria lançado antes de chegar aqui.
	const resultado = await db.registrarVendaFiadoHistorica({
		cliente_id: clienteId,
		sku,
		quantidade: 2,
		valorUnitario: 20,
		data: "2026-01-15",
		statusRecebivel: "aberto",
	});
	assert.strictEqual(resultado.success, true);
	assert.ok(resultado.vendaId);
	assert.strictEqual(resultado.total, 40);
});

test("não altera Variacoes.quantidade_estoque (é histórico, não deve afetar estoque atual)", async () => {
	const { variacaoId, sku } = await criarVariacao(15);
	const clienteId = await criarCliente();

	const antes = await getAsync(
		"SELECT quantidade_estoque FROM Variacoes WHERE id = ?",
		[variacaoId],
	);
	assert.strictEqual(antes.quantidade_estoque, 10);

	await db.registrarVendaFiadoHistorica({
		cliente_id: clienteId,
		sku,
		quantidade: 5,
		valorUnitario: 15,
		data: "2026-02-01",
		statusRecebivel: "aberto",
	});

	const depois = await getAsync(
		"SELECT quantidade_estoque FROM Variacoes WHERE id = ?",
		[variacaoId],
	);
	assert.strictEqual(
		depois.quantidade_estoque,
		10,
		"estoque atual não deveria mudar com uma venda histórica",
	);
});

test("cria Vendas + ItensVenda + LancamentosFinanceiros (com cliente_id) numa única transação atômica", async () => {
	const { variacaoId, sku } = await criarVariacao(30);
	const clienteId = await criarCliente();

	const resultado = await db.registrarVendaFiadoHistorica({
		cliente_id: clienteId,
		sku,
		quantidade: 3,
		valorUnitario: 30,
		data: "2026-03-10",
		statusRecebivel: "aberto",
	});

	const venda = await getAsync("SELECT * FROM Vendas WHERE id = ?", [
		resultado.vendaId,
	]);
	assert.ok(venda, "Venda deveria ter sido criada");
	assert.strictEqual(venda.cliente_id, clienteId);
	assert.strictEqual(venda.forma_pagamento, "Fiado");
	assert.strictEqual(venda.status, "finalizada");
	assert.strictEqual(venda.origem, "importado");
	assert.strictEqual(venda.total, 90);
	assert.ok(String(venda.data_venda).startsWith("2026-03-10"));

	const itens = await allAsync("SELECT * FROM ItensVenda WHERE venda_id = ?", [
		resultado.vendaId,
	]);
	assert.strictEqual(itens.length, 1);
	assert.strictEqual(itens[0].variacao_id, variacaoId);
	assert.strictEqual(itens[0].quantidade, 3);
	assert.strictEqual(itens[0].preco_unitario, 30);

	const lancamento = await getAsync(
		"SELECT * FROM LancamentosFinanceiros WHERE referencia_id = ? AND tipo = 'receber'",
		[resultado.vendaId],
	);
	assert.ok(lancamento, "Lançamento a receber deveria ter sido criado");
	assert.strictEqual(lancamento.cliente_id, clienteId);
	assert.strictEqual(lancamento.valor, 90);
	assert.strictEqual(lancamento.status, "aberto");
	assert.strictEqual(lancamento.origem, "manual");
	assert.strictEqual(lancamento.forma_pagamento, "Fiado");
	assert.ok(lancamento.descricao.includes("Crediário histórico"));
});

test("statusRecebivel 'pago' grava o lançamento já como pago (dívida quitada depois do fato)", async () => {
	const { sku } = await criarVariacao(25);
	const clienteId = await criarCliente();

	const resultado = await db.registrarVendaFiadoHistorica({
		cliente_id: clienteId,
		sku,
		quantidade: 1,
		valorUnitario: 25,
		data: "2026-04-05",
		statusRecebivel: "pago",
	});

	const lancamento = await getAsync(
		"SELECT * FROM LancamentosFinanceiros WHERE referencia_id = ? AND tipo = 'receber'",
		[resultado.vendaId],
	);
	assert.strictEqual(lancamento.status, "pago");
	assert.ok(
		lancamento.data_pagamento,
		"deveria ter data_pagamento quando já pago",
	);
});

test("rollback completo se o SKU não existir — nada é criado", async () => {
	const clienteId = await criarCliente();

	const [vendasAntes, itensAntes, lancamentosAntes] = await Promise.all([
		allAsync("SELECT COUNT(*) as n FROM Vendas", []),
		allAsync("SELECT COUNT(*) as n FROM ItensVenda", []),
		allAsync("SELECT COUNT(*) as n FROM LancamentosFinanceiros", []),
	]);

	await assert.rejects(
		() =>
			db.registrarVendaFiadoHistorica({
				cliente_id: clienteId,
				sku: "SKU-QUE-NAO-EXISTE-XYZ",
				quantidade: 1,
				valorUnitario: 10,
				data: "2026-05-01",
				statusRecebivel: "aberto",
			}),
		/não encontrado/i,
	);

	const [vendasDepois, itensDepois, lancamentosDepois] = await Promise.all([
		allAsync("SELECT COUNT(*) as n FROM Vendas", []),
		allAsync("SELECT COUNT(*) as n FROM ItensVenda", []),
		allAsync("SELECT COUNT(*) as n FROM LancamentosFinanceiros", []),
	]);

	assert.strictEqual(vendasDepois[0].n, vendasAntes[0].n);
	assert.strictEqual(itensDepois[0].n, itensAntes[0].n);
	assert.strictEqual(lancamentosDepois[0].n, lancamentosAntes[0].n);
});

test("cliente_id ausente é rejeitado com erro claro (diferente de finalizarVenda, aqui é obrigatório)", async () => {
	const { sku } = await criarVariacao(10);
	await assert.rejects(
		() =>
			db.registrarVendaFiadoHistorica({
				sku,
				quantidade: 1,
				valorUnitario: 10,
				data: "2026-05-01",
				statusRecebivel: "aberto",
			}),
		/[Cc]liente.*obrigatório/,
	);
});

test("status do recebível inválido é rejeitado", async () => {
	const { sku } = await criarVariacao(10);
	const clienteId = await criarCliente();
	await assert.rejects(() =>
		db.registrarVendaFiadoHistorica({
			cliente_id: clienteId,
			sku,
			quantidade: 1,
			valorUnitario: 10,
			data: "2026-05-01",
			statusRecebivel: "quitado_parcial",
		}),
	);
});

test("o recebível criado aparece em LancamentosFinanceiros consultado por cliente_id", async () => {
	const { sku } = await criarVariacao(60);
	const clienteId = await criarCliente();

	const resultado = await db.registrarVendaFiadoHistorica({
		cliente_id: clienteId,
		sku,
		quantidade: 1,
		valorUnitario: 60,
		data: "2026-06-01",
		statusRecebivel: "aberto",
	});

	const doCliente = await allAsync(
		"SELECT * FROM LancamentosFinanceiros WHERE cliente_id = ?",
		[clienteId],
	);
	assert.strictEqual(doCliente.length, 1);
	assert.strictEqual(doCliente[0].referencia_id, resultado.vendaId);
});

test("o recebível em aberto criado aparece no relatório getAgingRecebiveis", async () => {
	const { sku } = await criarVariacao(45);
	const clienteId = await criarCliente();

	const resultado = await db.registrarVendaFiadoHistorica({
		cliente_id: clienteId,
		sku,
		quantidade: 1,
		valorUnitario: 45,
		data: "2020-01-01", // bem no passado — cai em atraso90mais
		statusRecebivel: "aberto",
	});

	const aging = await db.getAgingRecebiveis();
	const todasLinhas = [
		...aging.aVencer.itens,
		...aging.atraso0a30.itens,
		...aging.atraso31a60.itens,
		...aging.atraso61a90.itens,
		...aging.atraso90mais.itens,
	];
	const encontrada = todasLinhas.find((l) =>
		l.descricao.includes("Crediário histórico"),
	);
	assert.ok(
		encontrada,
		"o lançamento do crediário histórico deveria aparecer no aging de recebíveis",
	);
	assert.strictEqual(encontrada.valor, 45);

	// Confirma explicitamente o vínculo do lançamento por trás dessa linha
	// com o cliente (getAgingRecebiveis não expõe cliente_id na resposta).
	const lancamento = await getAsync(
		"SELECT cliente_id FROM LancamentosFinanceiros WHERE id = ? AND referencia_id = ?",
		[encontrada.id, resultado.vendaId],
	);
	assert.strictEqual(lancamento.cliente_id, clienteId);
});
