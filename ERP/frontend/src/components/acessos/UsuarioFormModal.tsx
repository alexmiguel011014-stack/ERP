"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Checkbox from "@/components/form/input/Checkbox";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import { usePersistedState } from "@/hooks/usePersistedState";
import {
	erpApi,
	parsePermissoesUsuario,
	type Usuario,
	type UsuarioFormData,
} from "@/lib/erpApi";

const MODULOS_PERMISSAO = [
	{ value: "produtos", label: "Produtos" },
	{ value: "estoque", label: "Estoque" },
	{ value: "fornecedores", label: "Fornecedores" },
	{ value: "compras", label: "Compras" },
	{ value: "financeiro", label: "Financeiro" },
	{ value: "relatorios", label: "Relatórios" },
	{ value: "vendas", label: "Converter/cancelar orçamento" },
];

type FormState = {
	login: string;
	nome: string;
	perfil: "admin" | "dono" | "vendedor";
	comissao_percentual: number;
	ativo: boolean;
	senha: string;
	confirmarSenha: string;
	senhaAtual: string;
	permissoes: Record<string, boolean>;
};

const FORM_VAZIO: FormState = {
	login: "",
	nome: "",
	perfil: "admin",
	comissao_percentual: 0,
	ativo: true,
	senha: "",
	confirmarSenha: "",
	senhaAtual: "",
	permissoes: {},
};

function perfilValido(v: string): "admin" | "dono" | "vendedor" {
	return v === "admin" || v === "dono" ? v : "vendedor";
}

// Só os campos sem senha — nunca persistir credencial em localStorage.
type RascunhoUsuario = {
	login: string;
	nome: string;
	perfil: "admin" | "dono" | "vendedor";
	comissao_percentual: number;
	ativo: boolean;
	permissoes: Record<string, boolean>;
};

const RASCUNHO_VAZIO: RascunhoUsuario = {
	login: "",
	nome: "",
	perfil: "admin",
	comissao_percentual: 0,
	ativo: true,
	permissoes: {},
};

