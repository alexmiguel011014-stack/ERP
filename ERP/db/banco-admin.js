const path = require("path");
const {
	getConexao,
	runAsync,
	allAsync,
	getAsync,
	getPastaExecutavel,
} = require("./conexao");
const { colunasDaTabela } = require("./schema");
const { verificarHashSenha, hashSenhaUsuario } = require("./usuarios");

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

// Dois dígitos com zero à esquerda (dia/mês/hora do nome da pasta abaixo).
function doisDigitos(n) {
	return String(n).padStart(2, "0");
}

// Exporta o conteúdo completo do banco (todas as tabelas, sem limite de
// linhas) para "Backup local", na pasta do executável (não userData — o dono
// quer isso visível de fora do app, do lado do .exe, não escondido dentro de
// AppData). Uma subpasta por exportação (backup-DD-MM-AAAA-HH) com um
// arquivo JSON por tabela, mais um _info.json com o resumo — mais fácil de
// abrir/conferir uma tabela específica do que vasculhar um único JSON gigante.
async function exportarBancoJSON() {
	const fs = require("fs");
	const tabelas = await listarTabelasBanco();

	const agora = new Date();
	const nomePasta =
		"backup-" +
		doisDigitos(agora.getDate()) +
		"-" +
		doisDigitos(agora.getMonth() + 1) +
		"-" +
		agora.getFullYear() +
		"-" +
		doisDigitos(agora.getHours());
	const pastaBackup = path.join(getPastaExecutavel(), "Backup local");
	const pastaExportacao = path.join(pastaBackup, nomePasta);
	fs.mkdirSync(pastaExportacao, { recursive: true });

	let totalRegistros = 0;
	for (const tabela of tabelas) {
		const linhas = await allAsync("SELECT * FROM " + tabela, []);
		totalRegistros += linhas.length;
		fs.writeFileSync(
			path.join(pastaExportacao, tabela + ".json"),
			JSON.stringify(linhas, null, 2),
			"utf8",
		);
	}

	fs.writeFileSync(
		path.join(pastaExportacao, "_info.json"),
		JSON.stringify(
			{
				exportadoEm: agora.toISOString(),
				tabelas: tabelas.length,
				registros: totalRegistros,
			},
			null,
			2,
		),
		"utf8",
	);

	return {
		caminho: pastaExportacao,
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

// Tabelas nunca esvaziáveis por aqui — Usuarios porque zerar essa tabela
// tranca todo mundo pra fora do app (inclusive quem está limpando), sem
// nenhum jeito de voltar a entrar sem mexer direto no banco por fora.
const TABELAS_PROTEGIDAS = ["Usuarios"];

// Esvazia uma tabela por completo (todas as linhas) — pensado pra corrigir
// uma migração que importou parte errada (ex.: "categoria está certo, mas
// produto não está"): limpa só a tabela problemática e reimporta, sem
// precisar apagar o banco inteiro e recomeçar do zero. Mesma validação de
// nome de tabela que consultarTabelaBanco já usa (whitelist real via
// sqlite_master, não confia em string vinda do IPC).
async function limparTabela(tabela) {
	const nome = String(tabela || "").replace(/[^A-Za-z0-9_]/g, "");
	if (!nome) throw new Error("Tabela inválida.");
	if (TABELAS_PROTEGIDAS.includes(nome)) {
		throw new Error(
			"A tabela " +
				nome +
				" não pode ser limpa por aqui (travaria o acesso ao app).",
		);
	}
	const tabelas = await listarTabelasBanco();
	if (tabelas.indexOf(nome) === -1) {
		throw new Error("Tabela não existe: " + nome);
	}
	const antes = await getAsync("SELECT COUNT(*) AS n FROM " + nome, []);
	await runAsync("DELETE FROM " + nome, []);
	return { tabela: nome, registrosRemovidos: Number(antes.n) };
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
	// "dono" tem o mesmo nível de acesso de "admin" (ver main.js#ehNivelAdmin)
	// — sem esse OR, um dono nunca passaria nesse gate extra de reautenticação.
	if (
		!usr ||
		(usr.perfil !== "admin" && usr.perfil !== "dono") ||
		Number(usr.ativo) !== 1
	)
		return false;

	const { ok, precisaMigrar } = verificarHashSenha(l, s, usr.senha_hash);
	if (ok && precisaMigrar) {
		try {
			await runAsync("UPDATE Usuarios SET senha_hash = ? WHERE id = ?", [
				hashSenhaUsuario(s),
				usr.id,
			]);
		} catch {
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
	limparTabela,
	verificarSenhaAdmin,
	registrarLog,
	getLogAtividades,
};
