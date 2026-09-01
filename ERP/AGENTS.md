# AGENTS.md — ERP House Kimono

Memória de projeto para futuras sessões de IA + índice de automação (base_project).

## Automação e Economia de Tokens

- Siga as diretivas em `rules.md` (economia de tokens, workflow, ferramentas globais).
- Sub-agentes em `.opencode/agent/`:
  - `@architect`: arquitetura, análise e planejamento (read-only).
  - `@coder`: implementação e refatoração cirúrgica.
  - `@reviewer`: testes, validação e commits (Conventional Commits).
- Rode `/bootstrap` (ou `.\bootstrap.ps1`) para checar/instalar ferramentas globais
  (`gh`, `graphify`, `repomix`, `biome`, `typescript`) e gerar `repomix-output.xml` + `graphify-out/`.
- Análise de codebase: consulte `graphify-out/` ou `repomix-output.xml` ANTES de ler arquivos inteiros.

## Projeto

ERP desktop offline para uma loja de artigos de Jiu-Jitsu, empacotado como .exe.
Stack: Electron.js + Node.js + SQLite + HTML/CSS/JS puro.
Paleta visual: Tatame Clean (clara: `#F8FAFC`, `#FFFFFF`, `#1E293B`, `#2563EB`, `#16A34A`, `#E2E8F0`; dark: `#0F172A`, `#1E293B`, `#3B82F6`, `#E2E8F0`).

Repositório: `https://github.com/alexmiguel011014-stack/ERP.git` (branch `main`, push via HTTPS).
Versão atual: `v1.0.5` (`package.json`). Releases publicadas no GitHub Releases.

### Processo de release (checado em 2026-08-19, era conhecimento tribal até aqui)

`npm run build`/`npm run dist` (`electron-builder`) só geram o `.exe` em `dist/` — **não**
publicam sozinhos, apesar do bloco `"publish"` já configurado em `package.json` (provider
`github`, repo `alexmiguel011014-stack/ERP`). CI (`.github/workflows/ci.yml`) roda só
lint+test, nunca build/publish — releases são feitas manualmente, do computador de quem for
publicar:

```powershell
$env:GH_TOKEN = "<personal access token com escopo repo>"
npx electron-builder --publish always -c.extraMetadata.erpSuporte.login=$env:ERP_SUPORTE_LOGIN -c.extraMetadata.erpSuporte.senha=$env:ERP_SUPORTE_SENHA
```

`GH_TOKEN` é lido automaticamente pelo `electron-builder` (convenção própria dele) — nunca
colocar em `.env`, `package.json` ou qualquer arquivo versionado; é uma variável de ambiente
da sessão de quem publica, igual a qualquer outro token deste projeto (ver seção de Segurança
sobre credenciais de integração). Gerar o token em github.com → Settings → Developer settings
→ Personal access tokens, escopo `repo` (ou o fine-grained equivalente com permissão de
Contents: Read and write no repositório `ERP`).

As duas flags `-c.extraMetadata.erpSuporte.*` são **opcionais** (a conta de suporte do
desenvolvedor — ver GOALS.md — só é criada se ambas estiverem definidas no shell de quem
publica; omitir as duas gera um build idêntico ao de antes desta feature existir). Sintaxe
verificada contra o próprio código-fonte/testes do electron-builder (`-c.<caminho.aninhado>`
funciona pra qualquer campo de config, incluindo `extraMetadata` — não é uma expansão
`${env.X}` dentro de um `extraMetadata` estático em `package.json`, que não é garantida pra
esse campo especificamente).

**Achado real (2026-08-29): `ERP_SUPORTE_LOGIN=adm` colide com o login que a própria loja
tipicamente escolhe no primeiro acesso.** `garantirContaSuporte()` (`db/usuarios.js`) é
deliberadamente segura contra colisão — nunca embrulha um login que já pertence a uma conta
real, pra nunca quebrar o acesso de ninguém. Isso significa que se a loja (ou o próprio dono
testando) digitar `adm` como o primeiro login/senha da instalação, a conta de suporte nunca
ativa naquela instalação — silenciosamente, por design. Verificado ao vivo (2026-08-29): a
senha de suporte real não desembrulha a entrada `"adm"` de `erp_usuarios.json` numa
instalação de teste — exatamente esse cenário, confirmado criptograficamente (AES-GCM auth
tag não bate), não só por suspeita.

