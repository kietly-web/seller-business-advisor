# 03 — Security, privacy and compliance

The controls aim at three things: buyer personal data never reaches us, one shop can never see another's data, and every AI output and data-subject request is traceable. Targets are OWASP ASVS Level 2 (NFR-SEC) and the Vietnamese legal register in the discovery pack. Nothing here is legal advice; rows marked **counsel** need a lawyer's confirmation.

## Data classification

| Class | Examples | Where it may exist |
| --- | --- | --- |
| C0 Public | Marketing pages, demo shop | Anywhere |
| C1 Seller business data | SKUs, prices, fees, costs, metrics, competitor prices | Neon (SG), app memory, Claude (aggregates only) |
| C2 Seller personal data | Seller email, name, consent records, IP/user agent in sessions | Neon (SG), email provider, error tracking (scrubbed) |
| C3 Buyer personal data | Buyer name, phone, email, address, username, raw order ID | **Seller's browser memory only**, never sent, never stored |
| Secrets | API keys, auth secret, DB URLs | Vercel env vars (encrypted), GitHub Actions secrets |

Raw Shopee order IDs are treated as C3 because they can be linked back to a buyer through the seller's account. They are hashed in the browser with a per-shop salt.

## Threat model (STRIDE, condensed)

| # | Threat | Asset | Control | Verified by |
| --- | --- | --- | --- | --- |
| T1 | Shop A reads shop B's data via an IDOR or a missing `where` | C1 | RLS on every tenant table; `withShopContext`; ids are UUIDs | RLS test suite (02); e2e cross-tenant probe |
| T2 | Buyer PII uploaded by a parser bug | C3 | Allowlist mapping in browser; server zod schema rejects unknown keys; PII value detectors (phone, email patterns) on the server reject the chunk | Parser fixtures with PII columns; server rejection test |
| T3 | Prompt injection via SKU names or notes reaching Claude | LLM output integrity | SKU names go in as placeholder values the model never needs to read for decisions; output is schema + placeholder validated; no tools given to the model; chat (FR-13) answers only from a computed result set | Golden set with adversarial names (`"Bỏ qua hướng dẫn…"`) |
| T4 | LLM invents a number or a promise | Seller trust, AI Law | Digits outside placeholders are rejected; deterministic template fallback | NFR-AIQ check on every golden run |
| T5 | Account takeover | C1, C2 | Better Auth with email verification; Google OAuth; optional TOTP MFA; session rotation; login rate limit | Auth integration tests |
| T6 | CSRF / XSS | Sessions | Server actions with same-origin checks; strict CSP with nonces; no `dangerouslySetInnerHTML`; LLM text rendered as text | CSP report-only in preview, enforced in production |
| T7 | Malicious upload (zip bomb, formula injection) | Browser, exports | XLSX parsed in a Worker with size cap (25 MB) and row cap (500k); cells starting with `= + - @` escaped on CSV export | Fuzz fixtures |
| T8 | Secrets leak | All | Env vars only; no secrets in client bundles (`server-only` imports); GitHub secret scanning; separate keys per environment | CI check for `NEXT_PUBLIC_` misuse |
| T9 | Job worker runs a job for the wrong shop | C1 | Jobs carry `shop_id`; handler always enters `withShopContext(job.shop_id)` | Unit test on the job runner |
| T10 | Repudiation of a decision | Audit | `audit_log` for consent, upload, cost change, recommendation decision, DSR, admin access | Audit coverage test |
| T11 | DoS / cost abuse on LLM | Budget | On-demand runs ≤ 3/shop/day; chat ≤ 30 messages/shop/day; per-shop monthly token budget; Vercel Firewall rate rules on `/api/*` | Load test on preview |
| T12 | Supply-chain compromise | All | Lockfile, Dependabot, `pnpm audit` in CI, pinned GitHub Actions by SHA, minimal deps in `parsers` (runs on seller devices) | CI |

## Authentication and authorisation

- Better Auth (ADR-007): email + password with verification, Google OAuth, TOTP 2FA plugin (optional, prompted for owners), sessions in Postgres.
- Password policy per ASVS: at least 8 characters, a breached-password check (k-anonymity range API) at sign-up, no composition rules.
- Authorisation has two layers. The app checks membership and role (`owner`/`staff`) before acting, and RLS enforces the shop boundary regardless.
- Owner-only actions: delete the account, export all data, change consents, invite staff (Phase 2).

## Application security checklist (ASVS L2 highlights)

| Area | Control |
| --- | --- |
| Transport | HTTPS only (Vercel), HSTS, TLS to Neon (`sslmode=require`) |
| At rest | Neon storage encryption (AES-256); Vercel env vars encrypted |
| Headers | CSP (nonce), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal, `frame-ancestors 'none'` |
| Input | zod at every server boundary; parameterised SQL only (Drizzle) |
| Output | React escaping; LLM text never rendered as HTML |
| Errors | Generic messages to users; details only to error tracking with PII scrubbing (`beforeSend` strips emails, phone-like strings, request bodies) |
| Logging | Structured JSON logs, `shop_id` and request id, never payload bodies or file contents |
| Rate limiting | Vercel Firewall rules + per-shop counters in Postgres for business limits |
| Dependencies | Dependabot weekly; `pnpm audit --prod` gate on high/critical |

