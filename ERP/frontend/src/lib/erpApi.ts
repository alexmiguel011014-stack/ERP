// Espelha modules/core/banco.js's namespace-per-domínio, 1:1 — mesmo padrão
// já decidido no plano de migração (magical-soaring-squirrel.md). Só o
// namespace "clientes" existe por enquanto; cada módulo novo ganha o seu
// aqui conforme for portado, não tudo de uma vez.
function invocar<T>(nome: string, ...args: unknown[]): Promise<T> {
	const metodo = window.api?.[nome];
	if (typeof metodo !== "function") {
		return Promise.reject(new Error("API indisponível: " + nome));
	}
	return metodo(...args) as Promise<T>;
}

export type Cliente = {
	id: number;
	codigo: string | null;
	nome: string;
	cpf_cnpj: string | null;
	telefone: string | null;
	email: string | null;
	endereco: string | null;
	ativo?: number;
};

export type ClienteFormData = {
	nome: string;
	cpf_cnpj: string | null;
	endereco: string | null;
	telefone: string | null;
	email: string | null;
};

export type Fornecedor = {
	id: number;
	nome: string;
	cnpj: string | null;
	telefone: string | null;
	email: string | null;
	contato: string | null;
	prazo_pagamento_dias: number;
	observacao: string | null;
};

export type FornecedorFormData = {
	nome: string;
	cnpj: string | null;
	telefone: string | null;
	email: string | null;
	contato: string | null;
	prazo_pagamento_dias: number;
	observacao: string | null;
};

export type Usuario = {
	id: number;
	login: string;
	nome: string;
	perfil: "admin" | "dono" | "vendedor";
	ativo: number;
	criado_em: string;
	comissao_percentual: number;
	// JSON serializado (ver db/usuarios.js) — usar parsePermissoesUsuario() pra ler.
	permissoes: string;
};

export type UsuarioFormData = {
	id?: number;
	login: string;
	nome: string;
	perfil: "admin" | "dono" | "vendedor";
	comissao_percentual: number;
	ativo: boolean;
	senha: string;
	// Exigida pelo backend só quando o próprio admin/dono troca a senha dele
	// mesmo (ver db/usuarios.js#salvarUsuario) — nos demais casos é ignorada.
	senhaAtual?: string;
	permissoes: Record<string, boolean>;
};

export function parsePermissoesUsuario(
	texto: string | null | undefined,
): Record<string, boolean> {
	try {
		const obj = JSON.parse(texto || "{}");
		return obj && typeof obj === "object" ? obj : {};
	} catch {
		return {};
	}
}

export type LogAtividade = {
	id: number;
	usuario_id: number | null;
	usuario_login: string | null;
	acao: string;
	entidade: string | null;
	entidade_id: number | null;
	detalhes: string | null;
	data: string;
};

export type FiltroLogAtividades = {
	usuarioId?: number;
	acao?: string;
};

export type ResumoTabela = { tabela: string; total: number };

export type ConsultaTabela = {
	tabela: string;
	colunas: string[];
	linhas: Record<string, unknown>[];
	total: number;
	limite: number;
};

export type ExportacaoBanco = {
	caminho: string;
	tabelas: number;
	registros: number;
};

export type LinhaImportacaoVenda = {
	sku: string;
	quantidade: number;
	valorUnitario: number;
	data: string;
};

export type Lancamento = {
	id: number;
	tipo: "receber" | "pagar";
	descricao: string;
	valor: number;
	data_vencimento: string;
	data_pagamento: string | null;
	status: "aberto" | "pago";
	origem: "manual" | "venda" | "compra";
	referencia_id: number | null;
	forma_pagamento: string | null;
	data_criacao: string;
	grupo_id: string | null;
	parcela_num: number | null;
	parcela_total: number | null;
	categoria: string | null;
};

export type NovoLancamento = {
	tipo: "receber" | "pagar";
	descricao: string;
	valor: number;
	data_vencimento: string | null;
	parcelas: number;
	categoria: string | null;
};

// Lista fechada — precisa bater com CATEGORIAS_FINANCEIRAS em db/financeiro.js
// (o backend valida contra essa mesma lista; ver comentário lá).
export const CATEGORIAS_FINANCEIRAS = [
	"Aluguel",
	"Fornecedores",
	"Folha/Comissão",
	"Marketing",
	"Impostos",
	"Manutenção",
	"Investimento",
	"Outros",
] as const;

export type DiaFluxo = {
	dia: string;
	entradas: number;
	saidas: number;
	saldo: number;
	saldoAcumulado: number;
};

export type FluxoCaixa = {
	dias: DiaFluxo[];
	totalEntradas: number;
	totalSaidas: number;
	saldo: number;
};

export type FluxoCaixaProjetado = FluxoCaixa & {
	periodo: { inicio: string; fim: string };
};

export type LancamentoRecorrente = {
	id: number;
	tipo: "receber" | "pagar";
	descricao: string;
	valor: number;
	dia_mes: number;
	categoria: string | null;
	ativo: number;
	criado_em: string;
};

export type NovoLancamentoRecorrente = {
	tipo: "receber" | "pagar";
	descricao: string;
	valor: number;
	dia_mes: number;
	categoria: string | null;
};

