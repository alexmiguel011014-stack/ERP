# DESIGN.md — ALLU ERP visual direction

Written 2026-08-19 after the owner asked for a frontend direction that "tira a cara de IA"
(doesn't look AI-generated). Locks tokens here first — per the current, real research on this
exact problem (see Sources) — before any screen gets touched, so every future session pulls
from the same system instead of re-inventing it per file.

## Status: tokens applied, per-screen work still open

**Applied** (2026-08-19, `modules/core/head.js` + `modules/core/navbar.js` — the two shared
files every screen already loads, so this cascades project-wide without touching individual
screens):
- `--cor-primaria`/`--cor-sucesso`/`--cor-erro`/`--cor-destaque` families recolored to the
  palette below, both themes. **Adjustment made during implementation**: the proposal below
  names `--carimbo` (stamp red) as the primary/brand accent, but this app already uses red for
  `--cor-erro` — reusing red for both "normal button" and "error" would be a real usability
  problem (a primary action shouldn't visually read as dangerous). Shipped mapping instead:
  `--cor-primaria` = `--razao` (ledger green), `--cor-erro` = `--carimbo` (stamp red) — keeps
  both colors from the palette, without the collision.
- `--raio`/`--raio-sm` reduced (10px/7px → 6px/4px) — flatter surfaces, less "rounded-lg
  everywhere" (a named AI-slop tell).
- Sidebar active-item indicator: the flat `border-left` accent bar (flagged by name in the
  research as the single most recognizable AI-generated-UI tell) replaced with a small tally-mark
  glyph, overlaid rather than pushing layout.
- Two layout-thrashing transitions fixed: mobile sidebar drawer (`left` → `transform:
  translateX`), admin submenu expand/collapse (`max-height` → `grid-template-rows`, required
  wrapping its items in one `.sidebar-group-inner` div).
- Verified live: ran the app with seeded data, checked sidebar expanded/collapsed, the admin
  group toggle animation, the tally-mark at both sidebar states, and both themes.

**Not applied yet** (deferred, not forgotten):
- Typography (Fraunces/IBM Plex). **Blocked on a real constraint, not just scope**: this is an
  offline-first desktop app (no cloud dependency, works with no internet) — linking Google Fonts
  from a CDN would silently break that guarantee (fonts fail closed to the fallback stack when
  offline, not fatal, but it's a real network dependency in an app whose whole architecture
  promises it doesn't need one). Needs the font files self-hosted in the repo first (download
  the `.woff2` once, ship them, reference via local `@font-face`), not a `<link>` to
  `fonts.googleapis.com`.
- Base page background (the `--papel` cream tone) — each module's own CSS file still sets its
  own hardcoded `body { background-color: #F8FAFC; }` in light mode (dark mode's `body`
  background *is* centralized in `navbar.js` already and would need the same treatment); this
  is genuinely Phase-2-style, one-screen-at-a-time work, same shape as the earlier Frontend
  Visual/UX Fix Pass in `GOALS.md`.
- Chart colors (`CORES` object in each screen's own `.js`, e.g. `modules/relatorios/
  relatorios.js`) — hardcoded hex passed straight to Chart.js configs, not read from CSS custom
  properties, so they didn't pick up the new palette automatically. Still shows the old violet.
- The receipt-tear-off card treatment and the stamp-motif details — not started, per-screen work.

## Original proposal (unchanged below)

**Correction, load-bearing**: the first version of this file grounded the identity in jiu-jitsu
(belt colors, "grau" stripes, gi texture) — wrong. **ALLU is the owner's own generic product,
not a jiu-jitsu app** — the Jiu-Jitsu retail store is only its first client, and the design has
to stay usable/resellable to any kind of retail business. Reworked below to ground itself in
what the *software itself* does — point-of-sale, inventory, bookkeeping — universal to any
store, not any one customer's industry.

## Diagnosis: why the current UI reads as AI-generated

Checked against 2026's own documented "AI slop" tells, not vibes:

> "AI slop is the generic, statistically average look... purple-to-blue gradients,
> gray-bordered cards, the same left sidebar, **Inter for everything**... Three rounded cards in
> a row." — [DesignPixil](https://designpixil.com/blog/ai-slop-design),
> [925 Studios](https://www.925studios.co/blog/ai-slop-design-tells)

This app hits nearly every item: `system-ui`/Segoe UI (Inter-adjacent, zero personality),
`#6D28D9` (Tailwind's own `violet-700` — one of the most-generated "brand colors" in existence),
`.panel`/`.card` nested everywhere with soft `box-shadow` + `border-radius`, a left sidebar with
a flat colored accent bar on the active item. The `impeccable` design hook independently flagged
several of the same tells this session, unprompted: `.sidebar-item.current`'s left-border accent
("the most recognizable tell of AI-generated UIs" — its own words), bounce/elastic easing on the
theme toggle, `max-height`/`width`/`padding-left` transitions (layout-thrashing, also a generic
default). Two independent signals pointing at the same handful of files is a real pattern, not
a coincidence.

**The fix the research itself recommends**: *"Pick a real direction... lock its tokens —
palette, fonts, radius, texture, motion — in a DESIGN.md."* That's this file.

## The subject: what the software does, not who it's sold to

ALLU is a point-of-sale + inventory + bookkeeping tool. That's the actual, permanent subject —
true for the Jiu-Jitsu store today and for whatever store licenses it next. The raw material for
a distinctive identity should come from **the universal vernacular of commerce and
record-keeping** — ledger paper, receipts, rubber stamps, tally marks, carbon-copy forms — not
from any one client's product category. Every retail business that will ever run this app
already recognizes this vocabulary; none of it excludes or mismatches a future client the way a
jiu-jitsu belt system would.

## Token system

### Color — 6 named hexes, grounded in ledger/receipt materials, not decorative

| Token | Hex | Where it comes from |
|---|---|---|
| `--papel` | `#F2ECDD` | Base/light background — aged ledger-paper cream, not clinical `#F8FAFC` hospital-white |
| `--superficie` | `#FFFFFF` | Card/surface white — used sparingly (surfaces only, never the page background) |
| `--tinta` | `#221F1A` | Ink/text + dark-mode base — warm near-black like fountain-pen ink, not Tailwind's cold blue-gray `slate-900` |
| `--carimbo` | `#8B2E2E` | Primary brand accent — rubber-stamp ink red (the "PAGO"/"RECEBIDO" stamp every ledger has), deliberately *not* violet |
| `--razao` | `#2F5233` | Secondary accent / positive state — traditional accounting-ledger green (the columnar-pad green every bookkeeper recognizes) |
| `--grafite` | `#5B5647` | Neutral ink for secondary text/borders — warm graphite, not a pure/cold gray |

Status colors (stock levels, badges, chart categories) get their own small, deliberate scale
derived from these — e.g. `--razao` for healthy/positive, `--carimbo` for attention/overdue,
`--grafite`-tinted neutrals for inactive — instead of a generic red/yellow/green traffic light
bolted on top of an unrelated palette.

### Type — 3 roles, none of them Inter/system-ui

- **Display** (h1, section titles, the big total on PDV): a confident slab/grotesk with the
  weight of a printed form or invoice heading — **Fraunces** (bold, used with restraint — titles
  and the one big number per screen, never body text) or, if a cleaner grotesk reads better in
  testing, **Archivo**. Either way: not Inter, not Space Grotesk (both flagged as "safe" AI
  defaults).
- **Body/UI** (labels, buttons, table headers, everything read all day): a humanist sans built
  for legibility at small sizes, not personality — **IBM Plex Sans**. Chosen over Inter
  specifically because it isn't Inter; equally legible for dense data.
- **Numeric/tabular** (R$ values, SKUs, dates, anything in a table column that needs to align):
  **IBM Plex Mono** with tabular figures — a genuinely functional choice, not decoration. A
  column of prices in true monospace scans faster than proportional digits, which matters on a
  screen read constantly at checkout.

### Layout signature — tally marks, replacing the generic accent bar

The sidebar's active-item indicator (`.sidebar-item.current`'s flat `border-left: 3px solid`,
already flagged by the design hook as the single most recognizable AI tell) becomes a small
**tally mark** — the four-strokes-and-a-slash counting mark used on any real inventory count
sheet, rendered as a tiny fixed glyph next to the active label instead of a colored bar. It's
genuinely universal retail vocabulary (every stockroom clipboard has one), not decorative, and
it doesn't fight with (or require) any particular brand color to read as "selected."

Cards lose the floating drop-shadow-on-white-void look. Flatter surfaces, a single hairline
border (`--tinta` at 12% opacity, not a soft blurred shadow), and — on 1-2 places max, not every
card — a torn/perforated top edge evoking a receipt tear-off, used only where it earns its
keep (e.g. the day's closing summary in Caixa).

### Motion — fixing the two things the hook already caught, project-wide

- Remove `cubic-bezier(0.34,1.56,0.64,1)` (bounce/elastic) everywhere it isn't the one
  deliberately-kept theme-toggle exception already `ignore-value`'d this session — replace with
  a clean `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo), which the research names directly as
  the non-dated alternative.
- Replace the sidebar's `transition: left 0.2s ease, width 0.2s ease` and `padding-left 0.2s
  ease` (layout-thrashing — animates properties that force reflow) with `transform:
  translateX()`/`scale()` equivalents. Same for `.sidebar-group`'s `max-height` expand/collapse
  → `grid-template-rows: 0fr → 1fr` trick, which animates smoothly without ever touching layout.
  Both fixes were already flagged, left un-fixed mid-session as "out of scope for a targeted bug
  pass" — this is where they get scheduled.

## Applying this — incrementally, matching how this project already works

Same discipline already established for the Frontend Visual/UX Fix Pass earlier in `GOALS.md`:
tokens land once (in `modules/core/head.js`'s injected `:root`/`.dark-theme` block and
`modules/core/navbar.js`'s injected stylesheet — the two places every screen already pulls
shared styling from), then each screen picks it up for free without a rewrite, one screen
verified per session rather than a big-bang restyle.

## Sources consulted
- [AI Slop: Why Everything Designed With AI Looks the Same](https://designpixil.com/blog/ai-slop-design)
- [AI Slop Fonts and Gradients: The Tells That Give Away AI Design](https://www.925studios.co/blog/ai-slop-design-tells)
- [Why Your AI-Generated UI Looks Like Everyone Else's](https://medium.com/@Rythmuxdesigner/why-your-ai-generated-ui-looks-like-everyone-elses-and-how-to-break-the-pattern-7a3bf6b070be)
- [AI Slop Design: Why AI-Generated UI Looks Generic (Fix Guide 2026)](https://vibecodekit.dev/ai-slop-design)
- [Why Your AI Keeps Building the Same Purple Gradient Website](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)
- [Slop | Impeccable](https://impeccable.style/slop/)
- Palette/motif hexes above are original design decisions for this proposal, not a claim of any
  external brand's official colors — open to adjustment.
