# REPERTOIRE.md — ALLU ERP

Domain-knowledge briefing, not a build plan (that's `GOALS.md`'s job). Researched 2026-08-19 at
the owner's explicit request: *"pesquise a respeito como é feito um balanço de caixa real...
procure também na questão contábil e financeiro coisas que o sistema não tem mas deveria ter,
para funcionar exatamente como um sistema ERP de verdade."* Three lenses, confirmed with the
owner before researching: (1) real accounting/financial practice, (2) Brazilian tax/regulatory
requirements for small retail, (3) what real Brazilian small-business ERPs (Bling/Tiny/Omie/
ContaAzul) actually ship in their financial modules. Cultural/media lenses skipped — this is an
internal B2B management tool, not a consumer-facing product with cultural stakes.

Each section ends in its own **Sources consulted** list, same convention as `GOALS.md`.

---

## 1. Real accounting/financial practice for small retail

**DRE (Demonstração do Resultado do Exercício) and fluxo de caixa are two different, both
necessary, reports — not the same thing done twice.** DRE follows **regime de competência**:
it records revenue and expense when they're *earned/incurred*, not when cash actually moves.
Fluxo de caixa records the opposite — actual money in, actual money out, regardless of when the
underlying sale or expense was recorded. **DRE answers "is the business profitable?" Fluxo de
caixa answers "will there be money in the account to pay what's due?"** A healthy small business
tracks both: DRE monthly, fluxo de caixa weekly (or, for a POS-fed retail operation, effectively
daily via the caixa-fechamento cycle this project already has).

**DRE simplificado structure** (top to bottom, each line subtracting from the one above):
Receita Bruta (total sales) → (–) Deduções (ICMS/ISS/PIS/COFINS on the sale, devoluções,
descontos incondicionais) → Receita Líquida → (–) CMV/CSV (custo da mercadoria vendida) →
Lucro Bruto → (–) Despesas Operacionais (custos fixos: aluguel, salários, contas) → Lucro
Operacional → (–) Impostos sobre o lucro → **Lucro Líquido**. A small business doesn't need the
full corporate DRE (no depreciação/amortização line typically) — the simplified version above is
the actual practitioner standard for this business size.

**Markup vs. margem de contribuição are not interchangeable, and confusing them is the single
most common small-retail pricing mistake found in this research.** A markup of 50% on cost is
*not* a 50% margin — it works out to a ~33% margin on the sale price. **Margem de contribuição**
= (preço de venda) – (custos variáveis: CMV + comissão + taxa de gateway/adquirente + impostos
sobre a venda) — it's what's actually left over per unit to pay fixed costs and generate profit,
and it's the number that should drive per-product pricing decisions, not a flat markup multiplier
applied uniformly. 2026 context found in this research: Brazilian retail closed 2025 with a real
1% revenue contraction — when revenue isn't growing, knowing exactly what each product
contributes to fixed costs stops being a spreadsheet nicety and becomes the actual lever for
staying profitable.

**Ponto de equilíbrio (break-even)** = Custos fixos totais ÷ Margem de contribuição unitária
média. Answers "how much do I need to sell this month before I stop losing money and start
profiting?" — a number a store owner should be able to see at a glance, not calculate by hand
each month.

**Giro de estoque (inventory turnover)** measures how many times stock is sold and replaced in a
period; `365 ÷ número de giros no ano` gives the average days-to-resupply. Low turnover on a SKU
is dead capital sitting on a shelf; the metric exists specifically to catch that before it becomes
a write-off.

**Curva ABC** classifies SKUs by their share of a chosen metric (typically faturamento or
margem): roughly the top 20% of SKUs (Classe A) drive ~80% of the value, the next 30% (Classe B)
drive ~15%, and the remaining 50% (Classe C) drive only ~5%. Retail practice: recalculate every
3 months for seasonal/fashion-driven inventory, every 6 months for stable-demand categories — a
Jiu-Jitsu store's mix (kimonos/faixas = fairly stable demand, but seasonal promotional items
could exist) sits closer to the 6-month cadence for most of its catalog.

