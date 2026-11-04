# Discovery summary (source of truth for IDs)

Condensed from `Shopee Seller Advisor — BA Discovery Pack.docx` (3 Nov 2026) and the matching Claude Doc. The .docx stays the full record; this file holds the IDs that design, code and tests cite. If the two disagree, update this file and note it in the change log below.

## Product in one line

An AI decision assistant that turns a Vietnamese Shopee seller's own exported data, plus their unit costs, into at most 5 ranked, explained actions a week, and measures whether each accepted action paid off.

## Personas

| Persona | Scope | Profile |
| --- | --- | --- |
| Chị Lan, owner-operator | MVP primary | Household business (hộ kinh doanh), 50–300 SKUs, Shopee only, works from a phone |
| Anh Minh, shop operator | MVP secondary | Small brand, 3–10 staff, Shopee + TikTok Shop, weekly team review |
| Hà, agency operator | Phase 3 | Runs 3–10 client shops; needs multi-shop and white-label |

Not targeted: Mall brands with in-house BI; Chinese cross-border sellers.

## Fixed decisions from discovery

- Next.js on Vercel; Neon Postgres in Singapore (`aws-ap-southeast-1`).
- Vietnamese UI (vi-VN default), English documentation.
- Phase 1 data = Seller Centre exports (XLSX/CSV) uploaded by the seller. Buyer personal data is stripped **in the browser** before upload. Order IDs are hashed.
- Competitor prices are seller-entered. No scraping, ever.
- Nothing changes inside Shopee automatically. The seller approves and performs every action.
- Rules compute the numbers; the LLM only explains them. Every number shown was calculated, not generated.
- Shopee Open Platform adapter is Phase 2 and writes into the same canonical model.
- Storage must stay swappable until counsel answers the data-localisation question (risk R1).

## Functional requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-01 | Sign up with email or Google; verify email | Must |
| FR-02 | Capture separate, unticked consents; store who, what, when and policy version | Must |
| FR-03 | Upload XLSX or CSV exports; detect type; preview column mapping; reject unknown formats with a clear message | Must |
| FR-04 | Remove buyer personal data columns in the browser before upload and show the seller what was removed | Must |
| FR-05 | Bulk-upload unit costs from a template; edit inline | Must |
| FR-06 | Compute weekly per-SKU revenue, fees, discounts, cost of goods, contribution margin, units and stock cover | Must |
| FR-07 | Generate up to 5 ranked recommendations weekly and on demand | Must |
| FR-08 | Show evidence, impact range, confidence and the data used on every recommendation | Must |
| FR-09 | Accept, dismiss with reason, or mark done; measure outcome at 7 and 14 days | Must |
| FR-10 | Competitor tracker with listing link, price and date; raise price-gap signals | Must |
| FR-11 | Self-serve data export and account deletion | Must |
| FR-12 | Demo shop mode with synthetic data | Must |
| FR-13 | Vietnamese ask-your-data chat limited to the seller's own data | Should |
| FR-14 | Discount what-if simulator | Should |
| FR-15 | Weekly email digest | Should |
| FR-16 | Shopee Open Platform OAuth sync | Phase 2 |

Won't (MVP): changing anything in Shopee automatically; scraping; TikTok Shop and Lazada; multi-shop agency view; paid plans. Could: Zalo digest.

## Non-functional requirements

| ID | Area | Target |
| --- | --- | --- |
| NFR-SEC | Security | OWASP ASVS Level 2; TLS everywhere; encryption at rest; secrets only in env config; row-level security per tenant; rate limiting; audit log; dependency scanning; optional MFA |
| NFR-PRIV | Privacy | No buyer personal data stored; data-subject requests within Decree 356 timelines; 72-hour breach notification runbook |
| NFR-PERF | Performance | Dashboard p95 < 2 s on 4G for 50,000 order lines per quarter; 20 MB file parsed in < 30 s |
| NFR-AVAIL | Availability | 99.5% monthly during beta |
| NFR-A11Y | Accessibility | WCAG 2.2 AA |
| NFR-L10N | Localisation | vi-VN default; VND as `1.234.000 ₫`; dates `dd/MM/yyyy`; `Asia/Ho_Chi_Minh` |
| NFR-OBS | Observability | Structured logs, error tracking, LLM cost and latency per request |
| NFR-AIQ | AI quality | Zero numbers in explanations that are absent from the payload, checked on every golden-set run |
| NFR-MAINT | Maintainability | TypeScript strict, automated tests in CI, versioned migrations |

## User stories (Gherkin acceptance criteria in the .docx)

