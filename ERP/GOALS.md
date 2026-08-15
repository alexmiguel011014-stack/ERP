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
- [ ] **Add a real schema/migration versioning mechanism.** Right now "the migration" is
      "add a `CREATE TABLE IF NOT EXISTS` / call `migrarColunas()` and hope every deployed
      install re-runs `iniciarBanco()` on next launch." That has worked so far but has no
      version marker (`PRAGMA user_version` or a `SchemaVersion` table) and no rollback story.
      Low effort, meaningfully de-risks the next 10 schema changes — worth doing before the
      table count grows further from its current 21.
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
- [ ] **Add `PRAGMA user_version`** (see Backend item above) so future migrations can detect
      "this DB predates feature X" instead of relying purely on `IF NOT EXISTS`/column-presence
      checks scattered across `schema.js`.
- [ ] Automated daily backups exist (`data/backups/` dev, `userData/backups/` prod) — confirm
      there's a retention/pruning policy (currently unclear how many backups accumulate over a
      year of daily use) and that a restore has been tested end-to-end, not just backup.

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
- [ ] **Retail-flow backlog from `AGENTS.md`** (owner-confirmed gaps, not speculative):
      automatic change/troco calculation in PDV, customer search inside PDV, product images.
      These affect daily cashier workflow directly — prioritize over polish items below.
- [ ] UI/UX polish backlog from `AGENTS.md` ("ícones vetoriais, tipografia refinada") —
      lower priority than the functional gaps above.

## Connectivity

- N/A as "frontend talks to a remote API" — this is a single-process desktop app.
  Frontend ↔ backend is entirely `contextBridge` + `ipcMain.handle`, which is the correct
  choice here and already consistently applied; no cross-process/network surface to secure
  beyond what's covered under Security below.
- [ ] **Open, not touched this pass.** Auto-update via `electron-updater` + GitHub Releases is wired (`modules/atualizacao/`) —
      confirm the GitHub token used to *publish* releases (`electron-builder --publish`) is
      supplied as a CI/local environment variable (`GH_TOKEN`) and never committed; document
      the release process (who runs `npm run build`, how the token is provided) in `AGENTS.md`
      since it's currently tribal knowledge.

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
- [ ] `npx electron scripts` (E2E: login + visit every page, collect console errors) exists per
      `AGENTS.md` but isn't part of `npm test` — confirm it still passes; consider wiring it
      into the same CI workflow once CI exists, since it directly catches "page throws on load."

## Security

- [x] `nodeIntegration: false`, `contextIsolation: true`, `contextBridge` exposing only
      specific methods (never raw Node objects) — correct baseline for an Electron app.
- [x] `npm audit` — 0 known vulnerabilities in production dependencies as of this pass.
- [x] No secrets committed; app needs no runtime `.env` (fully offline, DB key comes from the
      user's own login password) — `.env.example` from `project-standards.md` doesn't apply
      here for the same reason.
- [x] DB key derivation — see **Database** above; verified sound (SQLCipher's own 256k-iteration
      PBKDF2 governs it), not the gap it first looked like.
- [ ] `modules/banco/` (raw table inspection) already requires admin session + password
      re-confirmation — good pattern; apply the same "admin + password re-confirm" gate to any
      future feature that can export or display bulk customer PII (e.g. a future full-database
      export/report feature), not just raw table browsing.

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
6. ~~ESLint warnings~~ — done, 0 warnings. Retail-flow backlog (troco, busca de cliente no PDV,
   imagens), UI polish — **still open**, not touched this pass (each is a small feature, not a
   bug fix — better scoped as its own pass).
7. Narrow the remaining admin-only IPC domains (`pagamentos`, `dashboard`, `usuarios`,
   `banco-admin`, `sistema`, `auth`) to `exigirPermissao` like the other 11 — only if the owner
   confirms a `vendedor` should reach any of them. **Still open**, needs an answer from you,
   not a technical decision.