export type ProvisaoDAS = {
	periodo: { inicio: string | null; fim: string | null };
	totalRecebido: number;
	aliquota: number;
	valorProvisionado: number;
};

export type FechamentoCaixa = {
	id: number;
	data_abertura: string;
	data_fechamento: string;
	valor_abertura: number;
	valor_esperado: number;
	valor_informado: number;
	diferenca: number;
	observacao: string | null;
	status: string;
};

export type Pagamento = {
	id: number;
	data_recebimento: string;
	valor_recebido: number;
	metodo: string;
	numero_identificador: string;
	status: "pendente" | "recebido";
	observacao: string | null;
	numero_venda: number | null;
	data_venda: string | null;
	cliente_id: number | null;
	cliente_nome: string | null;
};

export type NovoPagamento = {
	venda_id: number;
	cliente_id: number | null;
	metodo: string;
	numero_identificador: string;
	data_recebimento: string;
	valor_recebido: number;
	status: string;
	observacao: string;
};

export type ResultadoQrPix = {
	copiaECola: string;
	qrCodeDataUrl: string;
	txid: string;
	automatico: boolean;
};

export type Venda = {
	id: number;
	total: number;
	forma_pagamento: string | null;
	data_venda: string;
	desconto: number;
	observacao: string | null;
	status: "finalizada" | "orcamento" | "cancelado";
	nota_status: string | null;
	nota_numero: string | null;
	cliente_nome: string | null;
};

export type FiltroVendas = {
	dataInicio?: string | null;
	dataFim?: string | null;
	status?: string;
	formaPagamento?: string;
};

export type ItemVenda = {
	id: number;
	variacao_id: number;
	produto_nome: string;
	tamanho: string | null;
	cor: string | null;
	atributos: string | null;
	sku: string;
	quantidade: number;
	preco_unitario: number;
	subtotal: number;
	ncm: string | null;
	cfop_padrao: string | null;
	csosn: string | null;
	unidade_fiscal: string | null;
	origem_mercadoria: string | null;
	quantidade_devolvida: number;
};

export type PrecificacaoLinha = {
	id: number;
	produto_id: number;
	produto_nome: string;
	preco_custo: number;
	impostos_extras: number;
	margem_percentual: number | null;
	preco_venda: number;
	status: string;
	custo_variacao: number;
	preco_variacao: number;
	sku_primeiro: string | null;
	categorias: string | null;
	aplicar_custo_fixo: boolean;
};

export type CustoFixoConfig = {
	mensal: number;
	faturamentoMedioHistorico: number;
	mesesConsiderados: number;
	percentual: number;
};

export type ProdutoVariacao = {
	id: number;
	produto_id: number;
	nome: string;
	categoria_nome: string | null;
	subcategoria_nome: string | null;
	tamanho: string | null;
	cor: string | null;
	preco: number;
	preco_custo: number | null;
	quantidade_estoque: number;
	quantidade_reservada: number;
	quantidade_disponivel: number;
	estoque_minimo: number | null;
	sku: string;
	atributos: string | null;
	imagem: string | null;
};

// Shape real de buscarProdutosPorTermo (PDV) — mais estreito que
// ProdutoVariacao (sem categoria_nome/subcategoria_nome/preco_custo, que
// essa query não seleciona).
export type ProdutoBusca = {
	id: number; // id da variação — vira variacao_id no carrinho
	produto_id: number;
	sku: string;
	nome: string;
	tamanho: string | null;
	cor: string | null;
	preco: number;
	quantidade_estoque: number;
	quantidade_reservada: number;
	quantidade_disponivel: number;
	estoque_minimo: number | null;
	atributos: string | null;
	imagem: string | null;
};

export type CaixaAberto = {
	id: number;
	data_abertura: string;
	valor_abertura: number;
	usuario_abertura_id: number | null;
	status: string;
};

export type ResumoCaixa = {
	id: number;
	data_abertura: string;
	valor_abertura: number;
	vendido_em_dinheiro: number;
	valor_esperado_agora: number;
};

export type ItemCarrinho = {
	variacao_id: number;
	quantidade: number;
	preco_unitario: number;
};

export type NovaVendaDados = {
	itens: ItemCarrinho[];
	status?: "orcamento" | "finalizada";
	desconto?: number;
	total: number;
	cliente_id?: number | null;
	forma_pagamento?: string | null;
	observacao?: string | null;
};

export type ResultadoVenda = { success: boolean; vendaId: number };

// Crediário histórico (GOALS.md "4. Crediário histórico") — lançamento
// manual de uma dívida de Fiado antiga já vinculada a um cliente real.
export type VendaFiadoHistoricaDados = {
	cliente_id: number;
	sku: string;
	quantidade: number;
	valorUnitario: number;
	data: string;
	statusRecebivel: "aberto" | "pago";
};

export type ResultadoVendaFiadoHistorica = {
	success: boolean;
	vendaId: number;
	total: number;
};

export type DevolucaoDados = {
	venda_id: number;
	itens: { item_venda_id: number; quantidade: number }[];
	motivo?: string | null;
};

export type ResultadoDevolucao = {
	success: boolean;
	devolucaoId: number;
	valorTotal: number;
};

export type CotacaoFornecedor = {
	fornecedor_id: number;
	fornecedor_nome: string;
	preco_custo: number;
	prazo_entrega_dias: number | null;
	codigo_fornecedor: string | null;
};

