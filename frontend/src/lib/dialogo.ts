// Substituto in-app de window.alert()/window.confirm() (GOALS 31).
//
// Por que existe: no Electron/Windows, depois que um alert()/confirm() nativo
// fecha, a janela inteira pode ficar sem aceitar digitação até dar alt-tab
// (electron/electron#19977, #40212; corrigido só na 43.x ≥ #54462). O app tinha
// 38 desses diálogos. Aqui o diálogo é um modal React normal — nunca tira o
// foco do teclado da janela — e `eslint no-alert` impede a volta do nativo.
//
// Este módulo não importa React: é a ponte imperativa que o <DialogoHost/>
// (montado uma vez no layout autenticado) registra. Assim também funciona em
// funções comuns, fora de componentes (ex.: lib/utils/vendasExport.ts).

export type TipoAviso = "erro" | "info" | "sucesso";

export type OpcoesConfirmar = {
	titulo?: string;
	mensagem: string;
	confirmarLabel?: string;
	cancelarLabel?: string;
	// Ação destrutiva: o foco inicial vai pro Cancelar (Enter não confirma
	// sem querer). Nos demais, o foco vai pro Confirmar — o PDV é guiado por
	// teclado e o confirm() nativo também confirmava com Enter.
	destrutivo?: boolean;
};

export type OpcoesAviso = {
	titulo?: string;
	mensagem: string;
	tipo?: TipoAviso;
};

export type PedidoDialogo =
	| {
			tipo: "confirmar";
			opcoes: OpcoesConfirmar;
			resolver: (confirmou: boolean) => void;
	  }
	| { tipo: "avisar"; opcoes: OpcoesAviso; resolver: () => void };

let host: ((pedido: PedidoDialogo) => void) | null = null;
// Pedidos feitos antes do host montar (ou enquanto troca) esperam aqui em vez
// de sumir — a Promise só resolve quando alguém responde.
const pendentes: PedidoDialogo[] = [];

export function registrarHostDeDialogos(
	receber: (pedido: PedidoDialogo) => void,
): () => void {
	host = receber;
	while (pendentes.length > 0) receber(pendentes.shift()!);
	return () => {
		if (host === receber) host = null;
	};
}

function enviar(pedido: PedidoDialogo) {
	if (host) host(pedido);
	else pendentes.push(pedido);
}

export function confirmar(opcoes: OpcoesConfirmar | string): Promise<boolean> {
	return new Promise<boolean>((resolver) => {
		enviar({
			tipo: "confirmar",
			opcoes: typeof opcoes === "string" ? { mensagem: opcoes } : opcoes,
			resolver,
		});
	});
}

export function avisar(opcoes: OpcoesAviso | string): Promise<void> {
	return new Promise<void>((resolver) => {
		enviar({
			tipo: "avisar",
			opcoes: typeof opcoes === "string" ? { mensagem: opcoes } : opcoes,
			resolver,
		});
	});
}
