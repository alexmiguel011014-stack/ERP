"use client";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";

// Segundo passo do fluxo de instalação (o primeiro é o botão "Instalar" na
// própria página) — pedido explícito do dono: instalar reinicia o app, então
// precisa de uma confirmação explícita antes de disparar o quit-and-install
// (useAtualizacao.ts:confirmarInstalacao). A partir do "Sim" não existe mais
// nenhuma UI nossa — oneClick:true (package.json) faz o instalador NSIS
// assumir sozinho até o app reabrir.
export default function ConfirmarInstalacaoModal({
	isOpen,
	onClose,
	onConfirmar,
}: {
	isOpen: boolean;
	onClose: () => void;
	onConfirmar: () => void;
}) {
	return (
		<Modal isOpen={isOpen} onClose={onClose} className="max-w-[380px] p-6">
			<h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white/90">
				Instalar atualização
			</h2>
			<p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
				Baixar atualização faz com que o app reinicie, deseja prosseguir?
			</p>
			<div className="flex justify-end gap-3">
				<Button variant="outline" type="button" onClick={onClose}>
					Não
				</Button>
				<Button type="button" onClick={onConfirmar}>
					Sim
				</Button>
			</div>
		</Modal>
	);
}
