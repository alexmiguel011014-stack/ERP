import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
	baseDirectory: __dirname,
});

const eslintConfig = [
	// *.d.ts: arquivos de ambient declaration (shims pra módulo sem tipos,
	// next-env.d.ts gerado pelo próprio Next.js) — não é código de app, e
	// `next lint` (que este projeto usava antes) já os ignorava por padrão.
	{ ignores: [".next/**", "out/**", "node_modules/**", "**/*.d.ts"] },
	...compat.extends("next/core-web-vitals", "next/typescript"),
	// Diálogos nativos (alert/confirm/prompt) deixam a janela do Electron sem
	// aceitar digitação até dar alt-tab no Windows (electron/electron#19977,
	// #40212, #54462) — use `confirmar()`/`avisar()` de "@/lib/dialogo"
	// (GOALS 31). Esta regra é a trava pra isso não voltar.
	{ rules: { "no-alert": "error" } },
];

export default eslintConfig;