**Decisão final (2026-08-31): `adm` voltou a ser `ERP_SUPORTE_LOGIN`** (não mais
`allu_suporte`, que só durou dois dias) — mas dessa vez com a colisão eliminada, não só
evitada. `adm` agora é um login **reservado**: `autenticarUsuario()` recusa usá-lo como
bootstrap de instalação nova quando `ERP_SUPORTE_LOGIN` já está configurado (checado ANTES
de abrir/chavear o banco, pra nunca deixar o arquivo `.sqlite` keyed com uma senha rejeitada
e zero usuários), e `salvarUsuario()` recusa criar um usuário novo com esse login pela tela
de Gerenciar Acessos. Com isso a loja nunca mais consegue reivindicar `adm` por engano — o
login fica garantido pro mecanismo de suporte em toda instalação nova, sem exceção. A
proteção de colisão em `garantirContaSuporte()` continua existindo como rede de segurança
(cobre instalações antigas publicadas antes desta mudança, e qualquer cenário onde
`ERP_SUPORTE_LOGIN` não estava configurado no momento exato do bootstrap), mas não deveria
mais disparar em instalações novas. Senha atual: fornecida diretamente pelo dono, nunca
escrita em nenhum arquivo deste repo (ver `.env.example`).

**Pegadinha real (achada em 2026-08-28, primeira vez publicando pra valer): a release sai
como rascunho ("draft") por padrão**, mesmo com `--publish always`. Nesse estado o
`electron-updater` não a enxerga — `checkForUpdates()` nunca encontra uma release rascunho.
Depois de publicar, confirme e corrija se necessário:

```powershell
gh release view vX.Y.Z --repo alexmiguel011014-stack/ERP    # confere "draft: true/false"
gh release edit vX.Y.Z --repo alexmiguel011014-stack/ERP --draft=false   # publica de verdade
```

**Bug real e grave, achado em 2026-08-29 (causou tela branca em todo build empacotado desde
o cutover): `frontend/out/**/*` em `build.files` nunca incluía nenhum arquivo no pacote
final**, apesar do padrão aparecer corretamente resolvido em `dist/builder-debug.yml` —
comportamento/bug do electron-builder com essa combinação específica de padrões, não
confirmado a causa raiz exata (tentativa de isolar via leitura de código-fonte do
electron-builder não foi conclusiva). Só `modules/**/*` (o app antigo) chegava no pacote;
`frontend/` sumia inteiro. Sintoma: tela branca total, **sem nenhum erro no
`erp-crash.log`** (o protocolo `app://renderer/` simplesmente não tinha nada pra servir).
Diagnosticado extraindo o `app.asar` de verdade (`npx asar extract`) e comparando com o
código-fonte — nenhum teste automatizado (lint/typecheck/unit/e2e) pega esse tipo de bug,
porque todos rodam contra o **source**, nunca contra o **pacote final**; e2e roda via
`electron .` (não empacotado), então nunca exercitou esse caminho.

**Corrigido trocando pra `extraResources`** (mecanismo mais robusto e documentado pra
diretórios grandes pré-buildados, ao invés de depender do glob matching de `files` pra uma
combinação que aparentemente ele resolve mal): `frontend/out` agora copia via
`build.extraResources` pra `resources/frontend/out` (fora do asar, não dentro). `main.js`
resolve o caminho condicionalmente: `app.isPackaged ? path.join(process.resourcesPath,
"frontend", "out") : path.join(__dirname, "frontend", "out")` — em dev continua igual, só o
caminho empacotado mudou.

**Lição pra próxima vez**: depois de qualquer mudança em `build.files`/`extraResources`,
verificar de verdade que o pacote final tem o que devia, não só que o `files` config parece
certo:
```powershell
npx electron-builder --dir --win               # build rápido, sem publish/assinatura
npx asar list "dist\win-unpacked\resources\app.asar" | Select-String "^/frontend"
# ou, se usar extraResources: dir "dist\win-unpacked\resources\frontend\out"
```

