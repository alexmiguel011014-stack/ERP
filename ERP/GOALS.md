# GOALS.md — ALLU ERP

Master plan for taking this project from "good, works for the owner" to "production-grade,
safe to run unattended in a small retail store." Written for both a human reviewer and a
future `/buildproject`-style execution pass — each item should be checkable without
re-researching the codebase.

**Project**: Offline desktop ERP for a Jiu-Jitsu retail store (ALLU). Electron + Node.js +
SQLite (SQLCipher) + vanilla HTML/CSS/JS. No backend server, no cloud dependency — single
`.exe` installer, single local encrypted database file. Current version `v1.0.5`
(package.json), 21 tables in `db/schema.js`, 17 IPC domains, 18 frontend modules.
Full inventory: `graphify-out/GRAPH_REPORT.md` (1800 nodes / 4267 edges / 180 communities,
built from commit `16df208`).

This file only lists what's incomplete, fragile, or missing. Fully working areas (PDV,
produtos, clientes, fornecedores, compras, entrada de estoque, vendas, financeiro,
precificação, relatórios, acessos, dashboard, backup/restore, auto-update) are **not**
repeated here — see `AGENTS.md` §"Funcionalidades Implementadas" for that list.

---

## P0 — Broken or half-wired right now

- [x] **Fix `window.api` (the whole preload/contextBridge API) unavailable inside every
      dashboard tab.** Owner-reported 2026-08-19: "Fornecedores" threw `Erro: API indisponível:
      salvarFornecedor` on save, and its list showed `API indisponível.` instead of data —
      screenshot attached. Investigated instead of patching just Fornecedores, since the error
      pattern (a generic "API indisponível: <nome>" thrown by `modules/core/banco.js`'s
      `invocar()` helper whenever `typeof window.api[nome] !== "function"`) smelled structural,
      not module-specific. **Confirmed live** (a throwaway script drove the real dashboard →
      clicked the actual Fornecedores sidebar link → inspected the resulting `<iframe>`'s frame
      context directly): `typeof window.api` inside the iframe was `undefined`, while
      `typeof window.erpBanco` was `object` — `banco.js`'s `var api = window.api || {}` had
      silently fallen back to `{}` in that frame, so every single `erpBanco.*` call in it was
      doomed before the page even rendered. Root cause: `main.js`'s `BrowserWindow` sets
      `nodeIntegrationInSubFrames: false`, which (confirmed by flipping it and re-running the
      same live check) also blocks the **preload script itself** — not just raw Node APIs —
      from running inside `<iframe>`s. `modules/dashboard/abas.js` opens PDV, Clientes, Compras,
      Fornecedores, Financeiro, Relatórios, Acessos, Banco, Importação and Atualização **all**
      as real `<iframe>`s (`?embedded=1`) inside the dashboard's tab system — so this broke
      `window.api` in **10 of the app's modules whenever opened via the sidebar tabs**, not just
      Fornecedores; the owner just happened to hit "salvar" first. Not a new regression from
      anything this session touched — pre-existing in the tabbed-workspace feature (part of the
      other PC's sidebar/tabs refactor pulled in earlier this session) and, per my own earlier
      PDV verification in this same session, previously masked because I'd been loading
      `pdv.html` directly as the top-level page instead of through the real tab flow.
      **Fix**: `nodeIntegrationInSubFrames: true` in `main.js` (`criarJanelaPrincipal`) — safe
      here specifically because every iframe `src` in `abas.js` is a hardcoded first-party path
      from the app's own bundle (`MODULOS_ABA`), never a remote or user-controlled URL;
      `nodeIntegration` itself stays `false` and `contextIsolation` stays `true`, so this doesn't
      grant raw Node access anywhere — it only lets the same already-curated, safe
      `contextBridge` API also reach these first-party iframes. Verified end-to-end: submitted a
      real supplier through the actual UI (Fornecedores → Salvar Fornecedor) and got "✓ Sucesso
      — Fornecedor salvo!" with the row appearing in the list. `npm test` (35/35) and
      `npm run lint` (0 warnings) still clean after the change.
- [x] **Fix `Pagamentos` table missing from auto-migration.** `db/pagamentos.js` (added in the
      last commit, `16df208`) queries a `pagamentos` table that only exists as a `CREATE TABLE`
      statement written inside a *comment* in that file — it is never executed. Every other
      table lives in `db/schema.js:iniciarBanco()`, which runs `CREATE TABLE IF NOT EXISTS` for
      all 21 tables on every app start (idempotent auto-migration). `pagamentos` was never added
      to that list. **Result: the recebimentos (Pix/Boleto) feature will throw `no such table:
      pagamentos` on any machine that didn't have the SQL run by hand**, including the owner's
      production install once this update ships.
      - Move the `CREATE TABLE` from the comment into `db/schema.js:iniciarBanco()`, matching
        the style of the other 21 tables (same file, same function, `IF NOT EXISTS`).
      - Match column types to what's actually queried in `db/pagamentos.js` (uses `venda_id`,
        `cliente_id`, `metodo`, `numero_identificador`, `data_recebimento`, `valor_recebido`,
        `status`, `observacao`, `criado_em`).
      - Note the FK comment claims `cliente_id` references `usuarios(id)` — confirm that's not
        a copy-paste of `vendas(cliente_id)` referencing `Clientes(id)` instead; check
        `db/vendas.js`/`db/clientes.js` for the real convention before committing the FK target.
      - Re-run `node scripts/test-db.js` (or a new smoke test) against a fresh temp DB after the
        fix to confirm `listar-pagamentos` / `listar-pagamentos-pendentes` work from zero state.
- [x] **Verify `exigirSessao()` levels on `ipc/pagamentos.js` are intentional.** Fixed a deeper
      bug than "verify": the file had reimplemented its own local `exigirSessao` instead of
      using the shared one from `deps` (the pattern every other `ipc/*.js` file follows) — the
      local version ignored the `perfil` argument and, worse, didn't reject calls with **no**
      session at all, so an unauthenticated renderer could call `listar-pagamentos` etc.
      Replaced it with `const { exigirSessao } = deps;`, matching every other IPC domain; the
      existing `exigirSessao()` / `exigirSessao("admin")` call sites were already reasonable
      once backed by the real function.

## Backend (main process / IPC / db layer)

- [x] IPC handlers organized one file per domain (`ipc/*.js`), registered in `main.js`,
      exposed selectively via `preload.js` (`contextBridge`) — solid pattern, keep it for new
      domains.
- [x] Atomic stock guard on checkout (`UPDATE ... WHERE quantidade_estoque >= ?`) with
      rollback — already correct for the highest-risk write path.
- [x] **Add a real schema/migration versioning mechanism.** Added `VERSAO_SCHEMA` constant +
      `obterVersaoSchema()` in `db/schema.js`; `iniciarBanco()` now sets `PRAGMA user_version`
      after every migration in the function runs successfully (so a mid-failure boot never
      advances the marker — safe, since the migrations above are already idempotent and will
      just retry next launch). Re-exported through `database.js` (`obterVersaoSchema`,
      `VERSAO_SCHEMA`) for future code that wants to check "this DB predates feature X." Covered
      by `test/backup.test.js` ("PRAGMA user_version é gravado no boot e reflete
      VERSAO_SCHEMA"). No rollback mechanism added — out of scope per this item's own "low
      effort" framing; the marker alone is what was asked for.
- [x] ~~"Centralize error logging expectations"~~ — `main.js` already had `logErro()` +
      `CAMINHO_LOG_ERRO()` catching `window.onerror` / unhandled rejections; `AGENTS.md`'s
      backlog line claiming this was still pending was stale and has been corrected.
      Still open: confirm renderer-side errors in **all** modules (not just the ones wired
      through `modules/core/head.js`) reach this logger, and add a lightweight way for the
      owner to export the error log from the UI (e.g. a button in `modules/banco/` or
      `modules/atualizacao/`) without needing filesystem access.

## Database

- [x] SQLCipher encryption at rest, per-user key wrapping (AES-256-GCM), scrypt-based
      password hashing with legacy SHA-256 migration path (`db/usuarios.js`) — this part is
      done well.
- [x] ~~"Strengthen the DB unlock key derivation"~~ — **checked, not actually a gap.**
      `db/conexao.js:derivarChave()` SHA-256-hashes the password before handing it to
      `PRAGMA key = '<hex>'` as a quoted string, not `x'<hex>'` raw-key syntax — so SQLCipher
      treats it as a passphrase and runs its own PBKDF2-HMAC-SHA512 key stretching on top
      (confirmed: `PRAGMA cipher_version` → `4.4.2 community`, `PRAGMA cipher_default_kdf_iter`
      → `256000`, no `cipher_compatibility` downgrade anywhere in the codebase). The SHA-256
      pre-hash is just namespacing, not the thing standing between an attacker and the key —
      SQLCipher's own 256k-iteration KDF is. Initial read of this file missed that layer;
      correcting it here instead of "hardening" a path that was already sound, which would have
      added real risk (touching the unlock path of a production encrypted DB) for no actual
      security gain.
- [x] **Add `PRAGMA user_version`** — same item as Backend above, done there (`db/schema.js`).
- [x] **Automated daily backups — retention/pruning added, restore now tested end-to-end.**
      Confirmed the gap was real: `backupAutomatico()` (`db/sistema.js`) wrote one dated file
      per day forever, with zero pruning — a year of daily use would leave 365+ full DB copies
      on disk. Added `podarBackupsAutomaticosAntigos()`: keeps 30 days of automatic backups
      (`backup_YYYY-MM-DD.sqlite`), called at the end of every `backupAutomatico()` run. Deliberately
      scoped to *only* the automatic-daily filename pattern — a manual `exportBackup()`
      (`backup_<epoch>.sqlite`) is never auto-deleted, since the owner triggered that copy on
      purpose. `test/backup.test.js` now covers: export produces a real non-empty file; daily
      auto-backup doesn't duplicate same-day; **restore round-trip** (insert row → backup →
      insert another row → `importBackup` → confirm only the pre-backup row survives, proving
      restore returns to the exact backed-up state, not a merge); pruning removes an expired
      automatic backup while leaving a fresh one and a manual one untouched. All 5 pass.

## Frontend

- [x] Consistent per-page structure (`modules/<domain>/<domain>.js` + `.html` + shared
      `modules/core/*`), dark theme, shared navbar, `window.erpBanco` as the one blessed access
      layer for new code — good, keep extending new modules this way rather than falling back
      to raw `window.api.*`.
- [x] **Clear the ESLint warnings** — `npm run lint` now reports 0 errors / 0 warnings. Beyond
      unused `catch` params (switched to parameter-less `catch {}`, ES2019 optional catch
      binding — all bodies confirmed not to reference the caught error), found and removed
      several genuinely dead code paths this surfaced: `modules/pdv/pdv.js:buscarESku()` was a
      whole unused legacy search path still calling `window.api.buscarSKU` directly (bypassing
      the `window.erpBanco.*` convention) with leftover `DEBUG:` alerts; `modules/produtos/
      cadastro.js:carregarCategorias()` duplicated logic already live via
      `erpCategoryStore.onChange(...)`; three `*PDV02` functions (`db/clientes.js`,
      `db/produtos.js`, `db/vendas.js`) are deliberately-kept-but-unexported legacy code per an
      existing in-file comment — left in place, documented with a matching comment +
      `eslint-disable-next-line` instead of deleted, respecting that prior decision.
- [x] ~~**Retail-flow backlog from `AGENTS.md`**~~ — **checked, already built, `AGENTS.md` was
      stale.** All three items AGENTS.md listed as remaining backlog are fully implemented and
      wired to real logic, not just markup: automatic change/troco calculation
      (`modules/pdv/pdv.js:atualizarTroco()` — computes against `totalCarrinho()`, live on
      input, shown in the receipt too), customer search inside PDV (`clienteBusca` input with a
      live-filtered results dropdown, same file), product images
      (`modules/produtos/cadastro.js` — `escolherImagem`/`removerImagem`/preview, backed by
      `window.erpBanco.produtos.imagem`). Corrected the stale line in `AGENTS.md` (§"Próximos
      Passos") to point here instead of listing these as open work.
- [x] UI/UX polish backlog from `AGENTS.md` ("ícones vetoriais, tipografia refinada") — superseded
      by the concrete, screen-by-screen fix pass below (owner reported specific broken-looking
      screens on 2026-08-19, not just general polish), which is now complete; see **Frontend
      Visual/UX Fix Pass** section.

## Frontend Visual/UX Fix Pass (PDV pilot → screen-by-screen rollout) — in progress

**Why this section exists:** owner-reported on 2026-08-19, with screenshots of Frente de Caixa
(PDV) in light and dark mode: broken search-icon glyph, no responsive layout, dark mode only
partially applying, and the "Devolução / Troca" button clipped off the bottom of the screen.
Owner's own framing: fix screens one at a time, in separate sessions, per module — "se não vira
uma bola de neve" (otherwise it snowballs) — and use whichever module is fixed first to make the
rest easier. This section is scoped as **fix** (concrete, reproducible, currently-broken
behavior), not a redesign — no new visual language, no component-library rewrite, just repair
what's demonstrably broken per screen.

```mermaid
flowchart TD
    A[PDV pilot: 5 confirmed bugs] --> B[Derive reusable per-module audit checklist]
    B --> C1[entrada + importacao\n0 @media, no modulos.css gaps]
    B --> C2[vendas / clientes / precificacao /\nprodutos cadastro+categorias+gerenciamento\n1-4 @media, dedicated CSS]
    B --> C3[modulos.css-only screens:\nacessos, atualizacao, banco, compras,\ndashboard, financeiro, fornecedores,\npagamentos x2, relatorios]
```

### PDV (Frente de Caixa) — pilot module, confirmed bugs

Investigated directly (code read, not guessed) against `modules/pdv/pdv.html`,
`modules/pdv/pdv.css`, and `modules/core/navbar.js` (which injects the app's dark-theme
stylesheet at runtime). PDV is architecturally the outlier here: of 21 HTML pages, it's one of
only two (with `auth/login.html`, expected to differ) that does **not** link
`modules/core/modulos.css` — every other module screen inherits that file's shared components
and 2 responsive breakpoints for free; PDV is 100% standalone CSS. That's likely *why* it looks
worse than the rest, and why fixing it first won't fully predict the other screens' issues (they
start from a better baseline) — but the audit checklist derived from it still applies.

- [x] **Broken search-icon glyph.** Fixed. Root cause confirmed exactly as suspected:
      `modules/pdv/pdv.html:39` had 4 mangled bytes (`ð`/U+00F0, `Ÿ`/U+0178, a smart quote
      U+201D, and an invisible C1 control char U+008D — not simple `ðŸ”"` as it visually
      resembled) where a 🔍 emoji should have been. Replaced with a real inline `<svg>` icon
      matching the codebase's dominant icon pattern. Verified via byte-exact grep: `grep -c
      $'\xc3\xb0' modules/pdv/pdv.html` now returns 0.
- [x] **No responsive layout** — CSS added, but found a bigger blocker worth flagging.
      Added `@media (max-width: 900px)` (stacks `.pdv-main` to `flex-direction: column`) and
      `@media (max-width: 720px)` (reduces padding, wraps buttons) to `pdv.css`, reusing
      `modulos.css`'s existing breakpoint values. **However**, verified live (resized the actual
      window via `SetWindowPos`) that these breakpoints can never fire in the shipped app:
      `main.js:162-165` sets `minWidth: 1024` on the `BrowserWindow`, and Electron enforces
      that floor even against a programmatic resize request — asked for 650px, got 1024px back.
      Since `modulos.css`'s own 900px/720px breakpoints (already relied on by all 19 *other*
      module screens) are equally unreachable under the same constraint, this isn't a PDV-only
      problem — it's project-wide, pre-existing, and out of this pilot's scope to silently fix
      by changing a global window constraint. **Flagging for the owner**: is 1024px minimum
      intentional (matches every real deployment screen), or should it come down (e.g. to
      ~800px) so the window can snap to half of a 1366-wide laptop display without being
      force-widened? Not changed — this affects all 18 screens' minimum guaranteed layout, a
      bigger call than one module's fix pass.
- [x] **Dark mode incomplete.** Fixed both root causes. (a) Added the missing
      `.dark-theme .pdv-right`, `.forma-pagamento label/select/input`, `.btn-orcamento` (+
      hover/disabled) rules to `navbar.js`'s injected stylesheet. (b) Converted every
      inline-`style`-only element that carried a hardcoded light background — the 3 modal
      overlays (`#devolucaoOverlay`/`#caixaOverlay`/`#receiptOverlay`, now
      `.pdv-modal-overlay`/`.pdv-modal-box`), `#produtosEncontrados`'s table header,
      `#clienteResultados`, `#clienteEscolhido` — into real CSS classes in `pdv.css`, each with
      a matching `.dark-theme` rule added in the same navbar.js pass. Semantic action-button
      colors (confirm=red, abrir caixa=green, etc.) deliberately left inline — those are
      fixed brand colors, not theme-dependent chrome.
- [x] **"Devolução / Troca" button clipped.** Added `overflow-y: auto` to `.pdv-right` in
      `pdv.css`, mirroring `.pdv-left`'s existing rule.
- [x] **(bonus) Dead legacy navbar CSS.** Deleted the unused `.navbar`/`.navbar-brand`/
      `.navbar-links` block (was lines 17-58) from `pdv.css` — confirmed dead (the live navbar
      comes entirely from `navbar.js`'s own injected `.navbar` rules, which already existed and
      take precedence via higher specificity/later injection regardless).

All 5 verified via `npm run lint` (0 warnings) + `npm test` (35/35 pass — no automated visual
test exists for this, per the reusable checklist's own "(manual)" tagging convention; a live
look at the running app is the actual verification, done separately, see below) after every
change in this pass.

### Reusable per-module audit checklist (apply to each screen in Phase 2)

Derived from what the PDV pass above actually found — run all four against each module before
calling it done, don't assume a screen only has the issue category it was flagged for:
1. **Encoding**: `grep -rn "ðŸ\|Ã[€-¿]\{2,\}"` — actually just visually scan every icon/button
   glyph on the page; mojibake doesn't always match one fixed byte pattern.
2. **Responsive** (manual): resize the window from full down to ~375px — does layout stack
   instead of overflow/clip? Does it link `modules/core/modulos.css` at all (`grep -l
   modulos.css` the module's `.html`) — if not, it needs its own `@media` rules like PDV did.
3. **Dark mode** (manual): toggle dark mode, open every modal/overlay/dropdown the screen has —
   does anything stay on a light background? Check both (a) missing `.dark-theme .*` selectors
   in `navbar.js` for that screen's specific classes, and (b) inline `style="background:..."`
   attributes in the `.html` that no `.dark-theme` rule could ever override.
4. **Clipping/overflow** (manual): shrink window height — does any bottom element (buttons,
   totals) get cut instead of becoming scrollable? Check for `overflow: hidden` on a
   fixed-height ancestor with no matching `overflow-y: auto` on the actual content column.

### Phase 2 — remaining screens, real signal already gathered (not guessed)

Counted directly (`grep -c "@media"` per file) and checked which HTML files link
`modules/core/modulos.css`. No visual/dark-mode findings yet for these — that part still needs a
live look per the checklist above; only the CSS-file-shape signal below is confirmed today.
Suggested order (no hard technical dependency between screens — reorder freely; this is
severity/likely-impact ordering per fix.md convention, cashier-facing screens first):

- [x] **`entrada/entrada.css` + `importacao/importacao.css` — audited, no layout bugs; fixed a
      shared dark-mode gap.** Both correctly link `modulos.css` and their custom blocks
      (`.panel-lista-estoque`, `.chip-group`, `.table-responsive`) already wrap/stack fine; the
      720px/900px breakpoints they inherit from `modulos.css` are unreachable under the same
      pre-existing `minWidth: 1024` constraint flagged in the PDV section (not a new gap). Found
      one real bug shared with 3 other screens below: `#produtoPreview`/`#baixaProdutoPreview`/
      `#previaResultado` used an inline `style="color: #475569"` that no `.dark-theme` rule could
      ever override — same category as PDV's hardcoded modal overlays. Fixed by adding a reusable
      `.detalhe-preview` class (+ `.dark-theme` variant) to `modulos.css` and swapping the inline
      color out on both files. Encoding clean, no clipping issues (plain scrolling documents).
- [x] **`clientes/clientes.css`, `precificacao/precificacao.css`, `produtos/categorias.css`,
      `produtos/gerenciamento-produtos.css`, `vendas/vendas.css` — audited; 3 real bugs found and
      fixed, not just copy-pasted breakpoints as guessed.** Each file's 1 `@media` rule turned out
      to be a real, correct, screen-specific breakpoint (not copy-paste) — no responsive gap.
      Bugs found: (1) `clientes.css`'s `.dark-theme .modal-header` used `background: #0f3312` — a
      stray dark-green hex that matches no other color in the app's dark palette (everywhere else
      uses `#0f172a`/`#1e293b`), almost certainly a typo; fixed to `#0f172a`. (2) `categorias.css`
      and `vendas.css` both still carried a dead `.navbar`/`.navbar-brand`/`.navbar-links` block —
      confirmed dead the same way as PDV's bonus fix: neither `categorias.html` nor `vendas.html`
      has any static nav markup, the real navbar is 100% injected by `navbar.js` with its own
      (different, correct) rules; removed both blocks. (3) `clientes.css`'s `#pePreview` had the
      same hardcoded `color: #475569` inline-style bug as the entrada/importacao group above;
      fixed the same way (`.detalhe-preview`). Also found and fixed a project-wide gap while here:
      `modulos.css`'s shared `.tab-btn` (used by `financeiro.html` and `relatorios.html`, not by
      any file in this group) had zero `.dark-theme` coverage — added it. Encoding clean; no
      clipping issues.
- [x] **`produtos/cadastro.css` — audited, best existing coverage confirmed; 2 small bugs fixed.**
      The file's already-thorough dark-theme block covers every interactive element (dropdown,
      popover, modal, tags) correctly. Found: (1) `#previewImagemProduto`'s image-preview box was
      inline-styled with a light-only `background:#F8FAFC`/`color:#94A3B8`, same "inline style no
      `.dark-theme` rule can reach" bug as the rest of this pass — converted to a
      `.preview-imagem-produto` class with a dark variant. (2) `.dark-theme .placeholder-cell` was
      set to `#475569` — a mid-dark gray meant for *light* backgrounds, actually **lower**
      contrast than the light-mode value on the actual dark background it's meant to improve;
      fixed to `#64748b`, matching the muted-text tone used everywhere else in dark mode. 4
      `@media` rules all confirmed real and correct, same pre-existing 1024px-floor caveat as
      every other screen. Encoding clean.
- [x] **`dashboard/index.html` — audited, clean, no bugs found.** Correcting this file's
      categorization while at it: it was grouped below as "no dedicated CSS file — 100%
      modulos.css", which was never true — it has always had its own complete `<style>` block
      (now ~740 lines after this session's border/grid/icon fixes), doesn't link `modulos.css`
      at all (same situation as PDV before its fix). Ran the full 4-point checklist: (1)
      encoding — clean, no mojibake (`grep` for the byte patterns that hit PDV returns nothing);
      (2) responsive — has its own `@media (max-width: 480px)` (stats grid) and
      `@media (max-width: 900px)` (dash-grid → 1 column), but both are below the project's
      already-flagged `main.js` `minWidth: 1024` floor (see PDV section above) — same
      pre-existing, out-of-scope-per-screen constraint, not a new gap; (3) dark mode — complete,
      every colored class has an explicit `.dark-theme` rule or inherits correctly through
      `head.js`'s CSS custom properties, zero hardcoded-light `style="background:..."` (the
      pattern that was PDV's 3 modal overlays doesn't exist here); (4) clipping — clean, this is
      a normal scrolling document, not a fixed-height split panel like PDV, no `overflow: hidden`
      trapping real content.
