# 08 — Delivery plan

Six milestones take the MVP from an empty repo to a closed beta. Each one ends in something demoable on the demo shop. The order follows risk: tenant isolation and PII handling are built and tested before any feature that depends on them. Every backlog item has an owning sub-agent (`.claude/agents/`) and links to the requirement and design section it implements. Phase 0 discovery work (interviews, counsel, ISV) runs alongside M0–M2 and is owned by the human.

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

| ID | Item | Owner agent | Traces | Depends |
| --- | --- | --- | --- | --- |
| SA-001 | Scaffold pnpm workspace: `apps/web`, `packages/{db,parsers,engine,llm,shared}`; TS strict; ESLint; Vitest | platform-engineer | NFR-MAINT, ADR-001 | — |
| SA-002 | Vercel project (`sin1`), Neon project (SG), Neon–Vercel integration for preview branches, `seed` branch | platform-engineer | 07, ADR-002 | SA-001 |
| SA-003 | GitHub Actions pipeline: lint, typecheck, unit, audit, secret scan, SHA-pinned actions | platform-engineer | 07, NFR-SEC | SA-001 |
| SA-004 | `packages/shared`: VND/date formatting, ISO week helpers (ICT), branded types (`OrderHash`, `ShopId`) | engine-engineer | NFR-L10N | SA-001 |
| SA-005 | Counsel questions pack (Q-L1–L3, retention periods, TIA timing) | ba-analyst | 03 | — |
| SA-006 | VN cloud Postgres quote + migration runbook outline (R1 exit) | solution-architect | ADR-002 | — |

### M1 Data, auth, consent

| ID | Item | Owner agent | Traces | Depends |
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

| ID | Item | Owner agent | Traces | Depends |
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

| ID | Item | Owner agent | Traces | Depends |
| --- | --- | --- | --- | --- |
| SA-301 | `computeWeekMetrics` incl. fee allocation + reconciliation test | engine-engineer | FR-06 | SA-004 |
| SA-302 | `recompute_metrics` job writing `sku_week_metric` with `inputs_hash` skip | db-engineer | FR-06 | SA-301, SA-109 |
| SA-303 | Profit view (mobile): per-SKU table, week picker, drill-down to source rows | frontend-engineer | US-04 | SA-302 |
| SA-304 | Perf test: 50k lines/quarter, p95 < 2 s on throttled 4G | qa-engineer | NFR-PERF | SA-303 |

### M4 Recommendations

| ID | Item | Owner agent | Traces | Depends |
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

| ID | Item | Owner agent | Traces | Depends |
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

| ID | Item | Owner agent | Traces |
| --- | --- | --- | --- |
| SA-601 | Weekly email digest | platform-engineer | FR-15 |
| SA-602 | Discount what-if simulator | engine-engineer + frontend-engineer | FR-14 |
| SA-603 | Ask-your-data chat (query templates, strict tools), after the AI Law re-assessment | llm-engineer | FR-13 |

## Phase 0 (human-owned, runs alongside)

- Recruit 5–10 design-partner sellers and collect anonymised exports → unblocks the parser `assumed → verified` move (Q-D1).
- Counsel consult on Q-L1–L3 → may trigger the ADR-002 exit path before beta.
- Shopee ISV application via the household business (Q-D2) → gates FR-16.
- Interview synthesis, as-is/to-be process maps, willingness to pay → `ba-analyst` can draft guides and synthesis templates.

## Working agreement for agents

1. One backlog item per branch/PR, named `SA-xxx-short-slug` (≤ 60 chars).
2. The owning agent implements, `qa-engineer` adds or extends tests, and `security-compliance-reviewer` reviews any change touching `db`, `parsers`, `llm`, auth or ingest routes.
3. A change that contradicts a design doc updates the doc or adds an ADR in the same PR (`solution-architect` reviews).
4. Definition of done: acceptance criteria from the US met; tests green in CI; traceability row updated; no new sub-processor without an ADR; vi strings in `messages/vi.json`; no comments that just narrate the code.
