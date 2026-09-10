// Espelho manual da whitelist do backend (db/usuarios.js#CORES_AVATAR) — se uma
// mudar, a outra precisa mudar junto (mesmo padrão já existente entre o union
// "admin"|"dono"|"vendedor" de erpApi.ts e db/usuarios.js#salvarUsuario).
export const CORES_AVATAR = [
	"brand",
	"pink",
	"cyan",
	"orange",
	"green",
	"purple",
	"warning",
	"error",
] as const;

export type CorAvatar = (typeof CORES_AVATAR)[number];

// Cor sólida (-500) + texto branco, não o par pastel-bg/texto-colorido que
// AvatarText.tsx usa — o header (AppHeader.tsx, sempre #0F172A, não muda com o
// tema) precisa de contraste contra um fundo permanentemente escuro.
const CLASSES_COR_AVATAR: Record<CorAvatar, string> = {
	brand: "bg-brand-500 text-white",
	pink: "bg-pink-500 text-white",
	cyan: "bg-cyan-500 text-white",
	orange: "bg-orange-500 text-white",
	green: "bg-green-500 text-white",
	purple: "bg-purple-500 text-white",
	warning: "bg-warning-500 text-white",
	error: "bg-error-500 text-white",
};

const COR_PADRAO: CorAvatar = "brand";

export function corAvatarValida(
	cor: string | null | undefined,
): cor is CorAvatar {
	return !!cor && (CORES_AVATAR as readonly string[]).includes(cor);
}

export function classesCorAvatar(cor: string | null | undefined): string {
	return CLASSES_COR_AVATAR[corAvatarValida(cor) ? cor : COR_PADRAO];
}

// Sorteia uma cor diferente da atual, pra o botão "Cor aleatória" sempre
// mudar visivelmente algo em vez de às vezes repetir o que já estava lá.
export function corAvatarAleatoria(
	atual: string | null | undefined,
): CorAvatar {
	const opcoes = CORES_AVATAR.filter((c) => c !== atual);
	const lista = opcoes.length > 0 ? opcoes : CORES_AVATAR;
	return lista[Math.floor(Math.random() * lista.length)];
}
