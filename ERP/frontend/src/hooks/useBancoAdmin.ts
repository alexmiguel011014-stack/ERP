"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type ConsultaTabela, type ResumoTabela } from "@/lib/erpApi";

// Tela sensível (dados crus do banco) — pede a senha do usuário logado de
// novo antes de mostrar qualquer coisa, mesmo já sendo admin/dono. Mesmo
// gate de "reautenticação" que o módulo vanilla (modules/banco/banco.js) já
// tinha; só reimplementado aqui, não é uma trava nova.
export function useBancoAdmin() {
	const [autorizado, setAutorizado] = useState(false);
	const [autorizando, setAutorizando] = useState(false);
	const [erroSenha, setErroSenha] = useState<string | null>(null);

	const [resumo, setResumo] = useState<ResumoTabela[]>([]);
	const [carregandoResumo, setCarregandoResumo] = useState(false);

	const [tabelaSelecionada, setTabelaSelecionada] = useState("");
	const [dadosTabela, setDadosTabela] = useState<ConsultaTabela | null>(null);
	const [carregandoTabela, setCarregandoTabela] = useState(false);
	const [erroTabela, setErroTabela] = useState<string | null>(null);

	const [exportando, setExportando] = useState(false);
	const [resultadoExportacao, setResultadoExportacao] = useState<string | null>(
		null,
	);
	const [erroExportacao, setErroExportacao] = useState<string | null>(null);

	const carregarResumo = useCallback(async () => {
		setCarregandoResumo(true);
		try {
			setResumo(await erpApi.banco.resumoTabelas());
		} catch {
			setResumo([]);
		} finally {
			setCarregandoResumo(false);
		}
	}, []);

	useEffect(() => {
		if (autorizado) carregarResumo();
	}, [autorizado, carregarResumo]);

	async function confirmarSenha(senha: string) {
		setAutorizando(true);
		setErroSenha(null);
		try {
			const res = await erpApi.banco.verificarSenhaAdmin(senha);
			if (res.ok) {
				setAutorizado(true);
			} else {
				setErroSenha("Senha incorreta ou usuário sem perfil admin/dono.");
			}
		} catch (e) {
			setErroSenha(e instanceof Error ? e.message : String(e));
		} finally {
			setAutorizando(false);
		}
	}

	const consultar = useCallback(async (tabela: string) => {
		setTabelaSelecionada(tabela);
		setCarregandoTabela(true);
		setErroTabela(null);
		try {
			setDadosTabela(await erpApi.banco.consultarTabela(tabela, 200));
		} catch (e) {
			setErroTabela(e instanceof Error ? e.message : String(e));
			setDadosTabela(null);
		} finally {
			setCarregandoTabela(false);
		}
	}, []);

	function atualizar() {
		carregarResumo();
		if (tabelaSelecionada) consultar(tabelaSelecionada);
	}

	async function exportarJSON() {
		setExportando(true);
		setResultadoExportacao(null);
		setErroExportacao(null);
		try {
			const res = await erpApi.banco.exportarJSON();
			setResultadoExportacao(
				`${res.tabelas} tabela(s), ${res.registros} registro(s) exportados para: ${res.caminho}`,
			);
		} catch (e) {
			setErroExportacao(e instanceof Error ? e.message : String(e));
		} finally {
			setExportando(false);
		}
	}

	return {
		autorizado,
		autorizando,
		erroSenha,
		confirmarSenha,
		resumo,
		carregandoResumo,
		tabelaSelecionada,
		dadosTabela,
		carregandoTabela,
		erroTabela,
		consultar,
		atualizar,
		exportando,
		resultadoExportacao,
		erroExportacao,
		exportarJSON,
	};
}
