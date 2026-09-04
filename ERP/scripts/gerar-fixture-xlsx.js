// Gera test/fixtures/loja-house-sintetico.xlsx: um .xlsx pequeno e
// totalmente inventado (sem nenhum dado real da Loja House) que reproduz a
// ESTRUTURA da planilha real — inclusive as excentricidades reais já
// confirmadas contra a exportação original (célula TAMANHO/Quantidade com
// coluna vazia no meio nos kimonos, título vs. descrição divergente nas
// camisas, e as 4 regiões distintas da aba Rashcojuntos) — usando os MESMOS
// nomes de aba que o parser reconhece (db/excel-loja-house.js), já que cada
// aba agora tem uma função dedicada, não mais detecção genérica.
//
// Rodar com: node scripts/gerar-fixture-xlsx.js
//
// Os números usados nos testes (test/excel-loja-house.test.js) foram
// calculados a partir deste layout — qualquer mudança aqui precisa
// atualizar as contagens esperadas lá também.
const path = require("path");
const XLSX = require("xlsx");

const CAMINHO_SAIDA = path.join(
	__dirname,
	"..",
	"test",
	"fixtures",
	"loja-house-sintetico.xlsx",
);

function aba(dados) {
	return XLSX.utils.aoa_to_sheet(dados);
}