**Mesmo bug voltou de outro jeito, achado de novo em 2026-08-29 (a v1.1.7 publicada de
verdade no GitHub saiu SEM `frontend/out` — mesmo depois do fix do `extraResources`
acima).** Causa desta vez não foi config, foi **processo**: o build local que eu verifiquei
manualmente (`--dir`, checando `resources/frontend/out/index.html`) não era o MESMO build
que efetivamente virou o `.exe` publicado — nada garantia que `frontend/out/` estava fresco
no exato momento em que o `electron-builder --publish always` rodou de verdade. Sintoma:
app abre e mostra literalmente `Not Found` (a resposta 404 do próprio `main.js`) em vez de
tela branca — mais fácil de reconhecer que o bug anterior, mas raiz idêntica (frontend
faltando no pacote).

**Corrigido pra nunca mais depender de lembrar manualmente**: `package.json` →
`build.beforePack` aponta pra `scripts/before-pack.js`, que roda automaticamente ANTES do
electron-builder copiar qualquer arquivo — não importa como ele foi invocado (`--dir`,
`--publish always`, via `npm run build`). O hook builda `frontend/` do zero e **falha o
build inteiro** se `frontend/out/index.html` não existir depois. Testado de propósito:
apaguei `frontend/out/` manualmente, rodei `electron-builder --dir`, confirmei que o hook
rebuildou sozinho e o pacote final tinha o arquivo — não é só "parece certo no código", foi
verificado ao vivo partindo do estado quebrado.

## Comandos Essenciais

```powershell
npm install           # Instalar dependências
npm start             # Rodar o Electron (dev)
npm run build         # Gerar .exe instalador (NSIS)

npm test              # Testes automatizados (test/: integration + senha)
npm run lint          # ESLint (eslint.config.js)

node scripts/test-db.js          # CRUD produtos/categorias em banco temporário
node scripts/test-migracao.js    # Abre um banco de schema antigo e valida a migração
npx electron scripts             # E2E: login + visita todas as páginas, coleta erros de console
node scripts/corrigir-encoding.js [--aplicar]   # Detecta/corrige mojibake (UTF-8 duplo)
```

> `npx electron scripts` exige `ELECTRON_RUN_AS_NODE` **desligado** no shell.

## Estrutura do Projeto

```
ERP/
├── package.json / package-lock.json
├── main.js                          -- Processo principal Electron
├── preload.js                       -- Ponte IPC (contextBridge)
├── database.js                      -- Fachada de compatibilidade: re-exporta db/
├── eslint.config.js                 -- Lint (npm run lint)
├── ERP_Launcher.bat                 -- Lançador (chama o .vbs)
├── ERP_Launcher.vbs                 -- Lançador silencioso (sem console)
├── rules.md                         -- Regras operacionais (base_project)
├── opencode.json                    -- Config OpenCode (modelos)
├── bootstrap.ps1 / bootstrap.sh     -- Setup de ambiente portátil
├── AGENTS.md                        -- Este arquivo
│
├── .opencode/
│   ├── agent/                       -- architect, coder, reviewer
│   └── command/                     -- /bootstrap
│
├── build/                           -- Ícone do .exe e assets de empacotamento
├── data/                            -- DB dev + backups automáticos (gitignored)
├── docs/                            -- DB_PATHS.md, SHORTCUTS.md
│
├── db/                              -- Camada de dados por domínio (conexao, schema, usuarios,
│                                      produtos, vendas, estoque, financeiro, etc.)
├── ipc/                             -- Handlers ipcMain por domínio (auth, vendas, estoque, ...)
├── integracoes/                     -- Adapters de provedor externo (Pix, fiscal) — ver seção própria abaixo
│   ├── pix/                         -- payload.js (QR genérico), qrimage.js, provider.js, providers/efi.js
│   └── fiscal/                      -- provider.js, providers/focusnfe.js
│
├── modules/                         -- Módulos organizados por funcionalidade
│   ├── core/                        -- Shared: auth.js, banco.js, formatos.js, head.js,
│   │                                  loading.js, navbar.js, store.js, modulos.css
│   ├── acessos/                     -- Gerenciar usuários/acessos (admin)
│   ├── atualizacao/                 -- Página de atualizações
│   ├── auth/                        -- Tela de login
│   ├── banco/                       -- Inspeção crua das tabelas (admin)
│   ├── clientes/                    -- Cadastro de clientes + lista
│   ├── compras/                     -- Pedidos e recebimento de mercadorias
│   ├── dashboard/                   -- Dashboard principal (abas via iframe)
│   ├── entrada/                     -- Entrada de estoque + estoque negativo
│   ├── financeiro/                  -- Contas a pagar/receber + fluxo de caixa
│   ├── fornecedores/                -- CRUD de fornecedores
│   ├── importacao/                  -- Importação de dados
│   ├── pagamentos/                  -- Recebimentos (Pix/Boleto/etc.) vinculados a vendas
│   ├── pdv/                         -- Frente de Caixa + recibo
│   ├── precificacao/                -- Precificação e margens
│   ├── produtos/                    -- Cadastro de produtos + categorias + gerenciamento
│   ├── relatorios/                  -- Vendas por período + Curva ABC
│   └── vendas/                      -- Histórico + exportação CSV
│
├── scripts/                         -- Utilitários manuais: test-db.js, test-migracao.js,
│                                      test-ui.js, corrigir-encoding.js, criar-atalho.*
└── test/                            -- Testes automatizados (npm test): integration.test.js, senha.test.js
```

