# Shopee Seller Advisor: decisions and trade-offs (BA case study)

Written 05/11/2026, after Slice F. This is the single place that explains **what we decided, why, and what we gave up**, for business analysts and anyone reviewing the project. It links to the detailed records rather than repeating them. Start at [the docs index](README.md) if you want the full set of documents.

How to read it:

- Sections 1 and 2 give the business problem and the constraints every decision had to respect.
- Section 3 is the decision log: one row per decision, with the business driver, the trade-off accepted and a link to the record.
- Sections 4 and 5 cover what's still open and what we learned along the way.
- Section 6 is a glossary of technical terms in plain language.

## 1. The business problem

Small Vietnamese Shopee sellers, typically a household business with 50–300 products run from a phone ("Chị Lan" in the [discovery summary](discovery/discovery-summary.md#personas)), see revenue in Seller Centre but not **profit per product**. Shopee's fees, vouchers and their own unit costs are spread across separate exports, so a best-seller can quietly lose money.

The product promise: **upload your Seller Centre exports and unit costs, get at most 5 explained actions a week, and see afterwards whether each action paid off.**

What success looks like in a 12-week beta ([metrics](discovery/discovery-summary.md#success-metrics-beta-12-weeks)):

| Metric | Target |
| --- | --- |
| North star | Profit-positive actions per active shop per month |
| Activation (export and costs uploaded within 7 days) | 40% |
| Time to first insight | under 15 minutes |
| Acceptance rate of recommendations | 30% |
| Positive outcome rate at 14 days | 50% |
| Buyer personal data incidents | 0 |
| Numbers in AI explanations that the system didn't compute | 0 |

## 2. Constraints that shaped every decision

| Constraint | Source | What it rules out |
| --- | --- | --- |
| No buyer personal data may leave the seller's browser | Shopee Open Platform data policy (90-day cap if stored), PDP Law 91/2025 | Uploading raw export files, even temporarily |
| Every number shown to a seller is computed, never generated | Risk R5 (wrong advice erodes trust), AI Law 134/2025 | Letting the AI decide actions or write figures |
| Every AI output is labelled as AI-generated | AI Law 134/2025 | Unlabelled AI text anywhere in the UI |
| Nothing changes in Shopee automatically; no scraping | Shopee terms; trust | Auto-repricing, competitor price crawlers |
| Data may have to move to a Vietnamese cloud | Cybersecurity Law 116/2025, open question Q-L1 | Database-vendor-specific features in the data path |
| One owner, learning project, but real users possible | Project brief | Heavy process; it also rules out cutting legal or security corners |

The full legal register is in the [discovery summary](discovery/discovery-summary.md#legal-register-summary--not-legal-advice), and the counsel questions are in [compliance/counsel-questions.md](compliance/counsel-questions.md).

## 3. Decision log

Each row names the decision, the business reason, the trade-off we accepted, and where the full record lives. "ADR" rows have a formal decision record in [`docs/adr/`](adr/).

### 3.1 Product and scope

| # | Decision | Why (business driver) | Trade-off accepted | Record |
| --- | --- | --- | --- | --- |
| P1 | **File upload first; Shopee API sync later (Phase 2)** | Shopee's Open Platform approval may be slow or refused (R3), and individual developers can't apply in Vietnam (Q-D2) | Sellers do a manual export each week; formats are guessed until real files arrive (R2) | [04](design/04-ingestion-parser.md), [ADR-003](adr/ADR-003-browser-side-parsing.md) |
| P2 | **At most 5 actions a week, at most 2 of one kind, one per product** | A phone user acts on a short list; variety keeps it useful | Some valid signals are hidden in a busy week | [05 Prioritise](design/05-recommendation-engine.md#prioritise) |
| P3 | **No recommendations with less than 4 weeks of data**; price advice needs 10+ units in 28 days | Advice from noise destroys trust (R5) | New shops wait a month for their first actions; the demo shop covers that gap | [05 Data sufficiency](design/05-recommendation-engine.md#data-sufficiency-us-05) |
| P4 | **Demo shop with 12 months of synthetic data**, seeded through the real upload path | Sellers can see value before uploading anything; we have no real seller account (R8) | Synthetic data can hide problems real files would show | [04 Synthetic data](design/04-ingestion-parser.md#synthetic-data-and-fixtures) |
| P5 | **Competitor prices are seller-entered** | No scraping, ever (Shopee terms) | Price-gap rules only work for sellers who log competitors | [Discovery](discovery/discovery-summary.md#fixed-decisions-from-discovery) |
| P6 | **Public landing and sign-up pages are indexed by search engines; signed-in pages are not** | Acquisition through search; nothing private is exposed | Pages are visible before the legal pages (privacy policy, terms) exist; those are on the go-live checklist | [STATUS](STATUS.md) |
| P7 | **Vietnamese UI only, English docs and code** | The users are Vietnamese; the builders and reviewers work in English | Translation discipline: all UI text sits in one file (`messages/vi.json`) | [CLAUDE.md](../CLAUDE.md) |

### 3.2 Data, privacy and security

| # | Decision | Why | Trade-off accepted | Record |
| --- | --- | --- | --- | --- |
| D1 | **Files are read and stripped in the browser; we store no file at all** | Buyer data never reaches us, so there's nothing to leak or to delete within legal timelines | A parser bug can't be fixed by re-processing old files; the seller re-uploads. Low-end phones do the parsing | [ADR-003](adr/ADR-003-browser-side-parsing.md) |
| D2 | **Columns are kept by allowlist, not removed by blocklist** | A new buyer column Shopee adds is dropped by default; sellers see the removed columns | Every new useful column needs a parser change and review | [04 Parser contract](design/04-ingestion-parser.md#parser-plugin-contract) |
| D3 | **Order IDs are hashed in the browser with a per-shop salt** | Orders can be matched across files without storing the raw ID | The hash is pseudonymous, not anonymous (we hold the salt), so it's still treated as personal data | [data inventory](compliance/data-inventory.md) |
| D4 | **Neon Postgres in Singapore, with all data access behind one interface and no Neon-only features** | Fast to build now, but a move to a Vietnamese cloud must stay possible (R1) | We can't use some convenient vendor features; an exit runbook and price quote are needed | [ADR-002](adr/ADR-002-neon-singapore-swappable-storage.md), [research](research/vn-cloud-postgres.md) |
| D5 | **Tenant isolation enforced by the database (row-level security), not only by app code** | One shop must never see another's data, even if app code has a bug | Every query runs in a small transaction; every new table needs policies and tests | [ADR-006](adr/ADR-006-drizzle-orm-rls.md) |
| D6 | **Our own authentication (Better Auth) in our own database, rather than a hosted identity provider** | Seller identity stays in the same region and moves with the data; one fewer sub-processor | We own rate limiting, breached-password checks and session rules | [ADR-007](adr/ADR-007-better-auth.md) |
| D7 | **Email through Amazon SES in Singapore** | Same region as the rest; no new country to disclose | More setup (domain verification, leaving the SES sandbox) than simpler US services | [ADR-009](adr/ADR-009-ses-email-and-hibp.md) |
| D8 | **Separate, unticked consents recorded with policy version and text hash** | PDP Law requires provable, granular consent | More sign-up friction; a consent gate for accounts missing a record | [03](design/03-security-privacy.md) |
| D9 | **Uploads go through Next.js server actions, not a public API** | Built-in protection against cross-site requests; no public attack surface for a single caller | Smaller chunks (1 MB request limit) and no external API until one is needed | [ADR-010](adr/ADR-010-ingest-server-actions.md) |
| D10 | **A security reviewer agent checks every risky slice** (database, auth, parsing, AI input, new services) | Real users may come; mistakes here are costly | Extra time per risky slice. It paid off: see section 5 | [CLAUDE.md](../CLAUDE.md) |

### 3.3 Profit, recommendations and AI

| # | Decision | Why | Trade-off accepted | Record |
| --- | --- | --- | --- | --- |
| E1 | **Rules decide; the AI only writes the wording** | Recommendations must be explainable, reproducible and testable (R5) | Wording is constrained to short cards; every rule needs a handwritten Vietnamese template | [ADR-004](adr/ADR-004-rules-first-llm-explains.md) |
| E2 | **Impacts are shown as ranges** (for example "0,9–1,4 triệu ₫ a month"), never one number | Estimates are uncertain; a single figure overpromises | Less "punchy" than a precise promise | [05](design/05-recommendation-engine.md) |
| E3 | **Shopee fees come only from the income report**, not the orders export | Avoids counting fees twice when both files are uploaded | Profit is incomplete until the seller uploads the income report; the UI says so | [04](design/04-ingestion-parser.md) |
| E4 | **Order-level discounts and fees are split across products by revenue share, and the totals match the income report to the đồng** | Sellers must be able to reconcile with Shopee's own report | Allocation is an approximation per product, but the total is exact | [05 Metrics](design/05-recommendation-engine.md#see-metric-definitions-fr-06) |
| E5 | **Fees on cancelled or returned orders are shown separately as "unallocated"** | Spreading them over other products would distort per-product profit | One more line for the seller to understand | [05](design/05-recommendation-engine.md) |
| E6 | **A unit cost entered today also applies to older orders** | Sellers enter costs once and expect their history to show profit | If costs really changed over time, history uses the earliest known cost until the seller adds dated costs | [05](design/05-recommendation-engine.md) |
| E7 | **Products without a cost show revenue but no profit, and are excluded from margin advice**; best-sellers without a cost get a "please enter cost" banner | Wrong costs would produce wrong advice (R6) | Shops that skip costs get less value; the banner is the nudge | [05](design/05-recommendation-engine.md) |
| E8 | **Seven rules in v1**, each tested firing and not firing just short of its threshold (22-scenario "golden set") | Behaviour must be predictable and regression-proof | New rules need scenarios before they ship | [05 Golden set](design/05-recommendation-engine.md#golden-set) |
| E9 | **Confidence learns from outcomes, within limits** (×0.5 to ×1.5) | Rules that work for this shop rise; rules that don't fall | Learning is slow by design, so one bad week doesn't flip advice | [05 Prioritise](design/05-recommendation-engine.md#prioritise) |
| E10 | **Claude Opus 5.5 at low effort, with automatic fallback to another Claude model if a safety check wrongly declines** | Good Vietnamese, structured output, low cost per call (about $0.02 per run) | One AI vendor (Anthropic) as a sub-processor outside Vietnam; terms to confirm before beta (Q-T2) | [ADR-005](adr/ADR-005-claude-llm-provider.md), [06](design/06-llm-integration.md) |
| E11 | **The AI writes `{{placeholders}}` instead of numbers; code fills them in. Any card with a stray digit, number word, promise or markup falls back to the template** | Guarantees zero invented numbers (NFR-AIQ) | Some good AI cards are thrown away by strict checks; the template is always safe | [06 Validation](design/06-llm-integration.md#validation-in-order) |
| E12 | **The product works with no AI at all** (template mode) | Outages, refusals and local development must not break the product | Template text is plainer than AI text | [06](design/06-llm-integration.md) |
| E13 | **The paid live AI test runs only on request (a PR label) or nightly** | Each run costs money | AI wording regressions are caught by the nightly run, not by every change; offline checks run on every change | [06 Evaluation](design/06-llm-integration.md#evaluation) |

### 3.4 Platform and delivery

| # | Decision | Why | Trade-off accepted | Record |
| --- | --- | --- | --- | --- |
| T1 | **One Next.js app plus internal packages** (database, parsers, engine, AI, shared), not microservices | One owner, one deploy; clear seams for later splits | Everything deploys together | [ADR-001](adr/ADR-001-modular-monolith-nextjs.md) |
| T2 | **Background jobs in a Postgres table**, not a queue service | No extra vendor or cross-border disclosure | Needs a paid Vercel plan for scheduled draining; until then, work runs inline (next row) | [ADR-008](adr/ADR-008-postgres-job-queue.md) |
| T3 | **Stay on Vercel's free (Hobby) plan until the beta**; profit is recalculated in the same request as the upload or cost edit | No cost before there are users | Uploads take a little longer; very large shops may need the background job later | [STATUS](STATUS.md) |
| T4 | **"Lean mode": ship in slices, CI is the gate, review only risky changes, update docs only when a contract changes** | The owner judged per-item PRs, reviews and doc updates heavier than needed | Less paperwork per change. Standards stay professional: tests, security review on risky slices, ADRs for decisions | [CLAUDE.md](../CLAUDE.md#how-we-work-lean-mode) |
| T5 | **Tests use a real Postgres engine in memory (PGlite), never a mocked database** | Row-level security and SQL can only be proven against a real database | Slower test runs (about 20 seconds) | [CLAUDE.md](../CLAUDE.md) |
| T6 | **Parsers stay marked "assumed" until 3 real anonymised files pass** | Column names come from memory of Seller Centre, not real exports (Q-D1) | The biggest delivery risk stays open until design partners share files | [04](design/04-ingestion-parser.md) |
| T7 | **Claude may turn on auto-merge only for conflict-free PRs; the owner resolves conflicts** | Keeps a human on the risky part of merging | The owner is a bottleneck when conflicts happen | [CLAUDE.md](../CLAUDE.md#merging-owners-rule) |
| T8 | **A smoke check calls the live site after every production deploy** | A production page once returned errors that CI's build didn't catch | One more workflow to maintain | [STATUS](STATUS.md) |

## 4. What's still open

| Item | Why it matters | Owner |
| --- | --- | --- |
| Real Seller Centre export files (Q-D1) | Both Shopee parsers are assumptions until then (T6) | Owner, design partners |
| Legal answers Q-L1 to Q-L6, especially data localisation and the household-business question | Could force a database move (D4) or incorporation | Counsel |
| Anthropic data location, retention and no-training terms (Q-T2) | Must be in the privacy policy before beta (E10) | Owner |
| Production configuration: database migrations secret, auth and email settings, AI key | Sign-up, uploads and AI wording don't work in production yet | Owner ([STATUS](STATUS.md#waiting-on-the-owner)) |
| Privacy policy, terms and legal pages | Required before the first real seller (P6) | Owner, counsel |
| Weekly run, action cards with the AI label, competitor tracker | Turns the engine into something sellers see (Slice G) | Next slice |
| Outcome measurement, data export and account deletion | Closes the loop on "did it pay off" and data rights (Slice H) | Later slice |

## 5. Lessons learned

Problems caught before they reached a user, and how:

| What happened | Caught by | Lesson |
| --- | --- | --- |
| A product name containing `"` (for example `Tivi 32"`) could shift buyer names and phone numbers into a kept column | Security review of the parsers | Privacy guarantees need adversarial tests, not just happy-path ones |
| The cost and stock templates could run spreadsheet formulas when opened in Excel | Security review | Files we give sellers are an attack surface too |
| One income row produces several fee lines, which would have silently lost fees | Writing the database tests | Write the test against real data shapes before trusting a key design |
| A seller SKU like `0912345678` looked like a phone number and would have blocked that shop's uploads | Security review | Safety checks need false-positive tests as much as true-positive ones |
| "Infinite" stock cover couldn't be stored and would have crashed profit calculation | An integration test | Edge values (zero sales, empty weeks) deserve explicit tests |
| The AI check would have accepted digits written in other scripts (`５`) and number words (`năm triệu`); a first fix then wrongly rejected `tỷ lệ` ("rate") | Security review, then the prompt's own example tests | Language-aware rules need native-language test cases |
| The production home page returned an error that CI's build didn't catch | The owner noticed | Added the post-deploy smoke check (T8) |

Process observations:

- **Discovery IDs paid off.** Requirements (FR-xx), stories (US-xx) and risks (R-x) are cited in code, tests and this log, so a reviewer can trace any decision back to a business need ([traceability](design/09-traceability.md)).
- **Lean mode kept momentum without dropping standards.** Six slices shipped in two days, each with tests and, where risky, a security review.
- **Writing the trade-off down changes the decision.** Several rules were refined while writing the scenarios and docs (for example, the campaign rule only flags products that were profitable before the campaign).

## 6. Glossary

| Term | Meaning here |
| --- | --- |
| Contribution margin (lãi sau phí và giá vốn) | Revenue after the shop's own discounts, minus Shopee fees and unit costs |
| SKU | One sellable product variant |
| Allowlist | Keep only named columns; drop everything else by default |
| Row-level security (RLS) | The database itself filters rows by shop, so app bugs can't leak data |
| Pseudonymous | Not directly identifying, but re-identifiable by whoever holds the key (here, the salt) |
| Placeholder | A named slot like `{{current_price}}` that code fills with a computed value |
| Golden set | Fixed test scenarios with known correct answers, run on every change |
| ADR | Architecture decision record: one decision, its context, consequences and alternatives |
| Slice | One pull request that delivers one user-visible capability (several backlog items) |
| Sub-processor | A vendor that processes our users' data for us (Vercel, Neon, Anthropic, Amazon SES) |
