"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
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
						<h1 className="mb-1.5 text-2xl font-semibold text-gray-800 dark:text-white/90">
							ALLU ERP
						</h1>
						<p className="text-sm text-gray-500 dark:text-gray-400">
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
											<EyeIcon className="fill-gray-500 dark:fill-gray-400" />
										) : (
											<EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
										)}
									</span>
								</div>
							</div>
							{erro && (
								<div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
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
				</div>
			</div>
		</div>
	);
}