## Frontend novo (`frontend/`, Next.js — em migração)

`modules/` (HTML/CSS/JS puro) está sendo migrado telas-por-tela pra um frontend novo em
`frontend/`: Next.js 15 + React 19 + Tailwind v4, build estático (`output: 'export'`,
`trailingSlash: true`), servido pelo Electron via protocolo customizado `app://renderer/`
(registrado em `main.js`, não um servidor HTTP local — ver `magical-soaring-squirrel.md`
pro racional completo). Os dois frontends coexistem até o cutover final (Fase 6 do plano);
`modules/**` só sai do repo depois disso, nunca antes.

- **Cutover feito (2026-08-28)**: o frontend novo é o padrão agora (`main.js`,
  `CARREGAR_FRONTEND_ANTIGO`). `ERP_LEGACY_FRONTEND=1` força o `modules/` antigo — válvula
  de escape interna pra emergência, nunca documentada/usada pelo usuário final.
  `ERP_Launcher.bat` é o único lançador agora (o antigo `ERP_Launcher_NovoFrontend.bat`
  virou redundante e foi removido). `modules/**` continua no repo, não apagado ainda —
  Fase 6 do plano original (`magical-soaring-squirrel.md`) pede uma passada de regressão
  completa nas ~22 telas, os dois perfis, os dois temas, antes de remover de vez.
- **Projeto npm isolado**: `frontend/` tem `package.json`/lockfile próprios — nunca rodar
  `npm install` nele a partir da raiz (que é `"type": "commonjs"`, só Electron). Só
  `frontend/out/` (o build estático) entra no pacote final (`package.json` → `build.files`).
- **`trailingSlash: true` é obrigatório** (export estático — cada rota vira
  `rota/index.html`), o que significa `usePathname()` sempre devolve a rota com barra no
  final (`"/financeiro/"`), nunca sem. Qualquer comparação direta com um href construído
  sem barra (`hrefDoModulo()`, `"/produtos/cadastro"` etc.) precisa passar por
  `normalizarPathname()` (`hooks/useModulos.ts`) antes de comparar — bug real já pego e
  corrigido uma vez (fazia o sistema de abas do header só reconhecer o Dashboard).
- **Camada de acesso a dados**: `lib/erpApi.ts` espelha `window.api` (o mesmo IPC que
  `modules/` já usa) em namespaces por domínio, na mesma linha de `modules/core/banco.js`.
  Hooks simples por entidade em cima (`hooks/use*.ts`) — sem React Query/SWR, decisão
  deliberada (IPC local, não tem o que cachear/retry como dado de rede).
- **Sessão**: 100% estado do processo principal, sem token client-side — `AuthContext` só
  lê a sessão uma vez no mount do shell `(admin)/layout.tsx`.
- **Sistema de abas do header** (`context/TabsContext.tsx` + `layout/AbasAtivasWrapper.tsx`):
  mantém múltiplos módulos "montados" ao mesmo tempo (um `Map<pathname, ReactNode>`
  capturado na primeira visita, entradas inativas só escondidas via `hidden`, não
  desmontadas) — reimplementação manual porque o mecanismo nativo do Next
  (`cacheComponents`/`<Activity>`) exige a versão 16 (projeto está na 15.5.23).
- Sem suíte de teste automatizado ainda (`frontend/package.json` não tem script `test`) —
  todo o trabalho é verificado manualmente contra o app rodando. CI (ver seção acima) roda
  só lint+typecheck do frontend, sem build.
