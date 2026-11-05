# 08 — Delivery plan

Six milestones take the MVP from an empty repo to a closed beta. Each one ends in something demoable on the demo shop. The order follows risk: tenant isolation and PII handling are built and tested before any feature that depends on them. Every backlog item links to the requirement and design section it implements; the Area column names the part of the codebase. Work ships in slices (several items per PR, see below), and pre-launch work waits in the go-live checklist. Phase 0 discovery work (interviews, counsel, ISV) runs alongside and is owned by the human.

## Milestones and exit criteria

| Milestone | Goal | Exit criteria (demo) |
| --- | --- | --- |
| M0 Foundations | Repo, CI, environments | PR → preview URL with its own Neon branch; CI runs lint/type/unit; counsel questions pack sent |
| M1 Data, auth, consent | Tenancy you can trust | Sign up (email/Google), consents stored, shop created; RLS suite green on all tables |
| M2 Ingestion | File → canonical rows, PII never sent | Upload synthetic orders + income + costs on a phone viewport; removed columns shown; `PII_SUSPECTED` test green |
| M3 Profit | True profit per SKU per week | Profit view meets p95 < 2 s for 50k lines; every number links to source rows |
| M4 Recommendations | Weekly ≤ 5 explained actions | Monday run on the demo shop produces the expected golden actions; LLM output passes 0-stray-number check; competitor tracker feeds price rules |
| M5 Beta readiness | Close the loop, compliance, hardening | Accept → done → outcome at 7/14 days (simulated clock); export and delete work; vi legal pages live; a11y and perf budgets met |
| M6 Shoulds | FR-13 to FR-15 | Email digest; what-if simulator; chat behind a flag after the AI Law re-assessment |

## Backlog

ID format `SA-<milestone><nn>`, which is also the commit and branch prefix (see `CLAUDE.md`).

### M0 Foundations

| ID | Item | Area | Traces | Depends |
| --- | --- | --- | --- | --- |
| SA-001 | Scaffold pnpm workspace: `apps/web`, `packages/{db,parsers,engine,llm,shared}`; TS strict; ESLint; Vitest | platform-engineer | NFR-MAINT, ADR-001 | — |
| SA-002 | Vercel project (`sin1`), Neon project (SG), Neon–Vercel integration for preview branches, `seed` branch | platform-engineer | 07, ADR-002 | SA-001 |
| SA-003 | GitHub Actions pipeline: lint, typecheck, unit, audit, secret scan, SHA-pinned actions | platform-engineer | 07, NFR-SEC | SA-001 |
| SA-004 | `packages/shared`: VND/date formatting, ISO week helpers (ICT), branded types (`OrderHash`, `ShopId`) | engine-engineer | NFR-L10N | SA-001 |
| SA-005 | Counsel questions pack (Q-L1–L3, retention periods, TIA timing) | ba-analyst | 03 | — |
| SA-006 | VN cloud Postgres quote + migration runbook outline (R1 exit) | solution-architect | ADR-002 | — |

### M1 Data, auth, consent

| ID | Item | Area | Traces | Depends |
| --- | --- | --- | --- | --- |
| SA-101 | Drizzle schema for all `app.*` tables in 02 | db-engineer | FR-06…FR-12 | SA-002 |
| SA-102 | Roles, grants, `app_ctx` functions, RLS policies, `active_shop_ids()` | db-engineer | NFR-SEC, ADR-006 | SA-101 |
| SA-103 | `withShopContext`, repositories, CI check "every shop_id table has policies" | db-engineer | ADR-006 | SA-102 |
| SA-104 | Generated RLS test suite (5 cases × every table) | qa-engineer | NFR-SEC | SA-103 |
| SA-105 | Better Auth: email + verification, Google, TOTP plugin, breached-password check | platform-engineer | FR-01, ADR-007 | SA-101 |
| SA-106 | Consent screen (3 unticked boxes), consent ledger, withdrawal in settings | frontend-engineer | FR-02, US-01 | SA-105 |
| SA-107 | Shop onboarding (name, category, target margin), demo-shop toggle | frontend-engineer | FR-12 | SA-103 |
| SA-108 | Audit log writer + coverage list | db-engineer | 03 T10 | SA-103 |
| SA-109 | Job table, `enqueue()`, drainer route, cron auth | platform-engineer | ADR-008 | SA-103 |
| SA-110 | Compliance docs: data inventory, AI classification memo, breach runbook | ba-analyst | 03 | SA-005 |

### M2 Ingestion

