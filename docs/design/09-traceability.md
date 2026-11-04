# 09 — Traceability matrix

Each requirement maps to the design section that answers it, the backlog items that build it, and the tests that prove it. Test IDs are planned names: update this file when a test is written, renamed or removed. A row with no test is not done.

## Functional requirements

| Req | Design | Backlog | Tests (planned) |
| --- | --- | --- | --- |
| FR-01 Sign up email/Google, verify | 03 Auth, ADR-007 | SA-105 | `auth.signup.e2e`, `auth.verify-email.int` |
| FR-02 Separate unticked consents | 03 Consent, 02 `consent_record` | SA-106 | `consent.unticked-default.e2e`, `consent.ledger-append-only.int` |
| FR-03 Upload, detect, preview, reject unknown | 04 Pipeline, Upload API | SA-201, SA-203, SA-205, SA-206 | `parsers.detect.*.unit`, `ingest.reject-unknown.e2e` |
| FR-04 Strip buyer PII in browser, show removed | 04 Allowlist, ADR-003 | SA-201, SA-205, SA-206 | `parsers.pii-never-mapped.unit`, `parsers.synthetic-buyer-cols-dropped.unit`, `ingest.pii-suspected-reject.int` |
| FR-05 Unit costs template + inline | 04 Unit-cost template | SA-204, SA-207 | `parsers.unit-costs.unit`, `costs.inline-edit.e2e` |
| FR-06 Weekly per-SKU metrics | 05 See | SA-301, SA-302 | `engine.metrics.*.unit`, `engine.fee-allocation-reconciles.unit` |
| FR-07 ≤ 5 ranked recs weekly + on demand | 05 Prioritise, 01 F2 | SA-401, SA-402, SA-406 | `engine.rank.max5.unit`, `golden.*`, `jobs.weekly-run.int` |
| FR-08 Evidence, impact, confidence, data used | 05, 06 | SA-401, SA-407 | `actions.evidence-drawer.e2e`, `golden.facts-present` |
| FR-09 Accept/dismiss/done; 7/14-day outcome | 05 Outcome, 01 F3 | SA-407, SA-501 | `outcome.classify.unit`, `outcome.clock-sim.int` |
| FR-10 Competitor tracker, price-gap signals | 05 metrics, 02 competitor tables | SA-408, SA-401 | `competitor.median.unit`, `golden.price-gap` |
| FR-11 Export and delete | 03 DSR, 01 F4 | SA-502, SA-503 | `dsr.export.int`, `dsr.delete-within-20d.int` |
| FR-12 Demo shop | 04 Synthetic | SA-107, SA-202, SA-209 | `demo.seed.int`, `demo.labelled.e2e` |
| FR-13 Chat (Should) | 06 Chat | SA-603 | `golden.chat.*` (later) |
| FR-14 What-if (Should) | 05 What-if | SA-602 | `engine.whatif.unit` (later) |
| FR-15 Email digest (Should) | 01 F2 | SA-601 | `digest.render.unit` (later) |
| FR-16 Open Platform sync (Phase 2) | 01 Phase 2 hook | — | — |

## Non-functional requirements

| Req | Design | Backlog | Tests / checks |
| --- | --- | --- | --- |
| NFR-SEC | 03, 02 RLS, ADR-006 | SA-102–SA-104, SA-505 | RLS suite, CSP check, `pnpm audit` gate, ASVS checklist |
| NFR-PRIV | 03, ADR-003 | SA-201, SA-503 | PII tests, DSR timer tests |
| NFR-PERF | 01 Performance budget | SA-304, SA-506 | Perf test (50k lines), parse benchmark (20 MB < 30 s) |
| NFR-AVAIL | 07 Observability | SA-509 | Uptime check |
| NFR-A11Y | — | SA-506 | axe in Playwright, manual screen-reader pass |
| NFR-L10N | `packages/shared` | SA-004 | `shared.format.vnd.unit`, `shared.week-ict.unit` |
| NFR-OBS | 07 | SA-509 | `llm_call` populated assertion |
| NFR-AIQ | 06 Validation, ADR-004 | SA-404, SA-405 | `llm.no-stray-digits.unit`, live golden eval |
| NFR-MAINT | 07 CI | SA-001, SA-003 | CI required checks |

## User stories

| Story | Acceptance tests (planned) |
| --- | --- |
| US-01 | `consent.unticked-default.e2e`, `consent.required-blocks-submit.e2e`, `consent.ledger-append-only.int` |
| US-02 | `ingest.detect-and-preview.e2e`, `ingest.removed-columns-listed.e2e`, `ingest.reject-unknown.e2e` |
| US-03 | `costs.template-roundtrip.e2e`, `engine.missing-cost-excluded.unit` |
| US-04 | `profit.view.e2e`, `profit.drilldown-source-rows.e2e` |
| US-05 | `golden.*`, `actions.insufficient-data.e2e`, `actions.ai-label.e2e` |
| US-06 | `outcome.clock-sim.int`, `actions.track-record.e2e` |
| US-07 | `competitor.add-observation.e2e`, `golden.price-gap` |
| US-08 | `dsr.delete-ack-immediate.e2e`, `dsr.delete-within-20d.int` |

## Risks → controls

| Risk | Control in design | Where |
| --- | --- | --- |
| R1 | Repository layer, standard Postgres, exit runbook | ADR-002, SA-006 |
| R2 | Versioned parsers, detection score, unknown-header alert | 04 |
| R3 | Upload path is the full product; adapter interface ready | 01 Phase 2 hook |
| R4 | Cost-aware profit, outcomes, platform-agnostic model | 02, 05 |
| R5 | Rules first, sufficiency gates, track record incl. failures | 05, ADR-004 |
| R6 | Template, missing-cost banner, value from fees alone | 04, 05 `COST_MISSING` |
| R7 | One call per run, caching, Haiku 5.5 candidate, cost tracking | 06 |
| R8 | Synthetic generator, demo shop, design partners | 04 |
