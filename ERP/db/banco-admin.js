const path = require("path");
const {
	getConexao,
	runAsync,
	allAsync,
	getAsync,
	getDBPath,
} = require("./conexao");
const { colunasDaTabela } = require("./schema");
const { verificarHashSenha, hashSenhaUsuario } = require("./usuarios");

const TABELAS_VISIVEIS = null;

async function listarTabelasBanco() {
	const conn = getConexao();
	return new Promise((resolver, rejeitar) => {
		conn.all(
			"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
			[],
			(erro, linhas) => {
				if (erro) return rejeitar(erro.message);
				resolver((linhas || []).map((l) => l.name));
			},
		);
	});
}

// Visão geral: todas as tabelas (já cadastradas e as que forem criadas no
// futuro, já que a lista vem de sqlite_master) com a contagem de registros.
async function resumoTabelasBanco() {
	const tabelas = await listarTabelasBanco();
	const resumo = [];
	for (const tabela of tabelas) {
		const linha = await getAsync("SELECT COUNT(*) AS n FROM " + tabela, []);
		resumo.push({ tabela, total: Number(linha.n) });
	}
	return resumo;
}

// Exporta o conteúdo completo do banco (todas as tabelas, sem limite de
// linhas) para um arquivo JSON legível, para backup/auditoria fora do app.
async function exportarBancoJSON() {
	const fs = require("fs");
	const tabelas = await listarTabelasBanco();
	const dados = {};
	let totalRegistros = 0;
	for (const tabela of tabelas) {
		const linhas = await allAsync("SELECT * FROM " + tabela, []);
		dados[tabela] = linhas;
		totalRegistros += linhas.length;
	}

	const dbDir = path.dirname(getDBPath());
	const exportDir = path.join(dbDir, "exports");
	if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

	const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
	const destino = path.join(exportDir, "banco_export_" + carimbo + ".json");
	fs.writeFileSync(
		destino,
		JSON.stringify(
			{ exportadoEm: new Date().toISOString(), tabelas: dados },
			null,
			2,
		),
		"utf8",
	);

	return {
		caminho: destino,
		tabelas: tabelas.length,
		registros: totalRegistros,
	};
}

async function consultarTabelaBanco(tabela, limite) {
	const nome = String(tabela || "").replace(/[^A-Za-z0-9_]/g, "");
	if (!nome) throw new Error("Tabela inválida.");
	const tabelas = await listarTabelasBanco();
	if (tabelas.indexOf(nome) === -1) {
		throw new Error("Tabela não existe: " + nome);
	}
	const limiteNum = Math.max(1, Math.min(200, Number(limite) || 50));
	const conn = getConexao();
	const [colunas, linhas, total] = await Promise.all([
		colunasDaTabela(conn, nome),
		allAsync("SELECT * FROM " + nome + " LIMIT " + limiteNum, []),
		getAsync("SELECT COUNT(*) AS n FROM " + nome, []),
	]);
	return {
		tabela: nome,
		colunas,
		linhas,
		total: Number(total.n),
		limite: limiteNum,
	};
}

async function verificarSenhaAdmin(login, senha) {
	const l = String(login || "")
		.trim()
		.toLowerCase();
	const s = String(senha || "");
	const usr = await getAsync(
		"SELECT id, senha_hash, perfil, ativo FROM Usuarios WHERE login = ? COLLATE NOCASE",
		[l],
	);
	if (!usr || usr.perfil !== "admin" || Number(usr.ativo) !== 1) return false;

	const { ok, precisaMigrar } = verificarHashSenha(l, s, usr.senha_hash);
	if (ok && precisaMigrar) {
		try {
			await runAsync("UPDATE Usuarios SET senha_hash = ? WHERE id = ?", [
				hashSenhaUsuario(s),
				usr.id,
			]);
		} catch (e) {
			/* login já validado; falha ao migrar o hash não deve bloquear o acesso */
		}
	}
	return ok;
}

/* ============ Log de atividades (auditoria) ============ */

// Nunca deve derrubar a ação real por causa de uma falha de log — quem chama
// isso já está dentro de um try/catch da ação principal, então erros aqui
// são engolidos silenciosamente (loga no console do processo principal).
async function registrarLog(
	usuarioId,
	usuarioLogin,
	acao,
	entidade,
	entidadeId,
	detalhes,
) {
	try {
		await runAsync(
			"INSERT INTO LogAtividades (usuario_id, usuario_login, acao, entidade, entidade_id, detalhes, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
			[
				usuarioId || null,
				usuarioLogin || null,
				acao,
				entidade || null,
				entidadeId || null,
				detalhes || null,
				new Date().toISOString(),
			],
		);
	} catch (erro) {
		console.error("Falha ao registrar log de atividade:", erro);
	}
}

async function getLogAtividades(filtro) {
	filtro = filtro || {};
	var condicoes = [];
	var params = [];
	if (filtro.usuarioId) {
		condicoes.push("usuario_id = ?");
		params.push(Number(filtro.usuarioId));
	}
	if (filtro.acao) {
		condicoes.push("acao = ?");
		params.push(filtro.acao);
	}
	if (filtro.inicio) {
		condicoes.push("DATE(data) >= ?");
		params.push(filtro.inicio);
	}
	if (filtro.fim) {
		condicoes.push("DATE(data) <= ?");
		params.push(filtro.fim);
	}
	var where = condicoes.length ? "WHERE " + condicoes.join(" AND ") : "";
	var limite = Math.max(1, Math.min(500, Number(filtro.limite) || 200));
	return allAsync(
		"SELECT * FROM LogAtividades " +
			where +
			" ORDER BY id DESC LIMIT " +
			limite,
		params,
	);
}

module.exports = {
	listarTabelasBanco,
	resumoTabelasBanco,
	consultarTabelaBanco,
	exportarBancoJSON,
	verificarSenhaAdmin,
	registrarLog,
	getLogAtividades,
};
