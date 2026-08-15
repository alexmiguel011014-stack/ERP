const sqlite3 = require("@journeyapps/sqlcipher").verbose();
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

let DB_PATH = path.join(__dirname, "..", "erp.sqlite");

function setDBPath(basePath) {
	DB_PATH = path.join(basePath, "erp_housekimono.sqlite");
}

let db = null;
let currentKey = null;

function derivarChave(senha) {
	return crypto
		.createHash("sha256")
		.update("erp_housekimono:" + String(senha))
		.digest("hex");
}

function runOn(conn, sql, params = []) {
	return new Promise((resolver, rejeitar) => {
		conn.run(sql, params, function (erro) {
			if (erro) return rejeitar(erro);
			resolver(this);
		});
	});
}

function fecharConn(conn) {
	return new Promise((resolver) => {
		conn.close(() => resolver());
	});
}

function abrirBanco(key) {
	return new Promise((resolver, rejeitar) => {
		const dbDir = path.dirname(DB_PATH);
		if (!fs.existsSync(dbDir)) {
			fs.mkdirSync(dbDir, { recursive: true });
		}
		const conn = new sqlite3.Database(DB_PATH, (erro) => {
			if (erro) return rejeitar(erro);

			const validar = () => {
				conn.run("PRAGMA foreign_keys = ON");
				conn.get("SELECT count(*) AS n FROM sqlite_master", [], (e) => {
					if (e) {
						fecharConn(conn).then(() => rejeitar(e));
					} else {
						resolver(conn);
					}
				});
			};

			if (key) {
				conn.run("PRAGMA key = '" + key + "'", (e2) => {
					if (e2) {
						fecharConn(conn).then(() => rejeitar(e2));
					} else {
						validar();
					}
				});
			} else {
				validar();
			}
		});
	});
}

async function migrarParaCriptografado(key) {
	const tmpPath = DB_PATH + ".enc";
	try {
		const conn = await abrirBanco(null); // abre banco em texto plano
		await runOn(
			conn,
			"ATTACH DATABASE '" +
				tmpPath.replace(/'/g, "''") +
				"' AS encrypted KEY '" +
				key +
				"'",
		);
		await runOn(conn, "SELECT sqlcipher_export('encrypted')");
		await runOn(conn, "DETACH DATABASE encrypted");
		await fecharConn(conn);
		fs.copyFileSync(tmpPath, DB_PATH);
		fs.unlinkSync(tmpPath);
		console.log("Banco migrado para SQLCipher (criptografado).");
	} catch (erro) {
		if (fs.existsSync(tmpPath)) {
			try {
				fs.unlinkSync(tmpPath);
			} catch {
				/* ignora */
			}
		}
		throw erro;
	}
}

async function desbloquearBanco(senha) {
	if (db) return { success: true, jaDesbloqueado: true };

	const key = derivarChave(senha);
	try {
		db = await abrirBanco(key);
	} catch {
		// Banco pode ser plaintext (dev/testing). Tenta abrir sem chave.
		try {
			db = await abrirBanco(null);
			currentKey = null;
		} catch {
			// Tenta migrar banco antigo em texto plano
			try {
				await migrarParaCriptografado(key);
				db = await abrirBanco(key);
			} catch {
				db = null;
				throw new Error("Senha incorreta ou banco de dados ilegível.");
			}
		}
	}

	currentKey = key;
	// Require tardio (não no topo do arquivo): schema.js precisa de getConexao/runOn
	// deste módulo, e este módulo precisa de iniciarBanco() do schema.js — um require
	// de topo em qualquer um dos dois lados criaria um ciclo. Resolvendo em tempo de
	// chamada (não em tempo de carga do módulo) os dois arquivos podem se requisitar
	// mutuamente sem problema.
	await require("./schema").iniciarBanco();
	console.log("Banco de dados desbloqueado em:", DB_PATH);
	return { success: true };
}

async function bloquearBanco() {
	if (db) await fecharConn(db);
	db = null;
	currentKey = null;
}

async function trocarChave(novaSenha) {
	const conn = getConexao();
	const novaKey = derivarChave(novaSenha);
	await runOn(conn, "PRAGMA rekey = '" + novaKey + "'");
	currentKey = novaKey;
	return { success: true };
}

function isDesbloqueado() {
	return db !== null;
}

function getConexao() {
	if (!db) {
		throw new Error("Banco de dados bloqueado. Faça login para desbloquear.");
	}
	return db;
}

// Acessores para os dois pontos fora deste módulo que precisam ler/trocar a
// conexão ativa e a chave atual diretamente (db/sistema.js:importBackup e
// db/usuarios.js:autenticarUsuario/embrulharChave) sem manter suas próprias
// variáveis `db`/`currentKey` — que deixariam de existir aqui, gerando dois
// estados de conexão divergentes.
function getConexaoOuNull() {
	return db;
}

function getChaveAtual() {
	return currentKey;
}

function definirConexaoAtiva(conn, key) {
	db = conn;
	currentKey = key;
}

function runAsync(sql, params = []) {
	const conexao = getConexao();
	return new Promise((resolver, rejeitar) => {
		conexao.run(sql, params, function (erro) {
			if (erro) return rejeitar(erro);
			resolver(this);
		});
	});
}

function getAsync(sql, params = []) {
	const conexao = getConexao();
	return new Promise((resolver, rejeitar) => {
		conexao.get(sql, params, (erro, linha) => {
			if (erro) return rejeitar(erro);
			resolver(linha);
		});
	});
}

function allAsync(sql, params = []) {
	const conexao = getConexao();
	return new Promise((resolver, rejeitar) => {
		conexao.all(sql, params, (erro, linhas) => {
			if (erro) return rejeitar(erro);
			resolver(linhas);
		});
	});
}

// UPPER()/LOWER()/LIKE do SQLite só cobrem ASCII: "Trançado" nunca casa com
// "trançado". Como o catálogo é local e pequeno, a filtragem textual acontece
// em JS sobre o resultado da query, com acentos e caixa normalizados.
function normalizarBusca(texto) {
	return String(texto == null ? "" : texto)
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.trim();
}

function getDBPath() {
	return DB_PATH;
}

module.exports = {
	setDBPath,
	getDBPath,
	derivarChave,
	runOn,
	fecharConn,
	abrirBanco,
	migrarParaCriptografado,
	desbloquearBanco,
	bloquearBanco,
	trocarChave,
	isDesbloqueado,
	getConexao,
	runAsync,
	getAsync,
	allAsync,
	normalizarBusca,
	getConexaoOuNull,
	getChaveAtual,
	definirConexaoAtiva,
};
