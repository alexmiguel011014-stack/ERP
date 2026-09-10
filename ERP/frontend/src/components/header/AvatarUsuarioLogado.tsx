import { useFotoUsuario } from "@/hooks/useFotoUsuario";
import { classesCorAvatar } from "@/lib/avatarCores";

function iniciais(nome: string): string {
	const partes = nome.trim().split(/\s+/);
	const a = partes[0]?.[0] || "?";
	const b = partes.length > 1 ? partes[partes.length - 1][0] : "";
	return (a + b).toUpperCase();
}

// Peça compartilhada entre UserDropdown (header) e MeuPerfilModal, pra não
// duplicar a lógica de iniciais/cor/foto em dois lugares. Foto tem prioridade
// sobre cor quando as duas existem (cor continua salva por baixo — ver
// GOALS.md "Avatar do Usuário Logado").
export default function AvatarUsuarioLogado({
	nome,
	corAvatar,
	foto,
	tamanho = 36,
}: {
	nome: string;
	corAvatar?: string | null;
	foto?: string | null;
	tamanho?: number;
}) {
	const fotoUrl = useFotoUsuario(foto);

	if (fotoUrl) {
		return (
			// eslint-disable-next-line @next/next/no-img-element
			<img
				src={fotoUrl}
				alt={nome}
				className="shrink-0 rounded-full object-cover"
				style={{ width: tamanho, height: tamanho }}
			/>
		);
	}

	return (
		<span
			className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold ${classesCorAvatar(
				corAvatar,
			)}`}
			style={{ width: tamanho, height: tamanho }}
		>
			{iniciais(nome)}
		</span>
	);
}
