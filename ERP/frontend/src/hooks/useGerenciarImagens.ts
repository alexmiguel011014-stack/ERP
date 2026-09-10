"use client";
import { useCallback, useEffect, useState } from "react";
import { erpApi, type ImagemMeta } from "@/lib/erpApi";

// Tela sensível (mesmo nível de /banco) — pede a senha do usuário logado de
// novo antes de mostrar qualquer coisa, reusando o mesmo reautenticador
// (verificarSenhaAdmin) que useBancoAdmin.ts já usa. Ver GOALS.md "Image
// Database & Management" pro racional completo desta tela.
export function useGerenciarImagens() {
	const [autorizado, setAutorizado] = useState(false);
	const [autorizando, setAutorizando] = useState(false);
	const [erroSenha, setErroSenha] = useState<string | null>(null);

	const [imagens, setImagens] = useState<ImagemMeta[]>([]);
	const [total, setTotal] = useState(0);
	const [carregando, setCarregando] = useState(false);
	const [erro, setErro] = useState<string | null>(null);

	const [abaOrfas, setAbaOrfas] = useState(false);
	const [orfas, setOrfas] = useState<ImagemMeta[]>([]);
	const [carregandoOrfas, setCarregandoOrfas] = useState(false);

	const [visualizando, setVisualizando] = useState<{
		id: number;
		dataUrl: string;
	} | null>(null);

	const [paraExcluir, setParaExcluir] = useState<ImagemMeta | null>(null);
	const [excluindo, setExcluindo] = useState(false);
	const [resultadoExclusao, setResultadoExclusao] = useState<string | null>(
		null,
	);
	const [orfasParaExcluir, setOrfasParaExcluir] = useState(false);

	const carregarImagens = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			const res = await erpApi.imagens.listar({ entidadeTipo: "produto" });
			setImagens(res.linhas);
			setTotal(res.total);
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setCarregando(false);
		}
	}, []);

	const carregarOrfas = useCallback(async () => {
		setCarregandoOrfas(true);
		try {
			setOrfas(await erpApi.imagens.listarOrfas());
		} catch {
			setOrfas([]);
		} finally {
			setCarregandoOrfas(false);
		}
	}, []);

	useEffect(() => {
		if (autorizado) carregarImagens();
	}, [autorizado, carregarImagens]);

	useEffect(() => {
		if (autorizado && abaOrfas) carregarOrfas();
	}, [autorizado, abaOrfas, carregarOrfas]);

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

	async function visualizar(id: number) {
		try {
			const dataUrl = await erpApi.imagens.obterPorId(id);
			if (dataUrl) setVisualizando({ id, dataUrl });
		} catch {
			// Falha ao abrir a prévia não deve travar o resto da tela.
		}
	}

	function fecharVisualizacao() {
		setVisualizando(null);
	}

	function pedirExclusao(imagem: ImagemMeta) {
		setResultadoExclusao(null);
		setParaExcluir(imagem);
	}

	function cancelarExclusao() {
		setParaExcluir(null);
	}

	async function confirmarExclusao() {
		if (!paraExcluir) return;
		setExcluindo(true);
		setErro(null);
		try {
			await erpApi.imagens.excluirPorId(paraExcluir.id);
			setResultadoExclusao("Imagem removida.");
			await carregarImagens();
			if (abaOrfas) await carregarOrfas();
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setExcluindo(false);
			setParaExcluir(null);
		}
	}

	function pedirExclusaoOrfasEmLote() {
		setResultadoExclusao(null);
		setOrfasParaExcluir(true);
	}

	function cancelarExclusaoOrfasEmLote() {
		setOrfasParaExcluir(false);
	}

	async function confirmarExclusaoOrfasEmLote() {
		if (orfas.length === 0) {
			setOrfasParaExcluir(false);
			return;
		}
		setExcluindo(true);
		setErro(null);
		try {
			const res = await erpApi.imagens.excluirEmLote(orfas.map((o) => o.id));
			setResultadoExclusao(`${res.removidas} imagem(ns) órfã(s) removida(s).`);
			await carregarOrfas();
			await carregarImagens();
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setExcluindo(false);
			setOrfasParaExcluir(false);
		}
	}

	return {
		autorizado,
		autorizando,
		erroSenha,
		confirmarSenha,
		imagens,
		total,
		carregando,
		erro,
		abaOrfas,
		setAbaOrfas,
		orfas,
		carregandoOrfas,
		visualizando,
		visualizar,
		fecharVisualizacao,
		paraExcluir,
		pedirExclusao,
		cancelarExclusao,
		confirmarExclusao,
		excluindo,
		resultadoExclusao,
		orfasParaExcluir,
		pedirExclusaoOrfasEmLote,
		cancelarExclusaoOrfasEmLote,
		confirmarExclusaoOrfasEmLote,
	};
}