export type CustoFornecedorProduto = {
	preco_custo: number;
	prazo_entrega_dias: number | null;
};

export type PedidoCompra = {
	id: number;
	fornecedor_id: number | null;
	fornecedor_nome: string | null;
	observacao: string | null;
	total: number;
	status: "aberto" | "parcial" | "recebido" | "cancelado";
	data_pedido: string;
};

export type ItemPedidoCompra = {
	id: number;
	quantidade: number;
	quantidade_recebida: number;
	custo_unitario: number;
	sku: string;
	atributos: string | null;
	tamanho: string | null;
	cor: string | null;
	produto_nome: string;
};

export type NovoPedidoCompra = {
	fornecedor_id: number | null;
	observacao: string | null;
	itens: { variacao_id: number; quantidade: number; custo_unitario: number }[];
};

export type ItemRecebido = { item_id: number; quantidade: number };

export type VariacaoProduto = {
	variacao_id: number;
	sku: string;
	codigo_barras: string | null;
	tamanho: string | null;
	cor: string | null;
	preco: number;
	preco_custo: number | null;
	quantidade_estoque: number;
	atributos: string | null;
	// listProdutosDetalhados (db/produtos.js) nunca seleciona essa coluna —
	// bug pré-existente do vanilla, não introduzido aqui: o filtro "Estoque
	// baixo" da modal de Lista de Produtos nunca funcionou de verdade (sempre
	// compara contra undefined/0). getEstoqueVisaoGeral, usado na tela de
	// Estoque, seleciona certo — só esta lista específica tem o gap.
	estoque_minimo?: number;
};

export type CategoriaSelecionada = {
	id: number;
	nome: string;
	categoria_pai_id: number | null;
	categoria_pai_nome: string | null;
};

export type ProdutoDetalhado = {
	id: number;
	nome: string;
	categoria_legada: string | null;
	categoria_nome: string | null;
	subcategoria_nome: string | null;
	categoria_id: number | null;
	subcategoria_id: number | null;
	imagem: string | null;
	ativo: number;
	categorias_selecionadas: CategoriaSelecionada[];
	variacoes: VariacaoProduto[];
};

export type NovoProdutoDados = {
	nome: string;
	categoria: null;
	categoria_id: null;
	subcategoria_id: null;
	categoriasSelecionadas: number[];
	variacoes: {
		sku: string;
		codigo_barras?: string | null;
		preco: number;
		preco_custo: number;
		quantidade_estoque: number;
		atributos: { chave: string; valor: string }[];
	}[];
};

export type CategoriaComUso = {
	id: number;
	codigo: string;
	nome: string;
	categoria_pai_id: number | null;
	categoria_pai_nome: string | null;
	tipo: "categoria" | "subcategoria";
	ativo: boolean;
	uso_count: number;
	// Só produtos com ativo=1 — é essa contagem que bloqueia Inativar (ao
	// contrário de Excluir, que bloqueia com QUALQUER vínculo, ativo ou não).
	uso_ativo_count: number;
};

export type EscolherImagemResultado = {
	success: boolean;
	cancelado?: boolean;
	imagem?: string;
};

export type ImagemPendenteResultado =
	| { cancelado: true }
	| { cancelado: false; caminho: string; dataUrl: string };

export type MovimentacaoEstoque = {
	id: number;
	tipo: "entrada" | "ajuste" | string;
	quantidade: number;
	custo_unitario: number | null;
	origem: string | null;
	observacao: string | null;
	data: string;
	sku: string;
	atributos: string | null;
	tamanho: string | null;
	cor: string | null;
	produto_nome: string;
};

export type EstoqueVisaoGeralLinha = {
	variacao_id: number;
	sku: string;
	quantidade_estoque: number;
	estoque_minimo: number;
	preco_custo: number | null;
	atributos: string | null;
	tamanho: string | null;
	cor: string | null;
	produto_nome: string;
	produto_id: number;
};

export type NovaEntradaEstoque = {
	itens: {
		variacao_id: number;
		quantidade: number;
		custo_unitario: number | null;
	}[];
	observacao: string | null;
	origem: string;
};

export type AjusteManualEstoque = {
	variacao_id: number;
	quantidade: number;
	observacao: string;
};

export type ResultadoAjusteEstoque = {
	success: boolean;
	alterado: boolean;
	diferenca?: number;
	quantidade_estoque: number;
	abaixoDoReservado?: boolean;
	quantidade_reservada?: number;
};

export type ResultadoImportacaoVendas = {
	importadas: number;
	puladas: number;
	total: number;
};

export type DreResultado = {
	periodo: { inicio: string; fim: string };
	vendas: number;
	receitaBruta: number;
	descontos: number;
	receitaLiquida: number;
	cmv: number;
	lucroBruto: number;
	margemBrutaPercentual: number;
	despesas: number;
	lucroLiquido: number;
	margemLiquidaPercentual: number;
};

export type RelatorioVendasResultado = {
	resumo: {
		vendas: number;
		faturamento: number;
		descontos: number;
		ticketMedio: number;
		vendasVariacao: number | null;
		faturamentoVariacao: number | null;
		periodoAnterior: { inicio: string; fim: string };
	};
	porDia: {
		dia: string;
		vendas: number;
		faturamento: number;
		descontos: number;
	}[];
	porPagamento: {
		forma_pagamento: string;
		vendas: number;
		faturamento: number;
	}[];
};