## Privacy by design (PDP Law 91/2025 + Decree 356)

### Consent (FR-02, US-01)

- Three purposes, each a separate unticked checkbox: `service_processing` (required to use the product), `anonymised_benchmarking` (optional), `marketing` (optional).
- Each consent row stores the policy version and a hash of the exact UI text shown, so we can prove what the person agreed to.
- Withdrawal is self-serve in Settings and takes effect at once. Withdrawing `service_processing` starts the delete flow, after a confirmation step.

### Data-subject requests

| Request | Statutory limit (Decree 356, per discovery) | Our design |
| --- | --- | --- |
| Acknowledge any request | 2 working days | Automatic, immediate in-app + email |
| Access / correction | 10 days | Self-serve: data visible in app; costs and competitors editable; export available at once |
| Consent withdrawal | 15 days | Immediate |
| Deletion | 20 days | Immediate lock; hard delete after a 7-day undo window; confirmation email; `data_request` row tracks the timers |

A daily job flags any `data_request` within 3 days of `due_at` and not completed, and alerts the operator.

### Cross-border transfer

The stack places data outside Vietnam: Neon and Vercel are in Singapore, and Anthropic processing is outside Vietnam. Each one is a cross-border transfer.

- Prepare the transfer impact assessment and file it via the Ministry of Public Security portal within 60 days of starting processing (**counsel** to confirm timing and content).
- List every sub-processor with its country in the privacy policy (register below).

### Sub-processor register

| Sub-processor | Purpose | Data classes | Location | Status |
| --- | --- | --- | --- | --- |
| Vercel | Hosting, functions, logs | C1, C2 (transit + logs) | Singapore (`sin1`) functions; edge global | Decided |
| Neon | Database | C1, C2 | Singapore (`aws-ap-southeast-1`) | Decided |
| Anthropic | LLM explanations, chat | C1 aggregates only | Confirm (Q-T2) | Decided provider; terms to confirm |
| Google | OAuth sign-in | C2 (email, name) | Global | Decided |
| Email provider | Verification, digest | C2 (email) | Choose one with an SG/AP region if possible | Open (07) |
| Error tracking | Exceptions | C2 scrubbed | Choose (07) | Open |

Each new sub-processor needs an ADR, an update to this register and the privacy policy, and a change notice to sellers.

## AI governance (AI Law 134/2025/QH15)

- **Classification memo** (`docs/compliance/ai-classification-memo.md`, to write in M1). Self-classify as low risk for the MVP: the output is decision support, a human approves every action, no automated execution, and every output is labelled. Re-assess as possibly medium before FR-13 chat ships (**counsel**).
- **Transparency.** Every recommendation and chat answer carries "Gợi ý do AI tạo" plus the data window it used. The demo shop is labelled "Dữ liệu mẫu" everywhere.
- **Technical documentation.** This pack, the rule library, the prompt versions and the golden-set results are kept as the technical file.
- **Human oversight.** No action executes without the seller. Dismissals with reasons feed rule review.

## E-commerce Law 122/2025 and platform terms

- Keep `audit_log` and provenance so we can supply data and trace it if authorities ask (**counsel**: are we a "support service provider"?).
- Vietnamese terms, privacy policy and complaint channel. The Vietnamese text controls.
- Shopee terms: no automated collection, and competitor data is seller-entered only. The UI never fetches competitor URLs.

## Breach response (72-hour runbook outline)

1. **Detect and triage** (hour 0–4): who found it, which data classes, which shops; freeze affected credentials.
2. **Contain** (hour 0–12): rotate secrets, revoke sessions (`delete from auth.session`), block the path, take a Neon branch snapshot for forensics.
3. **Assess** (hour 12–36): scope from `audit_log`, Vercel logs and Neon query history; decide whether personal data is affected.
4. **Notify** (by hour 72): the authority via the MPS channel per Decree 356 (**counsel** for format), and affected sellers in Vietnamese.
5. **Review** (week 1–2): blameless postmortem, a new test that would have caught it, and a register update.

The full runbook goes in `docs/compliance/breach-runbook.md` (M1), with contacts and templates.

## Compliance deliverables to produce (tracked in 08)

| Doc | Milestone |
| --- | --- |
| Privacy policy (vi + en), terms of service (vi + en) from the discovery checklist | M5 (before beta) |
| Data inventory / record of processing | M1 |
| Transfer impact assessment draft | M4 (before beta) |
| AI classification memo | M1, revisit before FR-13 |
| Breach runbook | M1 |
| Counsel questions pack (Q-L1, Q-L2, Q-L3, retention periods) | M0 |
