/* GOALS17 — piloto financeiro isolado: nenhum workbook real nem banco do
   usuário participa destes testes. A planilha é sintética e o SQLCipher fica
   em um diretório temporário removido ao final. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const XLSX = require("xlsx");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-financeiro-janeiro-"));
const db = require("../database");
const { getAsync } = require("../db/conexao");
const {
	parseFinanceiroHistoricoMensal,
	criarModeloFinanceiroMensal,
	validarModeloFinanceiroMensal,
	serializarModeloFinanceiroMensal,
} = require("../db/excel-loja-house");
const {
	executarImportacaoFinanceiroMensal,
} = require("../db/importacoes");

const VALORES_VENDAS = [
	59.9, 100, 200, 300, 400, 250, 199.99, 180, 170, 160, 150, 140, 130,
	120, 110, 100, 1742.94,
];

function criarPlanilha(nome, opcoes = {}) {
	const linhas = [["DATA", "DESCRIÇÃO", "ENTRADA", "SAÍDA", "TOTAL"]];
	let saldo = 0;
	linhas.push(["01/01/2026", "Saldo Anterior", null, null, saldo]);
	VALORES_VENDAS.forEach((valor, indice) => {
		saldo = Math.round((saldo + valor) * 100) / 100;
		linhas.push([
			`${String((indice % 18) + 2).padStart(2, "0")}/01/2026`,
			`Produto histórico ${indice + 1}`,
			valor,
			null,
			saldo,
		]);
	});
	for (const [descricao, valor] of [
		["Cartão", 1509],
		["Kimonos Adultos", 1570],
		["Conjunto NoGi", 900],
	]) {
		saldo = Math.round((saldo - valor) * 100) / 100;
		linhas.push(["25/01/2026", descricao, null, valor, saldo]);
	}
	if (opcoes.incluirConsumo) {
		saldo = Math.round((saldo - 25) * 100) / 100;
		linhas.push(["26/01/2026", "café/almoço", null, 25, saldo]);
	}
	if (opcoes.incluirForaDoPeriodo) {
		saldo = Math.round((saldo + 10) * 100) / 100;
		linhas.push(["02/02/2026", "Kimono fora do período", 10, null, saldo]);
	}
	linhas.push([null, "TOTAL", null, null, saldo]);
	linhas.push([null, null, null, null, null]);

	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(
		workbook,
		XLSX.utils.aoa_to_sheet(linhas),
		"Financeiro LojaJANEIRO",
	);
	const arquivo = path.join(TMP, nome);
	XLSX.writeFile(workbook, arquivo);
	return arquivo;
}

function criarModelo(nome, opcoes) {
	return criarModeloFinanceiroMensal(
		parseFinanceiroHistoricoMensal(criarPlanilha(nome, opcoes), "JANEIRO"),
	);
}

function dadosDoModelo(modelo) {
	return validarModeloFinanceiroMensal(modelo).dados;
}

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-financeiro-historico-teste");
});

after(async () => {
	await db.bloquearBanco();
	fs.rmSync(TMP, { recursive: true, force: true });
});

test("parser de janeiro classifica só fatos comprovados e reconcilia o saldo", () => {
	const arquivo = criarPlanilha("janeiro-ok.xlsx");
	const dados = parseFinanceiroHistoricoMensal(arquivo, "JANEIRO");

	assert.equal(dados.vendasHistoricas.length, 17);
	assert.equal(dados.pagamentosHistoricos.length, 3);
	assert.equal(dados.pendenciasHistoricas.length, 0);
	assert.deepEqual(
		dados.pagamentosHistoricos.map((item) => [item.descricao, item.categoria]),
		[
			["Cartão", "Pagamento de cartão"],
			["Kimonos Adultos", "Compra para estoque histórica"],
			["Conjunto NoGi", "Compra para estoque histórica"],
		],
	);
	assert.deepEqual(dados.reconciliacao, {
		saldoAbertura: 0,
		totalEntradas: 4512.83,
		totalSaidas: 3979,
		saldoCalculado: 533.83,
		saldoInformado: 533.83,
		diferenca: 0,
		valida: true,
	});
	assert.throws(
		() => parseFinanceiroHistoricoMensal(arquivo, "FEVEREIRO"),
		/JANEIRO/,
	);
});

test("modelo JSON de janeiro usa centavos, trava fatos e rejeita campos de catálogo", () => {
	const modelo = criarModelo("janeiro-modelo.xlsx");
	const validacao = validarModeloFinanceiroMensal(modelo);
	assert.equal(validacao.modelo.competencia, "2026-01");
	assert.equal(validacao.modelo.movimentos.length, 20);
	assert.equal(validacao.modelo.auditoria.saldo_fechamento_calculado_centavos, 53383);
	assert.equal(validacao.dados.vendasHistoricas.length, 17);
	assert.equal(validacao.dados.pagamentosHistoricos.length, 3);
	assert.match(validacao.checksum, /^[a-f0-9]{64}$/);
	assert.match(serializarModeloFinanceiroMensal(modelo), /"valor_centavos"/);

	const comProduto = structuredClone(modelo);
	comProduto.movimentos[0].produto_id = 1;
	assert.throws(() => validarModeloFinanceiroMensal(comProduto), /não permitido/);
	const versaoInvalida = structuredClone(modelo);
	versaoInvalida.versao = 2;
	assert.throws(() => validarModeloFinanceiroMensal(versaoInvalida), /Versão/);
	const chaveDuplicada = structuredClone(modelo);
	chaveDuplicada.movimentos.push(structuredClone(chaveDuplicada.movimentos[0]));
	assert.throws(() => validarModeloFinanceiroMensal(chaveDuplicada), /duplicada/);
	const pagamentoSemCategoria = structuredClone(modelo);
	pagamentoSemCategoria.movimentos.find(
		(item) => item.destino === "pagamento_historico",
	).categoria = null;
	assert.throws(() => validarModeloFinanceiroMensal(pagamentoSemCategoria), /pagamento/);

	const comValorAlterado = structuredClone(modelo);
	comValorAlterado.movimentos[0].valor_centavos += 1;
	assert.throws(() => validarModeloFinanceiroMensal(comValorAlterado), /chave_externa/);

	const conciliacaoInvalida = structuredClone(modelo);
	conciliacaoInvalida.auditoria.diferenca_centavos = 1;
	assert.throws(() => validarModeloFinanceiroMensal(conciliacaoInvalida), /conciliação/);

	const comAberturaDeAuditoria = structuredClone(modelo);
	comAberturaDeAuditoria.auditoria.saldo_abertura_centavos = 100;
	comAberturaDeAuditoria.auditoria.saldo_fechamento_calculado_centavos += 100;
	comAberturaDeAuditoria.auditoria.saldo_fechamento_informado_centavos += 100;
	const normalizado = validarModeloFinanceiroMensal(comAberturaDeAuditoria).dados;
	assert.equal(normalizado.reconciliacao.saldoAbertura, 1);
	assert.equal(
		normalizado.vendasHistoricas.length + normalizado.pagamentosHistoricos.length,
		20,
	);
});

test("consumo interno é categorizado sem produto e data fora do mês bloqueia o commit", async () => {
	const arquivo = criarPlanilha("janeiro-com-pendencia.xlsx", {
		incluirConsumo: true,
		incluirForaDoPeriodo: true,
	});
	const dados = dadosDoModelo(
		criarModeloFinanceiroMensal(
			parseFinanceiroHistoricoMensal(arquivo, "JANEIRO"),
		),
	);
	assert.equal(
		dados.pagamentosHistoricos.find((item) => item.descricao === "café/almoço")
			?.categoria,
		"Consumo interno",
	);
	assert.equal(dados.pendenciasHistoricas.length, 1);
	assert.match(dados.pendenciasHistoricas[0].motivo, /fora de janeiro/);

	const previa = await executarImportacaoFinanceiroMensal(dados, null, {
		dryRun: true,
	});
	assert.equal(previa.preview.pendenciasHistoricas, 1);
	assert.equal(previa.preview.porCategoria["Consumo interno"], 25);
	await assert.rejects(
		() => executarImportacaoFinanceiroMensal(dados, null, { dryRun: false }),
		/conferência/,
	);
	assert.equal((await getAsync("SELECT COUNT(*) AS n FROM Vendas")).n, 0);
});

test("commit é idempotente, não altera estoque e aparece uma vez no fluxo", async () => {
	const dados = dadosDoModelo(criarModelo("janeiro-commit.xlsx"));
	const previa = await executarImportacaoFinanceiroMensal(dados, null, {
		dryRun: true,
	});
	assert.equal(previa.preview.vendasHistoricas, 17);
	assert.equal(previa.preview.pagamentosHistoricos, 3);
	assert.equal(previa.conflitos.duplicadasJaImportadas, 0);

	const dadosInvalidos = structuredClone(dados);
	dadosInvalidos.vendasHistoricas[0].valor = -1;
	await assert.rejects(
		() =>
			executarImportacaoFinanceiroMensal(dadosInvalidos, null, {
				dryRun: false,
			}),
		/dados parciais/,
	);
	assert.equal((await getAsync("SELECT COUNT(*) AS n FROM Vendas")).n, 0);
	assert.equal(
		(await getAsync("SELECT COUNT(*) AS n FROM ImportacaoBatch")).n,
		0,
	);

	const primeiro = await executarImportacaoFinanceiroMensal(dados, null, {
		dryRun: false,
	});
	assert.deepEqual(primeiro.erros, []);
	assert.deepEqual(primeiro.importadas, {
		vendasHistoricas: 17,
		pagamentosHistoricos: 3,
	});
	const lote = await getAsync(
		"SELECT origem, checksum FROM ImportacaoBatch WHERE id = ?",
		[primeiro.batchId],
	);
	assert.deepEqual(lote, {
		origem: "loja_house_financeiro_historico",
		checksum: dados.modeloChecksum,
	});
	assert.equal(
		(
			await getAsync(
				"SELECT COUNT(*) AS n FROM MapeamentoChaveExterna WHERE batch_id = ? AND entidade_tipo = 'venda_historica'",
				[primeiro.batchId],
			)
		).n,
		17,
	);
	assert.equal(
		(
			await getAsync(
				"SELECT COUNT(*) AS n FROM Vendas WHERE origem = 'importacao_financeiro_historico'",
			)
		).n,
		17,
	);
	assert.equal((await getAsync("SELECT COUNT(*) AS n FROM ItensVenda")).n, 0);
	assert.equal(
		(await getAsync("SELECT COUNT(*) AS n FROM MovimentacoesEstoque")).n,
		0,
	);
	assert.equal(
		(
			await getAsync(
				"SELECT COUNT(*) AS n FROM LancamentosFinanceiros WHERE tipo = 'receber' AND origem = 'importacao_financeiro_historico'",
			)
		).n,
		0,
	);
	assert.deepEqual(
		await new Promise((resolve, reject) => {
			db.getConexao().all(
				"SELECT categoria, valor FROM LancamentosFinanceiros WHERE origem = 'importacao_financeiro_historico' ORDER BY id",
				(erro, linhas) => (erro ? reject(erro) : resolve(linhas)),
			);
		}),
		[
			{ categoria: "Pagamento de cartão", valor: 1509 },
			{ categoria: "Compra para estoque histórica", valor: 1570 },
			{ categoria: "Compra para estoque histórica", valor: 900 },
		],
	);

	const fluxo = await db.getFluxoCaixa("2026-01-01", "2026-01-31");
	assert.deepEqual(
		{
			entradas: fluxo.totalEntradas,
			saidas: fluxo.totalSaidas,
			saldo: fluxo.saldo,
		},
		{ entradas: 4512.83, saidas: 3979, saldo: 533.83 },
	);
	assert.equal(
		fluxo.eventos.filter(
			(evento) => evento.origem === "importacao_financeiro_historico",
		).length,
		20,
	);
	assert.match(
		fluxo.eventos.find((evento) => evento.tipo === "entrada").descricao,
		/Histórico financeiro: Produto histórico/,
	);
	assert.equal((await db.getCurvaABC("2026-01-01", "2026-01-31")).length, 0);
	const vendas = await db.getRelatorioVendas("2026-01-01", "2026-01-31");
	assert.equal(vendas.resumo.vendas, 17);
	assert.equal(vendas.resumo.faturamento, 4512.83);
	const dre = await db.getDRE("2026-01-01", "2026-01-31");
	assert.equal(dre.receitaBruta, 0);
	assert.equal(dre.receitaHistoricaSemCMV, 4512.83);
	assert.equal(dre.despesas, 0);

	const segundo = await executarImportacaoFinanceiroMensal(dados, null, {
		dryRun: false,
	});
	assert.deepEqual(segundo.importadas, {
		vendasHistoricas: 0,
		pagamentosHistoricos: 0,
	});
	assert.equal(segundo.ignoradas, 20);
	assert.equal((await getAsync("SELECT COUNT(*) AS n FROM Vendas")).n, 17);

	const dadosAlterados = structuredClone(dados);
	dadosAlterados.modeloChecksum = "f".repeat(64);
	await assert.rejects(
		() => executarImportacaoFinanceiroMensal(dadosAlterados, null, { dryRun: false }),
		/operação auditada separada/,
	);
});

test("IPC expõe o modo mensal e o modo Excel geral não grava o financeiro legado", async () => {
	const { registrar } = require("../ipc/importacoes");
	const handlers = {};
	registrar(
		{
			handle(nome, handler) {
				handlers[nome] = handler;
			},
		},
		{
			exigirSessao() {},
			getSessao() {
				return { id: null };
			},
			getMainWindow() {
				return null;
			},
			log() {},
		},
	);
	const arquivo = criarPlanilha("janeiro-ipc.xlsx");
	const caminhoModelo = path.join(TMP, "loja-house-financeiro-2026-01.json");
	const validacao = await handlers["importacoes:gerar-modelo-financeiro-janeiro"](
		{},
		arquivo,
		caminhoModelo,
	);
	assert.equal(validacao.formato, "json_financeiro_mes");
	assert.equal(validacao.preview.vendasHistoricas.length, 17);
	assert.equal(fs.existsSync(caminhoModelo), true);
	const selecionado = await handlers["importacoes:validar-modelo-financeiro-janeiro"](
		{},
		caminhoModelo,
	);
	assert.equal(selecionado.checksum, validacao.checksum);

	const mensal = await handlers["importacoes:executar"](
		{},
		{ tipo: "json_financeiro_mes", caminho: caminhoModelo, checksum: selecionado.checksum },
		{ dryRun: true },
	);
	assert.equal(mensal.preview.vendasHistoricas, 17);
	assert.equal(mensal.preview.pagamentosHistoricos, 3);
	const alterado = await handlers["importacoes:executar"](
		{},
		{ tipo: "json_financeiro_mes", caminho: caminhoModelo, checksum: "0".repeat(64) },
		{ dryRun: true },
	);
	assert.match(alterado.erro, /mudou desde a prévia/);
	const excelDireto = await handlers["importacoes:executar"](
		{},
		{ tipo: "excel_financeiro_mes", caminho: arquivo, mes: "JANEIRO" },
		{ dryRun: true },
	);
	assert.match(excelDireto.erro, /só gera o rascunho/);

	const geral = await handlers["importacoes:executar"](
		{},
		{ tipo: "excel", caminho: arquivo },
		{ dryRun: true },
	);
	assert.equal(geral.preview.lancamentosHistoricos, 0);
});
