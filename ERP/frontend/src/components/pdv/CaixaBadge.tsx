"use client";
import Badge from "@/components/ui/badge/Badge";

export default function CaixaBadge({
	aberto,
	carregando,
	onClick,
}: {
	aberto: boolean;
	carregando: boolean;
	onClick: () => void;
}) {
	return (
		<button type="button" onClick={onClick} className="inline-flex">
			<Badge color={carregando ? "light" : aberto ? "success" : "error"}>
				{carregando ? "Caixa..." : aberto ? "Caixa aberto" : "Caixa fechado"}
			</Badge>
		</button>
	);
}
