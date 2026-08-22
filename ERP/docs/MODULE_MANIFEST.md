# Module manifest (`modulo.json`) — schema

Part of the **Core + Plugins Architecture** work (see `GOALS.md`). Each business module folder
under `modules/` gets a `modulo.json` describing it, so `main.js`'s IPC registration and
`navbar.js`'s sidebar rendering can be driven by data instead of hand-maintained hardcoded lists.
Modeled on Odoo's `__manifest__.py` (name/version/depends/data) — same problem shape, proven
design.

## Real navigation shape this schema has to represent

Read directly from the current code (`main.js`, `navbar.js`, `dashboard/abas.js`,
`produtos/gerenciamento-produtos.js`), not assumed — the module tree is **4 levels deep**, not a
flat list:

```
Sidebar (navbar.js)
├─ Dashboard              (always visible, no gate)
├─ Frente de Caixa (PDV)  (always visible, no gate)
├─ Produtos               (gated: podeModulo("produtos")) → opens as a Dashboard tab → its own
│                           internal tab bar (gerenciamento-produtos.js), each tab an iframe:
│                           ├─ Cadastro
│                           ├─ Categorias
│                           ├─ Estoque (entrada.html) → has its OWN hidden 4th-level tab:
│                           │    └─ Lista de Estoque (revealed only by a button inside entrada.js)
│                           └─ Precificação
├─ Compras                (gated: podeModulo("compras")) → Dashboard tab
├─ Fornecedores           (gated: podeModulo("fornecedores")) → Dashboard tab
├─ Clientes               (always visible, no gate) → Dashboard tab
├─ Financeiro             (gated: podeModulo("financeiro")) → Dashboard tab → its own iframe tab:
│                           └─ Pagamentos (pagamentos.html / lancar-pagamento.html)
├─ Relatórios             (gated: podeModulo("relatorios")) → Dashboard tab → its own iframe tab:
│                           └─ Vendas (histórico de vendas, vendas.html)
└─ Administração (group, collapsed by default, only shown if authenticated)
   ├─ Gerenciar Acessos   (gated: isAdmin only) → Dashboard tab
   ├─ Banco de Dados      (gated: isAdmin only) → Dashboard tab
   ├─ Importação          (gated: isAdmin only) → Dashboard tab
   └─ Atualizações        (NOT admin-gated — any authenticated user sees this one; the one
                            exception inside the admin group) → Dashboard tab
```

**"Opens as a Dashboard tab" is a real, separate mechanism** (`dashboard/abas.js`'s
`MODULOS_ABA` dict, matched by the clicked link's filename) — it intercepts the sidebar click and
loads the module in an iframe inside the Dashboard instead of navigating the whole window. This
is a THIRD file (besides `main.js` and `navbar.js`) that currently hardcodes per-module knowledge
and has to become manifest-driven too if the sidebar becomes dynamic — the original GOALS.md item
only named `navbar.js`; this is expanded scope discovered while designing the schema.

**Discovered inconsistency, not touched by this schema (flagging, not fixing):**
`gerenciamento-produtos.js`'s `iniciar()` gates the whole Produtos workspace to
`sessao.perfil === "admin"` specifically — stricter than `podeModulo("produtos")`, which a
`vendedor` with `permissoes.produtos = true` would pass. A vendedor granted the Produtos
permission would see the sidebar link (gate passes) but clicking it would silently do nothing
(the stricter internal gate blocks it). This is a pre-existing bug independent of this
refactor — noted here so the manifest-driven version doesn't accidentally paper over it one way
or the other without a deliberate decision.

## Schema

```jsonc
{
  "id": "financeiro",                 // matches the modules/<id>/ folder name
  "nome": "Financeiro",
  "versao": "1.0.0",
  "entrada": "financeiro.html",       // relative to the module folder; null if this module has
                                       // no standalone page (pure IPC/backend-only, rare)
  "ipc": ["financeiro.js"],           // file names under ipc/, registered via .registrar(ipcMain, deps)
  "permissao": { "tipo": "modulo", "nomeModulo": "financeiro" },
                                       // tipo: "sempre" | "admin" | "modulo"
  "navbar": {                         // omitted entirely for modules with no direct sidebar entry
    "secao": "gestao",                // "principal" | "gestao" | "administracao"
    "label": "Financeiro",
    "dica": null,                     // tooltip text, if different from label (e.g. Acessos:
                                       // label="Gerenciar Acessos", dica="Acessos" — the one real
                                       // case where these diverge today); falls back to label
    "icone": "<svg ...>",             // the exact inline SVG currently in navbar.js
    "ordem": 40,
    "abaDashboard": true,             // true = clicking opens as a Dashboard tab (abas.js), not a full navigation
    "workspaceParam": null            // only for tipo="workspace-dashboard": the ?workspace=...
                                       // query value (e.g. "produtos"'s is "gerenciamento-produtos",
                                       // not its own id — a pre-existing naming mismatch preserved as-is)
  },
  "paiWorkspace": null,               // set to the parent module's id for nested-tab-only modules
                                       // (e.g. "cadastro".paiWorkspace = "produtos")
  "tipo": "pagina",                   // "pagina" (has its own modules/<id>/<id>.html) |
                                       // "workspace-dashboard" (no page of its own — reached via
                                       // dashboard/index.html?workspace=<id>, e.g. "produtos"
                                       // today; entrada is null for this type)
  "dependeDe": []                     // other module ids that must be present first
}
```

`permissao.tipo`:
- `"sempre"` — always visible/reachable, no gate (Dashboard, PDV, Clientes today).
- `"admin"` — `isAdmin` only (Acessos, Banco, Importação today).
- `"modulo"` — `isAdmin || permissoes[nomeModulo] === true` (Produtos, Compras, Fornecedores,
  Financeiro, Relatórios today). Note the one real exception: **Atualizações lives in the admin
  group visually but is NOT `"admin"`-gated** — it's `"sempre"` (any authenticated user reaches
  it) despite being rendered inside the collapsed Administração section. The manifest's
  `navbar.secao` (visual placement) and `permissao.tipo` (actual gate) are independent fields on
  purpose, because the current code already has this exact case.

