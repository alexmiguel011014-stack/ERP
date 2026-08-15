const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const {
	getAsync,
	runAsync,
	allAsync,
	getDBPath,
	abrirBanco,
	derivarChave,
	desbloquearBanco,
	bloquearBanco,
	getConexaoOuNull,
	getChaveAtual,
	definirConexaoAtiva,
} = require("./conexao");
const { iniciarBanco } = require("./schema");

/* ============ Usuários (login do sistema) ============ */
// Cada usuário tem um login e uma senha. A senha do primeiro login é a chave-mestre
// do banco (SQLCipher). Para permitir vários usuários, a chave-mestre é "embrulhada"
// (AES-256-GCM) por cada login/senha em um arquivo ao lado do banco (erp_usuarios.json).
// Para trocar a senha de um usuário basta reembrulhar a mesma chave-mestre.

function caminhoArquivoUsuarios() {
	return path.join(path.dirname(getDBPath()), "erp_usuarios.json");
}

function derivarChaveUsuario(login, senha) {
	return crypto
		.createHash("sha256")
		.update("erp_usr:" + String(login) + ":" + String(senha))
		.digest();
}

// Formato legado (SHA-256 sem salt por usuário) — mantido só para validar hashes
// já gravados antes da migração para scrypt; nunca usado para gravar hash novo.
function hashSenhaUsuarioLegado(login, senha) {
	return crypto
		.createHash("sha256")
		.update("erp_usr_hash:" + String(login) + ":" + String(senha))
		.digest("hex");
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashSenhaUsuario(senha) {
	const salt = crypto.randomBytes(16);
	const hash = crypto.scryptSync(String(senha), salt, SCRYPT_PARAMS.keylen, {
		N: SCRYPT_PARAMS.N,
		r: SCRYPT_PARAMS.r,
		p: SCRYPT_PARAMS.p,
	});
	return "scrypt$" + salt.toString("hex") + "$" + hash.toString("hex");
}

// Verifica a senha contra o hash gravado, aceitando tanto o formato novo (scrypt)
// quanto o legado (SHA-256), para permitir migração transparente no login.
function verificarHashSenha(login, senha, hashArmazenado) {
	const armazenado = String(hashArmazenado || "");
	if (armazenado.startsWith("scrypt$")) {
		const partes = armazenado.split("$");
		if (partes.length !== 3) return { ok: false, precisaMigrar: false };
		const salt = Buffer.from(partes[1], "hex");
		const esperado = Buffer.from(partes[2], "hex");
		const calculado = crypto.scryptSync(
			String(senha),
			salt,
			SCRYPT_PARAMS.keylen,
			{ N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p },
		);
		const ok =
			calculado.length === esperado.length &&
			crypto.timingSafeEqual(calculado, esperado);
		return { ok, precisaMigrar: false };
	}
	const legado = Buffer.from(hashSenhaUsuarioLegado(login, senha), "hex");
	const atual = Buffer.from(armazenado, "hex");
	const ok =
		legado.length === atual.length && crypto.timingSafeEqual(legado, atual);
	return { ok, precisaMigrar: ok };
}

function lerArquivoUsuarios() {
	try {
		const caminho = caminhoArquivoUsuarios();
		if (!fs.existsSync(caminho)) return {};
		const dados = JSON.parse(fs.readFileSync(caminho, "utf8"));
		return dados && typeof dados === "object" ? dados : {};
	} catch (e) {
		return {};
	}
}

function gravarArquivoUsuarios(dados) {
	fs.writeFileSync(caminhoArquivoUsuarios(), JSON.stringify(dados, null, 2));
}

function embrulharChave(login, senha) {
	const chavePerfil = derivarChaveUsuario(login, senha);
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", chavePerfil, iv);
	const criptografado = Buffer.concat([
		// Antes: `currentKey` era uma variável de módulo local. Agora a chave
		// ativa vive em db/conexao.js e é lida via getChaveAtual().
		cipher.update(getChaveAtual(), "utf8"),
		cipher.final(),
	]);
	return {
		iv: iv.toString("hex"),
		tag: cipher.getAuthTag().toString("hex"),
		dados: criptografado.toString("hex"),
	};
}

function desembrulharChave(entrada, loginKey) {
	try {
		const decipher = crypto.createDecipheriv(
			"aes-256-gcm",
			loginKey,
			Buffer.from(entrada.iv, "hex"),
		);
		decipher.setAuthTag(Buffer.from(entrada.tag, "hex"));
		return Buffer.concat([
			decipher.update(Buffer.from(entrada.dados, "hex")),
			decipher.final(),
		]).toString("utf8");
	} catch (e) {
		return null;
	}
}

// Login do app: usuário + senha. Pode desbloquear via chave embrulhada (multi-usuário)
// ou via chave-mestre (primeiro acesso / migração de bancos antigos).
async function autenticarUsuario(login, senha) {
	const l = String(login || "")
		.trim()
		.toLowerCase();
	const s = String(senha || "");
	if (!l || !s) throw new Error("Informe usuário e senha.");

	const arquivo = lerArquivoUsuarios();
	const entrada = arquivo[l];
	let desbloqueado = false;

	// 1) Tenta desembrulhar a chave-mestre com a senha deste usuário.
	if (entrada) {
		try {
			const chaveMestre = desembrulharChave(entrada, derivarChaveUsuario(l, s));
			if (!chaveMestre) throw new Error("senha incorreta");
			if (!getConexaoOuNull()) {
				// Antes: `db = await abrirBanco(chaveMestre); currentKey = chaveMestre;`
				// direto nas variáveis de módulo. Agora db/currentKey moraram para
				// db/conexao.js, então a troca de conexão ativa passa por
				// definirConexaoAtiva() para manter os dois módulos em sincronia.
				const conn = await abrirBanco(chaveMestre);
				definirConexaoAtiva(conn, chaveMestre);
				await iniciarBanco();
			} else if (chaveMestre !== getChaveAtual()) {
				throw new Error("chave alterada");
			}
			desbloqueado = true;
		} catch (e) {
			desbloqueado = false;
		}
	}

	// 2) Fallback: chave-mestre direta (primeiro acesso, admin legado ou banco plaintext).
	if (!desbloqueado) {
		if (getConexaoOuNull()) {
			if (derivarChave(s) !== getChaveAtual())
				throw new Error("Senha incorreta.");
		} else {
			await desbloquearBanco(s);
		}
		desbloqueado = true;
	}

	// 3) Se o banco ainda está vazio de usuários, sementeia o primeiro (bootstrap).
	const total = await getAsync("SELECT COUNT(*) AS n FROM Usuarios", []);
	if (Number(total.n) === 0) {
		await runAsync(
			"INSERT INTO Usuarios (login, nome, perfil, ativo, senha_hash, criado_em) VALUES (?, ?, ?, 1, ?, ?)",
			[
				l,
				"Administrador",
				"admin",
				hashSenhaUsuario(s),
				new Date().toISOString(),
			],
		);
	}

	// 4) Garante o embrulho da chave para este login (novo/legado).
	if (!arquivo[l]) {
		try {
			arquivo[l] = embrulharChave(l, s);
			gravarArquivoUsuarios(arquivo);
		} catch (e) {
			/* ignora: login continua funcionando pela chave-mestre */
		}
	}

	// 5) Valida o usuário cadastrado e ativo.
	const usr = await getAsync(
		"SELECT id, login, nome, perfil, ativo, permissoes FROM Usuarios WHERE login = ? COLLATE NOCASE",
		[l],
	);
	if (!usr) {
		await bloquearBanco();
		throw new Error("Usuário não cadastrado neste sistema.");
	}
	if (Number(usr.ativo) !== 1) {
		await bloquearBanco();
		throw new Error("Usuário desativado. Contate o administrador.");
	}

	return {
		success: true,
		usuario: {
			id: usr.id,
			login: usr.login,
			nome: usr.nome,
			perfil: usr.perfil,
			permissoes: parsePermissoes(usr.permissoes),
		},
	};
}

// Parse defensivo: permissoes nunca deve derrubar o login por JSON inválido.
function parsePermissoes(texto) {
	try {
		const obj = JSON.parse(texto || "{}");
		return obj && typeof obj === "object" ? obj : {};
	} catch (e) {
		return {};
	}
}

function getUsuario(login) {
	return getAsync(
		"SELECT id, login, nome, perfil, ativo, permissoes FROM Usuarios WHERE login = ? COLLATE NOCASE",
		[String(login)],
	);
}

async function listarUsuarios() {
	return allAsync(
		"SELECT id, login, nome, perfil, ativo, criado_em, comissao_percentual, permissoes FROM Usuarios ORDER BY login",
	);
}

async function salvarUsuario(dados) {
	const l = String(dados.login || "")
		.trim()
		.toLowerCase();
	const nome = String(dados.nome || "").trim();
	if (!l || !/^[a-z0-9._-]{3,}$/i.test(l)) {
		throw new Error(
			"Login deve ter pelo menos 3 caracteres (letras, números, . _ -).",
		);
	}
	if (!nome) throw new Error("Informe o nome do usuário.");
	const perfil = dados.perfil === "vendedor" ? "vendedor" : "admin";
	const comissao = Math.max(0, Number(dados.comissao_percentual) || 0);
	const permissoes = JSON.stringify(
		dados.permissoes && typeof dados.permissoes === "object"
			? dados.permissoes
			: {},
	);

	const inserindo = !dados.id;
	const senha = String(dados.senha || "");
	if (inserindo) {
		if (senha.length < 4)
			throw new Error("Defina uma senha com pelo menos 4 caracteres.");
		const existente = await getAsync(
			"SELECT id FROM Usuarios WHERE login = ? COLLATE NOCASE",
			[l],
		);
		if (existente) throw new Error("Já existe um usuário com esse login.");
		await runAsync(
			"INSERT INTO Usuarios (login, nome, perfil, ativo, senha_hash, criado_em, comissao_percentual, permissoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			[
				l,
				nome,
				perfil,
				dados.ativo ? 1 : 0,
				hashSenhaUsuario(senha),
				new Date().toISOString(),
				comissao,
				permissoes,
			],
		);
	} else {
		if (!/^[0-9]+$/.test(String(dados.id)))
			throw new Error("Usuário inválido.");
		await runAsync(
			"UPDATE Usuarios SET nome = ?, ativo = ?, perfil = ?, comissao_percentual = ?, permissoes = ? WHERE id = ?",
			[
				nome,
				dados.ativo ? 1 : 0,
				perfil,
				comissao,
				permissoes,
				Number(dados.id),
			],
		);
		if (senha) {
			if (senha.length < 4)
				throw new Error("A senha deve ter pelo menos 4 caracteres.");
			await runAsync("UPDATE Usuarios SET senha_hash = ? WHERE id = ?", [
				hashSenhaUsuario(senha),
				Number(dados.id),
			]);
		}
	}

	// Embrulha/reescreve a chave-mestre para o login deste usuário.
	if (inserindo || senha) {
		const arquivo = lerArquivoUsuarios();
		arquivo[l] = embrulharChave(l, senha);
		gravarArquivoUsuarios(arquivo);
	}

	return { success: true };
}

