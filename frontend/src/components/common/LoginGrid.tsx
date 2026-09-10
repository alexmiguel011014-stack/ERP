// Grade decorativa do painel direito do login — pedido do dono (2026-09-01):
// "opção 1" das 4 comparadas (ver artifact "Opções de Grade"), a mesma ideia
// do GridShape.tsx original (linhas retas em dois cantos opostos), mas em
// CSS puro em vez de duas cópias de um SVG estático — precisa de controle
// fino sobre o RAIO do fade pra a grade sumir suavemente antes de encostar
// no GIF centralizado, não só "decorar os cantos" como o original fazia.
// mask-image radial: forte no canto, transparente a partir de ~62% do
// tamanho do próprio bloco — como cada bloco tem 560px e o GIF ocupa até
// 314px de largura centralizado no painel, a transição termina antes da
// borda do GIF em vez de brigar com ele.
const GRADE =
	"repeating-linear-gradient(0deg, rgba(255,255,255,.10) 0 1px, transparent 1px 44px), " +
	"repeating-linear-gradient(90deg, rgba(255,255,255,.10) 0 1px, transparent 1px 44px)";

export default function LoginGrid() {
	return (
		<>
			<div
				aria-hidden
				className="pointer-events-none absolute -right-16 -top-16 z-0 size-[560px]"
				style={{
					backgroundImage: GRADE,
					WebkitMaskImage:
						"radial-gradient(circle at top right, black 0%, transparent 62%)",
					maskImage:
						"radial-gradient(circle at top right, black 0%, transparent 62%)",
				}}
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute -bottom-16 -left-16 z-0 size-[560px]"
				style={{
					backgroundImage: GRADE,
					WebkitMaskImage:
						"radial-gradient(circle at bottom left, black 0%, transparent 62%)",
					maskImage:
						"radial-gradient(circle at bottom left, black 0%, transparent 62%)",
				}}
			/>
		</>
	);
}
