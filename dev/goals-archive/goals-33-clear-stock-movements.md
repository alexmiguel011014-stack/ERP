## GOALS 33 — Clear stock movements and consistent active products (ALLU ERP feature/fix)

Format: executor-v1

Baseline: `cf4a94d`. The customer could not find where to change stock quantities.
Deleted duplicates can appear in pricing while the normal product list hides them.
The reported record and videos remain unverified; reproduce the mechanisms with fictional data.

### Decisions

- Show active products in operational pricing and stock lists. Preserve inactive records and their history.
- Restore visibility when a product leaves the trash. Do not restore or delete customer records.
- Provide one product search by name, SKU, barcode, or product ID. Require an explicit variation selection.
- Show current stock beside the selected variation. Keep minimum stock visibly separate from actual stock.
- Offer `Adicionar estoque` and `Registrar saída` as distinct actions. Keep manual exits for loss, damage, and supplier returns.
- Reuse stock entry and weighted-cost behavior. Keep multi-item entry drafts and their confirmation.
- Apply manual exits as transactional deltas against the current database balance. Never submit a computed absolute balance.
- Reject inactive variations at commit. Preserve drafts and identify invalid items without silently removing them.
- Preserve sales, reservations, movement history, existing permissions, and financial records. Do not migrate real data.
- Refresh pricing when its subtab becomes visible. Preserve pending edits and show an explicit refresh action while edits exist.
- Use isolated temporary databases and fictional products for automated checks. Owner acceptance uses an isolated demo database.

| Stage | Items | Depends on | Can run in parallel with |
| --- | --- | --- | --- |
| Reproduction | S33-01 | none | none |
| Data fixes | S33-02, S33-03 | S33-01 | each other |
| Stock operation | S33-04, S33-05 | S33-01 | S33-02, S33-03 |
| Selection and pricing | S33-06, S33-09 | S33-03; S33-02 | each other |
| Stock interface | S33-07, S33-08 | S33-05, S33-06; S33-07 | S33-09 |
| Regression and review | S33-10, S33-11 | S33-02, S33-03, S33-04; S33-07, S33-08, S33-09 | each other |
| Acceptance | S33-12 | S33-10, S33-11 | none |

<!-- item-contract: v1 -->

### Reproduction and root cause

- [x] **S33-01 Reproduce inactive visibility and unsafe stock selection**
  tier: standard · high · gate: auto · after: none
  files: `test/precificacao-transacoes.test.js` (exists), `test/produtos-financeiro-melhorias.test.js` (exists), `e2e/produtos-cadastro.spec.ts` (exists)
  Anchor: `async function criarProdutoParaPrecificacao()`; `test("buscarSKU encontra a variação pelo código de barras, não só pelo SKU"`; `test.describe("Cadastro de Produto"`.
  Change: Add isolated regression cases to the existing backend test files. Add selection-race coverage in the existing Electron spec.
  Do not touch: Real databases and existing assertions.
  do:
  1. Create active and inactive products with matching names and distinct SKUs.
  2. Assert active pricing and stock lists exclude inactive products and include restored products.
  3. Assert selection A cannot survive changing the search to B or a delayed response for A.
  4. Record failing assertions before implementation. Stop if a failure has a different cause.
  Verify: `node --test test/precificacao-transacoes.test.js test/produtos-financeiro-melhorias.test.js` reproduces the inactive-list failure.
  Source: `db/produtos.js:234`, `db/produtos.js:734`, `db/precificacao.js:120`, and both stock forms.
  check: The new backend assertions fail before S33-02 and S33-03. Run `npx playwright test e2e/produtos-cadastro.spec.ts` for the failing Electron baseline.
  - proof: Backend 15 passed and 2 expected inactive-list failures; isolated Electron 3 passed and 3 expected stale-selection failures, 2026-11-03, coder and executor.

### Root cause fixes

- [x] **S33-02 Exclude inactive products from operational pricing**
  tier: standard · high · gate: auto · after: S33-01
  files: `db/precificacao.js` (exists)
  Anchor: `async function getPricingDataInterno()`; `async function sincronizarPrecosPendentesInterno()`.
  Change: Filter `Produtos.ativo = 1` in pricing insertion, displayed rows, and pending-price synchronization.
  Do not touch: Existing inactive pricing records, historical transactions, or manual prices.
  do:
  1. Join `Produtos` for pending synchronization and require `p.ativo = 1`.
  2. Require `p.ativo = 1` when inserting missing pricing rows and selecting displayed rows.
  3. Keep restoration idempotent and preserve existing inactive pricing values.
  Verify: `node --test test/precificacao-transacoes.test.js` exits 0.
  Source: `db/precificacao.js:67` and `db/precificacao.js:110`.
  check: The inactive product disappears and reappears after restoration without losing its price.
  - proof: Pricing tests 3/3 passed; isolated price 157 survived removal, refresh and restoration, 2026-11-03, coder and executor.

