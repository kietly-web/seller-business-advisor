# Data inventory (record of processing)

Prepared 05/11/2026 · Backlog SA-110 · Source: `packages/db/migrations/` and `docs/design/03-security-privacy.md` · Review whenever a table, field or sub-processor changes

Seller Advisor processes seller business data and seller account data only. Buyer personal data is removed in the seller's browser and never reaches us. Everything below is stored in Neon Postgres, Singapore (`aws-ap-southeast-1`), with transit and logs through Vercel `sin1`. This is a working record for counsel review, not legal advice; legal bases and retention periods marked **counsel** are our current reading.

## Processing purposes

| # | Purpose | Data subjects | Basis (our reading) |
| --- | --- | --- | --- |
| P1 | Provide the service: profit view, recommendations, outcome tracking | Seller (account holder) | Consent `service_processing` (PDP Law 91/2025) — **counsel** whether contract performance applies instead |
| P2 | Anonymised category benchmarks | Seller | Separate opt-in consent `anonymised_benchmarking` |
| P3 | Product news by email | Seller | Separate opt-in consent `marketing` |
| P4 | Security, audit and legal compliance | Seller | Legal obligation (E-commerce Law 122/2025, Cybersecurity Law 116/2025) — **counsel** |

## Data held, by table group

| Data | Tables | Class | Personal data? | Purpose | Retention |
| --- | --- | --- | --- | --- | --- |
| Seller identity: email, name, Google account id, sessions (IP, user agent), 2FA secret | `auth.*` (Better Auth, SA-105) | C2 | Yes (seller) | P1, P4 | Account life; sessions expire |
| Consent decisions with policy version and UI text hash | `app.consent_record` | C2 | Yes | P4 | Account life + 5 years (**counsel**) |
| Data-subject requests and their deadlines | `app.data_request` | C2 | Yes | P4 | Account life + 5 years (**counsel**) |
| Shop profile, members and roles | `app.shop`, `app.shop_member` | C1 / C2 (member user ids) | User ids only | P1 | Account life |
| Uploaded export metadata (file hash, removed column names, counts) | `app.upload`, `app.ingest_stage` (transient) | C1 | No | P1 | Account life; staging emptied at upload end, stale uploads purged after 24 h |
| Products, order lines, fees, traffic, stock | `app.sku`, `app.order_line`, `app.fee_line`, `app.product_traffic`, `app.stock_snapshot` | C1 | No — order ids are salted SHA-256 hashes; no buyer fields exist | P1 | Account life |
| Seller-entered costs and competitor prices | `app.unit_cost`, `app.competitor_listing`, `app.competitor_observation` | C1 | No | P1 | Account life |
| Derived metrics, recommendations, outcomes, rule track records | `app.sku_week_metric`, `app.recommendation_run`, `app.recommendation`, `app.outcome`, `app.rule_track_record` | C1 | No | P1 | Account life; global rule priors kept (no shop link) |
| Audit log (actor user id, action, entity) | `app.audit_log` | C2 | Yes (actor id) | P4 | 24 months minimum (**counsel**) |
| LLM usage (tokens, latency, cost, validation result — no prompt or response bodies) | `app.llm_call` | C1 | No | P4 | 13 months |
| Background jobs | `app.job` | C1 | No | P1 | Done jobs purged after 30 days (to implement with retention job) |

Not held anywhere: buyer name, phone, email, address, username, notes or raw Shopee order ids (C3). Enforced by the parser allowlist (`docs/design/04-ingestion-parser.md`), a server-side PII value scan, and the `order_hash` format check in the database.

## Recipients and transfers

| Recipient | Data | Location | Transfer type |
| --- | --- | --- | --- |
| Vercel (hosting) | C1, C2 in transit and logs | Singapore | Cross-border |
| Neon (database) | C1, C2 at rest | Singapore | Cross-border |
| Anthropic (LLM) | Per-SKU aggregate facts and product names only | Outside Vietnam, to confirm (Q-T2) | Cross-border |
| Google (sign-in) | Email, name | Global | Cross-border |
| Email provider (Q-I2, undecided) | Email address, message content | To decide | Cross-border unless VN-hosted |

A transfer impact assessment covering these recipients is due within 60 days of starting processing (SA-508; **counsel** for timing and form).

## Rights handling

Access and correction are self-serve (all data is visible and editable in the app); export streams a ZIP on request; deletion locks the account at once and hard-deletes after a 7-day undo window, within the 20-day limit. Deadlines are set by a database trigger on `app.data_request` (SA-102) and monitored daily (SA-503).

## Change log

| Date | Change |
| --- | --- |
| 05/11/2026 | First version, from migrations 0000–0003 |