- Progresso módulo-por-módulo, decisões de arquitetura detalhadas e histórico de bugs:
  `GOALS.md`.

## Banco de Dados

- Arquivo: `erp.sqlite` (criptografado com SQLCipher). Dev: `./data/` | Produção: `%APPDATA%/ERP/`.
- 8 tabelas principais: `Categorias` (2 níveis), `Produtos`, `Variacoes` (sku UNIQUE, atributos JSON, preço de custo, `estoque_minimo`), `Clientes` (cpf/cnpj, email, endereco), `Vendas` (desconto, observacao, status), `ItensVenda`, `Precificacao`, `Usuarios` (login, nome, perfil, ativo) (+ `ProdutoCategorias`/`Configuracao`).
- Novas tabelas: `MovimentacoesEstoque`, `Fornecedores`, `PedidosCompra` + `ItensPedidoCompra`, `LancamentosFinanceiros`.
- `PRAGMA foreign_keys = ON`; FKs com `ON DELETE CASCADE/RESTRICT`.
- **Criptografia**: ao fazer login, a senha do app deriva a chave (SHA-256) que destrava o banco via SQLCipher. Banco em texto plano é migrado automaticamente no primeiro login. Troca de senha usa `PRAGMA rekey`. Backups são cópias do arquivo criptografado. Cada usuário do sistema tem login+senha; a chave-mestre é embrulhada por login/senha via AES-256-GCM (`erp_usuarios.json` ao lado do DB), permitindo vários usuários de acesso.
- Backups automáticos diários em `data/backups/` (dev) ou `userData/backups/` (produção).

## Integrações Externas (Pix / Fiscal)

Estrutura genérica pronta, aguardando credenciais reais (loja não é do desenvolvedor;
certificado A1 e conta em provedor de pagamento ainda pendentes de acesso — ver `GOALS.md`).

- **Padrão adapter**: `integracoes/<pix|fiscal>/provider.js` lê `PIX_PROVIDER`/`FISCAL_PROVIDER`
  do `.env` e devolve o adapter concreto (`integracoes/<pix|fiscal>/providers/*.js`) já
  configurado, ou `null` se não houver credenciais — nenhuma tela trava por falta de provedor.
  Trocar de provedor é escrever um novo arquivo em `providers/`, sem tocar o resto do app.
- **Pix — sem provedor configurado**: `integracoes/pix/payload.js` gera um QR Code Pix
  "Copia e Cola" (padrão BR Code/EMV do Bacen) genérico, que funciona com a chave Pix de
  qualquer banco, sem conta em lugar nenhum. Confirmação de recebimento fica manual (como
  já era antes desta integração).
- **Pix — com `PIX_PROVIDER=efi`**: usa a API Pix da Efí (mTLS + OAuth2) pra gerar cobrança
  vinculada e permitir confirmação automática depois. Ver `.env.example` pras variáveis.
- **Fiscal — sem provedor configurado**: emissão pelo ERP fica indisponível; a tela de Vendas
  tem um campo manual (`nota_status`/`nota_numero` em `Vendas`) pra marcar "emitida por fora"
  quando a nota sai por outro sistema (ex.: contador) — evita emissão duplicada.
- **Fiscal — com `FISCAL_PROVIDER=focusnfe`**: emite NFC-e via Focus NFe. Exige que os produtos
  tenham `ncm`/`csosn` preenchidos (`Produtos`); sem isso, `ipc/fiscal.js` recusa a emissão com
  mensagem clara em vez de mandar uma nota incompleta pra SEFAZ.
- **`.env`**: carregado em `main.js` via `process.loadEnvFile()` (Node 20.6+, nativo, sem
  dependência). Só cobre modo dev (`.env` na raiz do app) — produção empacotada (`.exe`) ainda
  não tem um local definido pra guardar as credenciais reais; decidir isso quando as
  credenciais existirem.
- **Nada disso foi testado contra API real** — payloads seguem a documentação pública de cada
  provedor, mas o primeiro teste de verdade só acontece quando houver certificado/token reais.

## Decisões Arquiteturais