| ID | Item | Area | Traces | Depends |
| --- | --- | --- | --- | --- |
| SA-201 | Parser framework: registry, header normalisation, detection scoring, `ColumnSpec`, PII header list + build-failing test | parser-engineer | FR-03, FR-04, ADR-003 | SA-004 |
| SA-202 | Synthetic shop generator (12 months) + export-format writers with fake buyer columns | parser-engineer | FR-12, R8 | SA-201 |
| SA-203 | Parsers `shopee.orders@v1`, `shopee.income@v1` (assumed) + fixtures | parser-engineer | FR-03 | SA-201 |
| SA-204 | Parsers `seller.unit_costs@v1`, `seller.stock@v1` + per-shop template download | parser-engineer | FR-05, US-03 | SA-201 |
| SA-205 | Ingest API: create, chunk (zod strict + PII value scan), complete (merge, supersede), abort | db-engineer | FR-03, FR-04 | SA-103, SA-201 |
| SA-206 | Upload UI: worker, mapping preview, removed-columns panel, progress, resume | frontend-engineer | US-02 | SA-205 |
| SA-207 | Costs UI: template upload, inline edit, missing-cost flags | frontend-engineer | FR-05, US-03 | SA-204, SA-205 |
| SA-208 | Parsers `shopee.product_performance@v1`, `shopee.mass_update@v1` | parser-engineer | Should | SA-203 |
| SA-209 | Demo shop seeding job using SA-202 output | parser-engineer | FR-12 | SA-202, SA-205 |

### M3 Profit

| ID | Item | Area | Traces | Depends |
| --- | --- | --- | --- | --- |
| SA-301 | `computeWeekMetrics` incl. fee allocation + reconciliation test | engine-engineer | FR-06 | SA-004 |
| SA-302 | `recompute_metrics` job writing `sku_week_metric` with `inputs_hash` skip | db-engineer | FR-06 | SA-301, SA-109 |
| SA-303 | Profit view (mobile): per-SKU table, week picker, drill-down to source rows | frontend-engineer | US-04 | SA-302 |
| SA-304 | Perf test: 50k lines/quarter, p95 < 2 s on throttled 4G | qa-engineer | NFR-PERF | SA-303 |

### M4 Recommendations

| ID | Item | Area | Traces | Depends |
| --- | --- | --- | --- | --- |
| SA-401 | Rule framework + rules v1 (7 rules + COST_MISSING) with static vi templates and checklists | engine-engineer | FR-07, FR-08 | SA-301 |
| SA-402 | Ranking: score, cooldown, diversity, sufficiency gates | engine-engineer | FR-07, US-05 | SA-401 |
| SA-403 | Golden set (20 scenarios) running in CI | qa-engineer | NFR-AIQ, R5 | SA-402 |
| SA-404 | `LlmClient`, `ClaudeLlmClient`, `TemplateLlmClient`, payload builder, placeholder validator, `llm_call` logging | llm-engineer | ADR-004, ADR-005 | SA-401 |
| SA-405 | Prompt `explain.v1` + adversarial golden cases + live eval workflow (label-gated) | llm-engineer | NFR-AIQ | SA-403, SA-404 |
| SA-406 | `weekly_run` job + scheduler + on-demand trigger with rate limit | platform-engineer | FR-07 | SA-402, SA-404, SA-109 |
| SA-407 | Actions UI: cards, AI label, evidence drawer, accept/dismiss-with-reason/done, rating | frontend-engineer | FR-08, FR-09, US-05 | SA-406 |
| SA-408 | Competitor tracker UI + `competitor_median` metric | frontend-engineer | FR-10, US-07 | SA-302 |

### M5 Beta readiness

| ID | Item | Area | Traces | Depends |
| --- | --- | --- | --- | --- |
| SA-501 | `measure_outcomes` job, diff-in-diff, Beta-binomial track record, track-record UI | engine-engineer | FR-09, US-06 | SA-407 |
| SA-502 | Data export (ZIP of CSVs, formula-injection safe) | db-engineer | FR-11 | SA-103 |
| SA-503 | Account deletion: ack, lock, 7-day undo, hard delete, DSR timers + alerts | db-engineer | FR-11, US-08 | SA-109 |
| SA-504 | Privacy policy, terms (vi + en), complaint channel page, sub-processor list | ba-analyst | 03 | SA-005 |
| SA-505 | Security pass: CSP, headers, rate limits, error-tracking scrubbing, ASVS L2 checklist | security-compliance-reviewer | NFR-SEC | M4 |
| SA-506 | a11y (WCAG 2.2 AA) audit + fixes; perf budgets | qa-engineer | NFR-A11Y, NFR-PERF | M4 |
| SA-507 | E2E: full loop on the demo shop, mobile viewport, vi locale | qa-engineer | US-01…US-08 | M4 |
| SA-508 | Transfer impact assessment draft | ba-analyst | 03 | SA-005 |
| SA-509 | Ops pages: jobs, LLM cost/fallback, KPI views; alerts | platform-engineer | NFR-OBS | SA-406 |