| ID | Story | Key acceptance points |
| --- | --- | --- |
| US-01 | Choose exactly what I consent to | Separate unticked boxes; submit blocked without required consent; consent record with timestamp + policy version |
| US-02 | Upload my Seller Centre order export | Type detected; mapping preview; buyer columns removed before upload and listed; unknown format explained with guide link |
| US-03 | Add unit costs in bulk | Template with my SKUs; costs saved per SKU; SKUs missing cost flagged and excluded from margin rankings |
| US-04 | See true profit per SKU each week | Revenue, fees, discounts, COGS, contribution margin; every number links to its source rows |
| US-05 | Short list of actions each Monday | ≥ 4 weeks of data → ≤ 5 ranked actions with evidence, impact range, confidence, AI label; less data → insufficient-data message |
| US-06 | Know whether an action worked | Done action shows units and margin change vs baseline at 7 and 14 days; counts toward the rule's track record |
| US-07 | Log competitor prices | Saved with date; gap to competitor median beyond threshold can raise a pricing signal |
| US-08 | Delete my account and data | Immediate acknowledgement; all data deleted within 20 days; confirmation message |

## Success metrics (beta, 12 weeks)

North star: profit-positive actions per active shop per month (accepted recommendations whose 14-day margin beat the baseline).

| Metric | Target |
| --- | --- |
| Activation (export + costs uploaded within 7 days of sign-up) | 40% |
| Time to first insight (median) | < 15 min |
| Weekly engagement | 60% |
| Acceptance rate | 30% |
| Positive outcome rate (14 days) | 50% |
| Explanation trust (1–5) | 4.0 |
| Week-4 retention | 40% |
| Buyer personal data incidents | 0 |
| Explanation numbers not in payload (golden set) | 0 |

## Risks

| ID | Risk | L | I | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | Data localisation forces a hosting redesign | M | H | Legal opinion; storage behind an interface; quote a Vietnamese cloud |
| R2 | Export formats change and break parsing | H | M | Versioned parsers, format detection, sample library, alert on unknown columns |
| R3 | Open Platform approval slow or refused | M | M | Upload path is a complete product |
| R4 | Shopee ships a native AI advisor | H | H | Cost-aware profit, outcome tracking, cross-platform |
| R5 | Wrong recommendations erode trust | M | H | Rules first, visible confidence, insufficient-data state, public track record |
| R6 | Sellers won't enter unit costs | M | H | Template, category defaults, partial value from fees/discounts alone |
| R7 | LLM cost grows faster than revenue | L | M | Small aggregate payloads, caching, smaller model for phrasing |
| R8 | No own seller account to test with | H | M | Design partners; demo dataset |

## Legal register (summary — not legal advice)

| Rule | In force | Design response |
| --- | --- | --- |
| PDP Law 91/2025/QH15 + Decree 356/2025/ND-CP | 1 Jan 2026 | Consent ledger; DSR timers (ack 2 working days, access/correct 10 days, withdraw 15, delete 20); transfer impact assessment within 60 days; data inventory; breach runbook |
| Cybersecurity Law 116/2025/QH15 | 1 Jul 2026 | Localisation may apply → swappable storage, VN cloud fallback priced |
| E-commerce Law 122/2025/QH15 | 1 Jul 2026 | Audit logs, traceability; Vietnamese terms, privacy policy, complaint channel |
| AI Law 134/2025/QH15 | 1 Mar 2026 | Label every AI output; classification memo (likely low, medium once chat ships); seller approves every action |
| Shopee Open Platform Data Protection Policy | Current | Never store buyer personal data (90-day cap otherwise) |
| Shopee terms on data collection | Current | Competitor data seller-entered only |

## Open questions carried into design

- Q-L1 Is a seller-analytics SaaS an enumerated service under the Cybersecurity Law localisation rules? (counsel)
- Q-L2 E-commerce support service provider? Data-processing service provider under Decree 356? (counsel)
- Q-L3 AI Law tier: low, or medium once chat ships? (counsel + memo)
- Q-D1 Which Seller Centre exports exist, and which columns? (seller samples) — design proceeds on assumed columns, see `docs/design/04-ingestion-parser.md`
- Q-D2 Shopee Vietnam ISV requirements for a household business
- Q-B1 Shopee-only seller counts by GMV band
- Q-B2 Willingness to pay and pricing model
- Q-T1 LLM provider and processing location → **decided: Claude (Anthropic)**, see ADR-005; processing location still to confirm

## Change log

| Date | Change |
| --- | --- |
| 2026-11-04 | Created from the discovery pack; Q-T1 provider decided (Claude) |
| 2026-11-04 | Retention changed from "raw files deleted within 7 days" to "no file bytes stored at all" (ADR-003) |
