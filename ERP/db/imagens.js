const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const { runAsync, getAsync, allAsync } = require("./conexao");

const EXTENSOES_PERMITIDAS = [".png", ".jpg", ".jpeg", ".webp"];
const MIME_POR_EXTENSAO = {
	".png": "png",
	".jpg": "jpeg",
	".jpeg": "jpeg",
	".webp": "webp",
};

function validarExtensao(caminho) {
	const ext = path.extname(caminho).toLowerCase();
	if (!EXTENSOES_PERMITIDAS.includes(ext)) {
		throw new Error("Formato de imagem não suportado. Use PNG, JPG ou WEBP.");
	}
	return ext;
}

// Grava (ou substitui, via UNIQUE(entidade_tipo, entidade_id)) os bytes da
// imagem de uma entidade dentro do próprio erp.sqlite — não em disco. Genérico
// de propósito: qualquer feature futura (foto de cliente, logo de fornecedor,
// comprovante de pagamento) reaproveita isto passando outro entidadeTipo, sem
// migração de schema nova.
async function salvarImagem(entidadeTipo, entidadeId, caminhoOrigem) {
	if (!caminhoOrigem || !fs.existsSync(caminhoOrigem)) {
		throw new Error("Arquivo de imagem não encontrado.");
	}
	const ext = validarExtensao(caminhoOrigem);
	const dados = fs.readFileSync(caminhoOrigem);
	const mimetype = MIME_POR_EXTENSAO[ext];
	const nomeOriginal = path.basename(caminhoOrigem);

	const existente = await getAsync(
		"SELECT id FROM Imagens WHERE entidade_tipo = ? AND entidade_id = ?",
		[entidadeTipo, entidadeId],
	);

	if (existente) {
		await runAsync(
			`UPDATE Imagens SET dados = ?, mimetype = ?, tamanho_bytes = ?, nome_original = ?,
			 atualizado_em = datetime('now') WHERE id = ?`,
			[dados, mimetype, dados.length, nomeOriginal, existente.id],
		);
		return { success: true, id: existente.id };
	}

	const resultado = await runAsync(
		`INSERT INTO Imagens (entidade_tipo, entidade_id, dados, mimetype, tamanho_bytes, nome_original)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		[entidadeTipo, entidadeId, dados, mimetype, dados.length, nomeOriginal],
	);
	return { success: true, id: resultado.lastID };
}

// Referências para a entidade (ex.: Produtos.imagem_id) usam
// `ON DELETE SET NULL` — remover aqui já limpa sozinho quem apontava pra cá,
// sem precisar de UPDATE manual em cada tabela dona.
async function removerImagem(entidadeTipo, entidadeId) {
	await runAsync(
		"DELETE FROM Imagens WHERE entidade_tipo = ? AND entidade_id = ?",
		[entidadeTipo, entidadeId],
	);
	return { success: true };
}

async function excluirImagemPorId(id) {
	const resultado = await runAsync("DELETE FROM Imagens WHERE id = ?", [
		Number(id),
	]);
	if (resultado.changes === 0) throw new Error("Imagem não encontrada.");
	return { success: true };
}

async function excluirImagensEmLote(ids) {
	let removidas = 0;
	for (const id of ids || []) {
		await excluirImagemPorId(id);
		removidas++;
	}
	return { success: true, removidas };
}

async function obterImagemPorEntidade(entidadeTipo, entidadeId) {
	const linha = await getAsync(
		"SELECT id, dados, mimetype FROM Imagens WHERE entidade_tipo = ? AND entidade_id = ?",
		[entidadeTipo, entidadeId],
	);
	return linha || null;
}

async function obterImagemPorId(id) {
	if (!id) return null;
	const linha = await getAsync(
		"SELECT id, dados, mimetype FROM Imagens WHERE id = ?",
		[Number(id)],
	);
	return linha || null;
}

// Metadados apenas (nunca o BLOB) — usado pela tela de administração pra
// montar o grid sem decodificar toda imagem só pra listar.
async function listarImagens({
	entidadeTipo = null,
	pagina = 1,
	limite = 50,
} = {}) {
	const paginaSegura = Math.max(1, Number(pagina) || 1);
	const offset = (paginaSegura - 1) * limite;
	const linhas = await allAsync(
		`SELECT i.id, i.entidade_tipo, i.entidade_id, i.mimetype, i.tamanho_bytes,
		        i.nome_original, i.criado_em, i.atualizado_em,
		        CASE WHEN i.entidade_tipo = 'produto' THEN p.nome ELSE NULL END AS entidade_nome
		 FROM Imagens i
		 LEFT JOIN Produtos p ON p.id = i.entidade_id AND i.entidade_tipo = 'produto'
		 WHERE (? IS NULL OR i.entidade_tipo = ?)
		 ORDER BY i.atualizado_em DESC
		 LIMIT ? OFFSET ?`,
		[entidadeTipo, entidadeTipo, limite, offset],
	);
	const total = await getAsync(
		"SELECT COUNT(*) AS n FROM Imagens WHERE (? IS NULL OR entidade_tipo = ?)",
		[entidadeTipo, entidadeTipo],
	);
	return { linhas, total: total.n, pagina: paginaSegura, limite };
}

// Imagens cuja entidade dona não existe mais — hoje só cobre 'produto'
// (a única entidade suportada); um novo entidade_tipo futuro soma outro
// LEFT JOIN aqui, não uma reestruturação.
async function listarImagensOrfas() {
	return allAsync(
		`SELECT i.id, i.entidade_tipo, i.entidade_id, i.mimetype, i.tamanho_bytes,
		        i.nome_original, i.criado_em
		 FROM Imagens i
		 LEFT JOIN Produtos p ON p.id = i.entidade_id AND i.entidade_tipo = 'produto'
		 WHERE i.entidade_tipo = 'produto' AND p.id IS NULL`,
	);
}

// `require("electron")` fora de um processo Electron de verdade (ex.: `node
// --test`) devolve só uma string (o caminho do binário), não o módulo com
// `app` — `app.getPath` explodiria. `iniciarBanco()` roda em todo teste que
// desbloqueia um banco, então esta função precisa tolerar esse contexto, não
// só o de produção. `ERP_TEST_USERDATA_DIR` é a mesma env var que main.js já
// usa pra isolar o userData dos testes e2e (ver main.js) — reaproveitada
// aqui pra deixar a migração de verdade testável fora do Electron também
// (scripts/test-imagens.js), sem inventar um segundo mecanismo de override.
function pastaImagensProdutosLegado() {
	if (app && typeof app.getPath === "function") {
		return path.join(app.getPath("userData"), "produto-imagens");
	}
	if (process.env.ERP_TEST_USERDATA_DIR) {
		return path.join(process.env.ERP_TEST_USERDATA_DIR, "produto-imagens");
	}
	return null;
}

// Migração única e idempotente: lê cada arquivo ainda existente em
// produto-imagens/ pro novo Imagens (BLOB), preenche Produtos.imagem_id, e só
// então renomeia a pasta antiga (nunca apaga) — se algo der errado no meio, o
// pior caso é rodar de novo, não perder dado. Chamada por db/schema.js depois
// que a tabela Imagens e a coluna Produtos.imagem_id já existem.
async function migrarImagensLegadas() {
	const dir = pastaImagensProdutosLegado();
	if (!dir || !fs.existsSync(dir))
		return { migradas: 0, erros: 0, jaMigrado: true };

	const produtos = await allAsync(
		"SELECT id, imagem FROM Produtos WHERE imagem IS NOT NULL AND imagem_id IS NULL",
	);

	let migradas = 0;
	let erros = 0;
	for (const produto of produtos) {
		const caminho = path.join(dir, produto.imagem);
		if (!fs.existsSync(caminho)) {
			erros++;
			continue;
		}
		try {
			const resultado = await salvarImagem("produto", produto.id, caminho);
			await runAsync("UPDATE Produtos SET imagem_id = ? WHERE id = ?", [
				resultado.id,
				produto.id,
			]);
			migradas++;
		} catch {
			erros++;
		}
	}

	if (erros === 0) {
		try {
			fs.renameSync(dir, dir + ".migrado-" + Date.now());
		} catch {
			// Renomear é best-effort: a migração dos dados em si já terminou
			// com sucesso acima, um erro só aqui não deve preocupar o dono.
		}
	}

	return { migradas, erros };
}

module.exports = {
	salvarImagem,
	removerImagem,
	excluirImagemPorId,
	excluirImagensEmLote,
	obterImagemPorEntidade,
	obterImagemPorId,
	listarImagens,
	listarImagensOrfas,
	migrarImagensLegadas,
	pastaImagensProdutosLegado,
};
