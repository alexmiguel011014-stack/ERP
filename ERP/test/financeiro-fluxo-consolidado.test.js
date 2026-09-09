/* GOALS13-02/08 — contrato canônico do fluxo de caixa.
   Cada movimento financeiro deve aparecer uma única vez:
   venda finalizada não-Fiado = entrada na data da venda;
   Fiado = somente a baixa do receber, na data de pagamento;
   pagar = saída na data de pagamento;
   Pagamentos = detalhe vinculado, sem soma independente;
   FechamentosCaixa = reconciliação física, sem soma independente;
   devolução = saída na data do estorno; cancelada = fora do fluxo. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-fluxo-consolidado-"));
const db = require("../database");
const { runAsync } = require("../db/conexao");

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-fluxo-consolidado");
});

after(async () => {
	await db.bloquearBanco();
});

test("aplica a matriz sem duplicar Pagamentos ou FechamentosCaixa", async () => {
	const venda = await runAsync(
		"INSERT INTO Vendas (total, forma_pagamento, data_venda, status) VALUES (?, ?, ?, 'finalizada')",
		[100, "PIX", "2026-01-05T12:00:00Z"],
	);
	const vendaFiado = await runAsync(
		"INSERT INTO Vendas (total, forma_pagamento, data_venda, status) VALUES (?, ?, ?, 'finalizada')",
		[200, "Fiado", "2026-01-06T12:00:00Z"],
	);

	await runAsync(
		`INSERT INTO LancamentosFinanceiros
     (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, categoria)
     VALUES ('receber', 'Fiado aberto', 40, '2026-01-06', NULL, 'aberto', 'venda', 'Outros')`,
	);
	await runAsync(
		`INSERT INTO LancamentosFinanceiros
     (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, categoria)
     VALUES ('receber', 'Recebimento confirmado', 80, '2026-01-06', '2026-01-07T10:00:00Z', 'pago', 'manual', 'Outros')`,
	);
	await runAsync(
		`INSERT INTO LancamentosFinanceiros
     (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem, categoria)
     VALUES ('pagar', 'Fornecedor pago', 30, '2026-01-07', '2026-01-07T11:00:00Z', 'pago', 'compra', 'Fornecedores')`,
	);
	await runAsync(
		`INSERT INTO LancamentosFinanceiros
     (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem)
     VALUES ('pagar', 'Fornecedor em aberto', 90, '2026-01-08', NULL, 'aberto', 'compra')`,
	);

	await runAsync(
		`INSERT INTO Pagamentos
     (venda_id, metodo, numero_identificador, data_recebimento, valor_recebido, status)
     VALUES (?, 'pix', 'tx-pendente', '2026-01-05', 100, 'pendente')`,
		[venda.lastID],
	);
	await runAsync(
		`INSERT INTO Pagamentos
     (venda_id, metodo, numero_identificador, data_recebimento, valor_recebido, status)
     VALUES (?, 'pix', 'tx-recebido', '2026-01-05', 100, 'recebido')`,
		[venda.lastID],
	);
	await runAsync(
		`INSERT INTO FechamentosCaixa
     (data_abertura, valor_abertura, data_fechamento, valor_informado, valor_esperado, diferenca, status)
     VALUES ('2026-01-05T08:00:00Z', 50, '2026-01-05T18:00:00Z', 150, 150, 0, 'fechado')`,
	);
	await runAsync(
		`INSERT INTO FechamentosCaixa
     (data_abertura, valor_abertura, status)
     VALUES ('2026-01-07T08:00:00Z', 50, 'aberto')`,
	);

	const resultado = await db.getFluxoCaixa("2026-01-01", "2026-01-31");

	assert.deepEqual(
		{
			totalEntradas: resultado.totalEntradas,
			totalSaidas: resultado.totalSaidas,
			saldo: resultado.saldo,
		},
		{ totalEntradas: 180, totalSaidas: 30, saldo: 150 },
	);
	assert.equal(resultado.eventos.length, 3);
	assert.ok(
		!resultado.eventos.some(
			(evento) =>
				evento.origem === "venda" &&
				evento.referenciaId === vendaFiado.lastID,
		),
	);
	assert.deepEqual(
		resultado.porOrigem.map((grupo) => grupo.chave),
		["compra", "manual", "venda"],
	);
});

test("inclui limites e devoluções, mas ignora baixa sem data e rejeita período inválido", async () => {
	const venda = await runAsync(
		"INSERT INTO Vendas (total, forma_pagamento, data_venda, status) VALUES (?, ?, ?, 'finalizada')",
		[25, "Dinheiro", "2026-02-01T01:00:00Z"],
	);
	await runAsync(
		"INSERT INTO Devolucoes (venda_id, valor_total, data) VALUES (?, ?, ?)",
		[venda.lastID, 5, "2026-02-10T15:00:00Z"],
	);
	await runAsync(
		`INSERT INTO LancamentosFinanceiros
     (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem)
     VALUES ('receber', 'Pago sem data', 300, '2026-02-02', NULL, 'pago', 'manual')`,
	);
	await runAsync(
		`INSERT INTO LancamentosFinanceiros
     (tipo, descricao, valor, data_vencimento, data_pagamento, status, origem)
     VALUES ('pagar', 'Saída no limite', 7, '2026-02-28', '2026-02-28T23:00:00Z', 'pago', 'manual')`,
	);

	const resultado = await db.getFluxoCaixa("2026-02-01", "2026-02-28");
	assert.equal(resultado.totalEntradas, 25);
	assert.equal(resultado.totalSaidas, 12);
	assert.deepEqual(
		resultado.eventos.map((evento) => evento.data),
		["2026-02-01", "2026-02-10", "2026-02-28"],
	);
	assert.equal(resultado.eventos[1].origem, "devolucao");

	await assert.rejects(
		() => db.getFluxoCaixa("2026-03-01", "2026-02-01"),
		/Período inválido/,
	);
	await assert.rejects(
		() => db.getFluxoCaixa("2026-02-30", "2026-03-01"),
		/Data inicial inválida/,
	);
});

test("relatório devolve realizado e projetado pelo mesmo contrato", async () => {
	const resultado = await db.getRelatorioFluxoCaixa(
		"2026-01-01",
		"2026-01-31",
	);

	assert.equal(resultado.realizado.modo, "realizado");
	assert.equal(resultado.projetado.modo, "projetado");
	assert.equal(resultado.realizado.periodo.inicio, "2026-01-01");
	assert.equal(resultado.projetado.periodo.fim, "2026-01-31");
	assert.ok(resultado.politica.some((texto) => texto.includes("Pagamentos")));
});

test("IPC do relatório aplica permissão e expõe shape para período vazio/default", async () => {
	const { registrar } = require("../ipc/relatorios");
	const handlers = {};
	const permissoes = [];
	registrar(
		{
			handle(nome, handler) {
				handlers[nome] = handler;
			},
		},
		{
			exigirPermissao(permissao) {
				permissoes.push(permissao);
			},
		},
	);

	const handler = handlers["get-relatorio-fluxo-caixa"];
	assert.equal(typeof handler, "function");
	const vazio = await handler({}, "2099-01-01", "2099-01-31");
	assert.equal(vazio.realizado.modo, "realizado");
	assert.equal(vazio.projetado.modo, "projetado");
	assert.equal(vazio.realizado.eventos.length, 0);
	assert.deepEqual(permissoes, ["relatorios"]);

	const padrao = await handler({}, null, null);
	assert.ok(padrao.realizado.periodo.inicio);
	assert.ok(padrao.projetado.periodo.fim);
	await assert.rejects(
		() => handler({}, "2026-02-30", "2026-03-01"),
		/Data inicial inválida/,
	);
});

test("IPC nega relatório sem permissão e os nomes da ponte permanecem alinhados", async () => {
	const { registrar } = require("../ipc/relatorios");
	const handlers = {};
	registrar(
		{
			handle(nome, handler) {
				handlers[nome] = handler;
			},
		},
		{
			exigirPermissao() {
				throw new Error("Permissão negada.");
			},
		},
	);
	await assert.rejects(
		() => handlers["get-relatorio-fluxo-caixa"]({}, null, null),
		/Permissão negada/,
	);

	const preload = fs.readFileSync(
		path.join(__dirname, "..", "preload.js"),
		"utf8",
	);
	const api = fs.readFileSync(
		path.join(__dirname, "..", "frontend", "src", "lib", "erpApi.ts"),
		"utf8",
	);
	assert.match(
		preload,
		/getRelatorioFluxoCaixa:\s*\(inicio, fim\)\s*=>\s*ipcRenderer\.invoke\("get-relatorio-fluxo-caixa", inicio, fim\)/s,
	);
	assert.match(
		api,
		/fluxoCaixa:\s*\(inicio: string \| null, fim: string \| null\)[\s\S]*?invocar<RelatorioFluxoCaixaResultado>\(\s*"getRelatorioFluxoCaixa"/s,
	);

	const { registrar: registrarFinanceiro } = require("../ipc/financeiro");
	const financeiroHandlers = {};
	registrarFinanceiro(
		{
			handle(nome, handler) {
				financeiroHandlers[nome] = handler;
			},
		},
		{
			exigirPermissao(permissao) {
				throw new Error(`Permissão negada: ${permissao}.`);
			},
			exigirSessao() {},
			log() {},
		},
	);
	await assert.rejects(
		() => financeiroHandlers["get-fluxo-caixa"]({}, null, null),
		/Permissão negada: financeiro/,
	);
});