### Sources consulted
- [Fluxo de Caixa para Pequenas Empresas em 2026](https://rcontabilidadepa.com.br/fluxo-de-caixa-para-pequenas-empresas/)
- [DRE — Guia completo (eGestor)](https://blog.egestor.com.br/dre/)
- [DFC 2026: como montar a Demonstração de Fluxo de Caixa](https://www.ledware.com.br/2026/06/06/dfc-demonstracao-fluxo-caixa-2026/)
- [Modelo de DRE: Estrutura e Exemplo Pronto em 2026 (Contmatic)](https://simplifique.contmatic.com.br/blogs/modelo-de-dre)
- [DRE para Pequenas Empresas (EmpresaPro)](https://www.empresapro.com.br/blog/07-financeiro/dre-para-pequenas-empresas/)
- [Como calcular a margem de contribuição de produtos (Zoop)](https://www.zoop.com.br/blog/gestao/como-calcular-a-margem-de-contribuicao)
- [Margem de contribuição: fórmula e exemplos práticos (InfoPrice)](https://www.infoprice.co/blog/margem-de-contribuicao/)
- [Margem de Contribuição e Ponto de Equilíbrio (Porter Contabilidade)](https://portercontabilidade.com.br/margem-de-contribuicao-e-ponto-de-equilibrio-como-calcular/)
- [Precificação Estratégica (OSP Contabilidade)](https://ospcontabilidade.com.br/blog/recuperar-margem-lucro-precificacao/)
- [Giro de estoque: como calcular (Inovar)](https://www.inovarsistemas.com/blog/giro-de-estoque)
- [Curva ABC de Estoque: Como Calcular e Aplicar (Sults)](https://www.sults.com.br/blog/curva-abc-de-estoque/)
- [Curva ABC de estoque (Bling)](https://blog.bling.com.br/curva-abc-estoque/)
- [Entenda o cálculo da curva ABC (Hiper)](https://hiper.com.br/blog/calculo-da-curva-abc/)

---

## 2. Brazilian tax/regulatory context for small retail (2026)

**MEI vs ME/EPP have genuinely different obligations — this matters directly for whether this
store needs bookkeeping the app doesn't yet support.** MEI has dispensa (exemption) from formal
escrituração contábil. ME/EPP (a step up from MEI) must follow the Código Civil's bookkeeping
requirements and keep real accounting records. **Which one applies to this specific store is a
fact only the owner knows** (relevant to the still-paused Payment Processor Integration decision
too, per `GOALS.md` — Banco Inter's API access is also gated on MEI-vs-PJ status) — this section
documents the *rule*, not this store's actual registration.

**NFC-e (Nota Fiscal de Consumidor Eletrônica, modelo 65) is the standard fiscal document for
in-person retail sales in Brazil** — it replaced the old cupom fiscal. As of this research
(2026): **MEI is, as a general rule, still exempt from issuing a fiscal document on a sale to a
final consumer (pessoa física) unless the customer explicitly requests one** — sales to a CNPJ,
or to a pessoa física who asks, are mandatory regardless of MEI status. **This is expected to
change**: LC 214/2025 provides for a gradual expansion of mandatory fiscal-document issuance, and
market expectation (per the sources below) is that from **2027** NFC-e/NFS-e will be required on
consumer sales even without a request. Separately, since 2025-04-01, NF-e/NFC-e issuance requires
the **CRT 4** (Código de Regime Tributário) field, specific to MEI. **Direct relevance to this
project**: `AGENTS.md` already documents NF-e/NFC-e as "fora de escopo" for the ERP itself
(manual/external issuance instead) — that line was already flagged as needing reconciliation
once `integracoes/fiscal/` (FocusNFe) landed; this research adds urgency: if this store is MEI
today but expects to cross into ME/EPP, or if 2027's rule change lands, the "fora de escopo"
decision will need revisiting on a real deadline, not indefinitely.

**Regime de Caixa under Simples Nacional**: since 2009, Simples Nacional optantes may choose to
calculate and pay the **DAS** (the unified Simples Nacional tax bill) based on money actually
*received*, not on the value of fiscal documents issued — i.e., DAS follows cash-in, not
invoice-date. **The documented failure mode is exactly a fluxo-de-caixa problem**: businesses
that confuse "faturei" (invoiced) with "recebi" (received cash) end up calculating and paying DAS
too early, straining cash flow they don't actually have yet. **This makes accurate,
real-time fluxo de caixa a *tax-compliance* tool, not just a nice-to-have management report** —
getting the regime de caixa timing wrong isn't just bad bookkeeping, it's a real risk of
overpaying tax ahead of actual cash availability.

**Conciliação bancária** (matching bank-statement entries against fiscal documents/receivables)
is the mechanism that lets a Simples Nacional optante on regime de caixa actually *prove* to
Receita Federal when money was received, which is the entire basis for the regime de caixa DAS
calculation. This is the same territory `GOALS.md`'s paused "Payment Processor Integration"
section is already circling (Ton .xlsx import + reconciliation) — that work isn't just a
convenience feature, it's close to a compliance requirement if this store ever uses regime de
caixa.

### Sources consulted
- [Obrigações mensais da ME no Simples Nacional: guia 2026 (Agilize)](https://agilize.com.br/artigos/obrigacoes-contabeis-mensais-simples-nacional/)
- [Guia de contabilidade para ME no Simples Nacional (Agilize)](https://agilize.com.br/artigos/contabilidade-me-simples-nacional-rj/)
- [Obrigatoriedade da Contabilidade no Simples Nacional (eSimples Auditoria)](https://www.esimplesauditoria.com/obrigatoriedade-contabilidade-simples-nacional)
- [Nota fiscal do MEI em 2026: quando é obrigatório emitir (ACIES Contabilidade)](https://www.blog.aciescontabilidade.com.br/post/nota-fiscal-mei-2026-quando-obrigatorio-como-emitir-nfse)
- [Como emitir nota fiscal MEI em 2026 — NF-e, NFS-e e NFC-e (Bananasoft)](https://bananasoft.ai/blog/como-emitir-nota-fiscal-mei-2026)
- [Nota Fiscal para MEI: quando emitir, tipos e passo a passo (eGestor)](https://blog.egestor.com.br/nota-fiscal-para-mei-entenda-como-elas-funcionam/)
- [O Regime de Caixa no Simples Nacional (Contábeis)](https://www.contabeis.com.br/artigos/3651/o-regime-de-caixa-no-simples-nacional)
- [Simples Nacional na prática: DAS, Fator R e Regime de Caixa (Jettax)](https://www.jettax.com.br/blog/simples-nacional-na-pratica-como-um-software-cuida-do-das-fator-r-e-regime-de-caixa/)
- [Simples Nacional no Regime de Caixa: DAS e fluxo de caixa (Contabilidade Cidadã)](https://contabilidadecidada.com.br/simples-nacional-no-regime-de-caixa/)
- [Regime de caixa: o que é, como funciona (Conta Azul)](https://contaazul.com/blog/regime-de-caixa/)

---

## 3. What real Brazilian small-business ERPs ship in their financial modules

Compared against Bling, Tiny, Omie, and ContaAzul — the four most-cited real, shipping
Brazilian small-business ERPs found in this research, price range **R$ 220–1.800/mês** depending
on tier (this project is offline/self-hosted with no subscription, a structurally different cost
model worth keeping in mind rather than feature-matching line for line).

**Positioning differs, but every one of the four treats these as baseline, not premium, features**:
- **Omie** — most complete on gestão fiscal/contábil (ships with accountant integration);
  **DRE, fluxo de caixa projetado, and automatic bank reconciliation work natively inside the
  same system**, not as an add-on.
- **Tiny** — strong e-commerce/marketplace integration; still ships **DRE and performance
  indicator tracking** as a standard reporting module.
- **Bling** — the market's de facto standard for PME B2B up to ~R$2M/mês revenue; leads on
  marketplace/e-commerce integration and fiscal operation, not specifically on financial depth.
- **ContaAzul** — prioritizes financial/accounting management specifically over e-commerce reach.

**The common denominator across all four — and the clearest signal for what "a real ERP" means
in this market — is that DRE, projected fluxo de caixa, and bank reconciliation are treated as
core, not optional, financial-module features.** None of the four ships pricing/markup tooling
without also shipping the DRE/fluxo-de-caixa layer that tells the owner whether those prices are
actually working.

### Sources consulted
- [Bling vs Tiny vs Omie em 2026: qual ERP escolher (Cierus)](https://www.cierus.com.br/news-details.php?slug=bling-vs-tiny-vs-omie-qual-erp-escolher)
- [Tiny vs Bling vs Conta Azul vs Omie: comparativo honesto pra PME em 2026 (Adrion)](https://adrion.com.br/blog/tiny-bling-conta-azul-omie-comparativo-honesto-pme/)
- [Bling vs Tiny vs Omie vs ContaAzul: comparativo honesto 2026 (Clareza Gestão)](https://clarezagestao.com/comparativo-bling-tiny-omie-contaazul)
- [ERP 2026: Conta Azul vs Omie vs Bling vs Tiny (Dinheiro da Minha Empresa)](https://dinheirodaminhaempresa.com/comparativos/erp-conta-azul-omie-bling-tiny-2026/)
- [Conta Azul, Omie, Nibo ou Bling? comparativo (Multise)](https://multise.com.br/conta-azul-omie-nibo-ou-bling-comparativo-entre-os-erps-mais-usados-por-pmes/)

---

## Gap analysis against this project (cross-checked against `db/financeiro.js`,
## `db/precificacao.js`, `db/schema.js` as of 2026-08-19 — not guessed)

**Already has, confirmed by reading the actual code, more than expected going in:**
- `getDRE()` (`db/relatorios.js`) — real, complete simplified DRE (receita bruta → deduções →
  receita líquida → CMV → lucro bruto → despesas → lucro líquido, + margem bruta/líquida %),
  wired end-to-end (`ipc/relatorios.js`'s `get-dre` → `modules/relatorios/relatorios.js`, with
  chart and PDF export).
- `getFluxoCaixa()` (`db/financeiro.js`) — real fluxo de caixa exists.
- `custo_fixo_mensal` rateio into per-product pricing, `aplicar_custo_fixo` toggle,
  `getGlobalMargin`/`saveProductMargin`/`saveProductCost` (`db/precificacao.js`) — real
  cost/margin-based pricing exists, not just a flat markup field.
- `getFaturamentoMedioHistorico()` — historical revenue averaging exists.
- Curva ABC export already exists in the UI (`modules/relatorios/` — "Exportar ABC (CSV)" button,
  confirmed visible in this session's own screenshots).
- `FechamentosCaixa` table — daily caixa open/close with `valor_esperado`/`valor_informado`/
  `diferenca` — this is the operational backbone real fluxo de caixa needs.
- Fiscal fields already on `Produtos` (`ncm`, `cfop_padrao`, `csosn`) — schema is ready for NFC-e
  even though issuance itself is out of scope today.

**Correction (2026-08-19, caught during the `/newgoal` pass that reads this file): DRE
already exists.** The first version of this section claimed DRE was missing — wrong; I'd
grepped `db/relatorios.js` but never actually opened it before writing that line. It has a real,
complete, working `getDRE()` (receita bruta → deduções → receita líquida → CMV → lucro bruto →
despesas → lucro líquido, plus margem bruta % and margem líquida %), wired end-to-end through
`ipc/relatorios.js`'s `get-dre` handler to `modules/relatorios/relatorios.js` (chart, PDF export,
the works). Leaving this correction visible rather than silently editing the claim away, since a
wrong "missing" claim in this file could have sent a future build effort at something that
already exists.

**Genuinely missing, per this research** (re-verified by reading the actual files, not just
grepping for the term) — what a store operating under regime de caixa specifically would still
need before this qualifies as "funciona exatamente como um ERP de verdade":
- **No margem de contribuição as a distinct, surfaced metric.** Cost and margin per product exist
  (`db/precificacao.js`), but margem de contribuição specifically (price − *all* variable costs,
  including comissão/taxa de adquirente/impostos sobre a venda — not just custo do produto) isn't
  computed or shown as its own number anywhere found.
- **No ponto de equilíbrio calculation.** The two inputs it needs (custo fixo mensal, margem de
  contribuição) both already exist in the data model — this is close to free to add, not a new
  data-collection project.
- **No giro de estoque metric.** `MovimentacoesEstoque` has the raw data to compute it; the
  calculation itself isn't surfaced anywhere found.
- **No DAS/regime-de-caixa provisioning or reminder.** Given the documented failure mode (paying
  DAS before the cash it's based on actually arrived) is specifically a fluxo-de-caixa timing
  problem, and this app already has real fluxo de caixa, this is a plausible, scoped addition —
  not a full tax-filing feature, just surfacing "this much is likely owed on the next DAS, timed
  against what's actually been received" using data the app already has.
- **Bank reconciliation is still the paused Ton `.xlsx` import feature** in `GOALS.md` — this
  research reinforces that it's not just a nice-to-have (every one of the 4 competitor ERPs ships
  it as core), and ties it directly to the regime-de-caixa compliance story above, not just
  bookkeeping convenience.

**Not flagged as gaps** (deliberately out of scope per existing project decisions, unaffected by
this research): NF-e/NFC-e issuance itself (`AGENTS.md`'s documented scope decision stands, though
the 2027 regulatory change above gives it a future deadline worth another look, not urgency now)
and payment-processor API integration (already a separate, explicitly paused decision).