## File naming

One module folder can host more than one module (`modules/produtos/` alone hosts `produtos`
itself, `cadastro`, and `categorias`) — plain `modulo.json` is reserved for the folder's
"primary" module (the one sharing the folder's name), and co-located modules use
`<id>.modulo.json` instead (`cadastro.modulo.json`, `categorias.modulo.json`). The loader scans
for both patterns (`modulo.json` and `*.modulo.json`) under `modules/**`, not just one filename.

## Validation rules (enforced by the loader, `db/modulos.js`)

- `id` must match the containing folder name exactly.
- `entrada`, if present, must exist as a real file relative to the module folder.
- Every entry in `ipc` must exist as a real file under `ipc/`.
- `dependeDe` must not reference an unknown module id, and must not form a cycle.
- If `navbar` is present, `permissao` must be present too (a module can be permission-gated
  without a sidebar entry — a nested-tab module still needs its permission checked when its
  parent workspace opens — but it can't have a sidebar entry with no permission decision at all).
- A malformed manifest fails loudly with its file path in the error — the loader never silently
  skips a bad manifest.

## Entitlements (`entitlements.json`) — dormant until ~December 2026

`aplicarEntitlements()` in `modulos.js` already exists and is wired into both `main.js` (IPC
registration) and `ipc/sistema.js` (sidebar) — see `GOALS.md`. It reads an optional
`entitlements.json` at the repo root:

```json
{ "modulos": { "relatorios": false } }
```

Only list what's *disabled* — an absent file (the shipped default today) or an absent id both
mean enabled. Disabling a module cascades to anything that `dependeDe` it.

**Everything below this line is the plan for later, not built now** — owner's own instruction:
the code stays open, single-repo, everything enabled, until ~December 2026. Written down now so
the design isn't reinvented or forgotten by then, not because any of it is scheduled work today.

- **What gets gated**: per-module, matching the "sell PDV + Estoque without the rest" pricing
  idea from the original ask — not per-feature inside a module. The manifest's existing `id`s are
  already the right granularity; no new concept needed.
- **How a customer's `entitlements.json` gets generated**: a flat JSON file is trivial to
  hand-write or script from a purchase record — no need for a signed/encrypted license format
  like a commercial licensing SDK would use, *unless* tamper-resistance against the customer's
  own machine becomes a real requirement (a technically inclined customer could just edit the
  file back to `{}`). That's a real gap to close before this goes live for real money, not before
  then — an offline retail POS's threat model (a small store, not a hostile actor with strong
  incentive to crack it) may make this an acceptable risk, but that's a business call for the
  owner to make explicitly when the switch-over actually happens, not a default to assume.
- **Delivery**: whatever's simplest given the eventual sales process — dropped in alongside the
  installer, or generated post-purchase and emailed. Not decided, doesn't need to be yet.
- **What doesn't change**: the DB schema, the IPC contract, the manifest schema itself — none of
  it. The switch-over is "start shipping an `entitlements.json` with some modules set to `false`
  per customer," not a code change to this system.