export type CurvaAbcLinha = {
	produto_nome: string;
	quantidade: number;
	receita: number;
	custo: number;
	lucro: number;
	margem: number;
	percentual: number;
	acumulado: number;
	classe: "A" | "B" | "C";
};

export type ComissaoLinha = {
	usuario_id: number;
	nome: string;
	login: string;
	perfil: string;
	vendas: number;
	total_vendido: number;
	comissao_percentual: number;
	comissao_valor: number;
};

export type MargemContribuicaoResultado = {
	periodo: { inicio: string; fim: string };
	taxaAdquirenteUsada: number;
	porProduto: {
		produto_id: number;
		produto_nome: string;
		quantidade: number;
		receita: number;
		margemContribuicao: number;
		margemContribuicaoUnitaria: number;
		margemContribuicaoPercentual: number;
	}[];
	margemContribuicaoTotal: number;
	margemContribuicaoUnitariaMedia: number;
	margemContribuicaoPercentualMedia: number;
};

export type PontoDeEquilibrioResultado = {
	periodo: { inicio: string; fim: string };
	custoFixoMensal: number;
	margemContribuicaoUnitariaMedia: number;
	margemContribuicaoPercentualMedia: number;
	quantidadeNecessaria: number | null;
	faturamentoNecessario: number | null;
};

export type GiroEstoqueLinha = {
	produto_id: number;
	produto_nome: string;
	quantidadeVendida: number;
	estoqueAtual: number;
	giro: number | null;
	diasParaReposicao: number | null;
};

export type SegmentacaoClienteLinha = {
	cliente_id: number;
	nome: string;
	telefone: string | null;
	frequencia: number;
	valorTotal: number;
	ultimaCompra: string | null;
	diasDesdeUltimaCompra: number | null;
	segmento: "Frequente" | "Ativo" | "Em risco" | "Inativo" | "Nunca comprou";
};

export type ProdutoParadoLinha = {
	produto_id: number;
	produto_nome: string;
	sku: string;
	quantidadeEstoque: number;
};

export type SazonalidadeResultado = {
	porDiaSemana: {
		diaSemana: number;
		nome: string;
		vendas: number;
		faturamento: number;
	}[];
	porHora: { hora: number; vendas: number; faturamento: number }[];
};

export type ConversaoOrcamentosResultado = {
	periodo: { inicio: string; fim: string };
	convertidas: number;
	canceladas: number;
	abertas: number;
	taxaConversaoPercentual: number | null;
};

export type AgingGrupo = {
	itens: {
		id: number;
		descricao: string;
		valor: number;
		data_vencimento: string;
		diasAtraso: number;
	}[];
	total: number;
	quantidade: number;
};

export type AgingRecebiveisResultado = {
	aVencer: AgingGrupo;
	atraso0a30: AgingGrupo;
	atraso31a60: AgingGrupo;
	atraso61a90: AgingGrupo;
	atraso90mais: AgingGrupo;
	totalGeral: number;
};

// Importação de dados da Loja House (pasta com JSONs 01_categorias.json,
// 02_produtos_variacoes.json, etc — ver db/importacoes.js). Duas rotas
// diferentes trazem "preview" com formas diferentes: validarPastaImportacao
// conta lancamentos/pendencias já somados, enquanto o dry-run de
// executarImportacao devolve os totais brutos por arquivo — não são o
// mesmo shape, por isso dois types (ver ipc/importacoes.js e db/importacoes.js).
export type PreviewImportacao = {
	categorias: number;
	produtos: number;
	variacoes: number;
	estoque: number;
	clientes: number;
	lancamentos: number;
	pendencias: number;
};

export type ValidacaoPastaImportacao =
	| { cancelado: true }
	| { erro: string }
	| {
			formato: "loja_house";
			pasta: string;
			arquivos: string[];
			preview: PreviewImportacao;
	  };

// Terceiro modo do wizard: planilha .xlsx nativa da Loja House (ver
// db/excel-loja-house.js). Mesmo preview de contagens de validarPasta, só
// muda "pasta"+"arquivos" por "caminho" (um arquivo só, não uma pasta).
export type ValidacaoArquivoExcelImportacao =
	| { cancelado: true }
	| { erro: string }
	| {
			formato: "excel";
			caminho: string;
			preview: PreviewImportacao;
	  };

// Entrada aceita por executarImportacao: pasta de JSONs (string), ou
// planilha Excel nativa — espelha os dois formatos que
// executarImportacaoLojHouse (via ipc/importacoes.js) já aceita além do
// array de {arquivo,conteudo} usado internamente para uploads de JSON.
export type EntradaImportacao = string | { tipo: "excel"; caminho: string };

export type PreviewDryRunImportacao = {
	categorias: number;
	produtos: number;
	variacoes: number;
	estoque: number;
	clientes: number;
	lancamentosHistoricos: number;
	contasAbertas: number;
	vendasHistoricas: number;
	pendenciasOrigem: number;
};

export type ConflitosImportacao = {
	duplicadasJaImportadas: number;
	alertasRegrasNegocio: string[];
};

export type ResultadoDryRunImportacao = {
	dryRun: true;
	preview: PreviewDryRunImportacao;
	conflitos: ConflitosImportacao;
	checksum: string;
};

