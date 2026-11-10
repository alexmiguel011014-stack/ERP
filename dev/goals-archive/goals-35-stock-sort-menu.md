## GOALS 35 — Sort menu on the stock list (ALLU ERP feature)

Format: executor-v1

Baseline: `0a2fbd2`. The owner asked for the same search and sort bar that the product list has. The stock list already has a search box and status chips. It has no "Ordenar" menu. This plan adds that menu, ordered by name or by last product modification.

| Stage | Items | Depends on | Can run in parallel with |
| --- | --- | --- | --- |
| 1 Data | S35-1, S35-2 | none | none |
| 2 UI | S35-3 | Stage 1 | none |
| 3 Tests | S35-4 | Stage 2 | none |
| 4 Gate | S35-5, S35-6 | Stage 3 | none |

<!-- item-contract: v1 -->

### Decisions

- Reuse `OrdenarMenu` and `OPCOES_ORDENACAO_PRODUTOS` from the product list. Do not create new menu options or a new component.
- Sort by the product's `atualizado_em`. A stock movement does not change it, by design (see `AGENTS.md`, "Datas de modificação"). Do not add a stock-movement date.
- Keep the existing search box, its placeholder text, and the status chips unchanged. Many e2e specs select the box by that placeholder.
- Persist the choice in `localStorage` under the key `erp.ordenacao.estoque`. Default option: `nome-asc`.
- Tie-break equal names by variation ID. The old SQL order used SKU. This small change is accepted.
- Do not change the version, `atualizacaoNotas.ts`, or the summary cards. The cards always count all rows.

### Data

- [x] **S35-1 Return the product modification date in the stock overview**
  tier: standard · medium · gate: auto · after: none
  files: `db/estoque.js` (exists), `test/produtos-datas-modificacao.test.js` (exists)
  Anchor: `db/estoque.js:158` function `getEstoqueVisaoGeral`; its SELECT ends with `p.nome AS produto_nome, p.id AS produto_id`.
  Change: Add `p.atualizado_em AS produto_atualizado_em` to the SELECT list after `p.id AS produto_id`. Keep the ORDER BY unchanged.
  Do not touch: Any other function in `db/estoque.js`, the schema, and the triggers.
  do:
  1. Read `db/estoque.js` lines 155-172.
  2. Replace `p.nome AS produto_nome, p.id AS produto_id` with `p.nome AS produto_nome, p.id AS produto_id,` followed on the next line by `p.atualizado_em AS produto_atualizado_em`.
  3. Read the end of `test/produtos-datas-modificacao.test.js`.
  4. Append a `test(...)` that calls `criarProduto()`, then `db.getEstoqueVisaoGeral()`.
  5. In that test, find the row where `variacao_id` equals the created `variacaoId`.
  6. Assert the row's `produto_atualizado_em` matches `FORMATO_ISO_UTC`.
  7. In the same test, assert it equals `(await datasProduto(produtoId)).atualizado_em`.
  Verify: `node --test test/produtos-datas-modificacao.test.js`.
  Source: `db/datas-modificacao.js` triggers on `Produtos`; `AGENTS.md` section "Datas de modificação".
  check: `node --test test/produtos-datas-modificacao.test.js` exits 0 and lists the new test as passed.
  - proof: `node --test test/produtos-datas-modificacao.test.js` exit 0, pass 15, fail 0, 2026-11-10, sonnet

- [x] **S35-2 Add the field to the frontend row type**
  tier: light · low · gate: auto · after: S35-1
  files: `frontend/src/lib/erpApi.ts` (exists)
  Anchor: `frontend/src/lib/erpApi.ts:758` type `EstoqueVisaoGeralLinha`, last field `produto_id: number;`.
  Change: Add the line `produto_atualizado_em: string | null;` after `produto_id: number;`.
  Do not touch: Any other type.
  do:
  1. Read `frontend/src/lib/erpApi.ts` lines 756-775.
  2. Add the field after `produto_id: number;`.
  3. Run `npm --prefix frontend run typecheck`.
  Verify: Typecheck passes. No other code builds objects of this type by hand.
  Source: Same SELECT as S35-1.
  check: `npm --prefix frontend run typecheck` exits 0.
  - proof: `npm --prefix frontend run typecheck` exit 0, 0 errors, 2026-11-10, haiku. The 27 pre-existing errors were fixed by `frontend/src/svg.d.ts` (outside `files:`, approved by the owner in chat: "pode corrigir").

### UI

