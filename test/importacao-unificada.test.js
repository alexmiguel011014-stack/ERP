/* GOALS24 — contrato comum da fonte JSON: resolução, competências, checksum,
   adaptador de vendas legadas e idempotência. Tudo usa arquivos e SQLCipher
   temporários; nenhum dado da loja participa da suíte. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const XLSX = require("xlsx");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "erp-importacao-unificada-"));
const db = require("../database");
const {
	normalizarArquivosImportacao,
	carregarArquivosJsonImportacao,
	executarImportacaoLojHouse,
} = require("../db/importacoes");
const {
	parseFinanceiroHistoricoMensal,
	criarModeloFinanceiroMensal,
} = require("../db/excel-loja-house");
const { getAsync } = require("../db/conexao");

function criarModeloMensal(competencia) {
	const [ano, mes] = competencia.split("-");
	const dataVenda = `${ano}-${mes}-02`;
	const dataPagamento = `${ano}-${mes}-03`;
	const linhas = [
		["DATA", "DESCRIÇÃO", "ENTRADA", "SAÍDA", "TOTAL"],
		[`01/${mes}/${ano}`, "Saldo Anterior", null, null, 0],
		[dataVenda.split("-").reverse().join("/"), "Venda revisada", 10, null, 10],
		[dataPagamento.split("-").reverse().join("/"), "Cartão", null, 2, 8],
		[null, "TOTAL", null, null, 8],
		[null, null, null, null, null],
	];
	const workbook = XLSX.utils.book_new();
	const nomesMeses = [
		"JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
		"JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
	];
	XLSX.utils.book_append_sheet(
		workbook,
		XLSX.utils.aoa_to_sheet(linhas),
		`Financeiro Loja${nomesMeses[Number(mes) - 1]}`,
	);
	const arquivo = path.join(TMP, `financeiro-${competencia}.xlsx`);
	XLSX.writeFile(workbook, arquivo);
	return criarModeloFinanceiroMensal(parseFinanceiroHistoricoMensal(arquivo, competencia));
}

function entradaFinanceira(competencia, modelo = criarModeloMensal(competencia)) {
	return {
		arquivo: `05_financeiro_historico_${competencia}.json`,
		conteudo: modelo,
	};
}

before(async () => {
	db.setDBPath(TMP);
	await db.desbloquearBanco("senha-importacao-unificada");
});

after(async () => {
	await db.bloquearBanco();
	try {
		fs.rmSync(TMP, { recursive: true, force: true });
	} catch {
		/* o banco nativo pode manter o arquivo temporariamente aberto */
	}
});

test("resolvedor aceita arquivos em qualquer ordem, envelope, metadado e meses distintos", () => {
	const janeiro = criarModeloMensal("2026-01");
	const marco = criarModeloMensal("2026-03");
	const entradas = [
		{ arquivo: "nested/05_financeiro_historico_2026-03.json", conteudo: marco },
		{ arquivo: "00_manifesto.json", conteudo: { exportadoPor: "teste" } },
		{ arquivo: "01_categorias.json", conteudo: [{ chave_externa: "CAT-1", nome: "Categoria" }] },
		entradaFinanceira("2026-01", janeiro),
		{ arquivo: "06_contas_abertas.json", conteudo: { registros: [{ chave_externa: "CONT-1", tipo: "pagar", descricao: "Conta", valor: 4, data_vencimento: "2026-01-10", status: "aberto" }] } },
	];

	const resultado = normalizarArquivosImportacao(entradas);
	const repetido = normalizarArquivosImportacao([...entradas].reverse());

	assert.deepEqual(resultado.competencias, ["2026-01", "2026-03"]);
	assert.equal(resultado.dados.categorias.length, 1);
	assert.equal(resultado.dados.financeiroHistorico.length, 2);
	assert.equal(resultado.dados.vendasFinanceiroHistorico.length, 2);
	assert.equal(resultado.dados.contasAbertas.length, 1);
	assert.equal(resultado.errosFonte.length, 0);
	assert.equal(resultado.arquivos.find((item) => item.tipo === "metadado")?.arquivo, "00_manifesto.json");
	assert.equal(resultado.checksum, repetido.checksum);
});

test("reconhece o nome mensal gerado pelo fluxo Loja House", () => {
	const resultado = normalizarArquivosImportacao([{
		arquivo: "loja-house-financeiro-2026-02.json",
		conteudo: criarModeloMensal("2026-02"),
	}]);

	assert.equal(resultado.errosFonte.length, 0);
	assert.equal(resultado.arquivos[0].papel, "financeiroHistorico");
	assert.equal(resultado.arquivos[0].competencia, "2026-02");
	assert.equal(resultado.dados.financeiroHistorico.length, 1);
});

test("pasta percorre subpastas e não descarta JSON desconhecido ou inválido", () => {
	const pasta = path.join(TMP, "fontes-nested");
	fs.mkdirSync(path.join(pasta, "sub"), { recursive: true });
	fs.writeFileSync(path.join(pasta, "01_categorias.json"), JSON.stringify([{ chave_externa: "CAT-FOLDER", nome: "Pasta" }]));
	fs.writeFileSync(path.join(pasta, "sub", "00_manifesto.json"), "{}");
	fs.writeFileSync(path.join(pasta, "sub", "98_documentacao.json"), "{}");

	const entradas = carregarArquivosJsonImportacao({ tipo: "folder", caminho: pasta });
	const resultado = normalizarArquivosImportacao(entradas);
	assert.equal(resultado.dados.categorias.length, 1);
	assert.ok(resultado.errosFonte.some((item) => item.arquivo === "sub/98_documentacao.json"));

	fs.writeFileSync(path.join(pasta, "sub", "99_pendencias.json"), "{ inválido");
	assert.throws(
		() => normalizarArquivosImportacao(carregarArquivosJsonImportacao({ tipo: "folder", caminho: pasta })),
		/sub\/99_pendencias\.json/,
	);
});