export type ItensImportadosLote = {
	categorias: number;
	produtos: number;
	variacoes: number;
	estoque: number;
	clientes: number;
	lancamentos: number;
};

export type ErroImportacaoItem = {
	chave_externa: string;
	motivo: string;
};

export type ResultadoImportacaoLote = {
	batchId: string;
	importadas: ItensImportadosLote;
	ignoradas: number;
	pendencias: number;
	erros: ErroImportacaoItem[];
};

export type ErroImportacao = { erro: string };

// Retorno de executarImportacao: dry-run devolve preview leve, execução real
// devolve o lote gravado, e qualquer exceção vira { erro }. As duas variantes
// de sucesso ficam distintas por checagem de runtime ("dryRun" in resultado).
export type ResultadoExecucaoImportacao =
	| ResultadoDryRunImportacao
	| ResultadoImportacaoLote
	| ErroImportacao;

export type StatusLoteImportacao =
	| "sucesso"
	| "parcial"
	| "erro"
	| "em_progresso";

export type LoteImportacao = {
	id: string;
	data_importacao: string;
	usuario_id: number | null;
	origem: string;
	status: StatusLoteImportacao;
	total_itens: number;
	itens_importados: number;
	itens_ignorados: number;
	itens_erro: number;
};

export type PendenciaImportacao = {
	id: string;
	chave_externa: string | null;
	tipo_entidade: string;
	descricao: string | null;
	valor: number | null;
	motivo_rejeicao: string | null;
	sugestao: string | null;
	batch_id: string | null;
	data_criacao: string;
};

export type DetalhesLoteImportacao = {
	batch: LoteImportacao & { log: string; checksum: string };
	pendencias: PendenciaImportacao[];
	// JSON.parse(batch.log) no backend — mesmo shape de ResultadoImportacaoLote
	// quando o lote terminou de rodar, {} se log ainda não foi gravado.
	log: ResultadoImportacaoLote | Record<string, never>;
};

export type StatusConsignacao =
	| "emprestado"
	| "devolvido"
	| "vendido"
	| "perdido";

export type Consignacao = {
	id: number;
	cliente_id: number | null;
	variacao_id: number;
	quantidade: number;
	data_saida: string | null;
	data_prevista_retorno: string | null;
	status: StatusConsignacao;
	observacao: string | null;
	criado_em: string;
	cliente_nome: string | null;
	sku: string;
	tamanho: string | null;
	cor: string | null;
	preco: number;
	produto_nome: string;
};

export type NovaConsignacao = {
	cliente_id: number | null;
	variacao_id: number;
	quantidade: number;
	data_prevista_retorno: string | null;
	observacao: string | null;
};

export type MarcarVendidaConsignacao = {
	preco_unitario: number;
	forma_pagamento?: string | null;
	observacao?: string | null;
};

export type FiltroConsignacoes = {
	cliente_id?: number;
	status?: StatusConsignacao;
};

export type ErroConsignacao = { erro: string };