- [x] **S35-3 Add the "Ordenar" menu to the stock list**
  tier: standard · medium · gate: auto · after: S35-2
  files: `frontend/src/components/produtos/EstoqueListaView.tsx` (exists)
  Anchor: `EstoqueListaView.tsx:75-85` (`const termo`, `const filtradas`) and `:209-215` (the search `<input>`).
  Change: Sort the filtered rows with the chosen option. Render `<OrdenarMenu>` right after the search input.
  Do not touch: The summary cards, the chips, `salvarMinimo`, the table columns, and the search placeholder text.
  do:
  1. Read `frontend/src/components/produtos/EstoqueListaView.tsx` lines 1-100 and 190-225.
  2. Add imports: `OrdenarMenu` from `@/components/common/OrdenarMenu`, `usePersistedState` from `@/hooks/usePersistedState`.
  3. Add imports from `@/lib/utils/ordenacao`: `OPCOES_ORDENACAO_PRODUTOS`, `ORDENACAO_PADRAO_PRODUTOS`, `buscarOpcao`, `lerOrdenacaoPersistida`, `ordenar`.
  4. Inside `EstoqueListaPanel`, add `usePersistedState<string>("erp.ordenacao.estoque", ORDENACAO_PADRAO_PRODUTOS)`. Derive `ordenacaoId` with `lerOrdenacaoPersistida` and `opcaoOrdenacao` with `buscarOpcao`, exactly as `ProdutosListModal.tsx:78-87` does.
  5. After `const filtradas = ...`, add `const exibidas = ordenar(filtradas.map((r) => ({ ...r, id: r.variacao_id, nome: r.produto_nome, atualizado_em: r.produto_atualizado_em })), opcaoOrdenacao);`.
  6. In the table body, replace `filtradas.length === 0` with `exibidas.length === 0` and `filtradas.map(` with `exibidas.map(`. Keep `key={r.variacao_id}`.
  7. After the search `<input>`, add `<OrdenarMenu opcoes={OPCOES_ORDENACAO_PRODUTOS} valor={ordenacaoId} onChange={setOrdenacaoSalva} />`.
  8. Run `npm --prefix frontend run typecheck` and `npm --prefix frontend run lint`.
  Verify: Both commands exit 0. The control bar still wraps on a narrow window because its container has `flex-wrap`.
  Source: `frontend/src/components/produtos/ProdutosListModal.tsx:75-90,331-341`; `frontend/src/components/common/OrdenarMenu.tsx`; `frontend/src/lib/utils/ordenacao.ts`.
  check: `npm --prefix frontend run typecheck && npm --prefix frontend run lint` exits 0.
  - proof: typecheck exit 0, lint 0 errors (3 pre-existing warnings), 2026-11-10, sonnet. `OrdenarMenu` imported as default export (plan said named import; `OrdenarMenu.tsx` uses `export default`).

### Tests

- [x] **S35-4 Add an e2e test for the stock sort menu**
  tier: standard · medium · gate: auto · after: S35-3
  files: `e2e/estoque-workspace.spec.ts` (exists)
  Anchor: `e2e/estoque-workspace.spec.ts:20-30` helpers `listaEstoque` and `abrirEstoque`.
  Change: Add one test that uses `abrirEstoque()`, opens "Ordenar", and checks the menu and the row order.
  Do not touch: Existing tests and helpers.
  do:
  1. Read `e2e/estoque-workspace.spec.ts` in full to learn how it seeds variations.
  2. Add a test named `Estoque: menu Ordenar lista as quatro opções e inverte a ordem por nome`.
  3. In it, call `abrirEstoque()`. Click the button named `Ordenar` inside the list region.
  4. Assert four `menuitemradio` items exist. Assert `Nome (A → Z)` has `aria-checked="true"`.
  5. Click `Nome (Z → A)`. Read the text of the column-2 cells (Produto) of all rows.
  6. Assert the list equals itself sorted descending by `new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true })`.
  7. Reload the page. Assert `localStorage.getItem("erp.ordenacao.estoque")` equals `"nome-desc"`.
  8. Run `npx playwright test e2e/estoque-workspace.spec.ts`.
  Verify: The new test passes and the other tests in the file still pass. Stop if the seed has fewer than two products. Report it.
  Source: `e2e/ordenacao-listas.spec.ts:46-49` (menu click pattern).
  check: `npx playwright test e2e/estoque-workspace.spec.ts` exits 0.
  - proof: `npx playwright test e2e/estoque-workspace.spec.ts` exit 0, 5 passed, 2026-11-10, sonnet. Step 7 compares `JSON.parse(localStorage...)`, because the stored value is JSON-encoded (with quotes).

### Gate

- [x] **S35-5 Run the full project checks**
  tier: light · low · gate: auto · after: S35-4
  files: none
  Anchor: `package.json` scripts `lint`, `test`; `frontend/package.json` scripts `lint`, `typecheck`.
  Change: None. Run the checks only.
  Do not touch: Any file.
  do:
  1. Run `npm run lint`.
  2. Run `npm test`.
  3. Run `npm --prefix frontend run lint` and `npm --prefix frontend run typecheck`.
  4. Run `npx playwright test e2e/estoque-workspace.spec.ts e2e/estoque-acessibilidade.spec.ts e2e/estoque-lote.spec.ts e2e/ordenacao-listas.spec.ts`.
  5. Stop if a check fails. Report the failing command and its output.
  Verify: All commands exit 0.
  Source: `AGENTS.md` section "Comandos Essenciais".
  check: Every command in the steps exits 0.
  - proof: root `npm run lint` 0 errors; `npm test` 284/284; `npm --prefix frontend run lint` 0 errors; `npm --prefix frontend run typecheck` exit 0; Playwright estoque-workspace, estoque-acessibilidade, estoque-lote, ordenacao-listas 20 passed. 2026-11-10, sonnet/haiku executors, checks run by the orchestrator.

- [ ] **S35-6 Owner review of the stock sort menu**
  tier: user · gate: ask · after: S35-5
  files: none
  Anchor: Owner screenshot of the product list with "Buscar por nome ou categoria" and "Ordenar".
  Change: The owner checks the new menu in the running app.
  Do not touch: The store database.
  do:
  1. Ask the owner to open Produtos, then Estoque, in a test copy or demo.
  2. Ask the owner to open "Ordenar" and pick each of the four options.
  3. Ask the owner to close and reopen the app and check the option is remembered.
  4. Ask the owner to check both themes.
  Verify: Record the owner's acceptance or requested changes.
  Source: Owner screenshot in this conversation.
  check: manual — The owner sees the "Ordenar" button beside the search box on the stock list, each option reorders the rows, and the choice survives a restart.

**Done when:** the stock list shows an "Ordenar" menu beside the search box with the same four options as the product list, the rows reorder correctly, the choice is remembered, the new node test and e2e test pass, and lint, typecheck, and the stock e2e specs pass.
