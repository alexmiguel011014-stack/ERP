import type { NextConfig } from "next";
const nextConfig: NextConfig = {
	/* config options here */
	// Servido pelo Electron via protocolo customizado app://renderer/ (ver
	// main.js) — sem basePath, já que app://renderer/ É a origem, não um
	// subcaminho dentro de um domínio maior.
	output: "export",
	trailingSlash: true,
	images: {
		unoptimized: true,
	},
	webpack(config) {
		config.module.rules.push({
			test: /\.svg$/,
			use: ["@svgr/webpack"],
		});
		return config;
	},
};

export default nextConfig;