- `nodeIntegration: false` e `contextIsolation: true` — padrão de segurança.
- Todo acesso ao banco passa por `ipcMain.handle` no processo principal.
- `contextBridge` expõe apenas métodos específicos, nunca objetos Node.js brutos.
- Transações explícitas (BEGIN/COMMIT/ROLLBACK) para operações críticas (venda, entrada, recebimento de PO).
- Navbar injetada dinamicamente via `js/navbar.js` em todas as páginas: sticky no topo, full-width, links em blocos clicáveis (inserida no `<body>`, não no `.container`).
- Janela inicia maximizada (`janela.maximize()`), mínimo 1024x640.
- Tema escuro via classe `dark-theme` no `<html>` (configurado por `js/head.js`).
- Checkout de estoque com guarda atômica: `UPDATE ... WHERE id=? AND quantidade_estoque >= ?`; rollback na falha contendo o SKU do item com saldo insuficiente.
- Auth via sessão no processo principal (`get-auth-session` → `getAuthSession` no preload); perfil atual `erp_perfil` = admin.
- Login exigido apenas na entrada do app (`modules/core/auth.js` redireciona para `modules/auth/login.html` se não autenticado). Usuários são gerenciados em `modules/acessos/` (acessível pela sidebar: "Gerenciar Acessos", admin).
- Dois perfis: `admin` (acesso total) e `vendedor` (restrito por `permissoes` JSON, gerenciado em `modules/acessos/`). Admin sempre passa em `exigirPermissao(modulo)` independente de `permissoes`. `main.js:exigirPermissao` já gate 11 domínios IPC (produtos, categorias, clientes, vendas, estoque, fornecedores, compras, precificacao, financeiro, caixa, relatorios); `pagamentos`, `dashboard`, `usuarios`, `banco-admin`, `sistema` e `auth` ainda usam só `exigirSessao('admin')`.
- Atualização automática: `electron-updater` + GitHub Releases. Checa no boot + a cada 24h
  enquanto o app fica aberto (`main.js:iniciarChecagemAutomaticaDeAtualizacao`). Achou
  atualização → `update-status` (push event) chega em qualquer tela via um card global
  (`frontend/src/components/atualizacao/UpdateAvailableCard.tsx`, montado no
  `(admin)/layout.tsx`), não só na página `/atualizacao`. "Sim, atualizar" baixa (barra de
  progresso no card) e, ao terminar o download, chama `quit-and-install` sozinho — sem
  precisar de um segundo clique. Instalador NSIS é `oneClick: true` (progresso automático,
  sem assistente com cliques) — trade-off: perdeu a opção de escolher pasta de instalação
  no primeiro install manual, aceitável pra um app de tenant único instalado numa máquina só.
- **Camada central de acesso**: `modules/core/banco.js` expõe `window.erpBanco` (agrupado por domínio: produtos, categorias, clientes, vendas, estoque, precificacao, fornecedores, compras, financeiro, relatorios, dashboard, usuarios, sistema). Incluído em todas as páginas via `<script src="../core/banco.js">`. Módulos novos devem usar `window.erpBanco.*`; `window.api.*` permanece disponível para código legado.
- **Módulo banco** (`modules/banco/banco.html` + `banco.js`): inspeção crua das tabelas via sidebar (admin). Exige sessão admin (`exigirSessao('admin')`) nos IPC `listar-tabelas-banco` / `consultar-tabela-banco` e confirmação de senha do admin (`verificar-senha-admin`). Cadastros do dia a dia NÃO exigem senha extra (a sessão já autentica).
- **Conta de suporte do desenvolvedor** (`db/usuarios.js:garantirContaSuporte`, opcional, ver GOALS.md "Developer Support Admin Account" e a Pegadinha real acima sobre colisão de login): existe pra permitir gerenciar qualquer instalação de cliente sem saber a senha daquela loja especificamente. Login/senha só existem se `ERP_SUPORTE_LOGIN`/`ERP_SUPORTE_SENHA` forem definidos no shell de quem publica (nunca commitados — ver `.env.example`); embrulhados na chave-mestre a cada login bem-sucedido de qualquer usuário, não só no bootstrap. Nunca listado em `listarUsuarios()` (não aparece em Gerenciar Acessos), nunca removível/editável via `removerUsuario`/`salvarUsuario`. Deliberadamente **não documentado no README.md** (arquivo público) — a existência é ok pra quem mantém o repo, não pra quem só vê o GitHub público.

## Regras de Continuidade