- [x] **`acessos.html`, `atualizacao.html`, `banco.html`, `compras.html`, `financeiro.html`,
      `fornecedores.html`, `pagamentos/lancar-pagamento.html`, `pagamentos/pagamentos.html`,
      `relatorios.html` — audited; several real bugs found, not just the expected small gap.**
      - `atualizacao.html`: a genuine **functional** bug, not just a dark-mode gap —
        `atualizacao.js`'s `showMessage()` builds `class="msg " + tipo` (two space-separated
        classes), but the CSS defined `.msg-success`/`.msg-info`/`.msg-warning`/`.msg-error`
        (one hyphenated class) — a selector that can never match that markup. The colored
        update-status message box has never rendered with any color or background, in *either*
        theme. Fixed the selectors to `.msg.success`/`.msg.info`/`.msg.warning`/`.msg.error` and
        added the missing `.dark-theme` variants while there.
      - `compras.html`: the print-preview modal (`#printOverlay`'s content box) was hardcoded
        `background: #FFFFFF` inline with no override possible — same bug class as PDV's 3 modal
        overlays. Converted to a `.print-overlay-box` class with a dark variant. Its "Imprimir"/
        "Fechar" buttons were also raw inline-styled (`#2563EB`/`#64748B`) instead of the shared,
        already-dark-covered `.btn-primary`/`.btn-secondary` classes; switched them over. Also
        had the same `#produtoPreview`/`#cotacaoPreview` inline-color bug as the entrada group
        above; fixed with `.detalhe-preview`.
      - `financeiro.html`: a real **layout** bug, found by checking which stylesheet the page
        actually loads — the "Provisão de DAS" block uses `.config-item`/`.config-input-row`,
        classes that only exist in `precificacao.css`, which this page does **not** link (only
        `modulos.css`, which doesn't define them either). The alíquota input and its Salvar
        button were rendering with zero layout styling. Added a small scoped `<style>` block
        (light + dark) with the missing rules.
      - `pagamentos/pagamentos.html` and `pagamentos/lancar-pagamento.html`: the worst gap in the
        whole pass — **zero** `.dark-theme` coverage anywhere (neither file uses `.container`, so
        neither inherited anything from the app-wide dark baseline either). Added dark rules for
        inputs/selects/table/hover/empty-state/action buttons on both. Also found their embedded
        `.btn-primary`/`.btn-secondary` silently override the shared navy-branded versions from
        `modulos.css` (loaded first, then beaten by these later, more-specific local rules) with
        generic blue/gray (`#2563EB`/`#6B7280`) — every button on these two screens visibly
        doesn't match the rest of the app's navy branding. Repointed both at
        `var(--cor-primaria)` so they render and dark-adapt like every other button in the app.
      - `relatorios.html`: the "Exportar ABC (CSV)"/"Exportar PDF" buttons used inline pastel
        `background-color`s (`#EAF6E8`/`#FEE2E2`) with no dark variant — same "stays light in
        dark mode" bug category as the message-box findings above. Converted to
        `.btn-exportar-csv`/`.btn-exportar-pdf` classes with dark variants.
      - `acessos.html`, `banco.html`: no bugs in their own markup/CSS (both already carry decent
        scoped dark-theme rules, e.g. `banco.html`'s `.resumo-card`/`.modal-senha` overrides), but
        auditing them surfaced a **shared, cross-cutting** bug: bare `<select>` elements not
        wrapped in `.form-group` (`#selectTabela` in `banco.html`; `#filtroLogUsuario`/
        `#filtroLogAcao` in `acessos.html`) have no explicit CSS in either theme, so they render
        as Chromium's native (always-light) control — a light dropdown box floating in an
        otherwise-dark screen. Root-caused and fixed at the actual source instead of patching each
        instance: added `color-scheme: dark` to `html.dark-theme` in `head.js`'s injected token
        stylesheet (runs on every page). Chromium then auto-dark-themes any native control that
        doesn't already have explicit author styling — fixes these two screens' selects and any
        other unstyled native control anywhere else in the app, without touching elements that
        already have explicit `.dark-theme` rules (author styles still win over the UA default).
      Encoding clean across all 9 files; no clipping issues found (all plain scrolling documents,
      no fixed-height split panels like PDV).

**Not in scope for this pass** (flagged, not started): the underlying pattern — one shared
runtime-injected stylesheet (`navbar.js`, ~140 hand-maintained selectors) plus N independent
per-module CSS files with inconsistent coverage — will keep producing this exact class of bug as
the app grows. A real design-token refactor (CSS custom properties for background colors instead
of a parallel `.dark-theme .X` rule per `.X`, so new components get dark mode for free) would
remove the recurring cost, but that's a **structural change**, not a fix, and conflicts with the
owner's explicit "one module per session" approach for now. Phase 2 is now done and the pattern's
actual size is known: 13 real bugs across 16 screens, almost all some flavor of "a `.dark-theme`
rule is missing/wrong/unreachable" — worth revisiting as a real refactor if this class of bug
keeps recurring as new screens are added, but not undertaken here (out of the "fix, don't
redesign" scope this pass was given). This is moot anyway for the Next.js migration
(`magical-soaring-squirrel.md`) screens, which adopt Tailwind's `.dark` + CSS-variable convention
from scratch instead of the hand-maintained parallel-selector pattern.

## Connectivity

- N/A as "frontend talks to a remote API" — this is a single-process desktop app.
  Frontend ↔ backend is entirely `contextBridge` + `ipcMain.handle`, which is the correct
  choice here and already consistently applied; no cross-process/network surface to secure
  beyond what's covered under Security below.
- [x] **GitHub publish token confirmed local-only + release process documented.** Confirmed
      `npm run build`/`npm run dist` never publish on their own — they only build `dist/`
      locally; `ci.yml` only runs lint+test, never build/publish. Publishing is a manual,
      local `npx electron-builder --publish always` with `GH_TOKEN` set as a session
      environment variable (electron-builder's own convention — reads it automatically, never
      written to any file). Documented the exact command + token-scope instructions in
      `AGENTS.md` (new "Processo de release" subsection) since this was previously undocumented
      tribal knowledge.

## Auth

- [x] Session-based auth in the main process, login required at app entry
      (`modules/core/auth.js`), password hashing via scrypt with legacy migration.
- [x] ~~"Only one profile (`admin`) is actually implemented"~~ — **checked, already built.**
      `AGENTS.md`'s "Decisões Arquiteturais" section is stale on this point: `db/usuarios.js`
      (`salvarUsuario`) already persists a `vendedor` profile alongside `admin`, plus a granular
      `permissoes` JSON column; `modules/acessos/` already has a "Vendedor" option in its profile
      dropdown; and `main.js:exigirPermissao(modulo)` already gates 11 of the 17 IPC domains
      (`relatorios`, `caixa`, `financeiro`, `compras`, `fornecedores`, `precificacao`, `estoque`,
      `vendas`, `clientes`, `categorias`, `produtos`) by module-level permission, not just
      profile. Remaining gap is narrower than "build multi-profile auth": `ipc/pagamentos.js`,
      `ipc/dashboard.js`, `ipc/usuarios.js`, `ipc/banco-admin.js`, `ipc/sistema.js`,
      `ipc/auth.js` still gate on `exigirSessao("admin")` only, not `exigirPermissao` — confirm
      with the owner whether a `vendedor` should ever reach `pagamentos`/`dashboard` read-only,
      and if so switch those handlers to the same `exigirPermissao` pattern the other 11 use.
      Also: update `AGENTS.md` — its "por enquanto o único perfil é admin" line no longer
      matches the code.

## Deployment / Infra

- [x] NSIS installer via `electron-builder`, icon present (`build/icon.ico`), publish target
      configured for GitHub Releases, `asarUnpack` correctly scoped to the native SQLCipher
      addon.
- [ ] **The installer has never been tested on a clean machine** — this is `AGENTS.md`'s own
      "Próximos Passos" item #1, still open. Do this before the next release: install on a VM
      or a second machine with no dev tooling, confirm SQLCipher native binary loads
      (`@journeyapps/sqlcipher` + `electron-rebuild` mismatches are the classic failure mode
      here), confirm the auto-updater can reach GitHub Releases, confirm the desktop shortcut
      and silent launcher (`ERP_Launcher.vbs`) work without a console window.
- [x] ~~"AGENTS.md flags local commits not yet pushed"~~ — checked, stale: `git rev-list
      --left-right --count origin/main...HEAD` returns `0  0` (local `main` and `origin/main`
      match). `AGENTS.md` corrected to drop that line.

## Testing

- [x] **Test coverage for the money-handling surface** — added `test/negocio.test.js` (5 new
      `node:test` cases, wired into `npm test`): checkout with insufficient stock rolls back and
      leaves the stock balance untouched; checkout with sufficient stock decrements exactly the
      sold quantity; an orçamento reserves stock without touching the real balance, and
      converting it moves the reservation into a real decrement; `baixarLancamento` marks a
      lançamento paid, a second baixa attempt on the same id is rejected (SQL-level guard
      already existed — now proven), and `getFluxoCaixa` reflects it exactly once; a `pagamentos`
      round-trip (register → list → mark received). All 12 tests pass (`npm test`). Still not
      covered: `Precificacao` margin math (`calcLucro`/`calcMargem`/`calcPrecoVenda` live in
      `modules/precificacao/precificacao.js` as renderer-side DOM-coupled functions, not
      extracted into a testable pure module — would need a small refactor first, out of scope
      for this pass).
- [x] **CI** — added `.github/workflows/ci.yml` (`windows-latest`, Node 22): `npm ci && npm run
      lint && npm test` on push/PR to `main`. Not yet verified green on an actual GitHub Actions
      run (would require pushing and watching it fire) — the steps match exactly what was just
      run and confirmed clean locally, but treat the first real CI run as the actual proof.
- [x] **E2E wired into CI — found and fixed a real, pre-existing bug in the process.**
      "Confirm it still passes" turned up a genuine failure, not a stale claim: all 18/18 pages
      failed with `Cannot read properties of undefined (reading 'stats')`. Root cause:
      `scripts/test-ui.js`'s per-page probe called `window.erpBanco.dashboard.stats()`, but
      `window.erpBanco.dashboard` was never real — `modules/core/banco.js` has a `/* =====
      Dashboard ===== */` comment sitting directly above the *`busca`* (search) object, not a
      `dashboard` object; the actual dashboard page (`modules/dashboard/index.html:593`) has
      always called `window.api.dashboardStats()` (the raw preload API) directly, bypassing
      `erpBanco` entirely. Fixed the test to call the real, working API instead of the
      never-existent one — same repro→root-cause→fix discipline as any other bug in this file,
      not a blind "make it pass." Re-ran: 18/18 pages OK, 0 console errors. Added a step to
      `.github/workflows/ci.yml` running it after `npm test`.

## Security

- [x] `nodeIntegration: false`, `contextIsolation: true`, `contextBridge` exposing only
      specific methods (never raw Node objects) — correct baseline for an Electron app.
- [x] `npm audit` — 0 known vulnerabilities in production dependencies as of this pass.
- [x] No secrets committed; app needs no runtime `.env` (fully offline, DB key comes from the
      user's own login password) — `.env.example` from `project-standards.md` doesn't apply
      here for the same reason.
      **Superseded by the Payment Processor Integration section below**: once a Pix/adquirente
      provider is wired in, this stops being true — that integration *does* need a runtime
      `.env`. Keep this line as a historical note, not current fact, once that work starts.
- [x] DB key derivation — see **Database** above; verified sound (SQLCipher's own 256k-iteration
      PBKDF2 governs it), not the gap it first looked like.
- [ ] `modules/banco/` (raw table inspection) already requires admin session + password
      re-confirmation — good pattern; apply the same "admin + password re-confirm" gate to any
      future feature that can export or display bulk customer PII (e.g. a future full-database
      export/report feature), not just raw table browsing.

---

## Financial/Accounting Depth (margem de contribuição, ponto de equilíbrio, giro de estoque,
## provisão de DAS) — from `/repertoire` research, feature-type

**Source**: `REPERTOIRE.md`'s gap analysis (2026-08-19), which cross-checked real Brazilian
small-retail accounting practice + Simples Nacional/MEI tax rules + what Bling/Tiny/Omie/
ContaAzul actually ship, against what this project's `db/` layer actually has. Read that file
first if picking this section back up later — it has the *why* (formulas, regulatory citations,
competitor comparison) this section only references, not repeats.

**Corrected finding, important**: the first pass of that research wrongly listed DRE as missing
— it isn't. `getDRE()` (`db/relatorios.js`) already exists, complete and wired end-to-end
(receita bruta → deduções → receita líquida → CMV → lucro bruto → despesas → lucro líquido +
margem bruta/líquida %, in the Relatórios UI with chart + PDF export). Verified by actually
reading the file this time, not just grepping for the term. The four items below are the ones
that survived that re-check — genuinely absent, not re-discovered.

**Out of scope, explicitly** (same "don't overbuild" boundary `/repertoire`'s research itself
flagged): this section does **not** add a real DAS calculator (Simples Nacional's actual
brackets/anexos/Fator R are their own complex domain — an accountant's job, not this app's) and
does **not** add bank reconciliation (that's the already-tracked, still-paused Ton `.xlsx` import
in the Payment Processor Integration section below — related territory, separate decision).

```mermaid
flowchart TD
    A[Margem de Contribuição] --> B[Ponto de Equilíbrio\nneeds A's unit contribution margin]
    C[Giro de Estoque] --> E[Registration: wire into Relatórios UI]
    D[Provisão de DAS] --> E
    A --> E
    B --> E
```

### Margem de Contribuição

- [x] **Design rationale.** Distinct from the margem bruta/líquida `getDRE()` already computes
      (which nets against CMV only) and distinct from `db/precificacao.js`'s per-product margin
      (which nets against `preco_custo` + `impostos_extras` only). Margem de contribuição =
      preço de venda − *all* variable costs: CMV + comissão do vendedor (`comissao_percentual`,
      already tracked) + taxa de adquirente (cartão/Pix — **not currently tracked anywhere**,
      needs a new `Configuracao` key, same pattern as `custo_fixo_mensal`) + impostos sobre a
      venda (`impostos_extras`, already tracked). Out of scope: this does not replace the
      existing per-product margin field in Precificação — it's a new, separate number for
      period-level and per-product profitability analysis, per `REPERTOIRE.md`'s research on
      why markup ≠ margem de contribuição is the most common small-retail pricing mistake.
- [x] **New `Configuracao` key `taxa_adquirente_media`** (percentual, owner-entered — same
      manual-input pattern as `custo_fixo_mensal` in `db/precificacao.js:getCustoFixoConfig`/
      `saveCustoFixoConfig`), since no per-transaction gateway fee is tracked anywhere today.
- [x] **`getMargemContribuicao(dataInicio, dataFim)`** in `db/relatorios.js` (same file as
      `getDRE`/`getCurvaABC` — keep the "one file per domain" convention), returning both a
      period-level aggregate and a per-product breakdown (reuse `getCurvaABC`'s join pattern:
      `ItensVenda` → `Vendas` → `Variacoes` → `Produtos`). Formula per unit: `preco_unitario −
      preco_custo − (preco_unitario × comissao_percentual / 100) − (preco_unitario ×
      taxa_adquirente_media / 100) − impostos_extras`.
- [x] `test/relatorios-financeiro.test.js` — known sale (receita=200, cmv=100, comissão=10,
      taxa=6, impostos=4) → asserted exact margemContribuicao=80, unitária=40, percentual=40%.
      Also verified live in the running app: a real seeded sale (receita=1200, cmv=600,
      taxa=42) rendered margem=558 on screen, matching the formula exactly.

### Ponto de Equilíbrio

- [x] **Design rationale** — kept as planned, depends on Margem de Contribuição. **Bug caught
      and fixed before shipping**: the original plan's `faturamentoNecessario` idea
      (quantidadeNecessaria × ticketMedio) mixed units — quantidade is product-units, ticketMedio
      is R$/transação, not R$/unidade, so multiplying them doesn't give a coherent revenue
      figure. Fixed to the actually-correct formula: `custo_fixo_mensal ÷
      (margemContribuicaoPercentualMedia / 100)`. Caught by working through the test's expected
      values by hand before trusting the code, not by exhaustive review.
- [x] **`getPontoDeEquilibrio(dataInicio, dataFim)`** in `db/relatorios.js`, reusing
      `getCustoFixoConfig()` + `getMargemContribuicao()`. Returns quantidadeNecessaria and the
      corrected faturamentoNecessario (see bug fix above).
- [x] Test: custo_fixo_mensal=400, margem unitária média=40 → exact quantidadeNecessaria=10,
      faturamentoNecessario=1000, asserted end-to-end through the real function. Verified live
      too: custo_fixo=3000, margem%=46.5% → 17 unidades / R$6451.61, exact match on screen.

### Giro de Estoque

- [x] **Design rationale** — kept as planned. No period-snapshot of stock levels exists (only current
      `quantidade_estoque` on `Variacoes`) — computing a textbook "average stock over the
      period" isn't possible without adding stock-history snapshots, which is a bigger change
      than this item's scope. Use the same simplification `getDRE`'s own code comment already
      documents as precedent ("usa o preco_custo ATUAL... mesma simplificação que a Curva ABC já
      assume"): approximate giro with `quantidade vendida no período ÷ quantidade_estoque atual`
      instead of a true period average, **documented as a known simplification in the code
      comment**, not silently passed off as exact.
- [x] **`getGiroEstoque(dataInicio, dataFim)`** in `db/relatorios.js`, per-product, with
      `diasParaReposicao = 365 ÷ giro`.
- [x] Tests (2): known sold-quantity(2)/estoque(8) → exact giro=0.25, dias=1460. Zero-stock case
      → giro=null/dias=null, not Infinity/NaN. Verified live: vendido=3, estoque=12 (15 inicial
      − 3 vendidos) → giro=0.25, dias=1460, exact match on screen.

### Provisão de DAS (regime de caixa)

- [x] **Design rationale** — kept as planned. Not a tax calculator — Simples Nacional's real bracket/anexo/Fator R
      logic is out of scope, explicitly (see section header). This is narrower: surface "based
      on what `getFluxoCaixa()` shows was actually *received* in cash this period (not
      invoiced), here's the estimated DAS at a flat owner-entered rate" — directly targeting the
      documented failure mode from `REPERTOIRE.md`'s research (businesses that provision DAS
      against invoiced revenue instead of received cash end up paying early and straining cash
      flow they don't have yet). The whole value of this feature is using **received**, not
      **billed**, figures — get that distinction wrong and the feature reproduces the exact
      mistake it exists to prevent.
- [x] **New `Configuracao` key `aliquota_das_provisao`** — `db/financeiro.js:getAliquotaDAS`/
      `saveAliquotaDAS`. UI in `modules/financeiro/financeiro.html`'s Fluxo de Caixa tab.
- [x] **`getProvisaoDAS(dataInicio, dataFim)`** in `db/financeiro.js` (next to `getFluxoCaixa`,
      as planned). Reuses `getFluxoCaixa()`'s `totalEntradas` (received, not invoiced) as base.
- [x] Tests: exact provisioned value from a known received-cash figure + alíquota; **and** the
      one behavioral property that makes this safe — created a venda à vista (R$1000, counted)
      alongside a venda Fiado (R$5000, a receivable) in the same period, asserted only the 1000
      shows up in `totalRecebido`. Verified live: R$1200 recebido × 6% = R$72.00, exact match.

### Registration

- [x] All wired into `window.erpBanco.relatorios.*` (`margemContribuicao`, `pontoDeEquilibrio`,
      `giroEstoque`), `window.erpBanco.financeiro.*` (`aliquotaDAS`, `salvarAliquotaDAS`,
      `provisaoDAS`), `window.erpBanco.precificacao.*` (`taxaAdquirente`,
      `salvarTaxaAdquirente`) in `modules/core/banco.js`, matching existing patterns exactly.
- [x] `ipcMain.handle` entries added in `ipc/relatorios.js` (`exigirPermissao("relatorios")`),
      `ipc/financeiro.js` (mixed `exigirPermissao("financeiro")` for the DAS calc,
      `exigirSessao("admin")` for the alíquota config — same split `ipc/precificacao.js` already
      uses for custo_fixo_mensal), `ipc/precificacao.js` (`exigirSessao("admin")` for the taxa
      config). `database.js` and `preload.js` re-exports added for all of it.
- [x] UI: margem de contribuição + ponto de equilíbrio share one panel in
      `modules/relatorios/relatorios.js` (same decision, read together); giro de estoque got its
      own panel in the same screen (kept consistent with where every other period-based metric
      already lives, rather than splitting into estoque-lista.js). New "Taxa Média de
      Adquirente" config in `modules/precificacao/precificacao.html`; new "Provisão de DAS"
      panel in `modules/financeiro/financeiro.html`'s Fluxo de Caixa tab. Verified by actually
      running the app with seeded real data and reading the rendered screens (screenshots
      taken) — every number matched the underlying formula exactly, not just "code exists."
- [x] Updated `AGENTS.md`'s "Funcionalidades Implementadas" list (Financeiro + Relatórios lines).

---

## Payment Processor Integration (Ton / Stone / alternatives) — decided: not pursuing (2026-08-22)

**Owner decision (2026-08-22): dropping this entire section, not just pausing it.** No Ton
statement import, no Stone PJ upgrade, no adquirente switch — Pix via Efí stays the only active
payment integration. The research below stays as-is (accurate, still useful if this is ever
revisited), but every actionable item in this section is now closed as "decided against," not
"waiting on the owner."

**Status as of 2026-08-18: the "is there an API path for Ton" question is now answered —
no.** Confirmed directly from Stone's own help center
([Conhecendo o Open Finance](https://ajuda.stone.com.br/open-finance/conhecendo-o-open-finance)),
verbatim: *"Não. Por enquanto, você só vai poder compartilhar dados da sua Conta Stone."*
("No. For now, you can only share data from your Stone Account.") — Ton accounts are
explicitly excluded from Open Finance data-sharing today, even though Stone Pagamentos S.A.
itself is a certified Open Finance participant (certified 2023-02-15) — the certification
covers Stone Account, not Ton. This closes the loop on yesterday's "unconfirmed" eligibility
question from both directions: not via Stone's commercial OpenBank API (still unconfirmed but
structurally unlikely), and not via the regulated Open Finance channel either (explicitly
confirmed no) — which also rules out third-party Open Finance aggregators (Pluggy, Belvo,
Tecnospeed, etc.), since they all pull from the same regulated channel Stone just said Ton
isn't part of yet. No further "email support to ask" step is needed — this is a real dead end
for a Ton account as it exists today, not a temporarily-unknown one.

**What is confirmed possible today, self-service, no API/credential at all:** the Ton app's
own "Extrato" screen exports transactions as an **Excel (.xlsx) file** — self-service,
available right now, no partnership/approval needed (unlike an OFX file with a stable
`FITID`, which Ton does not appear to offer — several Reclame Aqui complaints exist from
users wanting a native PDF/OFX and being told Excel is the only export format). This means
Phase 1 below should target **.xlsx**, not OFX as originally scoped — deduplication needs a
composite key (date + valor + descrição) instead of a stable transaction ID, and re-imports
should warn on ambiguous near-duplicates rather than silently trusting a FITID that doesn't
exist for this source.

**A path that wasn't on the table yesterday: upgrade Ton → Conta Stone PJ.** Since Stone
Account *can* do Open Finance today (and is the more likely candidate for OpenBank API
eligibility too), if the store's revenue now clears Stone's CNPJ + R$15k/month minimum, this
is a real option — same corporate group, likely smoother transition than a full switch to
Mercado Pago/PagBank, and it directly unlocks both Open Finance and a plausible path to the
OpenBank API. This is a business decision (revenue threshold, whether the store wants a
CNPJ-tier account), not a technical one — flagged here, not decided.

**Status: still paused, waiting on the owner.** Do not start building against any specific
provider, and do not contact Stone/Ton support, until the owner picks a direction from the
three real options now on the table: (1) Excel-import reconciliation against Ton as-is
(buildable today, Phase 1 below), (2) upgrade to Conta Stone PJ if revenue qualifies, unlocking
Open Finance/OpenBank, or (3) switch adquirente entirely (Mercado Pago/PagBank/InfinitePay,
compared below). This section was written before the `Pagamentos` / `integracoes/pix/` (Efí
provider) / `integracoes/fiscal/` (FocusNFe provider) work existed in this file's history —
read that work first, since it already covers live Pix, separately from this adquirente/
statement question.

### What already exists (don't rebuild this)
- `db/pagamentos.js` / `ipc/pagamentos.js` — manual recebimento tracking (Pix/Boleto/Dinheiro/
  Cartão) linked to a venda. This is bookkeeping, not a live bank/processor connection.
- `integracoes/pix/provider.js` + `integracoes/pix/providers/efi.js` — a real, working Pix
  provider integration already built against **Efí (ex-Gerencianet)**, with
  `test/pix-payload.test.js` + `test/pix-provider.test.js` covering it. Efí is a legitimate,
  well-documented, self-service Brazilian Pix API (no partnership-approval gate, unlike
  Stone/Ton) — this may already solve the "get live Pix receipt data into the ERP" problem
  the research below was chasing.
- `integracoes/fiscal/provider.js` + `integracoes/fiscal/providers/focusnfe.js` — NF-e issuance
  via FocusNFe, with `test/fiscal.test.js` + `test/fiscal-provider.test.js`. Note: `AGENTS.md`'s
  "Fora de escopo (decidido)" line about NF-e is now stale — this was started. Reconcile that
  doc when this section's decision resolves.

### Research findings (still true, provider-choice research)

**"Banco TON" is not an independent bank — it's a brand of Grupo Stone**, positioned for
autonomous workers / MEI: a free digital account with Pix, a debit card, and card-machine
("maquininha") hardware. Sources: [Stone launches new Ton machine with Pix QR
Code](https://conteudo.stone.com.br/apostando-no-crescimento-do-mei-no-brasil-stone-reforca-marca-ton-e-lanca-nova-maquininha-com-pix-qr-code/),
[Sobre o Ton — Ton Help
Center](https://ajuda.ton.com.br/pt_BR/conta-e-transfer%C3%AAncia/sobre-o-ton),
[Stone e Ton são a mesma coisa?](https://conteudo.stone.com.br/stone-e-ton-sao-a-mesma-coisa/).

**No public TON developer API was found.** Ton's own help center mentions only Pix, payments,
transfers, and phone recharge — no API/webhook/export for third-party systems.

**Stone (the parent brand) does run a real, fairly complete banking API** — Stone OpenBank
(`docs.openbank.stone.com.br`): balance, transaction history, transfers, Pix, boletos, payment
links. Two things block using it today:
1. **Account-type eligibility unconfirmed.** Docs only reference `user_id` (PF) and
   `organization_id` (PJ) accounts, never "Ton." Ton and Stone have different eligibility rules
   as products (Stone: CNPJ + R$15k/month min revenue; Ton: CPF or CNPJ, no minimum) — a real
   signal they may not share the same backend ledger. Source:
   [maquininhacerta.com.br comparison](https://maquininhacerta.com.br/ton-ou-stone/).
2. **Access is not self-service.** Generate an SSH keypair → send the public key to Stone via
   their integration form → Stone issues a ClientID → test in
   `https://sandbox-api.openbank.stone.com.br` → email
   **`parcerias@openbank.stone.com.br`** for production access
   (`https://api.openbank.stone.com.br`) → homologation process. Sources:
   [STONE BANKING API guide](https://docs.openbank.stone.com.br/docs/guias/stone-open-banking/),
   [APROVAÇÃO](https://docs.openbank.stone.com.br/docs/guias/aprovacao/),
   [TOKEN DE ACESSO](https://docs.openbank.stone.com.br/sandbox/docs/guias/token-de-acesso/).

**Self-service alternatives with no commercial-approval gate**, compared on API access + MEI
card-machine rates:

| Processor | API access | Débito | Crédito 12x | Pix |
|---|---|---|---|---|
| **Mercado Pago** | Fully self-service — create an application in the [developer portal](https://www.mercadopago.com.br/developers/pt), test credentials instantly, production via website URL + T&C + recaptcha. Full REST API (orders, Pix, webhooks) + Point machine SDK. | ~0.74% (drops with revenue tier) | mid-range | ~0.74% |
| **PagBank** | Fully self-service — [developer.pagbank.com.br](https://developer.pagbank.com.br/), sandbox with test cards/simulator. Full REST API (orders/payments, checkout, Connect). | ~0.58% (lowest found) | 22.59% (highest of the three) | varies |
| **InfinitePay** | Self-service via [dashboard](https://www.infinitepay.io/desenvolvedores) — simpler API (checkout links + a webhook per sale), not a full account/statement API. | ~0.75% | 12.40% (lowest of the three) | free |
| **Efí (already integrated for Pix)** | Already wired in this codebase (`integracoes/pix/providers/efi.js`) — self-service, no approval gate. | N/A — not a card acquirer | N/A | already live |

**Recommendation if a card-machine/adquirente switch is chosen: Mercado Pago** — strong on both
API access and rates, and covers online sales on the same account if that ever happens. PagBank
wins on raw debit rate if the store's mix is mostly debit/à-vista. InfinitePay wins on cheap
installments. None of the three overlap with Efí's role (Efí ≈ Pix/banking API, these three
≈ card-machine/adquirente) — this may end up being "keep Efí for Pix, separately pick one of
these three (or stay on Ton) for card payments," not an either/or.

Real switching cost to weigh, not just rate math: new machine, Ton's existing sales history
doesn't move automatically, staff has to learn a new machine. Not this file's call to make.

### Phase 1 (Ton .xlsx import) and the open decision — both closed, not pursuing

- [x] ~~Phase 1: Ton .xlsx import + reconciliation (`ExtratoTon` table, `db/ton.js`/`ipc/ton.js`,
      `modules/conciliacao-ton/`, dedup/reconciliation logic, `test/ton-extrato.test.js`)~~ —
      **owner decided not to build this (2026-08-22)**, not a technical blocker. Full spec kept
      in git history if this is ever revisited — not reproduced here since it won't be built.
- [x] ~~Open decision: (a) Efí-only vs. (b) Ton .xlsx vs. (c) Stone PJ upgrade vs. (d) switch
      adquirente~~ — **decided: (a), Efí's existing Pix integration stays the only payment
      integration.** (e) (the stale `AGENTS.md` NF-e line) was independent of this decision and
      is fixed now regardless — see `AGENTS.md`'s corrected "Fora de escopo" section.
- [x] ~~Security checklist for whichever processor gets chosen~~ — moot, no new processor
      credential is being added. Efí's and FocusNFe's existing credential handling (`.env`,
      masked logging) predates this section and was already reviewed when those were built.

---

## Core + Plugins Architecture (module separation + per-module restyle) — build, not started

**Why this section exists:** owner wants to restructure the app from "19 modules hardcoded into
one repo" into a **core + plugins** shape: a minimal core (auth, dashboard shell, shared
SQLCipher database) that business modules (PDV, Clientes, Produtos, Compras, Fornecedores,
Financeiro, Relatórios, Pagamentos, Acessos, Banco, Atualização, Importação, Entrada, Vendas)
plug into — each with its own GitHub repo, addable/removable without touching the others or
rebuilding the whole app ("like a car's CAN bus: swap a part without breaking the rest" — owner's
own framing). Business motivation: **price per managed module** once the product is sold, e.g. a
client buys PDV + Estoque without the rest. The code must stay fully open/accessible until
**~December 2026** (owner's own deadline) — no hard license lock before then; any
entitlement/gating mechanism built here must default to "everything unlocked" until that date.

This does **not** replace the already-approved Next.js/TailAdmin frontend migration
(`C:\Users\beatl\.claude\plans\magical-soaring-squirrel.md`, Phase 0 spike already done — see
`Frontend` section above) — it changes the *order and boundary* the restyle work happens in
(module by module, independently, once each module has a clean boundary) instead of one big
sequential Phase 1→6 pass. The **frontend visual/UX bug-fix pass is fully done** (see section
above) and stays as-is; this new section is about the module *structure*, not another repaint of
the current vanilla screens.

**Confirmed from reading the actual code** (not assumed): `main.js` currently wires every module
by hand — 19 sequential `require("./ipc/X").registrar(ipcMain, deps)` calls
(`main.js:304-322`, one per domain). `navbar.js` builds the sidebar as one giant hardcoded HTML
string with every module's icon/label/href/permission-gate hand-written inline
(`navbar.js:328-404`, e.g. the "Financeiro" link is `podeModulo("financeiro") ? '<a href=...>' :
""` baked directly into the template). **Both of these are exactly the two places a real
plug-in-a-module mechanism has to replace** — this is the concrete, scoped technical work behind
the "CAN bus" analogy, not a vague architecture goal.

```mermaid
flowchart TD
    A[Design module manifest schema\n+ core/module contract] --> B[Backend: manifest-driven\nloader replaces main.js's\n19 hardcoded requires]
    A --> C[Frontend: manifest-driven\nsidebar replaces navbar.js's\nhardcoded HTML string]
    B --> D[Regression: same 19 modules,\nsame permissions, now loaded\nvia manifest, in ONE repo]
    C --> D
    D --> E[Extract module folders into\nseparate GitHub repos,\nwire as git submodules]
    E --> F[Packaging: submodule checkout\nstep before electron-builder]
    D --> G[Design entitlements.json\n— dormant, all-open until Dec 2026]
    F --> H[Per-module restyle against\nTailAdmin, one module at a time,\nuser-guided]
```

### Backend: module manifest + loader

- [x] **Design the module manifest schema — done, `docs/MODULE_MANIFEST.md`.** Turned out to be
      a bigger discovery than the original item assumed: reading the actual code
      (`main.js:304-322`, `navbar.js:328-404`, `dashboard/abas.js`,
      `produtos/gerenciamento-produtos.js`) showed the module tree is **4 levels deep**, not
      flat — Sidebar → Dashboard-tab (a THIRD file, `abas.js`'s `MODULOS_ABA` dict, hardcodes
      per-module knowledge by matching the clicked link's filename — not in the original item's
      scope) → Produtos' own internal tab bar → Estoque's own hidden 4th-level tab. The schema
      (`id`/`nome`/`versao`/`tipo`/`entrada`/`ipc`/`permissao`/`navbar`/`paiWorkspace`/`dependeDe`,
      modeled on Odoo's `__manifest__.py`) accounts for all of it, including the one real
      exception found (Atualizações sits visually inside the admin sidebar group but is NOT
      admin-gated — any authenticated user reaches it) and one pre-existing bug flagged, not
      fixed (`gerenciamento-produtos.js` hard-gates the whole Produtos workspace to
      `perfil==="admin"`, stricter than the sidebar's own `podeModulo("produtos")` check — a
      vendedor granted the permission would see the link but nothing would happen on click).
      Validated for real: wrote actual `modulo.json`/`<id>.modulo.json` manifests for all 19
      modules (not a hypothetical check) — see the loader item below for the real proof these are
      correct, not just written.
- [x] **`modulos.js` (repo root, not `db/` — this is module discovery, not database logic) —
      done.** Scans `modules/**` for `modulo.json`/`*.modulo.json`, validates each field, resolves
      and checks every `ipc`/`entrada` reference against the real filesystem, topologically sorts
      by `dependeDe` (Kahn's algorithm, throws naming the exact cycle). `test/modulos.test.js`
      (10 tests, registered in `package.json`'s test script) — done when criteria met for real:
      malformed JSON, missing required field, unknown `dependeDe` target, dependency cycle, dead
      `ipc`/`entrada` reference, and duplicate id all throw with the exact file path; and — the
      strongest proof — **running the loader against the real `modules/` directory succeeds and
      correctly orders every parent before its children** (`produtos` before `cadastro`, `entrada`
      before `estoque-lista`, `financeiro` before `pagamentos`), which is simultaneously the
      "validate the schema against all 19 real modules" requirement from the item above.
      `npm run lint` (0 warnings) + `npm test` (50/50, was 40/40) both pass.
- [x] **Replace `main.js`'s 19 hardcoded `require("./ipc/X").registrar(...)` calls — done.**
      `auth.js`/`fiscal.js` stay direct (core infra, not plugable modules — see
      `docs/MODULE_MANIFEST.md`); the rest come from a loop over `carregarModulos()`'s output,
      deduped by filename (`produtos.js` and `estoque.js` are each referenced by more than one
      module manifest — without dedup, `ipcMain.handle()` would throw "second handler" on boot).
      Verified for real, not assumed: `test/modulos.test.js` has a dedicated test asserting the
      exact set of files the new loop registers equals the old hardcoded 19-file list (neither a
      dropped nor a duplicated handler); and the app was actually booted (`npm start`, twice) with
      the crash log (`erp-crash.log`) checked before/after — no new entries, confirming no
      "second handler" exception or other boot-time crash in practice, not just in theory.
- [x] **Replace `navbar.js`'s hardcoded sidebar HTML + `dashboard/abas.js`'s `MODULOS_ABA` dict —
      done, live-verified by the owner against the checklist below.** `navbar.js`
      now fetches the module list via a new IPC round-trip (`ipc/sistema.js`'s
      `get-modulos-carregados` handler → `preload.js`'s `window.api.getModulosCarregados()`,
      since `navbar.js` runs in the renderer with no `fs` access) before building the sidebar.
      Deliberate risk-reduction choice: Dashboard and PDV (the "Principal" section, the only 2
      always-reachable, ungated links) stay **hardcoded, unchanged** — only the permission-gated
      Gestão/Administração sections became manifest-driven — so a bad `modulo.json` degrades to a
      smaller sidebar, never a fully unreachable app; the fetch failure path logs via
      `console.error` (visible in `erp-crash.log`) instead of failing silently.
      `dashboard/abas.js`'s `MODULOS_ABA` dict is now computed from `window.erpModulosCarregados`
      (set by `navbar.js` before it touches the DOM) inside the click handler itself, not at
      script-load time — `abas.js` runs synchronously before the async module fetch resolves, so
      the lookup has to happen lazily, at actual click time, when the data is guaranteed ready.
      **Two specific fidelity risks found and fixed while doing this**, not assumed away:
      "Acessos" has a tooltip (`data-tip="Acessos"`) that's shorter than its visible label
      ("Gerenciar Acessos") — added `navbar.dica` to the schema/manifest for this one real
      exception; and Produtos' `?workspace=` query value (`"gerenciamento-produtos"`) doesn't
      match its own manifest id (`"produtos"`) — added `navbar.workspaceParam` rather than
      deriving it from `id`. Verified so far: `npm run lint` (0 warnings), `npm test` (51/51),
      and two full app boots with the crash log checked before/after (no new entries — no
      uncaught exception/unhandled rejection fired while `navbar.js`/`abas.js` actually ran in
      the renderer). **Not yet verified**: that the rendered sidebar is actually correct — same
      links, same permission gating for `admin` vs. `vendedor`, same Dashboard-tab behavior —
      because none of the above can observe rendered DOM output or click-through behavior. Owner
      confirmed proceeding on this basis, then live-verified against the checklist below (admin
      sidebar order/tooltip/tabs, Produtos sub-tabs, vendedor's reduced sidebar including the
      Atualizações exception) — owner reported "deu certo" (2026-08-22), no discrepancies found.
- [x] Regression pass **before touching repo structure — done.** `npm run lint` + `npm test`
      (51/51) pass, and the manual pass above confirmed sidebar/permissions/tabs live for both
      profiles. **This item gated everything below** — module extraction into separate repos can
      now proceed, since the loader that makes it meaningful is proven working in the current
      single repo. Not yet started (next topic).

### Deployment/Infra: multi-repo composition — deferred until ~December 2026, owner's explicit call

**Owner decision (2026-08-22), overriding this section's earlier "recommended for now" framing:**
everything stays in the **single existing repository** until ~December 2026 — no module gets
split into its own GitHub repo before then. The module folders under `modules/` are the
organizational unit (already matches `docs/MODULE_MANIFEST.md`'s inventory), not separate repos,
for now. The research below stays as the plan for *when* that changes, not something to act on
now — don't create any new GitHub repo, don't add a submodule, without a fresh, explicit go-ahead
after this date.

Researched: `npm` cannot reference a specific workspace package inside another repo via a git
URL (no git-dependency support for workspaces as of npm's current release), which rules out the
"one core repo, `npm install` pulls each module straight from its own GitHub URL as a workspace
member" approach the ask first suggested — that mechanism doesn't exist in current npm tooling.
Two approaches actually work for this case (offline-first desktop app, no existing complex CI,
single dev owner today) — **both explicitly future work, not started:**

- [ ] **When the split happens: git submodules.** Each module folder becomes its own GitHub repo;
      the core repo (`ERP/ERP`) references each one as a submodule under `modules/<nome>/`,
      pinned to a commit. Native git, zero extra infrastructure, works identically with public
      repos. Tradeoff to accept knowingly: submodule workflow has real rough edges (detached HEAD
      after checkout, `git submodule update --init --recursive` required after clone, easy to
      forget to push a submodule's own commit before updating its pointer in core) — document
      these three specifically in `README.md` once adopted, since they're the actual footguns,
      not a vague "submodules are tricky".
- [ ] **Migration path for ~December 2026** (do not build this now, just don't design anything
      that blocks it later): once modules need real per-customer gating, publish each module as
      a versioned npm package via **GitHub Packages** (private repo + package = the entitlement
      mechanism itself — a customer's npm token either can or can't fetch a module they didn't
      buy, no custom license-key software needed) and have the core's `package.json` depend on
      published versions instead of submodule checkouts. This is a repackaging step once modules
      are already clean, manifest-declared packages — not a redesign — *if* the manifest schema
      and folder shape from the Backend section above are followed now (they are).
- [ ] Update `package.json`'s `build.files` allowlist and the build/CI scripts to check out
      submodules (`git submodule update --init --recursive`) before `electron-builder` runs —
      done when: a clean clone + the documented build command produces a working installer with
      no manual extra step beyond what's documented.
- [ ] Update `.github/workflows/ci.yml`'s checkout step (`actions/checkout@v4`) to fetch
      submodules (`with: submodules: recursive`) — done when: CI passes against the new repo
      shape, not just locally.

### Security: dormant entitlements design

- [x] **`aplicarEntitlements()` in `modulos.js` — done.** Reads an optional `entitlements.json`
      at the repo root, shape `{ "modulos": { "<id>": false } }` — only lists what's *disabled*;
      absent file or absent id means enabled, so the shipped default (no file present) is every
      module enabled, exactly as specified. Disabling a module cascades to anything that
      `dependeDe` it (disabling `produtos` also disables `cadastro`/`categorias`/`precificacao`/
      `entrada`/`estoque-lista` — doesn't make sense to leave a child registered when its parent
      workspace is gone). Wired into **both** halves that need to respect it: `main.js`'s IPC
      registration loop (a disabled module's handlers never register — not just hidden in the
      UI) and `ipc/sistema.js`'s `get-modulos-carregados` (disabled module never reaches the
      sidebar either). 5 new tests (`test/modulos.test.js`, 56 total now): no-file-present stays
      fully enabled, explicit `false` excludes, cascading disable through 2 levels of `dependeDe`
      excludes both, malformed `entitlements.json` throws, and — real proof, not a fixture —
      running it against the actual project with no `entitlements.json` present confirms all 19
      real modules stay enabled. `npm run lint` (0 warnings) + `npm test` (56/56) pass. Not
      re-verified via a fresh Electron boot this increment (the app was already open for the
      owner's own manual sidebar testing at the time — restarting it would have interrupted that;
      the change is provably a no-op today since no `entitlements.json` exists, and the exact
      same `carregarModulos()` path was already boot-verified before this wrapper was added).
- [x] **Switch-over plan for ~December 2026 documented — done, `docs/MODULE_MANIFEST.md`.**
      Gating stays per-module (matches the "sell PDV + Estoque only" pricing idea, no new
      granularity needed); flagged one real open question for the owner to decide *later, not
      now*: a plain `entitlements.json` has no tamper-resistance against the customer's own
      machine, which is fine for now but is a real gap to close before this goes live for
      real money — not assumed away, not solved prematurely either.

### Frontend: per-module restyle, reordered

**Note (2026-08-22):** "once extracted" below is now stale — the owner decided everything stays
in the single repo until ~December 2026 (see Deployment/Infra section above). Restyle work
happens directly in `frontend/`, not in a per-module repo.

- [x] **Shell: real auth, navy theme, manifest-driven sidebar, real Dashboard — built, not yet
      live-verified by the owner.** First concrete step of the restyle, per the owner's own
      choice (esqueleto + Dashboard, over "another module first with a generic sidebar").
      - `AuthContext` (`frontend/src/context/AuthContext.tsx`) wired to the real IPC
        (`getAuthSession`/`unlockWithProfile`/`logout`) — same `podeModulo`/`isAdmin` mirror
        logic as the vanilla `navbar.js`, real enforcement still 100% server-side in IPC.
      - `(admin)/layout.tsx` now actually gates on `sessao.autenticado`, redirecting to
        `/signin` — previously anyone could view admin pages regardless of session.
      - `globals.css`'s `@theme` brand scale replaced (TailAdmin's factory purple/blue →
        navy, landing on `--color-brand-500: #00006b`, the confirmed real primary).
      - `AppSidebar.tsx` rewritten to be **manifest-driven** — fetches
        `window.api.getModulosCarregados()` (the same IPC endpoint the vanilla sidebar uses,
        see Core + Plugins Architecture above) instead of TailAdmin's hardcoded demo nav
        (Calendar/Forms/Tables/Charts/etc., all removed). Renders 3 sections
        (Principal/Gestão/Administração) sorted by the manifest's own `ordem`, gated by the
        same `permissao.tipo` logic as vanilla. Deliberate simplification vs. vanilla: no
        collapsible Administração sub-group (flat 3rd section instead) — a real, disclosed
        difference, not an oversight.
      - `SignInForm.tsx` replaced entirely — was TailAdmin's generic template (Google/X social
        login, "keep me logged in," "forgot password," "sign up" — none of which apply to an
        internal, admin-managed, no-self-registration system). Now: usuário/senha, wired to
        `login()`, real error display. Matches `modules/auth/login.html`'s actual field
        shape, not invented.
      - `(admin)/page.tsx` replaced — was TailAdmin's fake e-commerce demo (fake metrics,
        "Monthly Target," fictional "Recent Orders") plus the leftover `IpcSmokeTest` spike
        component (now deleted, its whole purpose fulfilled by this real wiring). Now: 3 new
        components (`DashboardStatCards`, `FaturamentoChart`, `MaisVendidos`) fed by
        `window.api.dashboardStats()`, matching the vanilla dashboard's real 6 stat
        cards + 7-day chart + top-products table, not reinvented field names.
      - Every `window.api` call has a real fallback path (checked, not assumed) for the case
        it doesn't exist — running in a plain browser (`next dev` in a normal tab, no Electron
        preload bridge) shows a clear message instead of hanging or crashing silently.
      - Verified so far: `npm run typecheck` (clean) + `npm run lint` (clean) +
        `npm run build` (22/22 pages, static export succeeds) in `frontend/`, plus a real
        `next dev` session checked live in the Browser pane — auth-gate redirect confirmed
        working (`/` → `/signin` when unauthenticated), the real login form renders with the
        correct navy branding and copy, and the "no `window.api`" error path was actually
        triggered and displayed correctly (proven live, not just reasoned about).
      - **Not yet verified**: the sidebar and Dashboard with real data and a real session —
        that needs the actual Electron app (`ERP_SPIKE_FRONTEND=1 npm start`), which only the
        owner can look at, same limitation as the Core + Plugins sidebar work above. Not
        checked off as fully done until that live pass happens.
      - **Density pass (2026-08-22), owner feedback after first live look:** "muito grande os
        ícones, parece coisa de velho, queria algo mais minimalista." Diagnosed as a real
        Operate-mode density mismatch, not a one-off tweak — TailAdmin's factory scale (44-48px
        icon boxes, `rounded-2xl`, generous `p-5/p-6` card padding, `text-title-sm/md` headings)
        is tuned for a spacious consumer SaaS feel, not a dense tool checked repeatedly during a
        shift. Fixed systematically via `@theme`'s `--radius-*` tokens (every `rounded-*` class
        in the app inherits the tighter scale, not hunted file-by-file) plus deliberate
        per-component tightening (stat-card icons 44px→32px, card padding 20-24px→16px flat,
        stat value 30px→20px, sidebar icons 20px→18px matching the vanilla app's own scale,
        header button 44px→36px). Used the `impeccable` skill's `layout` guidance for this
        (Operate mode: density should match use frequency, not framework defaults). One
        pre-existing false positive triaged and suppressed via the skill's own mechanism
        (`hook-admin.mjs ignore-value gray-on-color`, scoped to `globals.css`): FullCalendar's
        vendor timegrid-axis CSS, untouched this session, Calendar page out of scope. Verified:
        `npm run typecheck` + `npm run build` (22/22) both clean after the pass, the mechanical
        `detect.mjs` scan returned no findings on every changed file, and the login heading's
        computed font-size was checked live in the browser (24px, down from 30-36px) — the
        sidebar/Dashboard density itself still needs the owner's own eyes in the real app.
      - **Second iteration (2026-08-22), owner saw it live in Electron:** first pass still
        "meio grande." Rather than guess again, built a temporary `DensitySlider` component
        (a `--density` CSS var driving the stat cards' padding/gap/icon/font sizes via
        `calc()`, a live 0.65–1.3× control right on the Dashboard) so the owner could dial in
        the exact number instead of me iterating blind — matches `impeccable`'s `layout.md`
        density-parameter pattern, self-hosted since the skill's own `live` mode needs
        MCP-browser tooling this session doesn't have wired to the Electron window. Owner
        settled on **0.90**; baked that multiplier into `DashboardStatCards.tsx`'s literal
        values (12.6px padding, 25.2px icon box, 16.2px value size, etc.) and deleted the
        slider component — it was explicitly temporary, not a shipped feature.
      - **Header cleanup, same session:** owner flagged the header search bar as dead weight
        (no command palette behind it) — removed, along with its now-orphaned `⌘K` listener.
        Owner also flagged that the template's fake logged-in user ("Musharof Chowdhury",
        `randomuser@pimjo.com`) and fake notification bell (8 hardcoded fake "Nganter App"
        collaboration requests, a permanent fake unread dot) were still showing, since this
        started life as a downloaded template. Fixed `UserDropdown.tsx` to show the *real*
        session (`sessao.usuario.nome`/`isAdmin` from `AuthContext`) with a working "Sair"
        that calls the real `logout()` IPC — previously a dead link to `/signin`. Deleted
        `NotificationDropdown.tsx` entirely rather than leave an inert bell: there is no
        notification backend in this ERP today, so a bell that can never show anything real
        is the same class of misleading dead UI as the fake search bar, not a feature to
        half-build. Flagged, not built: real notifications (estoque baixo, pagamento
        vencendo) would be a legitimate future feature if the owner wants it — new scope,
        not part of this shell pass.
      - **Sidebar width, same request:** reduced from TailAdmin's factory 290px (expanded) /
        90px (collapsed) to 260px / 76px, plus the `<aside>`'s own horizontal padding
        20px→16px — updated consistently in both `AppSidebar.tsx` (the sidebar itself) and
        `(admin)/layout.tsx` (the content area's matching margin, which has to move in
        lockstep or the page content would overlap or leave a gap).
      - Verified: `npm run typecheck` clean, `detect.mjs` clean on every touched file,
        `npm run build` 22/22 pages. Owner confirmed live ("certo") — 2026-08-22.
- [x] **Clientes — first CRUD module, built and live-verified.** Owner asked me to pick
      the next screen; chose Clientes over Fornecedores/Categorias for the reasons the original
      plan already gave (`magical-soaring-squirrel.md`): simplest pure CRUD, no nested-workspace
      dependency (unlike Categorias, which lives inside the not-yet-ported Produtos workspace),
      always-visible in the sidebar (`permissao: sempre`, no profile-gating edge case to test),
      and used by enough other screens (PDV, Vendas) that its pattern pays off broadly. Read the
      real vanilla implementation before building anything — `modules/clientes/clientes.js`
      (create/edit form) and `modules/clientes/lista-clientes.js` (list) are two separate pages
      — and found a real discrepancy worth noting rather than guessing: `Clientes` rows have
      `academia`/`faixa` DB columns (leftover from this ERP's original jiu-jitsu-store client,
      per the "ALLU is a generic product" direction already on record), but the current create
      form has **no field for them** — they only survive as list-page filter checkboxes + CSV
      export columns, populated only by legacy/imported data. Followed the existing product
      direction: no academia/faixa anywhere in the new form (matches the current form exactly,
      not an addition).
      - `lib/erpApi.ts` — thin `window.api` wrapper mirroring `modules/core/banco.js`'s
        namespace-per-domain shape, `clientes` namespace only for now (extended per module as
        each one gets built, not all at once).
      - `hooks/useClientes.ts`, `components/clientes/{ClientesTable,ClienteFormModal}.tsx`,
        `lib/utils/mascaras.ts` (phone/CPF-CNPJ masks, ported byte-for-byte from
        `clientes.js`'s own mask functions) — the `<XyzTable>`/`<XyzFormModal>`/`useXyz()`
        pattern the original plan named as the goal of doing a simple CRUD module first.
        Modal-based create/edit (not a separate page/route) — matches what the plan already
        specified, not a new decision.
      - **Real bug found and fixed while building this, not by inspection alone**: TailAdmin's
        shared `Button.tsx` never forwarded a `type` prop to the underlying `<button>` — inside
        a `<form>`, an unlabeled `<button>` defaults to `type="submit"`, so a "Cancelar" button
        next to a "Salvar" button would have silently submitted the form instead of closing it.
        Added the `type` prop (defaults to unset = browser's own submit-inside-form default,
        exactly like before, for every *existing* usage) — a real, general-purpose fix that
        benefits every future form built on this component, not something specific to Clientes.
      - **Explicitly deferred, not dropped** (scope kept to the core CRUD pattern the plan asked
        for): the `academia`/`faixa` list filters and CSV export from `lista-clientes.js`, the
        trash/restore toggle (`removerCliente` is soft-delete via `ativo=0`, already wired, just
        not exposed in the UI yet), the "Movimentações" modal (read-only sales history per
        client), and "Preços especiais" (per-client SKU pricing — needs the Produtos module,
        not yet ported, before it's meaningful to build).
      - Verified: `npm run typecheck` clean, `detect.mjs` clean on every new/touched file,
        `npm run build` (23/23 pages now). Owner tested live (list/search/create/edit/delete
        against the real database) and confirmed working — 2026-08-22.
- [x] **Fornecedores — second CRUD module, built and live-verified.** Same pattern as
      Clientes, deliberately: same folder shape (`hooks/useFornecedores.ts`,
      `components/fornecedores/{FornecedoresTable,FornecedorFormModal}.tsx`), same `erpApi.ts`
      namespace convention (now two namespaces). Read `ipc/fornecedores.js` + `db/fornecedores.js`
      before building, not assumed — found two real differences from Clientes worth preserving,
      not smoothing over into false consistency:
      - **Hard delete, not soft delete.** `removerFornecedor` actually `DELETE`s the row (guarded:
        throws if the supplier has purchase orders) — Clientes' `ativo=0` trash/restore pattern
        does not apply here. Matched the exact vanilla confirm copy (`Excluir "NOME"?`, not
        Clientes' longer "enviar para a lixeira" wording) since the underlying action really is
        different and deserves different copy, not a shared generic string.
      - **No input masking.** Checked `modules/fornecedores/fornecedores.js` for a CNPJ/phone
        mask like Clientes has — there isn't one; the current vanilla form takes CNPJ/telefone as
        plain free text. Built the same way (plain `Input`, no mask) rather than "improving" it
        with the mask utility already sitting in `lib/utils/mascaras.ts` from the Clientes
        build — adding formatting behavior the current app doesn't have is a scope decision for
        the owner to make, not something to slip in because the code happened to be handy.
      - Permission: `exigirPermissao("fornecedores")` in the IPC layer already matches the
        manifest's existing `permissao: {tipo:"modulo", nomeModulo:"fornecedores"}` — no manifest
        change needed, the sidebar link already pointed at `/fornecedores` correctly.
      - **Deferred, same reasoning as Clientes' "Preços especiais":** the "Produtos fornecidos"
        nested sub-feature (SKU + custo combinado per supplier) needs the Produtos module, not
        yet ported.
      - Verified: `npm run typecheck` clean, `detect.mjs` clean, `npm run build` (24/24 pages).
        Owner tested live ("parece funcionar corretamente") — 2026-08-24.
- [x] **Search state persists across navigation — done, live-verified after one real fix.**
      Owner noticed a real regression testing Clientes/Fornecedores: searching, then navigating
      to another screen and back, loses the search text — Next.js unmounts the page component on
      navigation (no more iframe-tabs keeping state alive like `dashboard/abas.js` did in the
      vanilla app). Talked through the tradeoff explicitly rather than just picking one:
      rebuilding the old iframe-tab system was rejected (it existed *because of* the
      iframe-embedding complexity this migration is deliberately removing — `?embedded=1` and all
      — not because it was the best solution; it would also have a real, scaling RAM cost from
      keeping N screens' component trees + fetched data alive at once, a real concern the owner
      raised for weaker store PCs — confirmed for the owner that the lightweight approach has
      none of that cost). True multi-screen "work in two screens at once" tabs stays explicitly
      out of scope — flagged as a real, bigger feature to plan deliberately if daily store
      workflow actually needs it, not something to build as a side effect of this fix.
      - **First attempt was wrong, caught by the owner's own retest, not by me**: persisted the
        search text via `history.replaceState` into the current page's URL (`?busca=...`). Built
        clean, typechecked clean — but didn't work, because the sidebar's `<Link>` always points
        at the bare `/clientes` with no query string; only the browser's own *back button* would
        have carried the saved URL forward. Clicking "Clientes" in the sidebar again (the actual
        way the owner returns to a screen) is a fresh navigation that ignores it entirely.
      - **Real fix: `sessionStorage`**, keyed per screen (`hooks/useBuscaPersistida.ts`), not the
        URL. Survives *any* path back to the screen (sidebar click, back button, whatever),
        clears itself when the app session actually ends — matching the "lasts while the app is
        open" behavior the old tab system had, without literally rebuilding it.
      - Verified: `npm run typecheck` clean, `detect.mjs` clean, `npm run build` clean on both
        attempts — neither check could have caught the actual bug (it was a navigation-path
        gap, not a type or build error), which is exactly why the owner's live retest mattered
        and why this stayed unchecked until they confirmed the second version — 2026-08-22
        ("perfeito").
- [x] **Acessos — third module, admin-gated, built and live-verified (2026-08-24).** First
      screen exercising the `permissao:{tipo:"admin"}` gate (Clientes was `sempre`, Fornecedores
      was `{tipo:"modulo"}`). Read `ipc/usuarios.js` + `db/usuarios.js` first: unlike
      Clientes/Fornecedores, `salvarUsuario(dados)` is a single endpoint for create *and* update
      (branches internally on `dados.id`), and password hashing (scrypt, salted) stays 100%
      server-side — the form only ever sends plaintext over IPC, never hashes client-side.
      - `components/acessos/{UsuarioFormModal,UsuariosTable,LogAtividadesPanel}.tsx`,
        `hooks/{useUsuarios,useLogAtividades}.ts`, `app/(admin)/acessos/page.tsx`. Also ported
        the vanilla screen's second panel — **Log de atividades** (filterable audit log,
        `banco.logAtividades`/`getLogAtividades`) — since it's a first-class part of this same
        screen, not an optional side feature to defer.
      - Owner tested live, then asked for a real hierarchy change: **three access tiers instead
        of two.** Added **Dono** between Adm and Funcionário (renamed from "Vendedor" — same
        underlying `perfil` DB value `"vendedor"`, only the label changed, no data migration).
        Rules implemented, backend-enforced (not just hidden in the UI):
        - `main.js#ehNivelAdmin` — one shared helper so `exigirSessao("admin")` accepts both
          `"admin"` and `"dono"`; single change point instead of touching the ~35 call sites
          across `ipc/*.js` individually. `exigirPermissao` got the same treatment.
        - `db/usuarios.js#salvarUsuario(dados, ator)` — now takes the acting session (threaded
          through from `ipc/usuarios.js` via `getSessao()`) to enforce, at the point a **new**
          password is being set: (1) a dono can never set a password on an admin-role account,
          full stop; (2) changing your *own* password (admin or dono) requires `dados.senhaAtual`,
          verified for real against the stored hash via the existing `verificarHashSenha`.
          Resetting *someone else's* password (the normal admin/dono workflow) still needs no
          current-password confirmation — that would defeat the point of a reset.
        - Both frontends updated in lockstep, not just the new one — the vanilla
          `modules/acessos/{acessos.html,acessos.js}` still is the default (`ERP_SPIKE_FRONTEND`
          is opt-in), and the backend rule change would have silently broken the *old* screen's
          self-password-change flow (no `senhaAtual` field to send) if left untouched. Also
          caught and fixed the same latent bug in both frontends: the perfil dropdown handler
          collapsed anything that wasn't `"vendedor"` into `"admin"`, which would have silently
          discarded a `"dono"` selection before it ever reached the backend.
        - `db/banco-admin.js#verificarSenhaAdmin` — separately gates the Banco de Dados screen's
          step-up re-auth (see below); hardcoded `perfil !== "admin"`, found and fixed while
          building Banco, not part of the original ask.
      - **Known gap, disclosed rather than silently closed either way**: the ask was specifically
        about the *password* — a dono can still edit an admin's other fields through the form
        (nome, ativo, and even the `perfil` dropdown itself). Not locked down; flagged to the
        owner, not decided unilaterally.
      - Verified: `npm run typecheck` clean, `npm run lint` clean (frontend), `npx eslint`
        clean on the touched backend files, all 56 backend tests still passing after the
        `db/usuarios.js`/`main.js` changes, `npm run build` (25/25 pages).
- [x] **Sidebar: hamburger removed, pure hover mode — built (2026-08-24).** Owner's explicit
      ask: no more click-to-pin expanded state, sidebar only widens on mouse hover, always
      starts collapsed (76px). Removed `isExpanded`/`isMobileOpen`/`toggleSidebar`/
      `toggleMobileSidebar` from `SidebarContext.tsx` entirely (not just unused — the only
      thing that ever triggered them, the header's hamburger button, is gone too), which made
      `Backdrop.tsx` (the mobile-drawer click-outside overlay) unreachable dead code — deleted.
      `AppSidebar.tsx`/`(admin)/layout.tsx` now key everything off `isHovered` alone. Verified:
      `npm run typecheck` clean, `npm run lint` clean.
- [ ] **Banco de Dados — fourth module, built, not yet live-verified.** Chosen as the next
      "simple, low-risk" pick after Acessos, same reasoning flagged earlier in this plan
      (admin-gated, mostly read-only). Read `modules/banco/banco.js` + `db/banco-admin.js`
      first: this screen has its own extra gate on top of the page-level admin permission — it
      re-asks for the logged-in user's password (`verificarSenhaAdmin`) before showing any data,
      a step-up re-auth for a sensitive raw-DB browser. Ported that gate as-is (a small
      password form in `hooks/useBancoAdmin.ts` + `app/(admin)/banco/page.tsx`), not simplified
      away.
      - Table resumo grid (name + row count, clickable) + dropdown, both wired to the same
        `consultarTabela(tabela, 200)` query; raw HTML table for the selected table's rows
        (React's own text-content escaping replaces the vanilla `esc()` helper — same
        protection, no manual escaping needed); "Exportar Banco (JSON)" button (writes a
        timestamped file server-side into `<dbDir>/exports/`, not a browser download).
      - Verified: `npm run typecheck` clean, `npm run lint` clean, `npx eslint` clean on
        `db/banco-admin.js`, all 56 backend tests passing, `npm run build` (26/26 pages).
        Owner hasn't confirmed live yet.
- [x] **Fornecedores CNPJ/telefone: strict input masking — built (2026-08-24).** Owner tested
      live, saved a supplier with `cnpj="1213185465487874"` (16 raw digits) and
      `telefone="asdf"` (letters) — the free-text inputs flagged as a deliberate scope decision
      when Fornecedores was first built (see that entry above) turned out to be a real usability
      gap, not a fine-as-is choice, once the owner actually hit it. Wired in the same
      `mascaraCpfCnpj`/`mascaraTelefone` utilities Clientes already uses
      (`lib/utils/mascaras.ts`) — same punctuation-as-you-type behavior, same 14/11-digit caps.
      `FornecedorFormModal.tsx` also runs existing records' `cnpj`/`telefone` through the mask
      when the edit form opens, so a garbled legacy value (like the owner's own test row) self-
      heals into the correct format the moment it's reopened, not just for values typed from now
      on. `db/fornecedores.js` stores `cnpj`/`telefone` as plain passthrough columns (no format
      constraint, confirmed by reading it) — masking is purely a frontend fix, no backend/schema
      change needed. On submit: `cnpj` stripped to raw digits (matches how Clientes' `cpf_cnpj`
      is already stored), `telefone` kept with its mask punctuation (also matching Clientes).
      Verified: `npm run typecheck` clean, `npm run lint` clean.
- [ ] **Importação — fifth module, built, not yet live-verified.** Smallest remaining screen
      (109 lines in the vanilla `importacao.js`, checked against `financeiro.js`/`relatorios.js`/
      `atualizacao.js` before picking it — genuinely the smallest, not a guess) — single file
      upload, client-side JSON parse/validate, one IPC call, no list/table/CRUD.
      - **Found and fixed a real manifest bug while reading the real gate before porting it**:
        `modules/importacao/modulo.json` said `permissao:{tipo:"admin"}`, but the actual vanilla
        page (`data-requer-modulo="estoque"` in `importacao.html`) and its IPC handler
        (`exigirPermissao("estoque")` in `ipc/vendas.js`, not admin-only) both gate on the
        `estoque` module permission — a funcionário granted "Estoque" access in Acessos should
        see this screen, and couldn't have, in either frontend, since the manifest is the single
        source both the vanilla sidebar and the new React sidebar read from. Fixed to
        `permissao:{tipo:"modulo",nomeModulo:"estoque"}`. Also found `"ipc":["estoque.js"]` was
        wrong — the handler this module actually calls (`importar-vendas-historicas`) lives in
        `ipc/vendas.js`, not `ipc/estoque.js`; fixed the `ipc` array and added
        `"dependeDe":["vendas"]` so the entitlements cascade (Dec 2026 switch-over) would
        correctly disable this screen if "vendas" itself ever gets disabled — today this was
        masked by the "vendas" module's own manifest already registering `vendas.js`
        independently, so nothing was actually broken live, but the manifest itself was wrong.
        Re-ran `test/modulos.test.js` after the fix (16/16 still passing).
      - `app/(admin)/importacao/page.tsx` — no dedicated hook, plain component state (file
        parse/validate/preview/import/result), matching the screen's actual one-shot-action
        shape rather than building a hook for something that isn't a reusable data-fetch
        pattern. New `erpApi.vendas` namespace (first entry in it — `importarHistorico`).
      - Verified: `npm run typecheck` clean, `npm run lint` clean, `npm test` (56/56, backend
        manifest change), `npm run build` (27/27 pages). Not yet verified live by the owner.
- [ ] **Atualização — sixth module, built, not yet live-verified.** Second-smallest remaining
      screen (158 lines). Only module so far needing a genuinely different data pattern: the
      `autoUpdater` (electron-updater) talks to the renderer via **push**, not
      request/response — `main.js` does `webContents.send("update-status", data)`,
      `preload.js` redispatches it as a DOM `CustomEvent("update-status")` on `window`. Every
      prior hook (`useClientes`, `useUsuarios`, etc.) only ever called `erpApi.X()` once and
      set state from the resolved value; this one has to `window.addEventListener` on mount
      and clean up on unmount instead, since the main process can push a new status at any
      time (checking → available → download-progress × N → update-downloaded/error).
      - `hooks/useAtualizacao.ts` — mirrors the vanilla state machine exactly (the same 6
        `update-status` cases, the same "if downloading, ignore repeat 'checking' events"
        guard, the same 3-way button branching: check → download → install depending on
        internal state), not simplified or restructured, since a states-and-transitions port
        is exactly where a "cleaner" rewrite risks silently dropping a real case. New
        `erpApi.sistema` namespace (`checkForUpdates`/`downloadUpdate`/`quitAndInstall`/
        `getAppVersion`) — the first 4 methods that map directly to preload-exposed names
        instead of raw IPC channel strings, since that's what `checkForUpdates` etc. already
        are in `preload.js` (no `-` channel-string round-trip needed).
      - Page-level permission stays `permissao:{tipo:"sempre"}` (anyone can see update
        status) but `download-update`/`quit-and-install` are still `exigirSessao("admin")`
        at the IPC layer (now admin-or-dono, per the Acessos hierarchy work above) —
        preserved as-is: a funcionário sees the same screen and button, and would get IPC's
        real error if they ever clicked past "check" into "download," same as the vanilla app
        already does. Not something to lock down further, not something to loosen either.
      - Verified: `npm run typecheck` clean, `npm run lint` clean, `npm run build` in
        progress (no backend files touched this time). Not yet verified live by the owner —
        also can't be fully exercised without a real newer release published, so the "no
        update available" / "checking" paths are what's realistically testable right now.
      - **Follow-up (2026-08-28), owner's explicit spec for the update flow**: "verifica
        sempre se tem atualização no repositório (1x/dia). ou clica em verificar
        atualizações. se ele verificar sozinho deve aparecer um card: Existe uma
        atualização, deseja fazer ela? se a pessoa clicar em sim, fecha o app, abre uma
        barra de carregamento, termina de atualizar depois inicia o app sozinho." Gaps
        found against that spec and closed:
        - `main.js` only checked for updates **once**, at boot. Added
          `iniciarChecagemAutomaticaDeAtualizacao()` (mirrors the existing daily-backup
          interval pattern) — checks at boot + every 24h while the app stays open, so a
          register left running all day doesn't have to wait for tomorrow's relaunch to
          notice a new release.
        - The existing `/atualizacao` page (`useAtualizacao.ts`) only ever surfaced status
          to whoever was already looking at that specific page — a background daily check
          finding an update while the owner was mid-sale on PDV would go unnoticed. New
          `components/atualizacao/UpdateAvailableCard.tsx`, mounted once in
          `(admin)/layout.tsx` (so it's live on every authenticated screen, not just
          `/atualizacao`): listens for the same `update-status` push event, and on
          `"available"` shows a floating card — "Existe uma atualização (vX) disponível.
          Deseja instalar agora?" with Sim/Agora não. This is additive, not a replacement —
          the `/atualizacao` page and its own button still work exactly as before for a
          manual check.
        - "Sim" downloads (progress bar right on the card) and, unlike the existing page's
          flow (which needs a *second* click once the download finishes), calls
          `quit-and-install` automatically the moment the `"update-downloaded"` event
          arrives — matches "termina de atualizar depois inicia o app sozinho" literally,
          no extra interaction.
        - The NSIS installer itself was `oneClick: false` (`package.json` → `build.nsis`) —
          a multi-step wizard (choose folder → Install → Finish), incompatible with "abre
          uma barra de carregamento" with zero clicks. Switched to `oneClick: true`
          (`quitAndInstall`'s own progress UI becomes a plain auto-advancing loading bar).
          **Disclosed trade-off, not hidden**: one-click NSIS installers can't offer
          "choose install directory," so `allowToChangeInstallationDirectory` was removed
          too — acceptable here since this app is installed on one dedicated register PC
          per client, not distributed to end users who'd want to pick a location.
        - Verified: `npm run lint`/`typecheck`/`build` clean (frontend), `npx eslint main.js`
          clean, `npm test` still 57/57, e2e suite (see Header Tab System section) still
          4/4 — confirms the new daily-interval code doesn't break app boot. **Not yet
          live-verified against a real published release** (same caveat as above — the
          "update available" → download → silent-install → auto-relaunch path can only be
          fully proven once there's an actual newer GitHub Release to update *to*).
- [ ] **Financeiro + Pagamentos — seventh module, built, not yet live-verified.** Owner asked
      to run through the rest of the per-module restyle in one continuous pass
      (`/execgoals`, "pode fazer tudo de uma vez"). 5-tab workspace (A Receber/A Pagar/Fluxo
      de Caixa/Fechamentos de Caixa/Pagamentos), each tab fetching lazily on activation —
      matching vanilla's own show/hide-and-fetch behavior, not eagerly loading all 5 tabs'
      data upfront.
      - **Real architectural difference from vanilla, deliberately not copied**: the
        Pagamentos tab was an `<iframe src="../pagamentos/pagamentos.html?embedded=1">` in
        the vanilla app — exactly the iframe-embedding pattern this whole migration exists to
        remove. Ported as a real in-page tab (`PagamentosTab.tsx`) instead, and "Lançar Novo
        Pagamento" (a full page navigation to `lancar-pagamento.html` in vanilla) became a
        modal (`PagamentoFormModal.tsx`) — matching the `<XyzFormModal>` convention every
        other module already uses, not a new decision made just for this screen.
      - Ported the Pix QR generation flow inside that modal byte-faithful to
        `lancar-pagamento.html`: shows the QR only when método is "pix", disables the button
        while generating, "automático" vs. "manual" confirmation copy depending on whether a
        real Pix provider is configured (`gerarQrCodePix`'s `automatico` flag), copy-to-
        clipboard for the copia-e-cola code.
      - Vanilla's dead "Excluir" button on the recebimentos list (its own handler just showed
        `alert("Funcionalidade de exclusão não implementada neste release.")` — never wired to
        a real IPC call) was **not ported** — matches the standing rule from the shell pass
        (delete `NotificationDropdown.tsx` rather than ship dead UI): a button that can never
        do anything real doesn't belong in the rebuild either.
      - New shared `lib/utils/formatos.ts` (`formatarAtributos`) — ported once, reusable by
        every future module that lists product variações (Compras, Entrada, Vendas, PDV),
        not just this one. Extended `InputField.tsx` with an `onKeyDown` prop (needed for the
        SKU-search "press Enter" pattern used throughout the vanilla app) — same
        extend-the-shared-component-when-a-real-need-appears precedent as the earlier `type`/
        `value` additions.
      - Verified: `npm run typecheck` clean, `npm run lint` clean. Not yet verified live.
- [ ] **Compras — eighth module, built, not yet live-verified.** SKU-search cart-builder
      (mirrors Financeiro's own "add item, see running total, submit" shape) plus an order
      list with expand-to-view-items, a partial-receiving flow (per-item quantity inputs,
      pre-filled with what's still outstanding), cancel, and print.
      - Reused `erpApi.produtos.buscarSKU` and two `erpApi.fornecedores` endpoints
        (`cotacao`/`custoProduto`) that existed in the vanilla `window.erpBanco` surface but
        hadn't been added to `erpApi.ts` yet (Fornecedores' own CRUD build only needed
        `listar`/`salvar`/`atualizar`/`remover`) — extended the namespace rather than
        duplicating logic.
      - **Print, ported with a new reusable mechanism, not a one-off hack**: vanilla's
        print-preview used a fixed-position overlay plus a `@media print { body* {
        visibility:hidden } #printContent{visibility:visible} }` CSS trick scoped to that one
        page. Added the same trick once, globally, in `globals.css` (`#print-area` id) — so
        Vendas/PDV receipts can reuse it later instead of re-solving the same problem.
      - Verified: `npm run typecheck` clean, `npm run lint` clean, `npm run build` (30/30
        pages). Not yet verified live.
- [ ] **Produtos — ninth module, the biggest single piece so far, built, not yet
      live-verified.** Real architectural wrinkle handled, not glossed over: the manifest
      types Produtos `tipo:"workspace-dashboard"` — vanilla opened it as a tab *inside* the
      Dashboard page (`?workspace=gerenciamento-produtos`, `dashboard/abas.js`'s tab system),
      the exact iframe-tab mechanism this whole migration exists to remove, and the new
      Dashboard page never implemented that tab host to begin with. Routed it as a normal
      standalone page instead — `AppSidebar.tsx#hrefDoModulo` no longer special-cases
      `workspace-dashboard` (Produtos was the only module using that type), everything now
      resolves to `/${id}` like every other module. Disclosed simplification, not an
      oversight — same category as the earlier "no collapsible Administração sub-group" note.
      - **Real tab structure, confirmed by reading `dashboard/index.html` directly, not
        guessed from the module folder layout**: the visible workspace tab bar is *Cadastro de
        Produto | Estoque | Precificação* — three tabs, not the four module folders under
        `modules/produtos/` + `modules/entrada/` + `modules/precificacao/` might suggest.
        "Categorias" isn't a tab at all — vanilla does a full page navigation away from the
        workspace to reach it (`window.location.href = "categorias.html"`), so it's a
        standalone top-level route here too (`/categorias`), not nested under `/produtos`.
        "Lista de Estoque" is a *hidden* fourth tab inside the same workspace frame, revealed
        only by a button inside the Estoque tab — ported as an in-page toggle inside
        `/produtos/estoque` (`EstoqueListaView.tsx`) rather than a fifth route, matching the
        "stays in the same workspace context" behavior it actually has in vanilla.
      - **Found and fixed the same manifest bug class as Importação, twice more**:
        `modules/entrada/modulo.json` and `modules/entrada/estoque-lista.modulo.json` both
        said `permissao:{tipo:"modulo",nomeModulo:"produtos"}`, but both real vanilla pages
        (`data-requer-modulo="estoque"`) and the real IPC gate (`exigirPermissao("estoque")`
        in `ipc/estoque.js`, all 7 handlers) require the `estoque` permission specifically —
        not `produtos`. Fixed both manifests to `nomeModulo:"estoque"`. Re-ran
        `test/modulos.test.js` after each fix (16/16 passing) — three for three so far on
        "the manifest disagrees with the real gate," worth double-checking on every remaining
        module before assuming a `.json` file written early in this project is still accurate.
      - **Cadastro de Produto** (`ProdutoFormPanel.tsx` + `CategoriaSelector.tsx` +
        `ProdutoImagemPicker.tsx` + `ProdutosListModal.tsx`) — the hierarchical
        category/attribute picker (search popover, chips, inline "create category" modal that
        pre-selects the new one) ported as one reusable component, not inlined into the form.
        Image picking calls `escolherImagemProduto` directly — that IPC handler opens a
        **native OS file dialog** (`dialog.showOpenDialog` in the main process), so the React
        side needed no file-input/drag-drop code of its own, just the same IPC call vanilla
        already made. The products list modal (filters sidebar, lixeira toggle, CSV export)
        ported as a modal opened from the form, matching vanilla's own modal-over-page shape
        exactly (not simplified into a separate route).
      - **Categorias** (`app/(admin)/categorias/page.tsx`) — hierarchical group/attribute
        CRUD (max 2 levels), reusing the same `useCategorias()` hook the selector above uses.
      - **Estoque** (`EstoqueReposicaoForm.tsx` + `EstoqueBaixaForm.tsx` +
        `MovimentacoesList.tsx` + `EstoqueListaView.tsx`) — SKU-search reposição cart (same
        shape as Compras' own cart builder), a separate "dar baixa" flow with the real
        estoque-vs-reservado guard (`ajustarEstoqueManual`'s `abaixoDoReservado` warning,
        ported verbatim — orçamentos abertos can reserve stock that a manual baixa shouldn't
        silently promise away), and the movimentações history with its category filter.
      - **Precificação** (`PrecificacaoTable.tsx`) — the most stateful screen ported so far:
        per-cell debounced auto-save (400ms, matching vanilla's own timing) on custo/impostos/
        margem/preço, live margem↔preço cross-calculation (editing one recalculates and saves
        the other, exactly like vanilla), a custo-fixo-per-product toggle, mass-margin-apply
        across a checkbox selection, and 3 admin-gated global config values (margem padrão,
        custo fixo mensal, taxa de adquirente) sitting alongside per-product edits that only
        need the `produtos` permission — preserved that exact split (checked
        `ipc/precificacao.js`'s gates line by line), not flattened into one permission level.
        **Real bug found while porting, not by inspection alone**: `EditableNumber`'s first
        draft never resynced its internal typed-text state when the row's underlying value
        changed from *outside* the cell (mass-apply, a full reload) — the cell would keep
        showing what the user last typed instead of the new value. Added the missing
        `useEffect` before it shipped, not after a bug report.
      - **Real pre-existing bug found and disclosed, not fixed**: `listProdutosDetalhados`
        (backs the Produtos list modal) never selects `estoque_minimo` from `Variacoes` — so
        that modal's own "Estoque baixo" filter checkbox has never matched anything, in either
        frontend (it always compares against `0`). `getEstoqueVisaoGeral` (the Estoque tab's
        own list) selects the column correctly and isn't affected. Typed `estoque_minimo` as
        optional on `VariacaoProduto` to match the real (incomplete) data shape rather than
        quietly adding the column to the query — that's a real fix belonging to its own
        change, not a side effect of a port.
      - Verified: `npm run typecheck` clean, `npm run lint` clean, `npm test` (56/56, backend
        manifest changes), `npm run build` (35/35 pages). **Live-verified by the owner
        (2026-08-24)** — found 8 real issues in one pass, all fixed same session:
        - **Modal close button covering content.** `components/ui/modal/index.tsx`'s X sat
          fully *inside* the card's top-right corner (`right-3 top-3`) — on `ProdutosListModal`
          (which uses `p-0` plus its own header row of controls reaching the same corner), the
          38px circle visually overlapped the "Exportar CSV" button. Moved it to float *outside*
          the corner (`-right-3 -top-3`, white background + border + shadow, floating-chip
          look) — a shared-component fix, so it corrects every modal in the app at once, not
          just this one.
        - **Saved product never appeared in the list.** `ProdutosListModal` doesn't unmount
          when closed (`Modal` just returns `null` internally — the parent component, and its
          `useProdutos`/`useCategorias` hooks, stay mounted the whole time), so the very first
          fetch on page load was the *only* fetch it ever did. Added a `useEffect` that
          refetches whenever `isOpen` flips true — matches vanilla's own `abrirModal()`, which
          always called `carregarProdutos()` on open; missed porting that part the first time.
        - **Duplicate SKU fetch on mount.** `ProdutoFormPanel` had two separate `useEffect`s
          both calling `buscarProximoSku()` for a new product — one via the
          `[produtoEditando]` effect's `else` branch, a second standalone `useEffect(.... , [])`
          left over from an earlier draft. Removed the redundant one. Flagged, not fully
          resolved: owner also reported intermittent lost keystrokes typing into "Nome do
          Produto" — this duplicate fetch was the only concrete lead found by re-reading the
          component; couldn't reproduce the actual symptom without a live session, so it's
          disclosed as a possible-not-confirmed fix, not claimed as solved.
        - **Categorias/Estoque/Movimentações redesigned to match the pattern the owner
          explicitly preferred** ("gostei muito mais do design da lista de produtos... faz a
          lista padrão sendo um card aparecendo com fundo borrado"): every list view that used
          to be permanently inline is now a button-triggered modal, reusing `ProdutosListModal`'s
          exact visual language instead of three different ad-hoc layouts. New
          `CategoriasListModal.tsx`; `EstoqueListaView.tsx` converted from a full-page state
          swap into a `Modal`; `MovimentacoesList.tsx` converted from always-visible-inline into
          a `Modal` opened by a new "Ver movimentações" button. Added a magnifying-glass button
          next to the SKU field in both `EstoqueReposicaoForm` and `EstoqueBaixaForm` that opens
          the stock-list modal pre-filtered to whatever SKU is currently typed — lets the owner
          browse/confirm a SKU visually instead of typing blind, per the owner's own request.
        - **New feature: Inativar for Categorias, real backend work, not just UI.** Owner's
          own spec: a category can be inactivated only if no *active* product still uses it
          (looser than the existing hard-delete guard, which blocks on *any* usage, active or
          not). Added `Categorias.ativo` via `migrarColunas` (same additive-migration pattern
          as every other soft-delete column in this schema), `inativarCategoria`/
          `reativarCategoria` in `db/categorias.js` (checks `Produtos.ativo=1` specifically,
          not just any historical link), new IPC handlers + preload exposure, and extended
          `getListCategoriasWithUsage`/`categoriasWithUsage` with an `incluirInativas` param
          (default false — every *selection* dropdown across the app, e.g. picking categories
          on a new product, now implicitly hides inactivated ones; only the new management
          modal's "Ver inativas" toggle passes `true`). Also added to
          `modules/core/banco.js`'s `categorias` namespace for vanilla parity, even though no
          vanilla UI calls it yet — keeps the shared IPC layer's dual-frontend convention
          consistent. Re-ran `npm test` (56/56) and `eslint` on every touched backend file
          after the schema change.
        - **New pattern: password re-confirmation before delete.** Owner's explicit ask —
          "excluir qualquer item deve pedir senha." Scoped to the two delete actions actually
          in front of the owner in this feedback (Produtos' excluir/excluir-definitivo,
          Categorias' excluir) rather than silently retrofitting it across every module already
          shipped — a much bigger, separate change that deserves its own explicit go-ahead, not
          a side effect of this bug-fix pass. New reusable `ConfirmarSenhaModal.tsx`, reusing
          the same `verificarSenhaAdmin` endpoint the Banco de Dados screen's step-up gate
          already uses — real consequence, disclosed: since that endpoint itself is
          `exigirSessao("admin")`, deleting a product or category now effectively requires
          admin/dono, even though the base action was already reachable by any funcionário with
          the `produtos` permission. Inativar (reversible) deliberately was *not* put behind
          this gate — only the irreversible actions were, matching the security principle
          (irreversible → extra confirmation, reversible → the existing `confirm()` is enough).
        - Verified: `npm run typecheck` clean, `npm run lint` clean, `npm test` (56/56),
          `npx eslint` clean on touched backend files, `npm run build` (35/35). Owner's second
          live pass found two more real gaps, fixed same session:
          - **`CategoriasListModal` didn't actually match `ProdutosListModal`'s layout** — the
            owner's first ask ("mesmo formato") was only followed at the surface level (Modal
            wrapper, blurred backdrop, floating X) but not structurally: Produtos' modal has a
            two-column body (a left `<aside>` with checkbox filter groups + the table on the
            right), Categorias' was a single-column table with filters jammed into the header
            row instead. Rebuilt to the same two-column skeleton — `aside` with "Tipo"
            (Grupo/Atributo checkboxes) and "Uso" (com/sem produtos vinculados checkboxes) +
            "Limpar filtros", mirroring Produtos' Categoria/Estoque filter groups exactly, not
            just visually similar.
          - **Header padding**: the row holding the theme toggle + user dropdown
            (`AppHeader.tsx`) had `py-4` (16px) vertical padding even at desktop width (no
            `lg:py-*` override existed to shrink it) — reduced to `py-[14.4px]`, exactly 90% of
            the original, per the owner's own ask. Icon sizes (`ThemeToggleButton`, the avatar
            in `UserDropdown`) untouched — only the padding around them shrank.
          - Verified: `npm run typecheck` clean, `npm run lint` clean, `npm run build` (35/35
            pages). Owner's third live pass found one more real gap, fixed same session:
          - **"Lista de Categorias" opened the wrong thing.** `ProdutoFormPanel.tsx`'s button
            was a plain `<Link href="/categorias">` — a full page navigation to the Categorias
            *management* page (its own form + a separate "Categorias Cadastradas" button),
            not the list modal the owner expected (same modal "Lista de Produtos" opens,
            `CategoriasListModal`). A tab-inside-a-tab, in the owner's own words. Replaced the
            `Link` with an `onAbrirListaCategorias` callback (mirroring the existing
            `onAbrirLista` prop for the products list) so `produtos/cadastro/page.tsx` now
            renders `CategoriasListModal` directly, same pattern as `ProdutosListModal`.
            Verified: `npm run typecheck` clean, `npm run build` (35/35 pages), Electron
            relaunched and confirmed booted (4 processes). Shipped in commit `e9ad544`.
- [ ] **Relatórios — tenth module, built, not yet live-verified.** Owner chose to continue the
      migration into Relatórios/Vendas/PDV rather than wait for live verification of the 6
      modules still pending it (Banco, Importação, Atualização, Financeiro+Pagamentos, Compras,
      Produtos) — those stay open, unchanged, this is additive.
      - Investigated the real vanilla module first (`modules/relatorios/relatorios.js`,
        `db/relatorios.js`, `ipc/relatorios.js`) before porting, same discipline as every prior
        module. **No manifest/gate mismatch this time** — `modules/relatorios/modulo.json`'s
        `nomeModulo:"relatorios"` matches all 7 `ipc/relatorios.js` handlers'
        `exigirPermissao("relatorios")` exactly (the first module checked this session where the
        manifest was already correct).
      - `erpApi.relatorios` namespace added (7 methods: `dre`, `vendasPeriodo`, `curvaABC`,
        `comissoes`, `margemContribuicao`, `pontoDeEquilibrio`, `giroEstoque`), all
        `(inicio, fim)` positional strings matching the real `db/relatorios.js` signatures
        exactly, confirmed already exposed under these exact names in `preload.js` (no new
        preload/IPC work needed — this module's backend was fully done in the earlier
        Financial/Accounting Depth pass).
      - **Charting swapped from Chart.js to ApexCharts**, not a byte-for-byte port — ApexCharts
        was already a `frontend/` dependency (from the TailAdmin base, used by
        `FaturamentoChart.tsx` on the Dashboard) and the original migration plan
        (`magical-soaring-squirrel.md`, Phase 3) explicitly called for this swap. 4 charts
        ported: `PorDiaChart` (bar), `PorPagamentoChart` (donut), `CurvaAbcChart` (pie),
        `DreChart` (horizontal bar, using ApexCharts' `distributed:true` to get one color per
        bar the way Chart.js did natively). Same color palette values ported from vanilla's
        `CORES` object.
      - **jsPDF export ported faithfully, one real bug fixed not replicated**: vanilla's
        `exportarPdf()` printed the Comissões table twice (a verbatim copy-paste of the same
        block at two points in the source) — fixed in the port, not copied, since that's a
        genuine defect, not intentional behavior worth preserving for parity. Everything else
        ported as-is per the investigation, including two disclosed, not-fixed quirks: (1) the
        Curva ABC panel/CSV/PDF all label the classification "por receita"/"por lucro"
        inconsistently while the actual A/B/C math is always by accumulated **lucro** share, not
        receita — a pre-existing vanilla naming/logic mismatch, ported as-is rather than
        unilaterally changing real business classification the owner may already rely on; (2)
        Margem de Contribuição, Ponto de Equilíbrio, and Giro de Estoque are excluded from the
        PDF export, same as vanilla — not treated as a bug, since vanilla never included them
        either. New `jspdf` dependency added to `frontend/package.json` (vanilla loaded it via a
        vendored UMD bundle; the React port uses the real npm package instead, same library).
      - **Currency/percent formatting deliberately modernized, not byte-for-byte**: vanilla's
        `formatarMoeda` was a raw `"R$ " + toFixed(2)` with no thousands separator; the port
        (`components/relatorios/formatos.ts`) uses `Intl.NumberFormat("pt-BR", {style:
        "currency"})`, matching the convention already established by
        `components/dashboard/formatos.ts` elsewhere in this migration — same small-file-not-
        shared pattern (each screen's `formatos.ts` is intentionally its own copy, per that
        file's own comment, not worth sharing at this size).
      - **Admin-only "Vendas" tab, disclosed simplification**: vanilla's second tab lazily
        embeds `vendas.html?embedded=1` in an `<iframe>` — exactly the iframe-embedding pattern
        this whole migration exists to remove, and Vendas hasn't been ported to a real Next.js
        route yet (it's next, per the owner's own chosen order). The tab still only renders for
        `isAdmin` (mirrors vanilla's client-side profile check), but shows a placeholder message
        instead of an iframe for now — will be wired to a real `/vendas` link once that module is
        built next.
      - CSV export (Curva ABC only, matching vanilla's own scope — no CSV button exists for any
        other panel in either frontend) ported as a direct client-side Blob-download, same
        pattern as every other CSV export already shipped this session (Produtos, etc).
      - Verified: `npm run typecheck` clean, `npm run lint` clean, `npm run build` (36/36 pages,
        `/relatorios` at 138 kB First Load JS — the jsPDF+ApexCharts weight, expected). No
        backend files touched (all IPC/db/preload wiring for this domain already existed from
        the earlier Financial/Accounting Depth pass) — `npm test` not re-run, nothing to
        invalidate. Electron relaunched, confirmed booted. Not yet live-verified by the owner.
- [x] **Theme: navy header/sidebar + ice-blue page background, page titles moved into the
      header.** Two owner-driven rounds. Round 1 (`#3fd2c7` chrome / `#93dcfc` background) was
      explicitly rejected live ("ficou feio de mais") — round 2 settled on `#0F172A` (header +
      sidebar, solid navy) / `#F0F4F8` (page background). Applied as literal hex (`bg-[#0F172A]`
      etc.), not new `@theme` tokens — these aren't the brand-primary color (`--color-brand-500`,
      still `#00006b`, untouched), just chrome/background, and the owner is still iterating on
      them ("vamos ter que mudar futuramente de novo").
      - Sidebar/header text and icon colors needed real contrast fixes, not just a background
        swap — `menu-item-inactive`/`menu-item-icon-inactive` (`globals.css`, used only by
        `AppSidebar.tsx`) switched from dark-gray light-mode text to light-gray always, since the
        sidebar's background is now permanently dark regardless of the app's own light/dark
        toggle. Same for the "ALLU ERP" logo label and `UserDropdown`'s toggle button (name +
        chevron) sitting directly on the header.
      - **New cross-cutting pattern: page titles live in the header, not in each page's own
        body.** Owner's explicit ask, with a worked example (Compras' "Pedidos de Compra" title
        pointed at, "tire esse titulo dai e passe ele exatamente do mesmo jeito para o header").
        Added `PageHeaderContext.tsx` (`{cabecalho, setCabecalho}` + a `usePageHeader(titulo,
        subtitulo?)` hook that sets-on-mount/clears-on-unmount via a `useEffect`) so a page
        declares its own title without the header needing to know about routes. Wired into
        `(admin)/layout.tsx` (`PageHeaderProvider` wraps sidebar+header+children) and
        `AppHeader.tsx` (renders `cabecalho.titulo` white + `cabecalho.subtitulo` light-gray, in
        the space between the mobile-only logo/hamburger block and the theme/user block — that
        space is otherwise empty at desktop width). Applied to all 12 pages that had a page-level
        `<h1>`: Relatórios, Compras, Categorias, Financeiro, Atualização, Importação,
        Estoque, Precificação, Acessos, Fornecedores, Clientes, Banco de Dados.
      - Found and fixed a real layout bug while wiring the header, not just inserted the new
        element: the header's mobile-only logo/hamburger container had `w-full` with no `lg:`
        override, so even though its own children were `lg:hidden`, the empty container itself
        still claimed full width at desktop and would have squeezed the new title block out —
        changed to `lg:hidden` on the whole container. Same issue on the theme/user container
        (`w-full` with no desktop override) — added `lg:w-auto lg:shrink-0` so it hugs its own
        content instead of also claiming full width.
      - `banco/page.tsx` has two states (password gate, then the real screen) — one
        `usePageHeader` call computes title/subtitle from `autorizado` rather than duplicating
        the call in both branches; `atualizacao/page.tsx`'s subtitle is dynamic JSX (colored
        status span), so `usePageHeader`'s second argument is typed `React.ReactNode`, not just
        `string`, to support both cases without a separate API.
      - Three pages (`acessos`, `fornecedores`, `clientes`) had their title living in a
        `flex justify-between` row next to an action button ("Novo Usuário" etc.) — removing the
        title left the button as the row's only child, so those rows were simplified to
        `flex justify-end` rather than left with a now-pointless `justify-between` on a
        single-child row.
      - Disclosed simplification: `importacao/page.tsx`'s original subtitle was a 3-sentence
        paragraph — too long for a single-line header without losing all meaning when truncated.
        The header got a shortened one-line version; the full original explanation stays in the
        page body as a standalone paragraph, not deleted.
      - `produtos/cadastro` was initially left untouched (see below — owner corrected this).
      - Verified: `npm run typecheck` clean, `npm run lint` clean, `npm run build` (36/36 pages),
        Electron relaunched and confirmed booted (4 processes) after both the color-swap round
        and the title-relocation round.
      - **Owner's live pass found two real bugs, fixed same session:**
        - **`produtos/cadastro` and Dashboard were missing a header title** — the first pass's
          "only move what already had a title" judgment call was too narrow; owner wanted every
          screen consistent. Added `usePageHeader("Cadastro de Produto", ...)` and
          `usePageHeader("Dashboard", ...)` (Dashboard never had one to begin with, in either
          pass — added fresh).
        - **Dashboard crashed to a blank white screen when opened via the sidebar link — a real,
          pre-existing routing bug, not caused by this session's color/title work.** Root-caused
          via `erp-crash.log` (`app.getPath("userData")/erp-crash.log`, `main.js`'s
          `did-fail-load` → `logErro()` hook — read directly rather than guessing, since there's
          no live DevTools access to the packaged Electron window from this session):
          `DID-FAIL-LOAD ... url=app://renderer/dashboard/index.txt`. `modules/dashboard/
          modulo.json`'s `id` is `"dashboard"`, and `AppSidebar.tsx#hrefDoModulo` resolves every
          module to `/${m.id}` — but the Dashboard page actually lives at Next.js's root route
          `/` (`app/(admin)/page.tsx`), not `/dashboard`. Clicking the sidebar link tried to
          client-side-navigate to a route that doesn't exist in the static export, and the
          failure left the page blank instead of erroring visibly. Fixed with a targeted special
          case in `hrefDoModulo` (`if (m.id === "dashboard") return "/"`) — the only module where
          this applies, since every other module's manifest `id` genuinely matches its own route
          segment. Pre-existing since Dashboard was first built this session; previously masked
          because the app always lands on `/` right after login, so this path was never actually
          exercised via a sidebar click until the owner did it live today.
        - Verified: `npm run typecheck` clean, `npm run lint` clean, `npm run build` (36/36
          pages), Electron relaunched and confirmed booted (4 processes). Not yet re-verified
          live by the owner.
      - **Interim safety guard added while Vendas/PDV weren't built yet**: `AppSidebar.tsx`'s
        `MODULOS_SEM_ROTA_NOVA` set renders a disabled (grayed out, non-clickable) sidebar item
        for any manifest module with no real Next.js route yet, instead of a real `Link` — same
        bug class as the Dashboard fix above, caught proactively this time instead of reactively.
        Owner flagged that "Frente de Caixa" (PDV) would hit exactly this landmine; guarded it
        before starting the Vendas/PDV build rather than leaving it live mid-build. Removed
        `"vendas"` from the set once Vendas shipped (see below); `"pdv"` stays until PDV ships.
- [ ] **Vendas — eleventh module, built, not yet live-verified.** Owner: "pode começar a fazer o
      vendas/pdv" — Vendas built first per the migration plan's own reasoning (proves the shared
      `vendas.*` API/hook surface PDV will also depend on, before PDV's much bigger build).
      Investigated the real vanilla module first (`modules/vendas/vendas.js`, `db/vendas.js`,
      `ipc/vendas.js`, plus `test/negocio.test.js` for the already-proven orçamento↔venda
      backend contract) — **first module this session where the manifest already matched the
      real IPC gate**, no mismatch bug found this time (`modulo.json`'s `{tipo:"admin"}` matches
      `get-vendas`/`get-itens-venda`'s real `exigirSessao("admin")` gate exactly).
      - `erpApi.ts`'s pre-existing `Venda` type and `vendas.listar()` stub were incomplete/
        mistyped from an earlier session (`listar(filtro?: unknown)`, `Venda` missing `desconto`,
        `observacao`, `status`, `nota_status`, `nota_numero`) — corrected to match `getVendas`'s
        real return shape and `filtro` shape (`{dataInicio, dataFim, status, formaPagamento}`)
        exactly, not guessed. Added `itens`/`converterOrcamento`/`atualizarNotaFiscal` — the
        three IPC channels this specific screen calls. Deliberately did **not** yet add
        `finalizar`/`registrarDevolucao`/`devolucoes`/`itensDevolucao`/`hoje` — those exist in
        vanilla's `banco.js` `vendas` namespace and PDV will need them, but nothing in this
        screen calls them; adding untyped/unused API surface ahead of the screen that actually
        needs it isn't this item's job. Will be added precisely when PDV is built next, once the
        real cart/checkout payload shape is investigated instead of guessed now.
      - **Read-only history screen, admin-only** (`app/(admin)/vendas/page.tsx` +
        `hooks/useVendas.ts` + `components/vendas/*`): server-side date-range filter (only filter
        vanilla actually sends to the backend), client-side status pills (Todas/Finalizada/
        Orçamento — matches vanilla's exact 3 options, no invented "Cancelado" pill vanilla
        doesn't have), client-side forma-pagamento pills (PIX/Cartão/Dinheiro/Fiado, vanilla's
        hardcoded list), client-side search (cliente/# venda), sortable columns, and
        prev/next+page-size pagination (10/20/50/100) — same client-side-over-server-fetched-
        cache shape as vanilla, not re-architected into server-side filtering.
      - Row click expands an inline itens sub-table (lazy-fetched once per venda, cached in the
        hook, matching vanilla's `itensCache`); "Ver detalhes completos" opens a full modal
        (`VendaDetalheModal.tsx`) with the complete item table, a manual nota-fiscal tracking
        widget (status select + número input + Salvar → `atualizarNotaFiscal`), Imprimir (reuses
        the `#print-area`/`@media print` mechanism from `globals.css`, first built for Compras
        and explicitly flagged then for reuse here), PDF export (jsPDF, same library/pattern as
        Relatórios/Compras — a generic document export, not a POS receipt), and — only for
        `status === "orcamento"` — "Converter em Venda" (confirm dialog → `converterOrcamento`).
      - **Faithful gap, disclosed not silently fixed**: `cancelarOrcamento` exists as a real,
        working backend function (`db/vendas.js`, `ipc/vendas.js`) but is **not wired to any
        button in vanilla's own UI** — confirmed by reading vendas.js/pdv.js, not assumed. Ported
        the same way: no "Cancelar" button added. An orçamento can only move forward
        (converter) or sit unconverted; this matches the existing app's actual behavior, not a
        gap introduced by the port.
      - **Also fixed the same bug class Compras' PDF export had (Relatórios' Comissões-table
        duplication)**: nothing found here — vanilla's `exportarDetalhePdf` for this screen was
        clean on inspection, ported as-is, no analogous bug.
      - **Relatórios' "Vendas" tab, previously a disclosed placeholder, is now wired for real.**
        When Vendas didn't exist yet, that tab showed "ainda não foi portado." Now it renders the
        actual Vendas screen's components inline (`useVendas()` + the same `Vendas*` components),
        matching vanilla's own behavior of showing the real history screen inside that tab —
        **without** the iframe-embedding mechanism vanilla used (`vendas.html?embedded=1`), since
        removing that exact pattern is this whole migration's reason to exist. Independent
        `useVendas()` instance per mount (Relatórios' tab and the standalone `/vendas` route each
        have their own filter/pagination state, not shared) — matches how every other
        modal-vs-page duplication in this codebase already works (e.g. `ProdutosListModal` vs.
        a hypothetical standalone products page), not a new pattern.
      - Removed `"vendas"` from `AppSidebar.tsx`'s `MODULOS_SEM_ROTA_NOVA` guard (see above) now
        that `/vendas` is real — though `modules/vendas/modulo.json` still has `navbar: null` in
        vanilla too (never a standalone sidebar item, same as Categorias), so this was always a
        dormant safety net for this module, not something actively blocking a visible link.
      - Fixed a real bug caught before shipping, not after: the first draft of `VendasTable.tsx`
        used a bare `<>...</>` fragment inside `.map()` with `key` placed on the inner `<tr>`
        instead of the fragment itself — React requires the key on the element actually returned
        per iteration. Fixed to `<Fragment key={v.id}>`.
      - Verified: `npm run typecheck` clean, `npm run lint` clean, `npm run build` (37/37 pages,
        `/vendas` + `/relatorios` both pull in jsPDF, ~254-261 kB First Load JS, expected). No
        backend/manifest files touched — this module needed none. Electron relaunched, confirmed
        booted (4 processes). Not yet live-verified by the owner.
- [ ] **PDV (Frente de Caixa) — twelfth and final module of the migration, built, not yet
      live-verified.** The most complex and highest-stakes screen — actual checkout, real
      money — deliberately saved for last per the original migration plan. Investigated the full
      vanilla module (`modules/pdv/pdv.js`, 1435 lines, read in full — not skimmed) plus
      `test/negocio.test.js`'s already-proven checkout contract before writing any code.
      - **Two real, pre-existing gaps found in vanilla — both put to the owner as explicit
        decisions before building, not silently picked either way:**
        1. **Caixa (cash register) was a soft UI reminder only — nothing in the backend actually
           blocked checkout with the caixa closed.** Owner chose to harden this. Added a guard
           directly in `db/vendas.js#finalizarVenda`: `status === "finalizada"` now requires
           `getCaixaAberto()` to return a row, else throws before the transaction even opens
           ("Não é possível finalizar a venda com o caixa fechado..."). Scoped to real sales
           only — `status === "orcamento"` never touches money, so it's exempt (an orçamento can
           still be created with the caixa closed, matching the fact that reserving stock isn't
           a cash-register concern). This is a genuine **behavior change from vanilla**, not a
           straight port — flagged as such, not silently absorbed into "just a port."
        2. **Real bug**: `get-itens-venda` (used by PDV's own Devolução/Troca flow to look up a
           sale's items) was gated `exigirSessao("admin")` in `ipc/vendas.js`, while PDV itself
           is `permissao:{tipo:"sempre"}` — any vendedor. Meant a non-admin cashier could open
           the Devolução overlay but the lookup itself would throw an access error — devolução
           was silently broken for regular sellers in the shipped vanilla app. Owner chose to
           fix it. Loosened the gate to bare `exigirSessao()`; the admin-only Vendas history
           screen (which also depends on `getItensVenda`) stays effectively admin-gated anyway
           since it's the only way to list vendas in the first place (`get-vendas` is still
           `exigirSessao("admin")`, unchanged) — this fix only widens the "look up one *specific,
           already-known* venda id's items" path, not sales browsing.
        - **Both backend changes needed test updates**, not just new coverage: `test/
          negocio.test.js` and `test/relatorios-financeiro.test.js` both call `finalizarVenda`
          with the default "finalizada" status and never opened a caixa — under the new guard
          those would now fail. Added `db.abrirCaixa(0, null)` to both files' `before()` hooks so
          existing coverage keeps testing what it always tested, not the new guard by accident.
          Added a dedicated new test in `negocio.test.js` ("rejeita venda finalizada com caixa
          fechado, mas orçamento continua permitido") proving both halves of the new guard: a
          finalizada checkout rejects (and doesn't touch stock) with caixa closed, while an
          orçamento with the same items still succeeds. All 57 backend tests pass (up from 56).
      - **Confirmed genuinely absent from PDV's checkout, not built**: Pix QR generation/polling
        and real fiscal note emission. Full-text-grepped vanilla `pdv.js` for both — zero
        matches beyond the literal "PIX" label in the payment dropdown. Selecting PIX just
        stores the string on `forma_pagamento`, same as Cartão — no QR, no confirmation
        webhook/poll. (Those real integrations exist elsewhere — Pagamentos' `gerarQrCodePix`,
        Vendas' manual `atualizarNotaFiscal` tracker — but PDV's own checkout never touches
        them, so the port doesn't either. Not a gap, matches the real app exactly.)
      - `erpApi.ts` gained `produtos.buscarPorTermo` (found the real preload-exposed name is
        `buscarProdutosTermo`, not `buscarProdutosPorTermo` like the db/ipc function itself —
        checked `preload.js` directly rather than assuming the naming convention held, since it
        didn't this one time), `clientes.precoEspecial`, `vendas.finalizar`/
        `vendas.registrarDevolucao` (deferred from the Vendas module on purpose, built now with
        the real checkout payload shape in hand instead of guessed earlier), and a full `caixa`
        namespace (`aberto`/`resumo`/`abrir`/`fechar`).
      - **`hooks/useCarrinho.ts`**: cart state persisted to `localStorage["pdv_carrinho"]`,
        matching vanilla exactly (cart survives an accidental reload/navigation). Add-to-cart
        replicates all three vanilla guards: blocks at preço ≤ 0, blocks at zero disponível,
        non-blocking low-stock warning (≤ `estoque_minimo || 5`, same default vanilla uses).
        Client-specific pricing (`getPrecoCliente`) applied on add and re-applied to the whole
        cart when a client is selected (`reprecificarParaCliente`), matching vanilla's
        `aplicarPrecoCliente`/`reaplicarPrecoClienteNoCarrinho` pair.
      - **`hooks/useCaixa.ts`** wraps the new `caixa` namespace; the PDV page shows a badge
        (green "Caixa aberto" / red "Caixa fechado") that opens `CaixaModal.tsx` — same
        abrir/fechar flow as vanilla (valor de abertura; on close, a resumo box with
        vendido-em-dinheiro/valor-esperado, then valor contado + diferença shown after
        confirming), backed by the real `db/caixa.js` math (already existed, untouched).
      - **Product search** (`BuscaProduto.tsx`): plain text input, Enter to search/select,
        arrow keys to navigate results — confirmed via full read of `pdv.js` that vanilla's own
        barcode-scanner handling is nothing more than this same pattern (a scanner just types
        fast and ends with Enter, no special timing heuristic exists to replicate), so no new
        scanner-specific logic was invented.
      - **Checkout** (`app/(admin)/pdv/page.tsx`): builds the exact `dados` shape
        `finalizarVenda` expects (confirmed field-by-field against the real function body, not
        the caller) — `itens` (variacao_id/quantidade/preco_unitario), `status`, `desconto`,
        `total`, `cliente_id`, `forma_pagamento`, `observacao`. Vanilla's own stylistic
        inconsistency (checked `erpBanco.vendas.finalizar` for availability but then called
        `window.api.finalizarVenda` directly — both hit the same channel, so harmless in
        vanilla) was **not** reproduced — the port just calls the one clean method once.
      - **Receipt** (`ReciboModal.tsx`): vanilla prints via a page-specific `#receiptContent`
        id (confirmed **no shared `#print-area` id exists anywhere in the vanilla codebase** —
        every module scopes its own `@media print` block to its own container id, contrary to
        what the Compras/Vendas build notes in this file assumed). The port uses this
        migration's own established `#print-area` convention instead (already wired into
        `globals.css`, already reused by Compras and Vendas this session) — a deliberate,
        consistent choice for the new codebase, not a literal vanilla port of a pattern that,
        on closer inspection, never actually existed as "shared" in the old app.
      - **Devolução/Troca** (`DevolucaoModal.tsx`): search by venda #, per-item quantity inputs
        capped at `quantidade - quantidade_devolvida`, confirm → `registrarDevolucao`. Ported
        as-is functionally; now actually reachable by non-admin sellers per the gate fix above.
      - Verified: `npm run typecheck` clean, `npm run lint` clean, `npx eslint` clean on
        `db/vendas.js`/`ipc/vendas.js`/both touched test files, `npm test` (57/57), `npm run
        build` (38/38 pages, `/pdv` at 127 kB First Load JS). Electron relaunched, confirmed
        booted (4 processes). **This closes out the frontend migration's module list** — every
        module from the original plan (`magical-soaring-squirrel.md`) now has a Next.js route.
        Not yet live-verified by the owner — given this screen handles real money, live testing
        (both perfis, both a normal checkout and the new caixa-closed rejection) matters more
        here than anywhere else in the migration before this replaces the vanilla PDV for real
        use.
- [x] **Post-launch owner QA round: PDV modal padding, form-field memory across modules,
      Clientes/Fornecedores autofill bug, footer watermark — built (2026-08-26).**
      - **Footer watermark replaced**: `Footer.tsx` no longer credits TailAdmin/ThemeWagon —
        now "Desenvolvido por Allu Enterprise" (owner's own text, corrected from "entreprise").
      - **4 modals missing padding, found and fixed the same way across all of them**:
        `CaixaModal.tsx`, `DevolucaoModal.tsx`, `ReciboModal.tsx` (all new this session) and
        `VendaDetalheModal.tsx` never got the `p-6` every other modal in the app already carries
        on its `Modal className` — content sat flush against the modal's rounded corners.
      - **PDV cart alert (`carrinho.alerta`) now auto-dismisses after 10s** (`useCarrinho.ts`) —
        previously stuck on screen until overwritten by another alert, with no way to dismiss it.
      - **Real bug found and fixed at the root**: typing in Fornecedores' "Nome" field and then
        navigating to Clientes showed the same text still filled in Clientes' "Nome" field —
        confirmed via code read this is **not** a React state bug (each modal has fully
        independent local `useState`, no shared key) — it's Chromium's own autofill suggesting
        values across unrelated forms since neither `<input>` set `autoComplete`. Fixed at the
        shared component: `InputField.tsx` now defaults `autoComplete="off"`, with an escape
        hatch for any future field that legitimately wants native autofill (login, etc).
      - **New reusable hook, `hooks/usePersistedState.ts`**: a drop-in `useState` replacement
        backed by `localStorage`, generalizing the pattern already built ad-hoc for the PDV cart
        and payment form. Returns `[valor, setValor, limpar]` — `limpar` resets to the initial
        value AND clears the stored key, used after a successful save so the next new-record
        draft starts empty instead of resurrecting the just-submitted values.
      - **Owner's ask: "todos os módulos" need field memory, except Clientes/Fornecedores**
        (which had the separate autofill bug instead, fixed above — not blindly given
        persistence too, since that wasn't what was reported for them). Applied to every
        "create new record" draft found:
        - `UsuarioFormModal.tsx` (Acessos) — persists login/nome/perfil/comissão/ativo/
          permissões; **deliberately excludes the three password fields** (senha/confirmarSenha/
          senhaAtual) from the persisted subset — a security carve-out, not an oversight, since
          those must never touch `localStorage`. The persisted draft only applies to *new*-user
          mode, not while editing an existing user (an edit session's typed changes shouldn't be
          mistaken for a "new user" draft next time the modal opens); cleared on successful save.
        - `categorias/page.tsx` — nome + grupo-pai.
        - `NovoPedidoForm.tsx` (Compras) — the item cart + fornecedor + observação (the cart is
          the most expensive thing to lose, same reasoning as the PDV cart); transient
          search-only fields (sku/qtd/custo being typed *before* "Adicionar item") intentionally
          not persisted, matching how the PDV product-search input isn't either.
        - `NovoLancamentoForm.tsx` (Financeiro) — tipo/descrição/valor/vencimento/parcelas.
          `PagamentoFormModal.tsx` in the same module was deliberately **not** touched — it
          already force-resets every field on every open by its own existing design (ties a
          fresh Pix QR to one specific attempt), so adding persistence would fight that
          intentional behavior rather than fix a real gap; disclosed, not silently skipped.
        - `ProdutoFormPanel.tsx` (Produtos Cadastro) — nome/estoque inicial/categorias
          selecionadas (SKU stays unpersisted — it's server-generated, not typed). Needed one
          extra guard beyond the simple cases: the component's own `useEffect` already reset the
          form to empty whenever `produtoEditando` was `null`, which fires on *first mount too*
          (not just on "cancelar edição") — without a fix that would have wiped the just-loaded
          persisted draft immediately after loading it. Added a `useRef` "primeira vez" flag so
          the reset only fires on a real transition away from editing, not on initial mount.
        - `EstoqueReposicaoForm.tsx` — the reposição item cart + observação, same "cart is the
          expensive thing to lose" reasoning as Compras. `EstoqueBaixaForm.tsx` deliberately
          **not** touched — it's a single quick action (SKU → qtd → motivo → confirm), no
          cart/multi-step draft exists there to lose, consistent with the same judgment applied
          to transient search fields elsewhere.
        - **Explicitly out of scope, disclosed**: Relatórios' and Vendas' date-range filters.
          Investigated applying persistence there too, but both hooks auto-fetch on mount using
          `dataInicio`/`dataFim` in their own `useEffect(() => { gerar() }, [])` — since
          `usePersistedState`'s own localStorage load happens in a *separate* effect that
          resolves one render after the initial one, the auto-fetch would fire with the stale
          default empty dates before the persisted value ever loads, silently fetching the wrong
          period on first mount. Fixing that race properly needs a different pattern (e.g. don't
          auto-fetch until the persisted value has loaded) — real, but lower-value than the
          "lost a typed form" pain the owner actually reported, so left for a future pass rather
          than shipping a subtly-wrong auto-fetch.
      - Verified: `npm run typecheck` clean, `npm run lint` clean, `npm run build` clean (no
        backend files touched — this whole round was frontend-only). Electron relaunched,
        confirmed booted (4 processes). Not yet re-verified live by the owner.

---

## Header Tab System (multi-tab workspace, faithful to the pre-migration dashboard) — built (2026-08-26), root-cause bug fixed (2026-08-27), tests below still pending live verification

**Owner's ask (2026-08-26), verbatim intent**: bring back the old vanilla dashboard's
`abas.js` behavior — clicking a sidebar module opens it as a tab in the header, several
modules can be open **at the same time**, switching between them doesn't lose what was
typed/in progress, each tab closes independently with an ×. Concrete example given: take
`AppHeader.tsx`'s current title block (e.g. "Financeiro" + the subtitle line under it) and
turn it into a closable tab chip instead. Apply this to every sidebar module, not just one.
Two smaller asks bundled into the same request: the header itself should be shorter (its
current height is "too big"), and the active tab's chip should use a lighter blue than the
navy header background.

**This directly revisits a decision this migration made on purpose.** `magical-soaring-
squirrel.md` (the original migration plan) explicitly flagged removing the vanilla
dashboard's simultaneous-iframe-tabs UX as "a real change of behavior for the end user, not
just implementation — worth confirming with the client before deciding technically," and the
owner accepted that tradeoff when the shell was first built. Asked directly this session
(see the architecture question below), the owner confirmed: **yes, they want the literal
multi-tab behavior back**, not just a single "current section" chip styled to look tab-like.
That answer is what this whole section is designed around — a lighter version (one tab at a
time, no real concurrency to manage) would have been a much smaller build, and was offered as
the alternative before this scope was locked in.

```mermaid
flowchart TD
    A[TabsContext: open-tabs list + active id,\nderived from the same manifest list AppSidebar.tsx already loads] --> B[Keep-alive render wrapper:\ncaches children by pathname, hides inactive ones]
    A --> C[Header tab strip UI\nreplaces the title block in AppHeader.tsx]
    B --> C
    C --> D[Header height/padding pass\nnow that the title block is gone]
    C --> E[Active-tab color token\nlighter blue vs. navy header]
    A --> F[localStorage persistence of open tabs\nsame pattern as this session's memória work]
```

### Design rationale

- **Why not Next.js's own native mechanism for this.** Researched directly (not assumed):
  Next.js does have a built-in way to keep a route's component state alive across navigation
  instead of unmounting it — `cacheComponents: true` in `next.config`, which uses React's
  `<Activity>` component internally. **It requires Next.js 16.** This project is on
  **15.5.23** — upgrading a major framework version specifically to unlock one UI feature,
  mid-way through an already-large migration, is a much bigger and riskier move than this
  feature justifies on its own. Also found multiple open Next.js GitHub issues describing
  `cacheComponents`/`<Activity>` as still causing real breakage in application logic even on
  16 (["Activity component route preservation causes significant breakage"](https://github.com/vercel/next.js/issues/86577)),
  and its caching semantics are designed around server-rendered data caching — there's no
  confirmation it behaves sanely under this project's specific deployment shape (`output:
  'export'`, served over a custom `app://` protocol inside Electron, no real Next.js server
  at runtime at all). Not a fit right now — revisit only if/when a Next 16 upgrade happens
  for its own independent reasons.
- **Why not a third-party keep-alive library either** (`next-easy-keepalive`,
  `react-next-keep-alive` both exist and do roughly this). Same judgment call this project
  already made once this session for a similar reason (skipping React Query/SWR for IPC data:
  "dependência desnecessária") — this app's deployment shape (static export, custom
  protocol, no server) is unusual enough that a general-purpose community library's
  assumptions may not hold, and the actual mechanism needed is small enough (~30 lines) to
  just own directly, with full control for debugging when something in this non-standard
  setup inevitably doesn't match the library author's assumptions.
- **The mechanism this section actually specs**: a client component that watches
  `usePathname()` and keeps a `Map<pathname, ReactNode>` of every currently-open tab's
  rendered subtree, captured from `children` at the moment each new pathname is first
  visited. Renders every entry in the map simultaneously, `display:none` on all but the
  active one. This is what makes "switch tabs without losing state" real — the hidden tabs'
  React trees, hooks, and effects keep running exactly as if they were still visible, not
  approximated via localStorage. Real Next.js routing (`<Link>`, `usePathname`) is untouched
  underneath — only what happens to the *previous* route's rendered tree changes.
- **Which routes become tabs**: only manifest `navbar`-registered top-level modules — the
  same list `AppSidebar.tsx` already loads via `getModulosCarregados()` and filters through
  `permissaoLiberada()`, so tab availability automatically matches sidebar-visibility
  permission logic with zero duplicated code. Produtos' own internal Cadastro/Estoque/
  Precificação sub-nav (`produtos/layout.tsx`) stays exactly as it is today — those are
  sub-routes *within* one "Produtos" tab, not three separate header tabs; this matches how
  they already behave and keeps the tab strip bounded to ~14 possible entries, not exploding
  with every nested sub-route the app has.
- **Dashboard is a tab like any other module now**, not the tab *host* it was in vanilla
  (where `abas.js` ran inside `dashboard/index.html`, which no longer makes sense once every
  module is its own real route). Reuses the existing `hrefDoModulo` special case (`m.id ===
  "dashboard" → "/"`) already built this session. If every tab is closed, fall back to
  auto-opening Dashboard rather than showing a blank shell.
- **What happens to the header subtitle**: per the owner's own example ("tira o texto embaixo
  ... faz uma caixa pra ser a nova guia"), `AppHeader.tsx` stops rendering
  `cabecalho.subtitulo` once the tab strip replaces the title block — the tab chip itself
  (icon + module label) is what the header shows now. `usePageHeader(titulo, subtitulo)`'s
  API and all ~13 existing call sites are **not** touched in this pass — `subtitulo` becomes
  inert data the header no longer reads, disclosed explicitly rather than either silently
  left half-wired or turned into a 13-file cleanup that's out of this feature's scope. A
  follow-up could route that description text into each page's own body instead (same
  treatment already given to Importação's long subtitle earlier this session) — flagged as a
  real option, not decided here.
- **PDV / caixa-sensitive tabs, disclosed risk, not blocking**: a cashier can now background
  an in-progress PDV sale by switching to another tab and leaving it open indefinitely — the
  cart already persists via `localStorage` regardless (this session's earlier memória work),
  so nothing is lost, but there's no visual reminder that a sale is sitting open in a
  background tab. A small non-empty-cart indicator dot on the PDV tab chip would close that
  gap — noted as a nice-to-have enhancement, not a required item for this section to be done.

### Implementation

- [x] **`context/TabsContext.tsx`** — new context: `{ abas: {id, moduloId, titulo, href,
      icone}[], abaAtivaId }`. Auto-registers a tab whenever `usePathname()` resolves to a
      new manifest-registered module route not already open (no explicit "open tab" call
      needed from the sidebar or anywhere else — fully decoupled from any one click handler,
      so no navigation path can accidentally bypass it). `fecharAba(id)` removes it from the
      list; if it was active, activates the previously-active tab if still open, else the
      next one in the list, else falls back to Dashboard (auto-opened). Persisted to
      `localStorage` (open tabs + active id) so a reload/restart restores the same set —
      same pattern as this session's `usePersistedState`/PDV-cart work, reused not
      reinvented. New shared `hooks/useModulos.ts` extracted from `AppSidebar.tsx`'s own
      inline manifest-fetch/permission-filter logic — both the sidebar and this context now
      read the exact same list, no duplicated permission logic to drift apart.
      **Real bug caught before shipping**: the first draft of `fecharAba` called
      `router.push`/`setAbaAtivaId` *inside* the `setAbas` updater callback — an impure
      updater, exactly what React Strict Mode double-invokes updaters to catch (would have
      fired the navigation/state-set twice). Fixed by computing the next `abas` list first,
      then calling the side effects separately using the closure's already-current
      `abas`/`abaAtivaId` values (safe in an event handler, not inside a state updater).
- [x] **Keep-alive render wrapper** (`layout/AbasAtivasWrapper.tsx`) — new client component
      inside `(admin)/layout.tsx`, replacing the direct `{children}` render: keeps a
      `Map<pathname, ReactNode>` keyed by every currently-open tab's pathname, captured from
      `children` **only on first visit** to that pathname (captured during render, not an
      effect — mutating the ref this way is the standard, safe version of this pattern,
      since a revisit's freshly-resolved-but-discarded `children` never actually gets
      inserted into the returned tree, so React never mounts/wastes a duplicate instance of
      it). Renders every cached entry simultaneously, Tailwind `hidden` on all but the one
      matching the current pathname. A separate effect prunes any cache entry whose href is
      no longer in `TabsContext.abas` — actually frees the closed tab's mounted state/memory,
      not just hides it. Researched the native alternative before building this by hand:
      Next.js's own `cacheComponents`/`<Activity>` mechanism does exactly this, but
      **requires Next.js 16** (confirmed via docs — this project is on 15.5.23) and has
      multiple open GitHub issues describing real breakage even there; a major-version
      upgrade just to unlock one UI feature mid-migration was judged too risky. Also
      considered (found via search) two community keep-alive libraries
      (`next-easy-keepalive`, `react-next-keep-alive`) and passed on both — same judgment
      call this project already made once this session for React Query/SWR: this app's
      deployment shape (static export, custom `app://` protocol, no real Next.js server at
      runtime) is unusual enough that a general-purpose library's assumptions may not hold,
      and the actual mechanism needed is small enough (~40 lines) to own directly.
- [x] **`AppHeader.tsx` — tab strip replaces the title block.** Horizontal, horizontally-
      scrollable row of chips (icon + label + ×), sourced from `TabsContext.abas`. Clicking
      a chip's body navigates to its `href` (`router.push`, intercepted by the keep-alive
      wrapper above so state isn't lost); clicking × calls `fecharAba(id)`. New shared
      `components/common/IconeModulo.tsx` extracted (was a private function inside
      `AppSidebar.tsx`) so the sidebar and the new tab strip render the exact same manifest
      SVG icon without a second copy of that component. `cabecalho.subtitulo` from
      `PageHeaderContext` no longer renders anywhere in the header — see design rationale
      for why that's a disclosed, deliberate no-op rather than a 13-file cleanup pass.
- [x] **Active-tab color** — `bg-blue-500` for the active chip, reusing the same blue family
      already chosen this session for the PDV "Devolução / Troca" button (`blue-600`), a
      lighter shade for better contrast against the navy header at chip scale. Inactive
      chips use a muted `bg-white/5` tone. Final visual check (whether `blue-500` reads
      right in practice, not just in isolation) still needs a live look — this session has
      no way to screenshot the actual Electron window.
- [x] **Header height pass** — right-side icon container's vertical padding cut from
      `py-[14.4px]` (the "90%" pass from earlier this session, sized for the old two-line
      title block) to `py-1.5` at desktop width — a fresh measurement against the new
      single-row tab strip's actual height, not a repeat of the earlier percentage-based cut.
- [x] **Sidebar `isActive` stays in sync.** Correction to the original claim above (this bullet
      was wrong when first written): it does **not** "work unchanged" — see the root-cause bug
      below, which broke this too. Fixed alongside the tab-registration bug.
- [x] **Root-cause bug found and fixed (2026-08-27): tabs never registered for any module
      except Dashboard.** Owner reported live: clicking Financeiro in the sidebar rendered
      Financeiro's page (the keep-alive wrapper worked correctly) but the header still showed
      only a "Dashboard" tab, active. Since `window.api`/DevTools aren't reachable directly
      from this session, root-caused via `erp-crash.log`: while chasing this, found and fixed
      an *unrelated* pre-existing bug first — `main.js`'s `console-message` handler used
      Electron's old two-parameter callback signature (`(event, detail) => {...}`); Electron
      35+ (this project is on ^43) changed it to a single destructured-object parameter, so
      `detail` was always `undefined` and the handler threw on every console message, silently
      disabling all console logging to the crash log. Fixed the handler signature (verified:
      Electron's own CSP security warning appeared in the log post-fix, confirming the pipeline
      works — see `main.js`'s `console-message` listener for the full writeup). With logging
      restored, the owner reproduced the bug once more and the log showed the real cause:
      `next.config.ts` sets `trailingSlash: true` (required for the static export — each route
      needs to resolve to `route/index.html`), so `usePathname()` returns `"/financeiro/"` (and
      the same for every other module), while `hrefDoModulo()` builds hrefs as `"/financeiro"`
      (no trailing slash — what `<Link>` targets use). `hrefDoModulo(m) === pathname` therefore
      never matched for any module except Dashboard, whose href is the special-cased root `"/"`
      (already slash-free, so it's the one case that happened to match). Fixed with a new
      `normalizarPathname()` helper in `hooks/useModulos.ts` (strips a trailing slash except on
      bare `"/"`), applied everywhere a raw `pathname` was compared against a `hrefDoModulo()`
      value: `TabsContext.tsx`'s auto-register effect and its localStorage-restore effect,
      `AppSidebar.tsx`'s `isActive()`, and — same bug, same fix, found while grepping for other
      `=== pathname` comparisons — Produtos' own internal Cadastro/Estoque/Precificação sub-tab
      highlighting in `(admin)/produtos/layout.tsx`, which had never highlighted any sub-tab as
      active for the same reason. New tabs now store their `href` via `hrefDoModulo()` (canonical,
      slash-free) instead of the raw `pathname`. The temporary `[TabsDebug]` `console.warn` lines
      used to catch this are removed. Typecheck, lint, and `next build` all clean; frontend
      static export rebuilt. Not yet re-verified live against the running app.

### Tests (manual — this project has no automated UI/browser test suite; every item here is
verified live against the running app, same discipline as every other frontend item in this
file)

- [ ] Open 3+ different modules via the sidebar; confirm each becomes its own tab in the
      header, all simultaneously listed, none replacing another.
- [ ] Type into a form field (or add items to a cart) in one tab, switch to another tab and
      back — confirm the first tab's in-progress state is still there, not reset. This is
      the actual point of the whole feature — verify it doesn't silently degrade into "looks
      like tabs, behaves like normal navigation" (i.e. Option A from the architecture
      decision, which was explicitly not what was chosen).
- [ ] Close a tab (×) — confirm its content is genuinely gone from the keep-alive cache
      (e.g. reopening the same module shows a fresh fetch, not instantly-restored stale
      data from before it was closed) and that closing the *active* tab falls back sensibly
      (previous tab, or Dashboard if none left) — never a blank screen.
- [ ] Restart the Electron app with several tabs open — confirm they're restored from
      `localStorage` in the same state (open + which was active).
- [ ] Confirm the header is visibly shorter than before this section.
- [ ] Confirm the active tab's chip renders in the chosen lighter blue, visually distinct
      from both inactive chips and the navy header background, in both light and dark app
      theme if that setting still applies to the header (it currently has a fixed navy
      background regardless of light/dark mode — confirm that's still the intent here, not
      a new question this feature needs to also answer).
- [ ] PDV specifically: open a sale in progress, switch away to another tab, switch back —
      confirm the cart, caixa badge state, and any in-progress payment fields are exactly as
      left, not reset, and that the caixa-closed checkout guard (built earlier this session)
      still works correctly on a tab that was just reactivated from the background, not only
      on a freshly-navigated-to one.

### Registration

- [x] Every manifest module with a `navbar` entry gets tab behavior automatically via the
      shared manifest-list mechanism — verify against the **real, current** manifest list
      (`window.api.getModulosCarregados()`), not just the modules already built this
      session, so a module added later doesn't need this feature re-wired by hand.
      **Verified (2026-08-29) via code, not manual click-through**: `useModulosPermitidos()`
      (`hooks/useModulos.ts`) reads directly from `window.api.getModulosCarregados()`, and
      `TabsContext.tsx`'s auto-register effect (`modulos.find((m) => hrefDoModulo(m) === rota)`)
      iterates that same live list — not a hardcoded set. A module added later needs no
      changes here.
- [ ] `GOALS.md` items in this section checked off only after live verification, per this
      file's own established discipline for the rest of the frontend migration — not when
      the code merely compiles.

---

## Developer Support Admin Account (feature, not started)

**Owner's ask (2026-08-28), verbatim**: "unica coisa que voce realmente deve subir e fazer é
minha conta de adm com senha que eu vou definir posteriormente para eu poder gerenciar os erp
no pc dos clientes." — the only thing that should actually ship is the owner's own admin
account, with a password to be defined later, so the owner can manage the ERP on client
machines. Raised right after a real cutover test (v1.1.0 published, installed on a second
PC) surfaced that there's currently no way for the developer to get into a client's install
without knowing that specific store's own login — every install's `Usuarios` table is
bootstrapped independently, from whatever the store typed on first run (see `db/usuarios.js`,
already documented in AGENTS.md's Auth section).

```mermaid
flowchart TD
    A[Env var: ERP_SUPORTE_LOGIN / ERP_SUPORTE_SENHA\nread from the packager's own gitignored .env] --> B[main.js: process.loadEnvFile\n same mechanism already used for Pix/fiscal]
    B --> C[db/usuarios.js: autenticarUsuario\nstep 4 extended — wrap the fixed support login\ntoo, on EVERY successful unlock, not just bootstrap]
    C --> D[erp_usuarios.json gets a second wrapped-key entry\nsame AES-256-GCM scheme as any normal user]
    E[electron-builder extraMetadata\nbakes the value into the packaged app] --> B
    C --> F[removerUsuario: guard so the support login\ncan never be deleted/deactivated]
    C --> G[listarUsuarios: filtered out of the store's\nown Gerenciar Acessos screen]
```

### Design rationale

- **Why this can't be "just add a row to `Usuarios`."** The DB is SQLCipher-encrypted; the
  actual decryption key is the "chave-mestre," derived once from whatever password unlocked
  the database the very first time, and every OTHER login works by having its own wrapped
  copy of that same master key sitting in `erp_usuarios.json` (AES-256-GCM, keyed by
  `derivarChaveUsuario(login, senha)`, see `db/usuarios.js`). A support login with no wrapped
  entry could never actually decrypt an existing store's database — it would just be a
  useless row. The wrap has to be created at a moment the process already holds the real
  master key in memory, which only happens during a successful unlock.
- **When the wrap gets created.** `autenticarUsuario`'s existing step 4 already does
  "ensure a wrap exists for the login that just authenticated" (this is how a *normal* user's
  first login creates their own entry). Extending that same step to *also* wrap the fixed
  support login, on every successful unlock (the store's own daily logins, not just first
  bootstrap), means the support account becomes usable the very first time anyone at the
  store logs in after this ships — no special first-run flow needed, no action required from
  the store owner.
- **How the password reaches a packaged build — considered three options.** (1) Bundle the
  raw `.env` file into the installer (`build.files`) — rejected: a plaintext credential
  sitting inside the installed app's `resources/` folder, trivially extractable by unpacking
  the asar. (2) A manual `.env` the developer drops next to each client's install after the
  fact — rejected: doesn't match "so I can manage the ERP on client PCs" (plural, ongoing) —
  would need repeating by hand for every future install/reinstall. (3) **Chosen**:
  electron-builder's own `extraMetadata` build option, set via **CLI flags at publish time**
  (`-c.extraMetadata.erpSuporte.login=... -c.extraMetadata.erpSuporte.senha=...`, verified
  against electron-builder's own source/tests — `coerceTypes(config.extraMetadata)` and the
  documented `-c.mac.sign.identity=null`-style nested-path override both confirm this exact
  syntax works), not a static `extraMetadata` block in `package.json` (a static block would
  need `${env.X}` macro expansion inside `extraMetadata` specifically, which isn't confirmed
  to apply there — the documented macro expansion is for publish-config string fields, a
  narrower thing). The shell substitutes the real values into the CLI flags before
  electron-builder ever sees them — the value never touches source control (same discipline
  as `GH_TOKEN`, `.env`, and every other secret this project already keeps out of the repo),
  gets baked once per release, and `main.js` reads it the same way it already reads
  `process.env` for Pix/fiscal
  (`process.loadEnvFile`), falling back to the embedded `package.json` field when no local
  `.env` is present (i.e. in the packaged, installed case).
- **Password rotation is not retroactive.** Because the value is baked in per-release (not
  fetched from a server — this app has none, by design), changing
  `ERP_SUPORTE_SENHA` and cutting a new release only affects installs that update to it.
  Already-installed clients keep whichever password was baked in when they installed/last
  updated, until they update again. Disclosed here so it's not assumed to behave like a
  central "reset everywhere" — it can't, offline-first has no such mechanism.
- **Never deletable.** `removerUsuario` already refuses to remove/deactivate the *last active
  admin* (so an owner can't lock themselves out). Extending the same guard to unconditionally
  refuse the fixed support login (regardless of admin count) prevents the store's own cleanup
  — or an admin who doesn't recognize the login and assumes it's a mistake — from silently
  removing the developer's own access.
- **Hidden from the store's own Gerenciar Acessos list — a judgment call, not hidden from the
  database itself.** Filtering the support login out of `listarUsuarios()`'s result (so it
  never shows in the Acessos screen a store admin uses day to day) matches how vendor support
  accounts are conventionally handled — it avoids a store owner seeing an unfamiliar login and
  worrying it's a breach. It is **not** concealment in any stronger sense: the row is a normal
  `Usuarios` entry, fully visible to anyone using the existing "Banco de Dados" raw-table
  inspection module (admin-gated, already requires re-entering the admin password — see
  AGENTS.md's Auth section). Flagged explicitly here rather than assumed, since "should the
  client be able to see this account exists" is ultimately the owner's call, not a technical
  one — open for the owner to override before this ships.
- **Login name**: needs the owner's preference (not invented here) — proposing a default of
  `allu_suporte` (matches the product's own branding, unambiguous, unlikely to collide with a
  real customer's chosen login) for the owner to confirm or override before implementation.
- **Out of scope, explicitly**: this is *not* remote/central management (no server exists or
  is proposed) — it's a guaranteed local credential the developer can use once they have
  physical or remote-desktop (AnyDesk/TeamViewer, already in the developer's own toolset)
  access to a client machine. Building actual centralized fleet management (push config,
  view status across installs from one dashboard) would be a much larger, separate initiative
  and contradicts this project's deliberate offline-first, no-server architecture — not
  proposed here.

### Implementation

- [x] **`db/usuarios.js` — extend the wrap-ensure step.** In `autenticarUsuario`, after the
      existing "ensure wrap for this login" logic, also ensure a wrap exists for
      `process.env.ERP_SUPORTE_LOGIN` using `process.env.ERP_SUPORTE_SENHA` — guarded so it's
      a no-op when either env var is unset (dev machines without the secret configured, or a
      build that deliberately omits it, keep working exactly as today). Reuses
      `derivarChaveUsuario`/`embrulharChave`/`gravarArquivoUsuarios`, no new crypto.
      Idempotent by construction (same "if (!arquivo[login])" guard already used for normal
      users) — never re-wraps or overwrites on every login, only creates the entry once.
      **Collision safety, since the owner picked the login `adm`** (a name a store could
      plausibly pick for their own account too): `garantirContaSuporte()` checks BOTH the
      wrap-file entry AND the `Usuarios` row before ever writing anything — if `adm` already
      belongs to a real account on that install (in either place), the function is a total
      no-op for that install rather than overwriting/breaking the real account's access. This
      means the support login simply won't be available on any client whose own admin already
      happens to be named `adm` — a real, disclosed limitation of reusing a common name,
      traded for simplicity per the owner's explicit choice.
- [x] **`db/usuarios.js` — bootstrap the `Usuarios` row too**, same "if not present, insert"
      pattern already used for the very first admin (`autenticarUsuario` step 3) — done inside
      `garantirContaSuporte()` itself (not step 3, which only fires on a truly empty table).
- [x] **`db/usuarios.js` — protected login guard.** `removerUsuario` refuses unconditionally
      (`ehLoginDeSuporte` check before the existing last-admin-count logic). `salvarUsuario`'s
      edit branch also refuses to edit/deactivate it by id — defense in depth beyond just
      hiding it from the list (closes a direct-IPC-call gap).
- [x] **`listarUsuarios()` — filter the support login out**, so
      `frontend/src/app/(admin)/acessos/page.tsx` / `UsuarioFormModal.tsx` never need their
      own awareness of it.
- [x] **`main.js` — extend `.env` loading for the packaged case.** Falls back to
      `require("./package.json").erpSuporte.{login,senha}` when `.env` didn't already provide
      both — the field the CLI publish flags below bake in.
- [x] **Publish command — wire the build-time bake.** `AGENTS.md`'s release process section
      documents the two extra `-c.extraMetadata.erpSuporte.*` flags the developer adds to the
      existing `npx electron-builder --publish always` command, sourcing
      `ERP_SUPORTE_LOGIN`/`ERP_SUPORTE_SENHA` from their own shell environment — never a
      static block in `package.json`, never committed with a real value.
- [x] **`.env.example` — document the two new variables**, noting they're read at
      *package/release* time (via the CLI flags above), not at every app launch in a packaged
      build, and are never required.
- [x] **Owner decision, answered (2026-08-28)**: login is `adm` (not the proposed
      `allu_suporte` — see collision-safety note above); the actual password was provided
      directly and used to publish v1.1.2 — **deliberately not recorded here or anywhere in
      this repo** (this file is public). Visibility default (hidden from Acessos, visible via
      Banco de Dados) not objected to — proceeding with it as specified in Design rationale.

### Tests

- [x] `test/suporte-admin.test.js` (new, `node:test` + temp-DB pattern matching
      `test/senha.test.js`): with `ERP_SUPORTE_LOGIN`/`ERP_SUPORTE_SENHA` set, a fresh DB's
      first-ever login (a different, normal login) also results in the support login
      successfully authenticating afterward — proves the wrap-on-any-unlock behavior, not just
      wrap-on-first-bootstrap.
- [x] Same test file: `listarUsuarios()` never includes the support login in its result.
- [x] Same test file: `removerUsuario(idDoSuporte)` throws, regardless of how many other
      active admins exist.
- [x] Same test file: with the env vars unset, behavior is byte-for-byte identical to today —
      no support login created, no error, nothing observable changes (proves the feature is
      genuinely opt-in, not a hidden requirement).
- [x] Same test file: collision case — a login matching `ERP_SUPORTE_LOGIN` that already
      belongs to a real account (created before the support env vars were ever set) keeps
      working with its own real password, and the support password does NOT unlock it.
- [ ] **(manual)** Full build → install cycle on a real second machine: confirm the baked
      `extraMetadata` value actually reaches a packaged install and the support login works
      end-to-end — this specific path (electron-builder's env-to-`extraMetadata` substitution)
      can't be exercised by the existing e2e suite, which launches the app straight from
      source (`electron .`), never a packaged build.

### Registration

- [x] AGENTS.md's Auth / Decisões Arquiteturais section gets a note about this account's
      existence and purpose — so a future session (or the owner, months from now) doesn't
      rediscover an unexplained login the same confused way this whole feature started.
      Deliberately **not** documented in README.md (a public file) — the account's existence
      is fine to disclose to a future maintainer working in the repo, not to anyone browsing
      the public GitHub page.

---

## Update Flow — Navigation Freeze Investigation (2026-08-29, root cause CONFIRMED and FIXED)

**Owner's live report**: after v1.1.6 (which fixed the missing `frontend/out` packaging bug),
navigating to Atualizações then clicking any other module/tab did nothing — the sidebar's
active-item highlight *did* update (proving `usePathname()` genuinely changed), but the
header tab strip and page content stayed frozen on Atualizações. Reproduced live via
computer-use on the owner's real machine.

**Two fixes shipped, both real architectural improvements, root cause not 100% pinned down**:

1. **`main.js`'s custom `app://renderer/` protocol switched from `net.fetch()` to
   `fs.promises.readFile()`.** `net.fetch` for a `file://` URL still routes through Chromium's
   network service — the same infrastructure `electron-updater` uses to reach GitHub. Serving
   a local static file has no reason to depend on network machinery at all; this fully
   decouples the two regardless of the exact interaction that was happening.
2. **`ipc/sistema.js`'s `check-for-updates`/`download-update` now pre-check connectivity**
   (`temConectividade`: a 5s `fetch` + real `AbortController`) before ever calling
   `autoUpdater.checkForUpdates()`/`downloadUpdate()`. The existing `comTimeout`
   (`Promise.race` + `setTimeout`) turned out not to be sufficient on its own — in testing,
   the race's own `setTimeout` sometimes never fired either, which points at something
   deeper than "the promise just doesn't resolve": DNS resolution (`getaddrinfo`) runs on
   Node's libuv threadpool, the same fixed-size pool `fs.readFile` needs a slot from — a
   hung DNS lookup can plausibly starve that pool. `fetch`'s `AbortController` is a genuine
   cancellation (not just "stop waiting"), which is why the pre-check uses it instead of
   another `Promise.race`.

**Update (2026-08-29, later same day)**: the e2e mock now exists —
`ERP_MOCK_UPDATER=1` (`ipc/sistema.js`) makes `checkForUpdates()` emit the real
`checking`/`not-available` events synchronously, no network involved at all. Restored the
removed regression test with it (`e2e/tab-system.spec.ts`, "navegar pra Atualizações e
depois pra outro módulo continua funcionando"). **It still reproduces — deterministically,
with zero network activity — which proves the bug was never about network/DNS in the first
place.** Also tried `normalizarPathname()` in `AbasAtivasWrapper.tsx` (a real gap — it was
the one place in the tab system that never got that fix — closed a latent duplicate-cache-key
risk) — didn't fix this either. Test is marked `test.fail()`: runs every CI run, documents
the known-broken state, and will loudly tell us (Playwright fails the run) the moment
something actually fixes it.

**Three real fixes shipped this investigation, all still valid architectural improvements,
none of them the root cause**: `net.fetch` → `fs.readFile` (decouples local file serving
from Chromium's network stack), the `temConectividade` pre-check (genuine `AbortController`
cancellation instead of just "stop waiting"), `normalizarPathname()` in
`AbasAtivasWrapper.tsx`. **Network is now definitively ruled out.** The actual root cause —
found and fixed below — was an unstable `useEffect` dependency in `usePageHeader`, specific
to the Atualizações page, exactly matching this prediction.

### Deep investigation plan (owner's request, 2026-08-29) — executed, root cause found

Real DevTools access (F12/`openDevTools`) turned out not to be necessary in the end — a
faster path existed: this app already writes every renderer `console.error`/`console.warn`
to `erp-crash.log` (`main.js`'s `console-message` handler), so temporary `console.warn`
instrumentation plus a standalone Playwright-driven repro script (outside the committed e2e
suite, launching the packaged frontend the same way `e2e/tab-system.spec.ts` does, with
`page.on("console", ...)` for real-time capture) reproduced the freeze deterministically and
captured the full renderer console output at the exact moment it happened — no visual
DevTools window needed.

- [x] **Step 1 — DevTools access.** Confirmed nothing in `criarJanelaPrincipal()` blocks
      `devTools` or intercepts F12 explicitly (matches the original suspicion that absence of
      an explicit block wasn't the explanation). Added `ERP_DEBUG_DEVTOOLS=1` env-gated
      `webContents.openDevTools({ mode: "detach" })` in `main.js` anyway — a permanent,
      opt-in diagnostic tool for future investigations, same convention as
      `ERP_MOCK_UPDATER`/`ERP_TEST_USERDATA_DIR`. Not what actually cracked this bug (see
      above), but genuinely useful going forward.
- [x] **Step 2 — reproduce and read the Console, done via the console-capture script instead
      of a live DevTools window (equivalent result, more automatable).** **Root cause found:**
      `frontend/src/app/(admin)/atualizacao/page.tsx` passed an inline JSX element as
      `subtitulo` to `usePageHeader(titulo, subtitulo)` — a brand-new object every render.
      `usePageHeader`'s `useEffect` (`context/PageHeaderContext.tsx`) depends on
      `[titulo, subtitulo]`, so with a never-stable `subtitulo` the effect
      (`setCabecalho(null)` → `setCabecalho({...})`) refired on **every render** of
      `AtualizacaoPage`. Because `AbasAtivasWrapper` keeps a visited page genuinely mounted
      even while hidden, and `useAtualizacao()`'s `window.addEventListener("update-status", ...)`
      is never torn down while mounted, every stray `update-status` event (confirmed firing
      repeatedly even after navigating away) re-triggered this cycle. `PageHeaderProvider`
      wraps the entire main tree (`TabsProvider` → `AppHeader` → `AbasAtivasWrapper` → every
      cached tab) with none of its children memoized, so each `setCabecalho` call
      re-rendered **the whole app**, including whatever tab the user had just navigated to —
      racing with, and in practice starving, that tab's own initial commit. Confirmed this is
      the *only* unstable call site: all other 15 pages calling `usePageHeader` pass plain
      string literals (stable by `Object.is`), which is exactly why only Atualizações ever
      triggered this.
- [x] **Step 3 — global `ErrorBoundary`.** Added `frontend/src/layout/AbaErrorBoundary.tsx`,
      wrapping each cached tab individually inside `AbasAtivasWrapper` (a crash in one hidden
      tab's tree no longer nukes the active one). Confirmed via the repro script this was
      *not* what was catching/hiding the freeze (no `[AbaErrorBoundary]` log ever appeared —
      the real cause was never a thrown exception) — kept anyway as a permanent safety net,
      since the app had zero error boundaries anywhere before this.
- [x] **Step 4 — instrumented, found it, then removed the temporary logging** (per this
      section's own stated convention) from `TabsContext.tsx`, `AbasAtivasWrapper.tsx`, and
      `useAtualizacao.ts` once Step 2's finding was confirmed.
- [x] **Fix applied and verified**: wrapped `atualizacao/page.tsx`'s `subtitulo` in
      `useMemo(() => (...), [versao, statusCor, status])`. Re-ran the exact same repro script
      after rebuilding — navigation to Compras now succeeds immediately, no freeze. Removed
      the `test.fail()` wrapper from `e2e/tab-system.spec.ts`'s regression test (Playwright
      itself flagged "Expected to fail, but passed" before the wrapper was removed — the
      built-in confirmation this exact mechanism predicted). Full suite green: `npm test` (62
      unit tests), `npx playwright test` (5/5 e2e), `npm run lint` (clean).
- **Not done, optional follow-up (bigger than this investigation's scope, flagged not
  executed):** `PageHeaderContext`'s `cabecalho` value is now confirmed **fully dead** —
  grepped the whole frontend, nothing reads it (`AppHeader.tsx` was migrated to the tab-strip
  design and never wired to consume it; every page's actual subtitle now renders in its own
  body, same pattern already applied to Atualizações earlier this session). The `useMemo` fix
  above closes the actual bug, but `usePageHeader`/`PageHeaderContext` could be deleted
  entirely (16 call sites + the context file) as dead-code cleanup that also permanently
  forecloses this whole bug class. Left undone here since it's a materially larger, more
  invasive change than what this investigation pass was scoped to — a call for the owner.

### Support account login collision — real, connected finding (2026-08-29)

**Owner's report, same message**: "eu tinha pedido para gerir uma senha de acesso diferente
da atual" — implying the account they're actually logged in as right now uses a different
(weaker) password than the one they'd asked to be set up, not the baked-in support password.
Verified directly against the owner's real,
currently-installed v1.1.8 (`resources/app.asar` extracted, read-only): `erpSuporte.login`
and `erpSuporte.senha` **are** correctly baked into this exact installed copy — the
`extraMetadata` mechanism worked correctly this time (unlike the `frontend/out` bug, this
is not a repeat of that class of failure).

**Likely root cause — the collision this file already flagged as a risk when the login
`adm` was chosen**: `garantirContaSuporte()` is deliberately collision-safe — it never wraps
a login that already has *any* `Usuarios` row or wrap-file entry, precisely so it can never
break a real account. On a genuinely fresh install, the *first* login+password anyone types
becomes the bootstrap admin (existing, unrelated behavior — `autenticarUsuario` step 3).
**If the owner (or a real client, entirely plausibly) types `adm` as their own first login
when setting up a fresh install — exactly what appears to have happened here — the support
account's own collision guard refuses to ever touch that login**, because as far as
`garantirContaSuporte()` can tell, `adm` already belongs to a real person. The support
password never activates for that install, silently, by design — the owner sees an
"Administrador" session and reasonably assumes it's the guaranteed support account, when
it's actually just their own bootstrap account that happens to share a name.

- [x] **Verified directly (2026-08-29), collision CONFIRMED cryptographically, not just by
      inference.** App was closed; read `erp_usuarios.json` from the real userData directory
      (`AppData/Roaming/erp/` — note the folder is `erp`, `package.json`'s `name` field, not
      `productName` "ALLU ERP") read-only. Wrote an isolated offline script replicating
      `derivarChaveUsuario`/`desembrulharChave` exactly and attempted to unwrap the `"adm"`
      entry with the real baked support password (`ERP_SUPORTE_SENHA`, never written to any
      file in this repo — see `.env.example`): **AES-GCM auth tag did not validate** — the
      real support password does not decrypt that entry. Proves `"adm"` in this install is
      the store's own bootstrap account (whatever password was typed on first run), not the
      support account — exactly the collision this file already flagged as a risk when the
      login was chosen.
- [x] **Renamed, per owner's decision (2026-08-29, answered via this execution's confirmation
      question): from the next publish onward, use `ERP_SUPORTE_LOGIN=allu_suporte`** instead
      of `adm` (documented in `AGENTS.md`'s release-process section, with the verified
      collision finding above as justification). No code change needed — the login is
      entirely driven by the env var/CLI flag at publish time, nothing hardcoded. **Not
      retroactive**: v1.1.8 and any other already-published build keeps `adm` and stays
      affected by the collision — only applies to builds published after this change.
- [x] **Collision now logged.** `garantirContaSuporte()` (`db/usuarios.js`) writes a line to
      `erp-crash.log` (same file/format as `main.js`'s own `logErro`) whenever the collision
      guard actually triggers — `[garantirContaSuporte] login "X" já pertence a uma conta
      real (id=N) — conta de suporte NÃO ativada nesta instalação (colisão de nome).` Makes
      this diagnosable in seconds on the next occurrence instead of requiring a fresh
      cross-referencing investigation.

---

## Pre-production QA pass (2026-08-29, owner's final test before real company use)

Owner's request: two live-tested corrections, ahead of using this ERP for real at their own
business and rolling the update out from GitHub Releases.

- [x] **Header tab strip never actually compacted — root cause was a flexbox `min-width:auto`
      trap, two levels up from the tab strip itself.** `AppHeader.tsx`'s tab row already had
      correct `min-w-0`/`flex-shrink` — but its own parent (`<header>`'s single flex child,
      `flex flex-col ... grow lg:flex-row`) and, one level further up,
      `(admin)/layout.tsx`'s main-content `flex-1` div, both lacked `min-w-0`. A flex item's
      default `min-width` is `auto` (never shrink below content's intrinsic size) — without
      the fix, the whole chain silently grew to fit the tab strip's *unshrunk* content instead
      of ever handing it a real constrained width, which is exactly why nothing ever
      compacted and the page just grew a horizontal scrollbar instead (matching the owner's
      screenshots). Fixed by adding `min-w-0` at both levels
      (`frontend/src/layout/AppHeader.tsx`, `frontend/src/app/(admin)/layout.tsx`).
- [x] **Tabs now shrink proportionally (CSS-only) down to a 96px floor**, then switch to a
      Chrome-style compact mode (first-letter badge + × only, no label) via a `ResizeObserver`
      watching the tab strip's real available width divided by tab count
      (`LARGURA_MIN_ABA_NORMAL = 96` in `AppHeader.tsx`). Verified live via an isolated
      Playwright repro script (11 tabs open, viewport narrowed to 1080px): all 11 render as
      compact letter+× badges, no scrollbar needed; with only 4 tabs at 1280px, full
      icon+label+× renders normally with visible ellipsis truncation on longer labels
      (confirmed "Fornece…", "Banco d…" truncating correctly).
- [x] **"Backup local" export**: `exportarBancoJSON()` (`db/banco-admin.js`) rewritten —
      was a single combined JSON file in `userData/exports/` (invisible to the store owner,
      buried in AppData); now writes to `<pasta do executável>/Backup local/backup-DD-MM-AAAA-HH/`
      (new `getPastaExecutavel()`/`setPastaExecutavel()` in `db/conexao.js`, set from `main.js`
      at boot — `app.isPackaged ? path.dirname(app.getPath("exe")) : __dirname`), one `.json`
      file per table plus `_info.json` with the export summary. Two exports within the same
      hour reuse the same subfolder (files just overwrite in place) rather than erroring or
      duplicating. Loading overlay added to `banco/page.tsx` for the `exportando` state
      (spinner + message, `absolute inset-0` over the page). Verified live: real export
      produced 22 table files + `_info.json` in a correctly-named
      `backup-29-08-2026-15/` folder at the project root (dev-mode `pastaExecutavel`); result
      banner showed the right path and counts. New test coverage:
      `test/banco-admin-export.test.js` (3 tests: location, per-table files + `_info.json`,
      same-hour reuse).
- [x] Full regression after both fixes: `npm run lint` clean, `npm test` 65/65,
      `npx playwright test` 5/5 (no e2e locator broke from the tab-strip markup changes).

---

## Suggested order

1. ~~P0 fix (pagamentos migration)~~ — done. Also found and fixed, beyond the missing table:
   `db/pagamentos.js` exported different function names than `ipc/pagamentos.js` imported (every
   handler was calling `undefined`), a query selected a `Vendas.numero_venda` column that doesn't
   exist, the customer-name join pointed at `Usuarios` instead of `Clientes`, `registrarPagamento`
   received an object but the function expected positional args, the "lançar pagamento" form
   populated its Venda dropdown from the payments list instead of the sales list, a stray `});`
   made `pagamentos.html`'s entire script fail to parse, and `ipc/pagamentos.js` had reimplemented
   its own broken local `exigirSessao` that silently let unauthenticated calls through instead of
   using the shared one from `deps`. Verified end-to-end against a temp encrypted DB.
2. ~~DB key derivation hardening~~ — investigated, turned out already sound; no change needed
   (see Database section).
3. ~~Testing gaps for money-handling paths~~ — done, see Testing section.
4. ~~Minimal CI~~ — done, `.github/workflows/ci.yml` added; unverified on an actual Actions run.
5. Clean installer test on a fresh machine — release-readiness gate (needs a second machine or
   VM; not something this pass could execute). **Still open.**
6. ~~ESLint warnings~~ — done, 0 warnings. ~~Retail-flow backlog~~ — checked, already built
   (troco/busca de cliente/imagens all already worked; `AGENTS.md` was stale, corrected). UI
   polish — superseded by item 9 below.
7. Narrow the remaining admin-only IPC domains (`pagamentos`, `dashboard`, `usuarios`,
   `banco-admin`, `sistema`, `auth`) to `exigirPermissao` like the other 11 — only if the owner
   confirms a `vendedor` should reach any of them. **Still open**, needs an answer from you,
   not a technical decision.
8. Payment Processor Integration decision (see section above) — **paused, open**, needs an
   answer from the owner before any code or outreach happens.
9. Frontend Visual/UX Fix Pass (see section above) — **done.** PDV pilot (all 5 bugs fixed,
   verified live) plus all 17 remaining screens now audited against the pilot's 4-point checklist
   (`dashboard/index.html` clean; the other 16 had 13 real bugs found and fixed — dark-mode gaps,
   2 genuine layout/functional bugs (`atualizacao.html`'s message classes never matched,
   `financeiro.html` referencing CSS classes it never loads), dead legacy CSS, and one
   project-wide fix via `color-scheme: dark` in `head.js`). Verified via `npm run lint` (0
   warnings) + `npm test` (40/40) after every change; no live browser pass done this session (see
   note below) — static-code verification only, same method used successfully for PDV/Dashboard.
   Independent of item 8 (no shared files). **Not yet committed** — offer to prepare a commit once
   confirmed.
10. ~~Financial/Accounting Depth~~ — done: margem de contribuição, ponto de equilíbrio (a real
    unit-mismatch bug caught and fixed before shipping), giro de estoque, provisão de DAS, all
    with tests (5 new, 40/40 total passing) and wired into the real UI, verified live against
    seeded data — every number matched its formula exactly on screen, not just in tests.
11. **Core + Plugins Architecture (see section above) — new, not started.** Concrete first step:
    design the module manifest schema, then replace `main.js`'s 19 hardcoded IPC requires and
    `navbar.js`'s hardcoded sidebar HTML with a manifest-driven loader — all still inside the
    current single repo, verified against the existing 19-module behavior before any repo is
    split out. Only after that regression passes does extracting modules into separate GitHub
    repos (git submodules) become meaningful. The already-approved TailAdmin restyle resumes
    module-by-module once a module has its own clean boundary, owner-guided session to session —
    no fixed order. Independent of items 5/7/8 above (no shared files), but item 5 (clean-machine
    installer test) should be re-run once packaging changes for submodule checkout, not just once.