### M6 Shoulds

| ID | Item | Area | Traces |
| --- | --- | --- | --- |
| SA-601 | Weekly email digest | platform-engineer | FR-15 |
| SA-602 | Discount what-if simulator | engine-engineer + frontend-engineer | FR-14 |
| SA-603 | Ask-your-data chat (query templates, strict tools), after the AI Law re-assessment | llm-engineer | FR-13 |

## Phase 0 (human-owned, runs alongside)

- Recruit 5–10 design-partner sellers and collect anonymised exports → unblocks the parser `assumed → verified` move (Q-D1).
- Counsel consult on Q-L1–L3 → may trigger the ADR-002 exit path before beta.
- Shopee ISV application via the household business (Q-D2) → gates FR-16.
- Interview synthesis, as-is/to-be process maps, willingness to pay → `ba-analyst` can draft guides and synthesis templates.

## Status

Current stage, open PRs and blockers: [`docs/STATUS.md`](../STATUS.md).

## Remaining work as slices

One PR per slice (`CLAUDE.md`, "How we work"). Security review applies to slices marked ⚑.

| Slice | Items | Delivers |
| --- | --- | --- |
| A Sign-up and onboarding UI | SA-106, SA-107 (+ sign-in, verify, sign-out pages) | A seller can sign up in Vietnamese, give consents, create a shop or open the demo shop |
| B Parsers ⚑ | SA-201, SA-202, SA-203, SA-204 | Registry, PII allowlist, synthetic shop generator, orders/income/cost/stock parsers with fixtures |
| C Upload flow ⚑ | SA-205, SA-206, SA-207, SA-209 | Upload on a phone, removed columns shown, costs entered, demo shop seeded |
| D Profit | SA-301, SA-302, SA-303, SA-304 | Weekly profit per SKU with drill-down, within the performance budget |
| E Engine | SA-401, SA-402, SA-403 | Rules, ranking and the golden set |
| F LLM ⚑ | SA-404, SA-405 | Claude explanations with placeholder validation and template fallback |
| G Actions | SA-406, SA-407, SA-408 | Weekly run, action cards, competitor tracker |
| H Outcomes and data rights ⚑ | SA-501, SA-502, SA-503 | Outcome measurement, export, account deletion |

M6 items stay as listed above and come after the beta.

## Go-live checklist (before the first real seller)

Required for a professional launch but deliberately not built yet. Each line names who does it.

| Item | Who |
| --- | --- |
| Separate Neon LOGIN roles for runtime (member of `sa_app`, `sa_worker`, `sa_auth`) and for migrations; runtime must not use the owner URL | Owner + Claude |
| `DATABASE_URL_MIGRATE` secret in GitHub so `migrate.yml` applies migrations to production | Owner |
| Production env in Vercel: `BETTER_AUTH_SECRET` (≥ 32 chars), `BETTER_AUTH_URL` (https), `AWS_SES_REGION`, `EMAIL_FROM`, AWS SES credentials, `CRON_SECRET`, `ANTHROPIC_API_KEY` | Owner |
| SES: verify the sending domain, SPF/DKIM/DMARC, request production access | Owner |
| Branch protection on `main` with required checks; GitHub auto-merge allowed | Owner |
| Vercel Pro (commercial use, per-minute cron) and register the drain cron | Owner + Claude |
| Vercel Firewall rate rule on `/api/auth/sign-in/*` | Owner |
| Error tracking with PII scrubbing (ADR + sub-processor row) | Claude |
| Google sign-in (OAuth client) if FR-01 keeps it | Owner + Claude |
| Counsel answers to Q-L1–L3; transfer impact assessment filed (SA-508) | Owner + counsel |
| Privacy policy, terms and complaint channel in Vietnamese (SA-504) | Claude drafts, owner + counsel approve |
| Whole-app security review, ASVS L2 checklist, CSP and headers (SA-505) | Claude |
| a11y and performance audits (SA-506); end-to-end tests of the full loop (SA-507) | Claude |
| Restore drill from Neon point-in-time restore; breach-runbook tabletop drill | Owner |