- [x] **S33-03 Align operational stock lists with active products**
  tier: standard · high · gate: auto · after: S33-01
  files: `db/estoque.js` (exists)
  Anchor: `async function getEstoqueBaixo()`; `async function getEstoqueVisaoGeral()`.
  Change: Filter inactive products from active stock overview and low-stock results.
  Do not touch: Movement history, historical sales, reservations, or inactive balances.
  do:
  1. Require `p.ativo = 1` in the two operational list queries.
  2. Keep historical movement queries unchanged.
  3. Include restored products on the next list request.
  Verify: `node --test test/produtos-financeiro-melhorias.test.js` exits 0.
  Source: `db/estoque.js:123` and `db/estoque.js:136`.
  check: Active totals and low-stock results exclude inactive variations and include restored variations.
  - proof: Stock tests 14/14 passed, including inactive and restored lists, 2026-11-03, coder and executor.

### Stock operation

- [x] **S33-04 Protect stock changes at commit**
  tier: strong · high · gate: auto · after: S33-01
  files: `db/estoque.js` (exists), `database.js` (exists)
  Anchor: `async function registrarEntradaEstoque(dados)`; `ajustarEstoqueManual: estoque.ajustarEstoqueManual,`.
  Change: Add `registrarSaidaEstoque` and validate active variations inside stock transactions.
  Do not touch: Existing absolute adjustment API, purchase entries, sale code, or stock history.
  do:
  1. Reject an entry when any draft variation belongs to an inactive product. Roll back the entire entry.
  2. Accept variation ID, positive integer quantity, and reason in `registrarSaidaEstoque`.
  3. Read current stock and reserved quantity inside the transaction.
  4. Subtract the requested quantity with an atomic nonnegative balance guard.
  5. Record one `ajuste` movement with origin `ajuste_manual` and the reason.
  6. Return the committed balance and reserved-balance warning. Export the new function through `database.js`.
  Verify: `node --test test/produtos-financeiro-melhorias.test.js` exits 0 after S33-10.
  Source: `db/estoque.js:36`, `db/estoque.js:159`, and `db/vendas.js:520`.
  check: Concurrent sale and exit cannot overwrite each other. An inactive draft changes no balance.
  - proof: Dedicated SQLCipher connections and BEGIN IMMEDIATE isolate stock transactions; deterministic concurrent deletion/rollback and sale/exit regressions passed, 2026-11-04, executor and reviewer.

- [x] **S33-05 Expose the manual exit through the existing boundary**
  tier: standard · high · gate: auto · after: S33-04
  files: `ipc/estoque.js` (exists), `preload.js` (exists), `frontend/src/lib/erpApi.ts` (exists)
  Anchor: `ipcMain.handle("ajustar-estoque-manual", async (event, dados) => {`; `ajustarEstoqueManual: (dados) =>`; `ajustarManual: (dados: AjusteManualEstoque) =>`.
  Change: Expose `registrarSaidaEstoque` through a dedicated IPC handler and typed API.
  Do not touch: Existing channels or permission meanings.
  do:
  1. Register `registrar-saida-estoque` with `exigirPermissao("estoque")`.
  2. Expose `registrarSaidaEstoque` through preload and the typed `estoque` namespace.
  3. Return the committed balance and reservation warning from S33-04.
  Verify: `npm run lint` and `npm --prefix frontend run typecheck` exit 0.
  Source: `ipc/estoque.js:70`, `preload.js:142`, and `frontend/src/lib/erpApi.ts:1304`.
  check: The new channel rejects users without stock permission and preserves existing channels.
  - proof: Permission denial and existing IPC channels checked; frontend typecheck and root lint passed after excluding nested worktrees, with four existing warnings, 2026-11-04, coder and executor.

### Interface