- Cada nova funcionalidade exige atualizar: `database.js` + `main.js` + `preload.js` + frontend.
- Use `modules/core/head.js` no `<head>` de todas as páginas (tema sem flash branco).
- Use `modules/core/auth.js` em todas as páginas protegidas (exceto `login.html`).
- `package.json` `files` usa glob `modules/**/*` — novos arquivos incluídos automaticamente.

## Funcionalidades Implementadas (resumo)

Setup Electron seguro · SQLite 8 tabelas + extensões · SQLCipher (criptografia por senha) + migração automática plaintext→cipher · Migração de colunas (`migrarColunas`) · Cadastro de produtos c/ variações + SKU auto + estoque_mínimo · Clientes CRUD (CPF/CNPJ, e-mail, endereço) · Fornecedores CRUD · PDV (leitor SKU, carrinho, cliente, desconto, observação, fiado, orçamento, transação atômica com guarda de estoque, recibo) · Orçamentos (salvar → converter em venda; não movimenta estoque até conversão) · Histórico de vendas (filtro data+status, badge, detalhes modal, conversão de orçamento, CSV) · Entrada de mercadorias (custo médio ponderado, ledger `MovimentacoesEstoque`) · Alerta de estoque mínimo (dashboard, PDV, página de entrada) · Pedidos de compra (criar/receber/cancelar; recebimento gera conta a pagar) · Financeiro (contas a pagar/receber, baixa, fluxo de caixa por dia, provisão de DAS por regime de caixa) · Relatórios (vendas por período, por pagamento, ticket médio, Curva ABC A/B/C + CSV, DRE, margem de contribuição, ponto de equilíbrio, giro de estoque) · Dashboard (vendas/faturamento/estoque/hoje + a receber e a pagar hoje) · Navbar por perfil · Tema escuro · Login multi-usuário (admin) + Gerenciar Acessos · Backup/Restore + automático diário · Auto-update · Build NSIS v1.0.0 · Janela maximizada · Launcher silencioso (VBS)

## Fora de escopo (decidido)

~~Emissão de NF-e / NFC-e: requer integração ao SEFAZ... inviável em ERP desktop offline.~~
Esta linha estava desatualizada (corrigido em 2026-08-22, via GOALS.md): a emissão **já foi
construída** — `integracoes/fiscal/provider.js` + `integracoes/fiscal/providers/focusnfe.js`
(NF-e via FocusNFe), com `test/fiscal.test.js` + `test/fiscal-provider.test.js` cobrindo. O
recibo térmico continua existindo em paralelo, não foi removido.

- **Decisão de processador de pagamento (Ton/Stone/adquirente alternativo)**: pesquisado a
  fundo (ver `GOALS.md`, seção "Payment Processor Integration"), mas o dono decidiu em
  2026-08-22 não seguir com isso — nem o import de extrato Ton, nem trocar de adquirente. Pix
  via Efí (`integracoes/pix/`) continua sendo a única integração de pagamento ativa.

## Próximos Passos

1. **Testar o instalador** (.exe NSIS) em uma máquina limpa. Ainda em aberto.
2. ~~Melhorias finais de UI/UX: ícones vetoriais, tipografia refinada.~~ Superseded pelo
   Frontend Visual/UX Fix Pass (ver `GOALS.md`) — pass tela-por-tela concluído, 13 bugs reais
   corrigidos. A migração de visual pro template TailAdmin (Next.js) está em andamento, também
   documentada em `GOALS.md`.
3. ~~NFC-e: avaliar ACBr/biblioteca de emissão como evolução futura.~~ Já construído — ver a
   correção acima.

~~Backlog restante: troco automático no PDV · busca de cliente no PDV · imagens nos produtos.~~
Esta linha estava desatualizada (checado em 2026-08-19, via GOALS.md): os três já existem e
funcionam — troco automático (`modules/pdv/pdv.js:atualizarTroco()`), busca de cliente no PDV
(`modules/pdv/pdv.js`, campo `clienteBusca` com dropdown de resultados) e imagens de produto
(`modules/produtos/cadastro.js`, `escolherImagem`/`removerImagem`/preview).
Log de erros em arquivo + `window.onerror` global já implementados (`main.js:logErro`/`CAMINHO_LOG_ERRO`).

Ver `GOALS.md` para o plano completo (o que falta, por área) e o que já foi corrigido nesta rodada.
