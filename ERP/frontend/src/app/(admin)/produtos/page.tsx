"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProdutosIndexPage() {
	const router = useRouter();
	useEffect(() => {
		router.replace("/produtos/cadastro");
	}, [router]);
	return null;
}
