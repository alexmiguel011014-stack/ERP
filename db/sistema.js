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

// Quantos dias de backup automático diário manter. Sem poda, backupAutomatico
// (chamado todo login + a cada 24h) acumula 1 arquivo/dia indefinidamente —
// 30 dias dá um mês de granularidade diária sem crescer sem limite. Só se
// aplica aos backups automáticos (nome com data ISO); um backup manual via
// exportBackup (nome com timestamp epoch) nunca é apagado por esta rotina —
// é uma cópia que o dono pediu explicitamente, não algo pra remover sozinho.
const RETENCAO_BACKUP_AUTOMATICO_DIAS = 30;
const PADRAO_BACKUP_AUTOMATICO = /^backup_(\d{4}-\d{2}-\d{2})\.sqlite$/;

function podarBackupsAutomaticosAntigos(backupDir) {
	const fs = require("fs");
	let arquivos;
	try {
		arquivos = fs.readdirSync(backupDir);
	} catch {
		return;
	}
	const limite =
		Date.now() - RETENCAO_BACKUP_AUTOMATICO_DIAS * 24 * 60 * 60 * 1000;
	for (const nome of arquivos) {
		const m = nome.match(PADRAO_BACKUP_AUTOMATICO);
		if (!m) continue;
		const dataArquivo = new Date(m[1] + "T00:00:00").getTime();
		if (!Number.isNaN(dataArquivo) && dataArquivo < limite) {
			try {
				fs.unlinkSync(path.join(backupDir, nome));
			} catch {
				/* falha ao remover um backup antigo não deve interromper o app */
			}
		}
	}
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

	if (!fs.existsSync(destino)) {
		fs.copyFileSync(origem, destino);
	}

	podarBackupsAutomaticosAntigos(backupDir);
	return destino;
}

module.exports = {
	exportBackup,
	importBackup,
	backupAutomatico,
	podarBackupsAutomaticosAntigos,
	RETENCAO_BACKUP_AUTOMATICO_DIAS,
};
