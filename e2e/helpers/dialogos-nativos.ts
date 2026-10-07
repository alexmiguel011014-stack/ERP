import { expect } from "@playwright/test";
import type { Page } from "playwright-core";

// Tripwire (GOALS 31): falha o teste se QUALQUER diálogo JS nativo
// (alert/confirm/prompt/beforeunload) abrir. No Electron/Windows um desses
// deixa a janela inteira sem aceitar digitação até dar alt-tab
// (electron/electron#19977, #40212) — o app usa confirmar()/avisar() de
// "@/lib/dialogo" no lugar, e a regra `no-alert` do ESLint cobre o código.
// Aqui cobrimos o comportamento em runtime nos fluxos já migrados.
//
// Uso: `const vigia = vigiarDialogosNativos(window);` no beforeAll e
// `vigia.garantirNenhum()` no fim de cada teste (ou afterEach).
export function vigiarDialogosNativos(page: Page) {
	const vistos: string[] = [];
	page.on("dialog", (dialogo) => {
		vistos.push(`${dialogo.type()}: ${dialogo.message()}`);
		// Dispensa pra o teste não ficar pendurado no diálogo; a falha vem do
		// garantirNenhum().
		void dialogo.dismiss();
	});
	return {
		garantirNenhum() {
			expect(
				vistos,
				"diálogo nativo (alert/confirm/prompt) apareceu — use confirmar()/avisar() de @/lib/dialogo",
			).toEqual([]);
		},
	};
}
