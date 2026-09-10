"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import { erpApi } from "@/lib/erpApi";
import {
	CORES_AVATAR,
	classesCorAvatar,
	corAvatarAleatoria,
} from "@/lib/avatarCores";
import AvatarUsuarioLogado from "./AvatarUsuarioLogado";

// Autoatendimento: sempre age sobre o próprio usuário logado (as chamadas de
// erpApi.usuarios.salvarCorAvatar/escolherFoto/removerFoto nunca recebem um
// id — o backend resolve pela sessão, ver GOALS.md "Avatar do Usuário Logado").
export default function MeuPerfilModal({
	isOpen,
	onClose,
}: {
	isOpen: boolean;
	onClose: () => void;
}) {
	const { sessao, refreshSessao } = useAuth();
	const [corSelecionada, setCorSelecionada] = useState<string | null>(null);
	const [salvando, setSalvando] = useState(false);
	const [erro, setErro] = useState<string | null>(null);

	const nome = sessao.usuario?.nome || sessao.usuario?.login || "Usuário";
	const foto = sessao.usuario?.foto;

	useEffect(() => {
		if (isOpen) {
			setCorSelecionada(sessao.usuario?.corAvatar ?? null);
			setErro(null);
		}
	}, [isOpen, sessao.usuario?.corAvatar]);

	async function salvarCor(cor: string) {
		setSalvando(true);
		setErro(null);
		try {
			await erpApi.usuarios.salvarCorAvatar(cor);
			setCorSelecionada(cor);
			await refreshSessao();
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setSalvando(false);
		}
	}

	async function handleCorAleatoria() {
		await salvarCor(corAvatarAleatoria(corSelecionada));
	}

	async function handleEscolherFoto() {
		setSalvando(true);
		setErro(null);
		try {
			const resultado = await erpApi.usuarios.escolherFoto();
			if (resultado.success) {
				await refreshSessao();
			}
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setSalvando(false);
		}
	}

	async function handleRemoverFoto() {
		setSalvando(true);
		setErro(null);
		try {
			await erpApi.usuarios.removerFoto();
			await refreshSessao();
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setSalvando(false);
		}
	}

	return (
		<Modal isOpen={isOpen} onClose={onClose} className="max-w-[440px] p-6">
			<h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
				Meu Perfil
			</h2>

			<div className="flex flex-col items-center gap-3 pb-4">
				<AvatarUsuarioLogado
					nome={nome}
					corAvatar={corSelecionada}
					foto={foto}
					tamanho={72}
				/>
				<span className="font-medium text-gray-700 dark:text-gray-300">
					{nome}
				</span>
			</div>

			<div className="border-t border-gray-200 pt-4 dark:border-gray-800">
				<p className="mb-2 text-theme-xs font-medium text-gray-500 dark:text-gray-400">
					Cor do ícone
				</p>
				<div className="flex flex-wrap items-center gap-2">
					{CORES_AVATAR.map((cor) => (
						<button
							key={cor}
							type="button"
							disabled={salvando}
							onClick={() => salvarCor(cor)}
							aria-label={`Cor ${cor}`}
							className={`size-8 rounded-full ${classesCorAvatar(cor)} ${
								corSelecionada === cor || (!corSelecionada && cor === "brand")
									? "ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-dark"
									: ""
							}`}
						/>
					))}
					<Button
						size="sm"
						variant="outline"
						onClick={handleCorAleatoria}
						disabled={salvando}
					>
						Cor aleatória
					</Button>
				</div>
			</div>

			<div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
				<p className="mb-2 text-theme-xs font-medium text-gray-500 dark:text-gray-400">
					Foto de perfil
				</p>
				<div className="flex gap-3">
					<Button
						size="sm"
						variant="outline"
						onClick={handleEscolherFoto}
						disabled={salvando}
					>
						Escolher foto...
					</Button>
					{foto && (
						<Button
							size="sm"
							variant="outline"
							onClick={handleRemoverFoto}
							disabled={salvando}
						>
							Remover foto
						</Button>
					)}
				</div>
			</div>

			{erro && (
				<div className="mt-4 rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
					{erro}
				</div>
			)}

			<div className="flex justify-end pt-5">
				<Button variant="outline" type="button" onClick={onClose}>
					Fechar
				</Button>
			</div>
		</Modal>
	);
}
