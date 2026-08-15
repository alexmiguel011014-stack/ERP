const path = require("path");
const {
	getConexao,
	abrirBanco,
	getDBPath,
	getChaveAtual,
	definirConexaoAtiva,
} = require("./conexao");

function exportBackup() {
	const fs = require("fs");
	const origem = getDBPath();
	const dbDir = path.dirname(getDBPath());
	const backupDir = path.join(dbDir, "backups");

	if (!fs.existsSync(backupDir)) {
		fs.mkdirSync(backupDir, { recursive: true });
	}

	const destino = path.join(backupDir, "backup_" + Date.now() + ".sqlite");

	fs.copyFileSync(origem, destino);
	return destino;
}

async function importBackup(caminhoArquivo) {
	const fs = require("fs");
	const conn = getConexao();

	return new Promise((resolver, rejeitar) => {
		fs.readFile(caminhoArquivo, (erroLeitura, dados) => {
			if (erroLeitura) return rejeitar(erroLeitura.message);

			const tmpPath = getDBPath() + ".tmp";
			fs.writeFileSync(tmpPath, dados);

			conn.close((errClose) => {
				if (errClose) return rejeitar(errClose.message);

				// Antes: `db = null;` direto. A conexão ativa agora vive em
				// db/conexao.js, então trocamos por definirConexaoAtiva mantendo a
				// mesma chave (esta função nunca troca a senha, só o arquivo).
				definirConexaoAtiva(null, getChaveAtual());
				fs.copyFileSync(tmpPath, getDBPath());
				fs.unlinkSync(tmpPath);

				abrirBanco(getChaveAtual())
					.then((conn) => {
						definirConexaoAtiva(conn, getChaveAtual());
						resolver({
							success: true,
							message: "Backup restaurado com sucesso.",
						});
					})
					.catch((e) =>
						rejeitar(
							"Backup restaurado, mas não foi possível reabrir o banco: " +
								e.message,
						),
					);
			});
		});
	});
}

function backupAutomatico() {
	const fs = require("fs");
	const origem = getDBPath();
	const dbDir = path.dirname(getDBPath());
	const backupDir = path.join(dbDir, "backups");

	if (!fs.existsSync(backupDir)) {
		fs.mkdirSync(backupDir, { recursive: true });
	}

	const dataHoje = new Date().toISOString().slice(0, 10);
	const destino = path.join(backupDir, "backup_" + dataHoje + ".sqlite");

	if (fs.existsSync(destino)) {
		return destino;
	}

	fs.copyFileSync(origem, destino);
	return destino;
}

module.exports = {
	exportBackup,
	importBackup,
	backupAutomatico,
};
