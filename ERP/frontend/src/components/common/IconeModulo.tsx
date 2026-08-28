// Renderiza o SVG bruto que já vem no manifesto (modulo.json) — mesmo ícone
// usado no navbar.js vanilla, sem reconverter pra componente React um por
// um. Fonte confiável (nossos próprios arquivos, não dado de usuário).
// Compartilhado entre AppSidebar.tsx e a faixa de abas do AppHeader.tsx.
export default function IconeModulo({ svg }: { svg: string }) {
	return (
		<span
			className="[&>svg]:h-[18px] [&>svg]:w-[18px]"
			dangerouslySetInnerHTML={{ __html: svg }}
		/>
	);
}
