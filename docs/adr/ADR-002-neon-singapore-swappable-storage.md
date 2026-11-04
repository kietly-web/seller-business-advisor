# ADR-002 Neon Postgres in Singapore, behind a repository layer

Status: Accepted, conditional on counsel's answer to Q-L1 · 2026-11-04

## Context

Discovery chose Neon in `aws-ap-southeast-1`. The 2025 Cybersecurity Law may require storing user data in Vietnam if a seller-analytics SaaS is an enumerated service (Q-L1, risk R1). Neon has no Vietnam region, and a Neon project's region is fixed at creation.

## Decision

- Use Neon Singapore for all environments.
- Keep all SQL standard Postgres. Use no Neon-only features in the data path: no Neon Data API, no `pg_session_jwt`. RLS uses plain `set_config`.
- All data access goes through repositories in `packages/db`. App code never imports the driver directly.
- Exit path if counsel says localisation applies: provision managed Postgres at a Vietnamese provider (Viettel IDC, VNPT, FPT Smart Cloud, or CMC), `pg_dump`/`pg_restore` during a maintenance window, and switch `DATABASE_URL*`. Functions can stay in `sin1` at first (~30–50 ms extra latency). Moving compute into Vietnam is a later step if storage-only localisation is not enough.

## Consequences

- Neon's branch-per-PR workflow is available now. If we leave Neon, preview environments need another approach (schema-per-PR or a shared staging DB).
- A VN cloud quote is needed in M0 so the cost of the exit path is known before beta.
- The cross-border transfer impact assessment is required regardless of the answer.
- Provider comparison, quote questions and the exit runbook outline: [`docs/research/vn-cloud-postgres.md`](../research/vn-cloud-postgres.md) (SA-006).

## Alternatives considered

- Start on a Vietnamese cloud: no branching, more operations work, and the legal need is unconfirmed.
- Supabase / AWS RDS Singapore: the same localisation problem with no advantage over the discovery decision.