async function removerUsuario(id) {
	const usuarioId = Number(id);
	if (!usuarioId) throw new Error("Usuário inválido.");
	const usr = await getAsync("SELECT * FROM Usuarios WHERE id = ?", [
		usuarioId,
	]);
	if (!usr) throw new Error("Usuário não encontrado.");

	// A trava tem que ser sobre admins, não usuários em geral — senão dá pra
	// apagar o último admin e deixar só vendedores, travando a administração.
	if (usr.perfil === "admin") {
		const adminsAtivos = await getAsync(
			"SELECT COUNT(*) AS n FROM Usuarios WHERE ativo = 1 AND perfil = 'admin'",
			[],
		);
		if (Number(adminsAtivos.n) <= 1 && Number(usr.ativo) === 1) {
			throw new Error("Não é possível remover o último administrador ativo.");
		}
	}

	await runAsync("DELETE FROM Usuarios WHERE id = ?", [usuarioId]);

	const arquivo = lerArquivoUsuarios();
	if (arquivo[usr.login]) {
		delete arquivo[usr.login];
		gravarArquivoUsuarios(arquivo);
	}
	return { success: true };
}

module.exports = {
	hashSenhaUsuario,
	hashSenhaUsuarioLegado,
	verificarHashSenha,
	caminhoArquivoUsuarios,
	derivarChaveUsuario,
	lerArquivoUsuarios,
	gravarArquivoUsuarios,
	embrulharChave,
	desembrulharChave,
	autenticarUsuario,
	parsePermissoes,
	getUsuario,
	listarUsuarios,
	salvarUsuario,
	removerUsuario,
};