- [x] **S33-06 Create a variation selector**
  tier: standard · high · gate: auto · after: S33-03
  files: `frontend/src/components/produtos/EstoqueProdutoSelector.tsx` (new), `frontend/src/lib/erpApi.ts` (exists)
  Anchor: `export type ProdutoBusca = {`; `invocar<ProdutoBusca[]>("buscarProdutosTermo", termo)`.
  Change: Add a shared selector using the existing authenticated product search.
  Do not touch: Search permissions, the PDV selector, or database schema.
  do:
  1. Search active variations by name, SKU, barcode, or product ID through `buscarProdutosTermo`.
  2. Display product name, variation attributes, SKU, and current stock for each result.
  3. Require an explicit selection. Hydrate the selected SKU through `buscarSKU` for cost data.
  4. Clear selection immediately when text changes. Ignore responses for superseded searches.
  5. Support keyboard selection and show empty, loading, and error states.
  Verify: `npm --prefix frontend run typecheck` exits 0.
  Source: `db/produtos.js:263`, `ipc/produtos.js:244`, and `preload.js:41`.
  check: Duplicate names remain distinguishable by variation and SKU. A delayed response cannot select an old product.
  - proof: Isolated Electron verified distinct choices, stale responses, SKU/barcode collisions and immediate scanner Enter; frontend typecheck passed, 2026-11-04, coder and executor.

- [x] **S33-07 Connect selection to stock entry and exit**
  tier: standard · high · gate: auto · after: S33-05, S33-06
  files: `frontend/src/components/produtos/EstoqueReposicaoForm.tsx` (exists), `frontend/src/components/produtos/EstoqueBaixaForm.tsx` (exists)
  Anchor: `async function adicionarItem()`; `async function darBaixa()`.
  Change: Replace both code-only inputs with the shared variation selector.
  Do not touch: Persisted entry drafts, optional unit cost, confirmation, or existing history.
  do:
  1. Show the selected variation and current balance before either action.
  2. Keep quantity and optional cost for entry. Keep reason and positive quantity for exit.
  3. Submit exits through `registrarSaidaEstoque`. Display its committed balance and reservation warning.
  4. Keep rejected entry drafts visible. Identify inactive items and allow their removal.
  5. Clear stale selection and cost when the selected variation changes.
  Verify: `npm --prefix frontend run typecheck` exits 0.
  Source: `EstoqueReposicaoForm.tsx:50` and `EstoqueBaixaForm.tsx:36`.
  check: Searching A, changing to B, and submitting changes B only. An inactive draft changes no stock.
  - proof: Isolated Electron selected A then B, exit changed B only; inactive mixed draft retained items and left A unchanged; frontend build/typecheck passed, 2026-11-03, coder and executor.

- [x] **S33-08 Make stock actions and quantities evident**
  tier: standard · medium · gate: auto · after: S33-07
  files: `frontend/src/app/(admin)/produtos/estoque/page.tsx` (exists), `frontend/src/components/produtos/EstoqueListaView.tsx` (exists)
  Anchor: `export default function EstoquePage()`; `export default function EstoqueListaView({`.
  Change: Put `Adicionar estoque` and `Registrar saída` before the stock list and history.
  Do not touch: Stock minimum values, movement history, or automatic sale deduction.
  do:
  1. Label actual stock `Estoque atual` and minimum stock `Estoque mínimo`.
  2. Explain that minimum stock is an alert threshold and does not change the balance.
  3. Explain that completed sales reduce stock automatically.
  4. Label manual exits for loss, damage, and supplier returns.
  5. Use existing responsive components and `ScrollArea` for growing lists.
  Verify: `npm --prefix frontend run lint` and `npm --prefix frontend run typecheck` exit 0.
  Source: Customer screenshot, `EstoqueBaixaForm.tsx:118`, and `db/vendas.js:520`.
  check: Actions and both quantities are distinguishable at 1024×640 in both themes.
  - proof: Isolated Electron DOM and geometry checks at 1024×640 in light and dark themes confirmed distinct actions and columns; human visual acceptance remains S33-12, 2026-11-04, coder and executor.