export default function UsuarioFormModal({
	isOpen,
	onClose,
	usuarioEditando,
	onSalvo,
}: {
	isOpen: boolean;
	onClose: () => void;
	usuarioEditando: Usuario | null;
	onSalvo: () => void;
}) {
	const { sessao } = useAuth();
	const [form, setForm] = useState<FormState>(FORM_VAZIO);
	const [erro, setErro] = useState<string | null>(null);
	const [salvando, setSalvando] = useState(false);
	const [rascunho, setRascunho, limparRascunho] =
		usePersistedState<RascunhoUsuario>(
			"acessos_novo_usuario_rascunho",
			RASCUNHO_VAZIO,
		);

	useEffect(() => {
		if (!isOpen) return;
		setErro(null);
		if (usuarioEditando) {
			setForm({
				login: usuarioEditando.login || "",
				nome: usuarioEditando.nome || "",
				perfil: perfilValido(usuarioEditando.perfil),
				comissao_percentual: Number(usuarioEditando.comissao_percentual) || 0,
				ativo: Number(usuarioEditando.ativo) === 1,
				senha: "",
				confirmarSenha: "",
				senhaAtual: "",
				permissoes: parsePermissoesUsuario(usuarioEditando.permissoes),
			});
		} else {
			const base = { ...FORM_VAZIO, ...rascunho };
			// Dono não pode criar admin — se o padrão (ou um rascunho salvo
			// antes desta correção) ainda apontar "admin", cai pra "dono".
			if (sessao.perfil !== "admin" && base.perfil === "admin") {
				base.perfil = "dono";
			}
			setForm(base);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen, usuarioEditando]);

	function campo<K extends keyof FormState>(nome: K, valor: FormState[K]) {
		setForm((f) => {
			const novo = { ...f, [nome]: valor };
			// Rascunho só faz sentido pra cadastro novo — editar um usuário
			// existente não deve sobrescrever o que estava sendo digitado antes.
			if (!usuarioEditando) {
				setRascunho({
					login: novo.login,
					nome: novo.nome,
					perfil: novo.perfil,
					comissao_percentual: novo.comissao_percentual,
					ativo: novo.ativo,
					permissoes: novo.permissoes,
				});
			}
			return novo;
		});
	}

	function alternarPermissao(modulo: string, marcado: boolean) {
		setForm((f) => {
			const permissoes = { ...f.permissoes, [modulo]: marcado };
			if (!usuarioEditando) {
				setRascunho((r) => ({ ...r, permissoes }));
			}
			return { ...f, permissoes };
		});
	}

	const ehVendedor = form.perfil === "vendedor";
	const editando = !!usuarioEditando;
	// Achado real (2026-09-02): dono via a opção "Adm" aqui e conseguia criar
	// outro admin — só quem já é admin pode criar/promover admin (o backend
	// também bloqueia isso, esta é só a UI não oferecer a opção). Continua
	// aparecendo ao editar a própria conta do admin já existente, porque
	// dono ainda pode tocar no resto do cadastro dele (nome, ativo — pedido
	// explícito anterior, ver donoBloqueadoNaSenha abaixo).
	const mostrarOpcaoAdmin =
		sessao.perfil === "admin" || usuarioEditando?.perfil === "admin";
	const editandoASiMesmo =
		editando && sessao.usuario?.id === usuarioEditando!.id;
	// Dono nunca mexe na senha do admin — mas pode editar o resto do cadastro
	// dele (nome, ativo, perfil). Só a senha é bloqueada, por pedido explícito.
	const donoBloqueadoNaSenha =
		sessao.perfil === "dono" && usuarioEditando?.perfil === "admin";
	// Trocar a própria senha (sendo admin ou dono) exige confirmar a senha
	// atual — evita que uma sessão aberta sozinha na loja vire troca de senha
	// sem ninguém saber a antiga.
	const precisaSenhaAtual =
		editandoASiMesmo && (sessao.perfil === "admin" || sessao.perfil === "dono");

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const loginVal = form.login.trim().toLowerCase();
		if (!form.nome.trim()) {
			setErro("Informe o nome do usuário.");
			return;
		}
		if (!loginVal) {
			setErro("Informe o login do usuário.");
			return;
		}
		if (!editando && form.senha.length < 4) {
			setErro("Defina uma senha com pelo menos 4 caracteres.");
			return;
		}
		if (!editando && form.senha !== form.confirmarSenha) {
			setErro("As senhas não coincidem.");
			return;
		}
		if (editando && form.senha.length > 0 && form.senha.length < 4) {
			setErro("A nova senha deve ter pelo menos 4 caracteres.");
			return;
		}
		if (donoBloqueadoNaSenha && form.senha) {
			setErro("Você não pode alterar a senha do administrador.");
			return;
		}
		if (precisaSenhaAtual && form.senha && !form.senhaAtual) {
			setErro("Informe sua senha atual para trocar a senha.");
			return;
		}
		if (editandoASiMesmo && !form.ativo) {
			setErro("Você não pode desativar o próprio usuário.");
			return;
		}
		if (
			editandoASiMesmo &&
			usuarioEditando?.perfil === "admin" &&
			form.perfil !== "admin"
		) {
			setErro("Você não pode remover o próprio acesso de admin.");
			return;
		}

		const dados: UsuarioFormData = {
			login: loginVal,
			nome: form.nome.trim(),
			perfil: form.perfil,
			comissao_percentual: form.comissao_percentual,
			ativo: form.ativo,
			senha: form.senha,
			senhaAtual: form.senhaAtual,
			permissoes: form.permissoes,
		};
		if (usuarioEditando) dados.id = usuarioEditando.id;

		setSalvando(true);
		setErro(null);
		try {
			await erpApi.usuarios.salvar(dados);
			if (!usuarioEditando) limparRascunho();
			onSalvo();
			onClose();
		} catch (e) {
			setErro(e instanceof Error ? e.message : String(e));
		} finally {
			setSalvando(false);
		}
	}

	return (
		<Modal isOpen={isOpen} onClose={onClose} className="max-w-[600px] p-6">
			<h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
				{usuarioEditando ? "Editar Usuário" : "Novo Usuário"}
			</h2>
			<form onSubmit={handleSubmit} className="space-y-4">
				<div className="grid grid-cols-2 gap-4">
					<div>
						<Label>
							Nome completo <span className="text-error-500">*</span>
						</Label>
						<Input
							value={form.nome}
							onChange={(e) => campo("nome", e.target.value)}
							placeholder="Ex: Ana Beatriz Silva"
						/>
					</div>
					<div>
						<Label>
							Login <span className="text-error-500">*</span>
						</Label>
						<Input
							value={form.login}
							onChange={(e) => campo("login", e.target.value)}
							placeholder="apenas letras, números, . _ -"
							disabled={editando}
						/>
					</div>
				</div>
				{donoBloqueadoNaSenha ? (
					<div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/5 dark:text-gray-400">
						Você não pode alterar a senha do administrador.
					</div>
				) : (
					<div className="grid grid-cols-2 gap-4">
						<div>
							<Label>
								Senha {!editando && <span className="text-error-500">*</span>}
							</Label>
							<Input
								type="password"
								value={form.senha}
								onChange={(e) => campo("senha", e.target.value)}
								placeholder="mínimo 4 caracteres"
							/>
							{editando && (
								<p className="mt-1 text-xs text-gray-400">
									Deixe em branco para manter a senha atual
								</p>
							)}
						</div>
						<div>
							<Label>Confirmar senha</Label>
							<Input
								type="password"
								value={form.confirmarSenha}
								onChange={(e) => campo("confirmarSenha", e.target.value)}
								placeholder="repita a senha"
							/>
						</div>
						{precisaSenhaAtual && (
							<div className="col-span-2">
								<Label>Senha atual</Label>
								<Input
									type="password"
									value={form.senhaAtual}
									onChange={(e) => campo("senhaAtual", e.target.value)}
									placeholder="necessária pra trocar sua própria senha"
								/>
							</div>
						)}
					</div>
				)}
				<div className="grid grid-cols-2 gap-4">
					<div>
						<Label>Perfil de acesso</Label>
						<select
							value={form.perfil}
							onChange={(e) => campo("perfil", perfilValido(e.target.value))}
							className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
						>
							{mostrarOpcaoAdmin && <option value="admin">Adm</option>}
							<option value="dono">Dono</option>
							<option value="vendedor">Funcionário</option>
						</select>
						<p className="mt-1 text-xs text-gray-400">
							Adm e Dono acessam tudo. Funcionário acessa só Frente de Caixa
							(PDV) e Clientes, mais os módulos liberados abaixo.
						</p>
					</div>
					{ehVendedor && (
						<div>
							<Label>Comissão sobre vendas (%)</Label>
							<Input
								type="number"
								value={form.comissao_percentual}
								onChange={(e) =>
									campo("comissao_percentual", Number(e.target.value) || 0)
								}
							/>
						</div>
					)}
				</div>
				<Checkbox
					id="usuario-ativo"
					label="Usuário ativo (pode entrar no sistema)"
					checked={form.ativo}
					onChange={(marcado) => campo("ativo", marcado)}
				/>
				{ehVendedor && (
					<div>
						<Label>
							Módulos liberados (além de PDV e Clientes, sempre disponíveis)
						</Label>
						<div className="mt-2 flex flex-wrap gap-x-5 gap-y-3">
							{MODULOS_PERMISSAO.map((m) => (
								<Checkbox
									key={m.value}
									id={`perm-${m.value}`}
									label={m.label}
									checked={form.permissoes[m.value] === true}
									onChange={(marcado) => alternarPermissao(m.value, marcado)}
								/>
							))}
						</div>
					</div>
				)}
				{erro && (
					<div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
						{erro}
					</div>
				)}
				<div className="flex justify-end gap-3 pt-2">
					<Button variant="outline" type="button" onClick={onClose}>
						Cancelar
					</Button>
					<Button type="submit" disabled={salvando}>
						{salvando ? "Salvando..." : "Salvar Usuário"}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
