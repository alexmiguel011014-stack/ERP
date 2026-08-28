/* Popula o banco REAL (o mesmo que o app usa, não um temporário) com dados
   fictícios pra testar a navegação/telas do ERP com algo além de "vazio".
   Nomes de clientes/fornecedores são claramente fictícios (sufixo "(Teste)",
   e-mails @teste.exemplo) pra nunca serem confundidos com dados reais.

   Uso: node scripts/seed-dados-teste.js "SENHA_DO_BANCO"

   Precisa que o Electron esteja FECHADO enquanto roda (dois processos não
   devem escrever no mesmo arquivo SQLCipher ao mesmo tempo). */
const path = require("path");
const db = require("../database");

function caminhoUserDataReal() {
	// Mesma resolução que main.js faz via app.getPath("userData") — nome da
	// pasta é "erp" (o campo "name" minúsculo do package.json, não o
	// productName "ALLU ERP").
	const base =
		process.env.APPDATA ||
		path.join(require("os").homedir(), "AppData", "Roaming");
	return path.join(base, "erp");
}

async function main() {
	const senha = process.argv[2];
	if (!senha) {
		console.error('Uso: node scripts/seed-dados-teste.js "SENHA_DO_BANCO"');
		process.exit(1);
	}

	const userData = caminhoUserDataReal();
	db.setDBPath(userData);
	console.log("Banco alvo:", db.getDBPath());

	await db.desbloquearBanco(senha);
	console.log("Banco desbloqueado.\n");

	const resumo = {
		categorias: 0,
		produtos: 0,
		clientes: 0,
		fornecedores: 0,
		lancamentos: 0,
	};

	console.log("== Categorias ==");
	const categoriasBase = [
		{ nome: "Kimonos", subs: ["A0", "A1", "A2", "A3"] },
		{ nome: "Faixas", subs: ["Adulto", "Infantil"] },
		{ nome: "Acessórios", subs: ["Proteção"] },
		{ nome: "Suplementos", subs: [] },
	];
	const idsCategoria = {}; // nome -> id (pai) ou id (sub, chave "Pai/Sub")
	for (const c of categoriasBase) {
		const pai = await db.salvarCategoria(c.nome, null);
		idsCategoria[c.nome] = pai.id;
		resumo.categorias++;
		console.log("  + " + c.nome);
		for (const sub of c.subs) {
			const criada = await db.salvarCategoria(sub, pai.id);
			idsCategoria[c.nome + "/" + sub] = criada.id;
			resumo.categorias++;
			console.log("    + " + sub);
		}
	}

	console.log("\n== Produtos ==");
	const produtos = [
		{
			nome: "Kimono Trançado Reforçado",
			cat: "Kimonos/A1",
			preco: 420,
			custo: 210,
			estoque: 12,
		},
		{
			nome: "Kimono Trançado Reforçado",
			cat: "Kimonos/A2",
			preco: 440,
			custo: 220,
			estoque: 8,
		},
		{
			nome: "Kimono Ouro Premium",
			cat: "Kimonos/A2",
			preco: 690,
			custo: 350,
			estoque: 5,
		},
		{
			nome: "Kimono Infantil Trançado",
			cat: "Kimonos/A0",
			preco: 320,
			custo: 160,
			estoque: 10,
		},
		{
			nome: "Faixa Branca 4mm",
			cat: "Faixas/Adulto",
			preco: 45,
			custo: 18,
			estoque: 30,
		},
		{
			nome: "Faixa Azul 4mm",
			cat: "Faixas/Adulto",
			preco: 45,
			custo: 18,
			estoque: 22,
		},
		{
			nome: "Faixa Roxa 4mm",
			cat: "Faixas/Adulto",
			preco: 48,
			custo: 20,
			estoque: 14,
		},
		{
			nome: "Faixa Marrom 4mm",
			cat: "Faixas/Adulto",
			preco: 48,
			custo: 20,
			estoque: 9,
		},
		{
			nome: "Faixa Preta 4mm",
			cat: "Faixas/Adulto",
			preco: 65,
			custo: 30,
			estoque: 4,
		},
		{
			nome: "Rashguard Manga Longa",
			cat: "Acessórios/Proteção",
			preco: 120,
			custo: 55,
			estoque: 18,
		},
		{
			nome: "Protetor Bucal Simples",
			cat: "Acessórios/Proteção",
			preco: 25,
			custo: 8,
			estoque: 40,
		},
		{
			nome: "Whey Protein 900g",
			cat: "Suplementos",
			preco: 180,
			custo: 95,
			estoque: 2,
		},
	];
	for (const p of produtos) {
		const sku = await db.getProximoSkuProduto();
		const categoriaId = idsCategoria[p.cat];
		const payload = {
			nome: p.nome,
			categoria: null,
			categoria_id: null,
			subcategoria_id: null,
			categoriasSelecionadas: categoriaId ? [categoriaId] : [],
			variacoes: [
				{
					sku,
					preco: p.preco,
					preco_custo: p.custo,
					quantidade_estoque: p.estoque,
					atributos: [{ chave: "Unidade", valor: "Padrão" }],
				},
			],
		};
		await db.salvarProduto(payload, payload.variacoes);
		resumo.produtos++;
		console.log("  + " + sku + " " + p.nome + " (estoque " + p.estoque + ")");
	}

	console.log("\n== Clientes ==");
	const clientes = [
		{
			nome: "Ana Teste Ferreira",
			academia: "Equipe Leão Branco",
			faixa: "Azul",
			telefone: "(11) 90000-0001",
			email: "ana.teste@teste.exemplo",
		},
		{
			nome: "Bruno Exemplo Alves",
			academia: "Equipe Leão Branco",
			faixa: "Roxa",
			telefone: "(11) 90000-0002",
			email: "bruno.exemplo@teste.exemplo",
		},
		{
			nome: "Carla Teste Nunes",
			academia: "Gracie Barra Modelo",
			faixa: "Branca",
			telefone: "(11) 90000-0003",
			email: "carla.teste@teste.exemplo",
		},
		{
			nome: "Diego Exemplo Souza",
			academia: "Gracie Barra Modelo",
			faixa: "Marrom",
			telefone: "(11) 90000-0004",
			email: "diego.exemplo@teste.exemplo",
		},
		{
			nome: "Erika Teste Lima",
			academia: "Equipe Leão Branco",
			faixa: "Preta",
			telefone: "(11) 90000-0005",
			email: "erika.teste@teste.exemplo",
		},
		{
			nome: "Felipe Exemplo Rocha",
			academia: "Checkmat Modelo",
			faixa: "Branca",
			telefone: "(11) 90000-0006",
			email: "felipe.exemplo@teste.exemplo",
		},
	];
	for (const c of clientes) {
		const codigo = await db.getProximoCodigoCliente();
		await db.salvarCliente({ ...c, codigo });
		resumo.clientes++;
		console.log("  + " + codigo + " " + c.nome);
	}

	console.log("\n== Fornecedores ==");
	const fornecedores = [
		{
			nome: "Distribuidora Kimono Sul (Teste)",
			cnpj: "00.000.000/0001-00",
			telefone: "(11) 3000-0001",
			email: "contato@kimonosul.teste.exemplo",
			contato: "Marcos Teste",
			prazo_pagamento_dias: 30,
		},
		{
			nome: "Faixas & Cia (Teste)",
			cnpj: "00.000.000/0002-00",
			telefone: "(11) 3000-0002",
			email: "vendas@faixasecia.teste.exemplo",
			contato: "Patrícia Teste",
			prazo_pagamento_dias: 15,
		},
		{
			nome: "Suplementos Norte (Teste)",
			cnpj: "00.000.000/0003-00",
			telefone: "(11) 3000-0003",
			email: "comercial@suplementosnorte.teste.exemplo",
			contato: "Renato Teste",
			prazo_pagamento_dias: 45,
		},
	];
	for (const f of fornecedores) {
		await db.salvarFornecedor(f);
		resumo.fornecedores++;
		console.log("  + " + f.nome);
	}

	console.log("\n== Financeiro ==");
	const hoje = new Date();
	function daqui(dias) {
		const d = new Date(hoje);
		d.setDate(d.getDate() + dias);
		return d.toISOString();
	}
	const lancamentos = [
		{
			tipo: "receber",
			descricao: "Mensalidade academia - lote teste",
			valor: 1450,
			data_vencimento: daqui(5),
		},
		{
			tipo: "receber",
			descricao: "Venda kimono a prazo (Teste)",
			valor: 420,
			data_vencimento: daqui(10),
		},
		{
			tipo: "pagar",
			descricao: "Fornecedor Distribuidora Kimono Sul (Teste)",
			valor: 2200,
			data_vencimento: daqui(7),
		},
		{
			tipo: "pagar",
			descricao: "Aluguel do espaço (lançamento teste)",
			valor: 1800,
			data_vencimento: daqui(3),
		},
	];
	for (const l of lancamentos) {
		await db.criarLancamento(l);
		resumo.lancamentos++;
		console.log("  + [" + l.tipo + "] " + l.descricao);
	}

	await db.bloquearBanco();
	console.log("\n================================");
	console.log("Resumo:", JSON.stringify(resumo));
	console.log("Banco fechado. Pode reabrir o app normalmente.");
}

main().catch((e) => {
	console.error("\nERRO:", e && e.stack ? e.stack : e);
	process.exit(1);
});