- [x] **S33-09 Refresh pricing safely when returning to its subtab**
  tier: standard · high · gate: auto · after: S33-02
  files: `frontend/src/app/(admin)/produtos/precificacao/page.tsx` (exists), `frontend/src/hooks/usePrecificacao.ts` (exists)
  Anchor: `const [alteracoes, setAlteracoes] = useState<`; `useEffect(() => {`.
  Change: Refresh pricing on visibility transitions using `useAbaVisivel`.
  Do not touch: Unsaved pricing edits or other product subtabs.
  do:
  1. Refresh on return when no pricing edits are pending.
  2. Preserve pending edits and show `Atualizar lista` when edits exist.
  3. Ask for confirmation before discarding pending edits through that action.
  4. Refresh once after saving or explicitly discarding those edits.
  Verify: `npm --prefix frontend run typecheck` exits 0.
  Source: `frontend/src/layout/ProdutosWorkspace.tsx:90` and `frontend/src/hooks/usePrecificacao.ts:63`.
  check: A renamed or trashed product updates on return. Pending edits remain until saved or confirmed discarded.
  - proof: Isolated Electron verified trash/restore refresh, preserved pending edit, cancelled discard and confirmed discard; typecheck passed, 2026-11-04, coder and executor.

### Regression and review

- [x] **S33-10 Cover stock transaction and restore behavior**
  tier: standard · high · gate: auto · after: S33-02, S33-03, S33-04
  files: `test/produtos-financeiro-melhorias.test.js` (exists), `test/precificacao-transacoes.test.js` (exists)
  Anchor: `test("buscarSKU encontra a variação pelo código de barras, não só pelo SKU"`; `async function criarProdutoParaPrecificacao()`.
  Change: Extend isolated database regressions for inactive records and transactional stock changes.
  Do not touch: Real data or existing tests.
  do:
  1. Check active, trashed, and restored variations in pricing and stock lists.
  2. Check unchanged inactive pricing, historical movements, and stock on restoration.
  3. Check entry rollback for an inactive draft and preservation of weighted cost.
  4. Check exit guards, movement reason, reserved-balance warning, and concurrent stock changes.
  5. Check completed sales decrease stock and open budgets reserve stock.
  Verify: `node --test test/precificacao-transacoes.test.js test/produtos-financeiro-melhorias.test.js` exits 0.
  Source: S33-02 through S33-04 and `db/vendas.js:334`.
  check: All added assertions pass with temporary databases and no zero-test result.
  - proof: Isolated backend regression suite passed 22/22, including deterministic concurrent deletion during rollback; locked transactions can be retried, 2026-11-04, coder and executor.

- [x] **S33-11 Cover the end-to-end customer flow**
  tier: standard · high · gate: auto · after: S33-07, S33-08, S33-09
  files: `e2e/produtos-cadastro.spec.ts` (exists)
  Anchor: `test.describe("Cadastro de Produto"`.
  Change: Add Electron flows using the existing isolated `ERP_TEST_USERDATA_DIR` fixture.
  Do not touch: The signed-in owner session or production data.
  do:
  1. Search duplicate names and select a specific variation by name, SKU, barcode, and product ID.
  2. Add stock and record an exit. Check balances, confirmation, and movement history.
  3. Check stale search responses and changing a selected product before submission.
  4. Trash and restore a product. Check pricing, stock list, and pricing tab refresh.
  5. Check pending pricing edits survive a tab switch.
  6. Run `npm run lint`, `npm test`, frontend lint, typecheck, and build.
  7. Run `npx playwright test e2e/produtos-cadastro.spec.ts` after the frontend build.
  Verify: Each command exits 0. The Electron spec reports at least one executed test.
  Source: `e2e/produtos-cadastro.spec.ts:37` and `playwright.config.ts`.
  check: Record command results and any existing warnings. Stop on a new failure.
  - proof: Backend tests 281/281; Electron spec 10/10; root lint, frontend lint/typecheck and frontend build passed; four root and three frontend existing lint warnings, 2026-11-04, coder and executor.

### Owner acceptance

- [ ] **S33-12 Review the stock workflow with the owner**
  tier: user · gate: ask · after: S33-10, S33-11
  files: none
  Anchor: Customer screenshot asking where to add stock numbers.
  Change: Review an isolated demo with fictional variations and no production database.
  Do not touch: The store database or existing sales.
  do:
  1. Ask the owner to find a variation and add or remove stock without guidance.
  2. Ask the owner to distinguish current stock from minimum stock.
  3. Ask the owner to inspect restored and trashed products in pricing and stock.
  4. Ask the owner to review both themes at 1024×640 and a maximized window.
  Verify: Record the owner's observations and explicit acceptance or requested changes.
  Source: Customer audio and screenshot supplied in this conversation.
  check: manual — The owner locates both stock actions and understands the resulting balance.
