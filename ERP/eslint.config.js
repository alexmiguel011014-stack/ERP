const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
	{
		ignores: [
			"node_modules/**",
			"dist/**",
			"graphify-out/**",
			"data/**",
			"modules/core/vendor/**",
			"servers/**",
		],
	},
	js.configs.recommended,
	{
		files: [
			"main.js",
			"database.js",
			"db/**/*.js",
			"ipc/**/*.js",
			"integracoes/**/*.js",
			"scripts/**/*.js",
			"test/**/*.js",
			"eslint.config.js",
		],
		languageOptions: {
			sourceType: "commonjs",
			globals: { ...globals.node },
		},
		rules: {
			"no-unused-vars": "warn",
			"no-empty": "warn",
		},
	},
	{
		// preload.js roda no contexto isolado do Electron: tem require() do Node
		// e acesso a window/document ao mesmo tempo (é a ponte contextBridge).
		files: ["preload.js"],
		languageOptions: {
			sourceType: "commonjs",
			globals: { ...globals.node, ...globals.browser },
		},
		rules: {
			"no-unused-vars": "warn",
		},
	},
	{
		// Módulos do renderer: várias tags <script> na mesma página HTML
		// compartilham escopo global via `window.X = ...` em um arquivo e uso de
		// `X` bare em outro — no-undef não consegue enxergar isso estaticamente
		// sem um bundler, então fica desligado aqui (não é um bug real).
		files: ["modules/**/*.js"],
		languageOptions: {
			sourceType: "script",
			globals: {
				...globals.browser,
				api: "readonly",
				erpBanco: "readonly",
			},
		},
		rules: {
			"no-unused-vars": "warn",
			"no-undef": "off",
			"no-empty": "warn",
		},
	},
];
