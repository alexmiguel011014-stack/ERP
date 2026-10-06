const { runOn } = require("./conexao");

// "Última modificação" de Produtos e Categorias (GOALS 30). As datas são
// carimbadas por TRIGGERS do SQLite, não por cada UPDATE espalhado pelo
// código (produtos, precificação, importação, imagens...): um ponto só, que
// cobre inclusive escritas futuras.
//
// Formato: UTC ISO-8601 com ms e "Z" — a mesma forma de LogAtividades.data —
// então comparar como texto já ordena certo.
const AGORA = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

// Triggers com `WHEN NEW.atualizado_em IS OLD.atualizado_em`: só carimba
// quando a própria instrução não definiu a data (o carimbo interno e o
// backfill definem, então não reentram) e sem lista de colunas pra manter.
// NÃO ligar `recursive_triggers`.
const TRIGGERS = [
	`CREATE TRIGGER IF NOT EXISTS trg_produtos_datas_insert
     AFTER INSERT ON Produtos WHEN NEW.criado_em IS NULL
     BEGIN
       UPDATE Produtos SET criado_em = ${AGORA}, atualizado_em = ${AGORA}
       WHERE id = NEW.id;
     END`,
	`CREATE TRIGGER IF NOT EXISTS trg_produtos_datas_update
     AFTER UPDATE ON Produtos WHEN NEW.atualizado_em IS OLD.atualizado_em
     BEGIN
       UPDATE Produtos SET atualizado_em = ${AGORA} WHERE id = NEW.id;
     END`,

	// Variações: identidade/preço/custo/estoque mínimo contam como modificação
	// do produto; venda, devolução, consignação, ajuste manual e entrada de
	// estoque NÃO. A entrada altera quantidade_estoque junto com preco_custo
	// (custo médio) no mesmo UPDATE — o WHEN abaixo a deixa de fora.
	`CREATE TRIGGER IF NOT EXISTS trg_variacoes_datas_insert
     AFTER INSERT ON Variacoes
     BEGIN
       UPDATE Produtos SET atualizado_em = ${AGORA} WHERE id = NEW.produto_id;
     END`,
	`CREATE TRIGGER IF NOT EXISTS trg_variacoes_datas_delete
     AFTER DELETE ON Variacoes
     BEGIN
       UPDATE Produtos SET atualizado_em = ${AGORA} WHERE id = OLD.produto_id;
     END`,
	`CREATE TRIGGER IF NOT EXISTS trg_variacoes_datas_update
     AFTER UPDATE OF sku, codigo_barras, tamanho, cor, preco, preco_custo,
                     atributos, estoque_minimo ON Variacoes
     WHEN NEW.quantidade_estoque IS OLD.quantidade_estoque
     BEGIN
       UPDATE Produtos SET atualizado_em = ${AGORA} WHERE id = NEW.produto_id;
     END`,

	`CREATE TRIGGER IF NOT EXISTS trg_produtocategorias_datas_insert
     AFTER INSERT ON ProdutoCategorias
     BEGIN
       UPDATE Produtos SET atualizado_em = ${AGORA} WHERE id = NEW.produto_id;
     END`,
	`CREATE TRIGGER IF NOT EXISTS trg_produtocategorias_datas_delete
     AFTER DELETE ON ProdutoCategorias
     BEGIN
       UPDATE Produtos SET atualizado_em = ${AGORA} WHERE id = OLD.produto_id;
     END`,

	`CREATE TRIGGER IF NOT EXISTS trg_categorias_datas_insert
     AFTER INSERT ON Categorias WHEN NEW.criado_em IS NULL
     BEGIN
       UPDATE Categorias SET criado_em = ${AGORA}, atualizado_em = ${AGORA}
       WHERE id = NEW.id;
     END`,
	`CREATE TRIGGER IF NOT EXISTS trg_categorias_datas_update
     AFTER UPDATE ON Categorias WHEN NEW.atualizado_em IS OLD.atualizado_em
     BEGIN
       UPDATE Categorias SET atualizado_em = ${AGORA} WHERE id = NEW.id;
     END`,
];

function colunasDaTabelaOn(conn, tabela) {
	return new Promise((resolver, rejeitar) => {
		conn.all("PRAGMA table_info(" + tabela + ")", [], (erro, linhas) => {
			if (erro) return rejeitar(erro);
			resolver(linhas.map((l) => l.name));
		});
	});
}

// Backfill só com evidência real: o log de atividades registra criar/editar/
// excluir/imagem de cada produto (ipc/produtos.js). Linha sem nenhum registro
// no log fica NULL (= "desconhecido"; a tela mostra "—") — nunca inventamos
// data. Categorias não têm log, então não há backfill pra elas. O
// `WHERE EXISTS` também garante que o UPDATE sempre troca atualizado_em de
// NULL para um valor, nunca disparando o trigger de carimbo "agora".
async function preencherDatasProdutosDoLog(conn) {
	await runOn(
		conn,
		`UPDATE Produtos
       SET criado_em = COALESCE(criado_em, (
             SELECT MIN(l.data) FROM LogAtividades l
             WHERE l.entidade = 'Produtos' AND l.entidade_id = Produtos.id
               AND l.acao = 'criar-produto')),
           atualizado_em = (
             SELECT MAX(l.data) FROM LogAtividades l
             WHERE l.entidade = 'Produtos' AND l.entidade_id = Produtos.id)
     WHERE atualizado_em IS NULL
       AND EXISTS (
         SELECT 1 FROM LogAtividades l
         WHERE l.entidade = 'Produtos' AND l.entidade_id = Produtos.id)`,
	);
}

// Colunas + backfill + triggers, tudo numa transação (DDL do SQLite é
// transacional): se algo falhar no meio, nada fica meio-migrado. Deve rodar
// DEPOIS de migrarImagensLegadas() em iniciarBanco — essa migração reescreve
// Produtos.imagem_id no boot, e com os triggers já criados todo produto com
// imagem legada seria carimbado como "modificado agora".
async function migrarDatasModificacao(conn) {
	const produtosJaTinhaData = (await colunasDaTabelaOn(conn, "Produtos")).includes(
		"atualizado_em",
	);

	await runOn(conn, "BEGIN");
	try {
		for (const tabela of ["Produtos", "Categorias"]) {
			const existentes = await colunasDaTabelaOn(conn, tabela);
			for (const coluna of ["criado_em", "atualizado_em"]) {
				if (!existentes.includes(coluna)) {
					// SQLite recusa ADD COLUMN com DEFAULT não-constante: coluna
					// nullable, carimbada pelos triggers.
					await runOn(conn, `ALTER TABLE ${tabela} ADD COLUMN ${coluna} TEXT`);
				}
			}
		}
		if (!produtosJaTinhaData) await preencherDatasProdutosDoLog(conn);
		for (const sql of TRIGGERS) await runOn(conn, sql);
		await runOn(conn, "COMMIT");
	} catch (erro) {
		try {
			await runOn(conn, "ROLLBACK");
		} catch {
			/* sem transação ativa — nada a desfazer */
		}
		throw erro;
	}
}

module.exports = {
	migrarDatasModificacao,
	preencherDatasProdutosDoLog,
	TRIGGERS,
};
