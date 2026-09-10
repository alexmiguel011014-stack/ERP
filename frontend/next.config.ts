import path from "path";
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
	/* config options here */
	// Servido pelo Electron via protocolo customizado app://renderer/ (ver
	// main.js) — sem basePath, já que app://renderer/ É a origem, não um
	// subcaminho dentro de um domínio maior.
	output: "export",
	// frontend/ é um projeto npm isolado de propósito (package.json/lockfile
	// próprios, ver README) dentro do repo raiz do Electron, que também tem
	// seu próprio lockfile — sem isso o Next infere a raiz errada e avisa em
	// todo build ("multiple lockfiles detected").
	outputFileTracingRoot: path.join(__dirname),
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