function gerar() {
	const workbook = XLSX.utils.book_new();

	// "Kimono Draken": reproduz a folga de coluna real (TAMANHO,null,
	// Quantidade) — 2 blocos de estilo (Light, Dragon) + 1 bloco de acessório
	// embutido (Mochilas, CORES/Quantidade, mesma folga).
	// Light: P=5, M=3, G=0 (3 variações). Dragon: P=2 (1 variação).
	// Mochilas: Bege=1, Preta=2 (2 variações).
	XLSX.utils.book_append_sheet(
		workbook,
		aba([
			["KIMONOS ADULTOS - BRANCO LIGHT", null, null, null],
			["TAMANHO", null, "Quantidade", null],
			["P", null, 5, null],
			["M", null, 3, null],
			["G", null, 0, null],
			[null, null, null, null],
			["KIMONOS KIDS - PRETO DRAGON", null, null, null],
			["TAMANHO", null, "Quantidade", null],
			["P", null, 2, null],
			[null, null, null, null],
			["Mochilas", null, null, null],
			["CORES", null, "Quantidade", null],
			["Bege", null, 1, null],
			["Preta", null, 2, null],
		]),
		"Kimono Draken",
	);

	// "Camisas": mesmo padrão real onde o MESMO produto (título normalizado)
	// aparece em blocos separados (cores/lotes diferentes) e precisa ser
	// mesclado, não duplicado — "Camisas Over - Teste" aparece 2x (2+2
	// variações = 4 no total) e "Camisas Over - Solo" 1x (1 variação). A
	// segunda linha do 2º bloco de "Teste" repete tamanho+cor da 1ª
	// ocorrência de propósito, pra exercitar a pendência de duplicata.
	XLSX.utils.book_append_sheet(
		workbook,
		aba([
			[
				"Camisas Over - Teste",
				null,
				null,
				null,
				null,
				"Camisas Over - Solo",
				null,
				null,
				null,
			],
			[
				"TAMANHO",
				"DESCRIÇÃO",
				"COR",
				"Quantidade",
				null,
				"TAMANHO",
				"DESCRIÇÃO",
				"COR",
				"Quantidade",
			],
			["P", "ADULTO", "Preta", 2, null, "M", "ADULTO", "Branca", 1],
			["M", "ADULTO", "Preta", 1, null, null, null, null, null],
			[null, null, null, null, null, null, null, null, null],
			[null, null, null, null, null, null, null, null, null],
			["Camisas Over - TESTE", null, null, null],
			["TAMANHO", "DESCRIÇÃO", "COR", "Quantidade"],
			["G", "ADULTO", "Preta", 3],
			["P", "ADULTO", "Preta", 9], // duplicata proposital (mesmo tam+cor do 1º bloco)
		]),
		"Camisas",
	);

	// "Coleção House": mesma categoria "Camisas", produto próprio.
	XLSX.utils.book_append_sheet(
		workbook,
		aba([
			["Camisas Extra", null, null, null],
			["TAMANHO", "DESCRIÇÃO", "COR", "Quantidade"],
			["M", "ADULTO", "Cinza", 4],
		]),
		"Coleção House",
	);

	// "Estoque faixa": layout único (COR/Modalidade/Tamanho/Quantidade) — vira
	// estoque do produto único "Faixa" (categoria "Faixas"), não um produto
	// novo. Uma linha duplicada de propósito (mesma cor+tamanho).
	XLSX.utils.book_append_sheet(
		workbook,
		aba([
			["COR", "Modalidade", "Tamanho", "Quantidade"],
			["Branca", null, "M0", 4],
			["Branca", null, "M1", 3],
			["Preta", null, "A2", 1],
			["Branca", null, "M0", 99], // duplicata proposital
		]),
		"Estoque faixa",
	);

	// "Rashcojuntos": as 4 regiões distintas já mapeadas contra a exportação
	// original, em miniatura.
	XLSX.utils.book_append_sheet(
		workbook,
		aba([
			// Região A/B: "RASH NO GI - ADULTO/KIDS EQUIPE" — 4 colunas de
			// produto lado a lado (Conjunto/Shorts/Blusa Curta/Blusa Longa),
			// os dois blocos (Adulto/Kids) lado a lado NA MESMA LINHA em
			// faixas de coluna diferentes (reproduz o layout real — testa o
			// escopo de dedup por coluna, já que os dois blocos reusam o
			// mesmo rótulo de tamanho "P").
			// Adulto (col. 0-5): P=1(conjunto),null(shorts),2(blusa curta),null.
			// Kids (col. 8-13): P=1(conjunto),1(shorts),null,null.
			[
				"RASH NO GI - ADULTO EQUIPE",
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				"RASH NO GI - KIDS EQUIPE",
				null,
				null,
				null,
				null,
				null,
			],
			[
				"TAMANHO",
				"DESCRIÇÃO",
				"Conjunto",
				"Shorts",
				"Blusa Manga Curta",
				"Blusa Manga Longa",
				null,
				null,
				"TAMANHO",
				"DESCRIÇÃO",
				"Conjunto",
				"Shorts",
				"Blusa Manga Curta",
				"Blusa Manga Longa",
			],
			[
				"P",
				"ADULTO",
				1,
				null,
				2,
				null,
				null,
				null,
				"P",
				"ADULTO",
				1,
				1,
				null,
				null,
			],
			[
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
			],
			// Região C: "CONJUNTO NO GI - Brazil Combat" — col0 = "<Short|
			// Conjunto> <Cor>", col1 = tamanho, col2 = qtd.
			["CONJUNTO NO GI - Brazil Combat", null, null],
			["TAMANHO", "DESCRIÇÃO", "Quantidade"],
			["Short Azul", "G", 1],
			["Conjunto Roxo", "EG", 1],
			["Short Preto", "G", 1], // mesmo tamanho "G" do 1º Short, cor diferente
			[null, null, null],
			// Região D: "RASHGUARD - BRAZIL COMBAT" — repete 2x, cor+tamanho
			// combinados numa célula só.
			["RASHGUARD - BRAZIL COMBAT", null, null],
			["TAMANHO", "DESCRIÇÃO", "Quantidade"],
			["Azul P", null, 1],
			["Azul M", null, 0],
			[null, null, null],
			["RASHGUARD - BRAZIL COMBAT", null, null],
			["TAMANHO", "DESCRIÇÃO", "Quantidade"],
			["Roxa P", null, 1],
			[null, null, null],
			// Mini-tabela com tamanho: "CORTA VENTO".
			["CORTA VENTO", null, null],
			["TAMANHO", "DESCRIÇÃO", "Quantidade"],
			["Preto", "M", 1],
			[null, null, null],
			// Mini-tabela sem tamanho: "Protetor Bucal".
			["Protetor Bucal", null, null],
			["TAMANHO", "DESCRIÇÃO", "Quantidade"],
			["Azul", null, 0],
			["Vermelho", null, 1],
		]),
		"Rashcojuntos",
	);

	// "Valores": tabela de preço "à vista" — modelo bate com "Kimono Draken
	// Light" pelo nome do produto já normalizado pelo parser.
	XLSX.utils.book_append_sheet(
		workbook,
		aba([
			["Tabela de Preços DRAKEN", null, null, null, null, null, null],
			[
				"Modelo",
				"Marca",
				"Tamnho",
				"Quantidade",
				"Valor Compra",
				"Valor Venda",
				"Total",
			],
			[
				"Kimono Draken Light",
				"Draken",
				"P",
				3,
				"R$300,00",
				"R$558,80 à vista ou 3xR$210,90 no cartão",
				"R$1676,40",
			],
		]),
		"Valores",
	);

	// "Financeiro LojaJANEIRO": inclui "Saldo Anterior" (pulado) e uma linha
	// sem data (pulada — mesma regra confirmada contra a exportação real: uma
	// transação sem data nunca é um dado novo, é cópia de virada de mês).
	XLSX.utils.book_append_sheet(
		workbook,
		aba([
			["DATA", "DESCRIÇÃO", "ENTRADA", "SAÍDA", "TOTAL"],
			["01/01/2026", "Saldo Anterior", null, null, "1000,00"],
			["05/01/2026", "Venda balcão", "150,00", null, "1150,00"],
			["10/01/2026", "Pagamento fornecedor", null, "80,00", "1070,00"],
			[null, "Venda sem data (carryover)", "50,00", null, "1120,50"],
		]),
		"Financeiro LojaJANEIRO",
	);

	// "Crediário": Nome/Data(sempre vazia)/Valor — sem SKU, sempre pendência.
	XLSX.utils.book_append_sheet(
		workbook,
		aba([
			["Nome", "Data", "Valor"],
			["Maria Silva", null, "120,00"],
			["João Souza", null, "75,50"],
		]),
		"Crediário",
	);

	// "Contas a Pagar": uma linha sem data (vira pendência) e uma linha com
	// data (vira contas abertas de verdade).
	XLSX.utils.book_append_sheet(
		workbook,
		aba([
			["DATA", "DESCRIÇÃO", "VALOR"],
			[null, "Conta de luz", "250,00"],
			["20/02/2026", "Aluguel fevereiro", "900,00"],
		]),
		"Contas a Pagar",
	);

	// "Custos Fixos": bloco principal + bloco lateral "Investimento Loja" —
	// ambos sempre viram pendência.
	XLSX.utils.book_append_sheet(
		workbook,
		aba([
			["DATA", "DESCRIÇÃO", "VALOR", null, null, "Investimento Loja", null],
			[
				null,
				"Manutenção ar condicionado",
				"180,00",
				null,
				null,
				"Nome do item",
				"Valor",
			],
			[null, null, null, null, null, "Tinta para reforma", "300,00"],
			[null, null, null, null, null, "Cortina vitrine", "150,00"],
			[null, null, null, null, null, null, null],
		]),
		"Custos Fixos",
	);

	// "Consignado": texto livre por pessoa.
	XLSX.utils.book_append_sheet(
		workbook,
		aba([
			["Consignado", null],
			["Ana Paula", "1 conjunto kids PP, 1 Conjunto kids M"],
			["Carlos Eduardo", "2 rashguards GG"],
		]),
		"Consignado",
	);

	// "analise2025": relatório analítico, não transacional.
	XLSX.utils.book_append_sheet(
		workbook,
		aba([
			["Análise 2025 - Repasse"],
			["Total vendido: R$ 12.345,00"],
			["Lucro líquido estimado: R$ 3.200,00"],
		]),
		"analise2025",
	);

	XLSX.writeFile(workbook, CAMINHO_SAIDA);
	console.log("Fixture gerada em " + CAMINHO_SAIDA);
}

gerar();