export const erpApi = {
	clientes: {
		listar: (incluirInativos?: boolean) =>
			invocar<Cliente[]>("getClientes", incluirInativos),
		proximoCodigo: () => invocar<string>("proximoCodigoCliente"),
		salvar: (dados: ClienteFormData) =>
			invocar<{ success: boolean; clienteId: number }>("salvarCliente", dados),
		atualizar: (id: number, dados: ClienteFormData) =>
			invocar<{ success: boolean }>("atualizarCliente", id, dados),
		remover: (id: number) =>
			invocar<{ success: boolean }>("removerCliente", id),
		precoEspecial: (clienteId: number, variacaoId: number) =>
			invocar<number | null>("getPrecoCliente", clienteId, variacaoId),
	},
	fornecedores: {
		listar: () => invocar<Fornecedor[]>("getFornecedores"),
		salvar: (dados: FornecedorFormData) =>
			invocar<{ success: boolean; fornecedorId: number }>(
				"salvarFornecedor",
				dados,
			),
		atualizar: (id: number, dados: FornecedorFormData) =>
			invocar<{ success: boolean }>("atualizarFornecedor", id, dados),
		remover: (id: number) =>
			invocar<{ success: boolean }>("removerFornecedor", id),
		cotacao: (variacaoId: number) =>
			invocar<CotacaoFornecedor[]>("getCotacaoProduto", variacaoId),
		custoProduto: (fornecedorId: number, variacaoId: number) =>
			invocar<CustoFornecedorProduto | null>(
				"getCustoFornecedorProduto",
				fornecedorId,
				variacaoId,
			),
	},
	produtos: {
		buscarSKU: (sku: string) =>
			invocar<ProdutoVariacao | null>("buscarSKU", sku),
		detalhados: (incluirInativos?: boolean) =>
			invocar<ProdutoDetalhado[]>("listarProdutosDetalhados", incluirInativos),
		proximoSku: () => invocar<string>("proximoSkuProduto"),
		salvar: (dados: NovoProdutoDados) =>
			invocar<{ success: boolean; produtoId: number }>("salvarProduto", dados),
		atualizar: (id: number, dados: NovoProdutoDados) =>
			invocar<{ success: boolean }>("atualizarProduto", id, dados),
		remover: (id: number) =>
			invocar<{ success: boolean }>("removerProduto", id),
		restaurar: (id: number) =>
			invocar<{ success: boolean }>("restaurarProduto", id),
		excluirPermanente: (id: number) =>
			invocar<{ success: boolean }>("excluirProdutoPermanente", id),
		escolherImagem: (produtoId: number) =>
			invocar<EscolherImagemResultado>("escolherImagemProduto", produtoId),
		escolherImagemPendente: () =>
			invocar<ImagemPendenteResultado>("escolherImagemPendente"),
		salvarImagemCaminho: (produtoId: number, caminho: string) =>
			invocar<EscolherImagemResultado>(
				"salvarImagemProdutoCaminho",
				produtoId,
				caminho,
			),
		removerImagem: (produtoId: number) =>
			invocar<{ success: boolean }>("removerImagemProduto", produtoId),
		imagem: (nomeArquivo: string) =>
			invocar<string | null>("getImagemProduto", nomeArquivo),
		buscarPorTermo: (termo: string) =>
			invocar<ProdutoBusca[]>("buscarProdutosTermo", termo),
	},
	categorias: {
		comUso: (incluirInativas?: boolean) =>
			invocar<CategoriaComUso[]>("categoriasWithUsage", incluirInativas),
		proximoCodigo: () => invocar<string>("proximoCodigoCategoria"),
		salvar: (nome: string, categoriaPaiId: number | null) =>
			invocar<{ success: boolean; id: number }>(
				"salvarCategoria",
				nome,
				categoriaPaiId,
			),
		atualizar: (
			id: number,
			dados: { nome: string; categoriaPaiId: number | null },
		) => invocar<{ success: boolean }>("atualizarCategoria", id, dados),
		remover: (id: number) =>
			invocar<{ success: boolean }>("removerCategoria", id),
		inativar: (id: number) =>
			invocar<{ success: boolean }>("inativarCategoria", id),
		reativar: (id: number) =>
			invocar<{ success: boolean }>("reativarCategoria", id),
	},
	estoque: {
		visaoGeral: () => invocar<EstoqueVisaoGeralLinha[]>("getEstoqueVisaoGeral"),
		movimentacoes: (limite?: number) =>
			invocar<MovimentacaoEstoque[]>("getMovimentacoesEstoque", limite),
		registrarEntrada: (dados: NovaEntradaEstoque) =>
			invocar<{ success: boolean }>("registrarEntradaEstoque", dados),
		ajustarManual: (dados: AjusteManualEstoque) =>
			invocar<ResultadoAjusteEstoque>("ajustarEstoqueManual", dados),
		salvarMinimo: (variacaoId: number, valor: number) =>
			invocar<{ success: boolean }>("salvarEstoqueMinimo", variacaoId, valor),
	},
	compras: {
		criarPedido: (dados: NovoPedidoCompra) =>
			invocar<{ success: boolean; pedidoId: number }>(
				"criarPedidoCompra",
				dados,
			),
		pedidos: () => invocar<PedidoCompra[]>("getPedidosCompra"),
		itensPedido: (pedidoId: number) =>
			invocar<ItemPedidoCompra[]>("getItensPedidoCompra", pedidoId),
		receberPedido: (pedidoId: number, itensRecebidos: ItemRecebido[]) =>
			invocar<{ success: boolean; pedidoId: number; status: string }>(
				"receberPedidoCompra",
				pedidoId,
				itensRecebidos,
			),
		cancelarPedido: (pedidoId: number) =>
			invocar<{ success: boolean }>("cancelarPedidoCompra", pedidoId),
	},
	precificacao: {
		dados: () => invocar<PrecificacaoLinha[]>("getPricingData"),
		margemGlobal: () => invocar<number>("getGlobalMargin"),
		salvarMargemGlobal: (valor: number) =>
			invocar<{ success: boolean }>("saveGlobalMargin", valor),
		custoFixoConfig: () => invocar<CustoFixoConfig>("getCustoFixoConfig"),
		salvarCustoFixoConfig: (mensal: number) =>
			invocar<{ success: boolean }>("saveCustoFixoConfig", mensal),
		salvarAplicarCustoFixo: (produtoId: number, aplicar: boolean) =>
			invocar<{ success: boolean }>("saveAplicarCustoFixo", produtoId, aplicar),
		salvarMargemProduto: (produtoId: number, margem: number) =>
			invocar<{ success: boolean }>("saveProductMargin", produtoId, margem),
		salvarPreco: (produtoId: number, precoVenda: number) =>
			invocar<{ success: boolean }>("saveProductPrice", produtoId, precoVenda),
		salvarCusto: (produtoId: number, custo: number) =>
			invocar<{ success: boolean }>("saveProductCost", produtoId, custo),
		salvarImpostos: (produtoId: number, valor: number) =>
			invocar<{ success: boolean }>("saveProductTaxes", produtoId, valor),
		aplicarMargemEmLote: (produtoIds: number[], margem: number) =>
			invocar<{ success: boolean; count: number }>(
				"massUpdateMargem",
				produtoIds,
				margem,
			),
		taxaAdquirente: () => invocar<number>("getTaxaAdquirente"),
		salvarTaxaAdquirente: (valor: number) =>
			invocar<{ success: boolean }>("saveTaxaAdquirente", valor),
		taxaAdquirentePorMetodo: (metodo: "pix" | "cartao") =>
			invocar<number | null>("getTaxaAdquirentePorMetodo", metodo),
		salvarTaxaAdquirentePorMetodo: (metodo: "pix" | "cartao", valor: number) =>
			invocar<{ success: boolean }>(
				"saveTaxaAdquirentePorMetodo",
				metodo,
				valor,
			),
	},
	usuarios: {
		listar: () => invocar<Usuario[]>("listarUsuarios"),
		salvar: (dados: UsuarioFormData) =>
			invocar<{ success: boolean }>("salvarUsuario", dados),
		remover: (id: number) =>
			invocar<{ success: boolean }>("removerUsuario", id),
	},
	banco: {
		logAtividades: (filtro: FiltroLogAtividades) =>
			invocar<LogAtividade[]>("getLogAtividades", filtro),
		listarTabelas: () => invocar<string[]>("listarTabelasBanco"),
		resumoTabelas: () => invocar<ResumoTabela[]>("resumoTabelasBanco"),
		consultarTabela: (tabela: string, limite?: number) =>
			invocar<ConsultaTabela>("consultarTabelaBanco", tabela, limite),
		exportarJSON: () => invocar<ExportacaoBanco>("exportarBancoJSON"),
		limparTabela: (tabela: string) =>
			invocar<{ tabela: string; registrosRemovidos: number }>(
				"limparTabelaBanco",
				tabela,
			),
		verificarSenhaAdmin: (senha: string) =>
			invocar<{ ok: boolean }>("verificarSenhaAdmin", senha),
	},
	vendas: {
		importarHistorico: (linhas: LinhaImportacaoVenda[]) =>
			invocar<ResultadoImportacaoVendas>("importarVendasHistoricas", linhas),
		listar: (filtro?: FiltroVendas) => invocar<Venda[]>("getVendas", filtro),
		itens: (vendaId: number) => invocar<ItemVenda[]>("getItensVenda", vendaId),
		converterOrcamento: (vendaId: number) =>
			invocar<{ success: boolean; vendaId: number }>(
				"converterOrcamento",
				vendaId,
			),
		atualizarNotaFiscal: (
			vendaId: number,
			dados: { status: string; numero: string | null },
		) => invocar<{ success: boolean }>("atualizarNotaFiscal", vendaId, dados),
		finalizar: (dados: NovaVendaDados) =>
			invocar<ResultadoVenda>("finalizarVenda", dados),
		registrarDevolucao: (dados: DevolucaoDados) =>
			invocar<ResultadoDevolucao>("registrarDevolucao", dados),
		registrarVendaFiadoHistorica: (dados: VendaFiadoHistoricaDados) =>
			invocar<ResultadoVendaFiadoHistorica>(
				"registrarVendaFiadoHistorica",
				dados,
			),
	},
	financeiro: {
		lancamentos: (filtro: { tipo?: string; status?: string }) =>
			invocar<Lancamento[]>("getLancamentos", filtro),
		criarLancamento: (dados: NovoLancamento) =>
			invocar<{ success: boolean; lancamentoId: number }>(
				"criarLancamento",
				dados,
			),
		baixar: (id: number) =>
			invocar<{ success: boolean }>("baixarLancamento", id),
		excluir: (id: number) =>
			invocar<{ success: boolean }>("excluirLancamento", id),
		fluxoCaixa: (inicio: string | null, fim: string | null) =>
			invocar<FluxoCaixa>("getFluxoCaixa", inicio, fim),
		aliquotaDAS: () => invocar<number>("getAliquotaDAS"),
		salvarAliquotaDAS: (valor: number) =>
			invocar<{ success: boolean }>("saveAliquotaDAS", valor),
		provisaoDAS: (inicio: string | null, fim: string | null) =>
			invocar<ProvisaoDAS>("getProvisaoDAS", inicio, fim),
		metaFaturamentoMensal: () => invocar<number>("getMetaFaturamentoMensal"),
		salvarMetaFaturamentoMensal: (valor: number) =>
			invocar<{ success: boolean }>("saveMetaFaturamentoMensal", valor),
		lancamentosVencendoHoje: () =>
			invocar<
				Pick<
					Lancamento,
					"id" | "tipo" | "descricao" | "valor" | "data_vencimento"
				>[]
			>("getLancamentosVencendoHoje"),
		fluxoCaixaProjetado: (inicio: string | null, fim: string | null) =>
			invocar<FluxoCaixaProjetado>("getFluxoCaixaProjetado", inicio, fim),
		lancamentosRecorrentes: () =>
			invocar<LancamentoRecorrente[]>("listarLancamentosRecorrentes"),
		criarLancamentoRecorrente: (dados: NovoLancamentoRecorrente) =>
			invocar<{ success: boolean; id: number }>(
				"criarLancamentoRecorrente",
				dados,
			),
		alternarLancamentoRecorrente: (id: number, ativo: boolean) =>
			invocar<{ success: boolean }>("alternarLancamentoRecorrente", id, ativo),
		removerLancamentoRecorrente: (id: number) =>
			invocar<{ success: boolean }>("removerLancamentoRecorrente", id),
	},
	caixa: {
		historico: (limite?: number) =>
			invocar<FechamentoCaixa[]>("getHistoricoCaixa", limite),
		aberto: () => invocar<CaixaAberto | null>("getCaixaAberto"),
		resumo: () => invocar<ResumoCaixa | null>("getResumoCaixaAberto"),
		abrir: (valorAbertura: number) =>
			invocar<{ success: boolean; caixaId: number }>(
				"abrirCaixa",
				valorAbertura,
			),
		fechar: (valorInformado: number, observacao: string | null) =>
			invocar<{
				success: boolean;
				valorEsperado: number;
				valorInformado: number;
				diferenca: number;
			}>("fecharCaixa", valorInformado, observacao),
	},
	pagamentos: {
		listar: (metodo?: string) =>
			invocar<Pagamento[]>("listarPagamentos", metodo),
		registrar: (dados: NovoPagamento) =>
			invocar<number>("registrarPagamento", dados),
		pagar: (id: number) => invocar<unknown>("pagarPagamento", id),
		gerarQrCodePix: (dados: {
			valor: number;
			txid?: string;
			descricao?: string;
		}) => invocar<ResultadoQrPix>("gerarQrCodePix", dados),
	},
	sistema: {
		checkForUpdates: () => invocar<unknown>("checkForUpdates"),
		downloadUpdate: () => invocar<{ success: boolean }>("downloadUpdate"),
		quitAndInstall: () => invocar<void>("quitAndInstall"),
		getAppVersion: () => invocar<string>("getAppVersion"),
	},
	relatorios: {
		dre: (inicio: string | null, fim: string | null) =>
			invocar<DreResultado>("getDRE", inicio, fim),
		vendasPeriodo: (inicio: string | null, fim: string | null) =>
			invocar<RelatorioVendasResultado>("getRelatorioVendas", inicio, fim),
		curvaABC: (inicio: string | null, fim: string | null) =>
			invocar<CurvaAbcLinha[]>("getCurvaABC", inicio, fim),
		comissoes: (inicio: string | null, fim: string | null) =>
			invocar<ComissaoLinha[]>("getComissoes", inicio, fim),
		margemContribuicao: (inicio: string | null, fim: string | null) =>
			invocar<MargemContribuicaoResultado>(
				"getMargemContribuicao",
				inicio,
				fim,
			),
		pontoDeEquilibrio: (inicio: string | null, fim: string | null) =>
			invocar<PontoDeEquilibrioResultado>("getPontoDeEquilibrio", inicio, fim),
		giroEstoque: (inicio: string | null, fim: string | null) =>
			invocar<GiroEstoqueLinha[]>("getGiroEstoque", inicio, fim),
		segmentacaoClientes: () =>
			invocar<SegmentacaoClienteLinha[]>("getSegmentacaoClientes"),
		produtosParados: (inicio: string | null, fim: string | null) =>
			invocar<ProdutoParadoLinha[]>("getProdutosParados", inicio, fim),
		sazonalidade: () => invocar<SazonalidadeResultado>("getSazonalidade"),
		conversaoOrcamentos: (inicio: string | null, fim: string | null) =>
			invocar<ConversaoOrcamentosResultado>(
				"getConversaoOrcamentos",
				inicio,
				fim,
			),
		agingRecebiveis: () =>
			invocar<AgingRecebiveisResultado>("getAgingRecebiveis"),
	},
	importacoes: {
		// Sem argumento: o próprio backend abre o dialog nativo do Electron
		// (dialog.showOpenDialog) e devolve a pasta escolhida.
		validarPasta: (pasta?: string) =>
			invocar<ValidacaoPastaImportacao>("validarPastaImportacao", pasta),
		// Mesma ideia, mas pra planilha Excel (.xlsx) nativa em vez de pasta
		// de JSONs — sem argumento também abre o dialog nativo, já filtrado
		// pra .xlsx.
		validarExcel: (caminho?: string) =>
			invocar<ValidacaoArquivoExcelImportacao>(
				"validarArquivoExcelImportacao",
				caminho,
			),
		executar: (
			pasta: EntradaImportacao,
			opcoes: { dryRun: boolean; dataMovimentacao?: string },
		) =>
			invocar<ResultadoExecucaoImportacao>("executarImportacao", pasta, opcoes),
		historico: () => invocar<LoteImportacao[]>("historicoImportacoes"),
		detalhes: (batchId: string) =>
			invocar<DetalhesLoteImportacao>("detalhesImportacao", batchId),
	},
	consignacoes: {
		registrar: (dados: NovaConsignacao) =>
			invocar<{ success: boolean; consignacaoId: number } | ErroConsignacao>(
				"registrarConsignacao",
				dados,
			),
		marcarDevolvida: (id: number) =>
			invocar<{ success: boolean } | ErroConsignacao>(
				"marcarConsignacaoDevolvida",
				id,
			),
		marcarPerdida: (id: number) =>
			invocar<{ success: boolean } | ErroConsignacao>(
				"marcarConsignacaoPerdida",
				id,
			),
		marcarVendida: (id: number, dados: MarcarVendidaConsignacao) =>
			invocar<{ success: boolean; vendaId: number } | ErroConsignacao>(
				"marcarConsignacaoVendida",
				id,
				dados,
			),
		listar: (filtro?: FiltroConsignacoes) =>
			invocar<Consignacao[] | ErroConsignacao>("listarConsignacoes", filtro),
	},
};
