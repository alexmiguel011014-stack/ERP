"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Image from "next/image";
import React, { useState } from "react";

export default function SignInForm() {
	const [showPassword, setShowPassword] = useState(false);
	const [usuario, setUsuario] = useState("");
	const [senha, setSenha] = useState("");
	const [erro, setErro] = useState<string | null>(null);
	const [enviando, setEnviando] = useState(false);
	const { login } = useAuth();
	const router = useRouter();

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setErro(null);
		setEnviando(true);
		try {
			await login(usuario, senha);
			router.replace("/");
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setEnviando(false);
		}
	}

	return (
		<div className="flex flex-col flex-1 lg:w-1/2 w-full">
			<div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
				<div>
					<div className="mb-6">
						{/* Tela de login não segue o tema claro/escuro do resto do app —
						    é sempre essa cara (branco à esquerda, azul à direita), de
						    propósito, então sempre a versão preta da logo aqui. */}
						<Image
							src="/images/logo/allu-logo.png"
							alt="Allu"
							width={220}
							height={98}
							className="mb-3 h-11 w-auto"
							priority
						/>
						<p className="text-sm text-gray-500">
							Digite seu usuário e senha para continuar
						</p>
					</div>
					<form onSubmit={handleSubmit}>
						<div className="space-y-4">
							<div>
								<Label>
									Usuário <span className="text-error-500">*</span>
								</Label>
								<Input
									placeholder="Seu login de acesso"
									type="text"
									value={usuario}
									onChange={(e) => setUsuario(e.target.value)}
								/>
							</div>
							<div>
								<Label>
									Senha <span className="text-error-500">*</span>
								</Label>
								<div className="relative">
									<Input
										type={showPassword ? "text" : "password"}
										placeholder="Digite a senha de acesso"
										value={senha}
										onChange={(e) => setSenha(e.target.value)}
									/>
									<span
										onClick={() => setShowPassword(!showPassword)}
										className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
									>
										{showPassword ? (
											<EyeIcon className="fill-gray-500" />
										) : (
											<EyeCloseIcon className="fill-gray-500" />
										)}
									</span>
								</div>
							</div>
							{erro && (
								<div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600">
									{erro}
								</div>
							)}
							<div>
								<Button className="w-full" size="sm" disabled={enviando}>
									{enviando ? "Entrando..." : "Entrar"}
								</Button>
							</div>
						</div>
					</form>
					{/* Pedido do dono (2026-09-01): reaproveita o texto que existia no
					    painel direito do login antes do GIF entrar no lugar — agora
					    embaixo do formulário, no painel esquerdo. */}
					<p className="mt-6 text-center text-sm text-gray-400">
						Sistema de gestão para lojas — vendas, estoque, financeiro e
						relatórios em um só lugar.
					</p>
				</div>
			</div>
		</div>
	);
}