test("financeiro sem competência, competência duplicada e papel ambíguo bloqueiam a fonte", () => {
	const semCompetencia = normalizarArquivosImportacao([{
		arquivo: "05_financeiro_historico.json",
		conteudo: [{ chave_externa: "FIN-SEM-MES", tipo: "pagar", descricao: "Sem data", valor: 1 }],
	}]);
	assert.match(semCompetencia.errosFonte[0].motivo, /competência financeira ausente/);

	const janeiro = criarModeloMensal("2026-01");
	const duplicado = normalizarArquivosImportacao([
		entradaFinanceira("2026-01", janeiro),
		{ arquivo: "financeiro_historico_2026-01.json", conteudo: janeiro },
	]);
	assert.ok(duplicado.errosFonte.some((item) => /competência duplicada/.test(item.motivo)));

	const papelAmbiguo = normalizarArquivosImportacao([{
		arquivo: "lancamentos.json",
		conteudo: [{ chave_externa: "FIN-AMB", tipo: "pagar", descricao: "Ambíguo", valor: 1 }],
	}]);
	assert.ok(papelAmbiguo.errosFonte.some((item) => /nome não corresponde/.test(item.motivo)));
});

test("venda legada ganha chave determinística e segue sem débito do estoque atual", async () => {
	const arquivo = "07_vendas_historicas.json";
	const linha = { sku: "SKU-LEGADA", quantidade: 2, valorUnitario: 15, data: "2026-03-10" };
	const primeira = normalizarArquivosImportacao([{ arquivo, conteudo: [linha] }]);
	const segunda = normalizarArquivosImportacao([{ arquivo, conteudo: [linha] }]);
	assert.equal(primeira.dados.vendasHistoricas.length, 0);
	assert.equal(primeira.dados.vendasFinanceiroHistorico.length, 1);
	assert.equal(primeira.dados.vendasFinanceiroHistorico[0].chave_externa, segunda.dados.vendasFinanceiroHistorico[0].chave_externa);

	const resultado = await executarImportacaoLojHouse([{ arquivo, conteudo: [linha] }], null, { dryRun: false });
	assert.equal(resultado.importadas.vendasHistoricas, 1);
	assert.equal((await getAsync("SELECT COUNT(*) AS n FROM ItensVenda")).n, 0);
	assert.equal((await getAsync("SELECT COUNT(*) AS n FROM Vendas WHERE origem = 'importacao_financeiro_historico'")).n, 1);
	const retry = await executarImportacaoLojHouse([{ arquivo, conteudo: [linha] }], null, { dryRun: false });
	assert.equal(retry.importadas.vendasHistoricas, 0);
	assert.equal(retry.ignoradas, 1);
});

test("janeiro e março passam pelo mesmo lote sem conflito e o checksum bloqueia fonte alterada", async () => {
	const janeiro = await executarImportacaoLojHouse([entradaFinanceira("2026-01")], null, { dryRun: false });
	const marco = await executarImportacaoLojHouse([entradaFinanceira("2026-03")], null, { dryRun: false });
	const retryMarco = await executarImportacaoLojHouse([entradaFinanceira("2026-03")], null, { dryRun: false });
	assert.equal(janeiro.erros.length, 0);
	assert.equal(marco.erros.length, 0);
	assert.equal(retryMarco.importadas.vendasHistoricas, 0);
	assert.equal(retryMarco.importadas.lancamentos, 0);
	assert.ok(retryMarco.ignoradas >= 2);
	assert.equal((await getAsync("SELECT COUNT(*) AS n FROM Vendas WHERE origem = 'importacao_financeiro_historico'")).n, 3);
	assert.equal((await getAsync("SELECT COUNT(*) AS n FROM LancamentosFinanceiros WHERE origem = 'importacao_financeiro_historico'")).n, 2);

	const { registrar } = require("../ipc/importacoes");
	const handlers = {};
	registrar({ handle(nome, handler) { handlers[nome] = handler; } }, {
		exigirSessao() {},
		getSessao() { return { id: null }; },
		getMainWindow() { return null; },
		log() {},
	});
	const fonte = path.join(TMP, "01_categorias_validado.json");
	fs.writeFileSync(fonte, JSON.stringify([{ chave_externa: "CAT-CHECK", nome: "Checksum" }]));
	const validacao = await handlers["importacoes:validar-json"]({}, { selecao: "files", caminhos: [fonte] });
	assert.equal(validacao.formato, "json");
	const origem = { ...validacao.origem, checksum: validacao.checksum };
	const previa = await handlers["importacoes:executar"]({}, origem, { dryRun: true });
	assert.equal(previa.preview.categorias, 1);
	fs.writeFileSync(fonte, JSON.stringify([{ chave_externa: "CAT-CHECK", nome: "Checksum alterado" }]));
	const alterado = await handlers["importacoes:executar"]({}, origem, { dryRun: true });
	assert.match(alterado.erro, /mudou desde a prévia/);
});

test("competência fora do formato YYYY-MM é rejeitada pelo modelo revisado", () => {
	const modelo = criarModeloMensal("2026-03");
	modelo.competencia = "2026-13";
	assert.throws(() => require("../db/excel-loja-house").validarModeloFinanceiroMensal(modelo), /competência/);
});
