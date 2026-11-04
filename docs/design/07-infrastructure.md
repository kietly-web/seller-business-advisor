# 07 — Infrastructure, environments and operations

One Vercel project (functions pinned to `sin1`) and one Neon project (`aws-ap-southeast-1`). Each pull request gets its own preview deployment with its own Neon branch. Scheduled work is Vercel Cron calling authenticated route handlers that drain a Postgres job table. GitHub Actions runs checks and migrations. A Vercel **Pro** plan is needed before beta: Hobby is for non-commercial use and limits cron frequency.

## Environments

| Env | Vercel | Neon | Data | Claude key |
| --- | --- | --- | --- | --- |
| Local | `next dev` | Personal dev branch off `main` | Demo shop only | Dev key, low spend limit, or `TemplateLlmClient` |
| Preview (per PR) | Preview deployment | Branch per PR, created by the Neon–Vercel integration, deleted on PR close | Demo shop (seeded by migration step) | Eval key, monthly spend limit |
| Production | Production deployment | `main` branch, protected | Real sellers | Production key |

Real seller data never leaves production: no production snapshots in preview, and no copying `main` into dev branches after beta starts. Dev branches are created from a `seed` branch that holds only demo data.

## Vercel setup

- Framework: Next.js; package manager pnpm; root `apps/web` with workspace packages built through `transpilePackages`.
- `vercel.json`: `"regions": ["sin1"]` so functions run next to Neon, plus the cron schedule below.
- Fluid compute on. Long jobs get `export const maxDuration` per route (check the current plan limits when implementing).
- Request bodies are capped at 4.5 MB for functions, hence chunked ingest (see 04).
- Firewall: rate-limit rules on `/api/ingest/*` and the auth endpoints; bot protection on sign-up.
- Preview deployments protected by Vercel Authentication, so they are not public.

### Cron schedule (UTC in config, ICT = UTC+7)

| Path | Schedule (UTC) | ICT | Job |
| --- | --- | --- | --- |
| `/api/cron/drain` | `* * * * *` | every minute | Claim and run due jobs (≤ 50 s per invocation) |
| `/api/cron/weekly` | `5 17 * * 0` | Mon 00:05 | Enqueue `weekly_run` per active shop |
| `/api/cron/daily` | `0 19 * * *` | 02:00 | Enqueue `measure_outcomes`, `retention_purge`, `dsr_deadline_check`, `stale_upload_cleanup` |

Each cron route checks `Authorization: Bearer ${CRON_SECRET}`, which Vercel sends automatically when the env var is set.

### Job runner

```sql
-- claim
update app.job set locked_at = now(), locked_by = $1, attempts = attempts + 1
where id in (
  select id from app.job
  where done_at is null and run_after <= now()
    and (locked_at is null or locked_at < now() - interval '5 minutes')
    and attempts < max_attempts
  order by run_after
  limit 10
  for update skip locked)
returning *;
```

On failure: `run_after = now() + 2^attempts minutes` and `last_error` recorded. On exhausting retries: alert. Handlers are idempotent (`dedupe_key`, upserts). This runs on the existing database with no queue vendor and no extra sub-processor (ADR-008). If volume grows past what minute-level draining handles, swap in a queue behind the same `enqueue()` / handler interface.

## Neon setup

- Project in `aws-ap-southeast-1`. The region is fixed at creation, so moving region means a new project and a data migration (ADR-002 exit path).
- Postgres 17 (or the current default). Extensions: `pgcrypto` (only if `gen_random_uuid` needs it), `pg_stat_statements`.
- Roles `sa_owner`, `sa_app`, `sa_worker` created by the first migration, with passwords stored as env vars.
- Pooling: the app uses the pooled connection string with the WebSocket driver. Migrations use the direct (unpooled) string.
- Autoscaling min 0.25 CU in preview, min 0.5 CU in production during beta, to limit cold starts on the Monday run. Scale-to-zero is fine for previews.
- Point-in-time restore window: the plan default, at least 7 days in production. Run a monthly restore drill into a branch, with the result logged.

## Environment variables

| Name | Scope | Notes |
| --- | --- | --- |
| `DATABASE_URL` | all | `sa_app`, pooled |
| `DATABASE_URL_WORKER` | all | `sa_worker`, pooled |
| `DATABASE_URL_MIGRATE` | CI only | `sa_owner`, direct; never in the Vercel runtime |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | all | Different per environment |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | all | Separate OAuth clients for preview and production |
| `ANTHROPIC_API_KEY` | all | Separate keys and spend limits per environment |
| `LLM_MODEL_EXPLAIN`, `LLM_MODEL_CHAT` | all | Defaults `claude-opus-5-5` |
| `EMAIL_*` | all | Provider TBD |
| `ERROR_TRACKING_DSN` | all | Provider TBD |
| `CRON_SECRET` | all | Random, rotated quarterly |

No `NEXT_PUBLIC_` variable may hold a secret. A CI grep enforces it.

## CI/CD (GitHub Actions)

```mermaid
flowchart LR
  PR[Pull request] --> L[lint + typecheck]
  L --> U[unit tests\nparsers, engine, llm validator]
  U --> NB[Neon branch\n(from seed)]
  NB --> MG[migrate + RLS policy check]
  MG --> IT[integration + RLS tests]
  IT --> G[golden set\n(engine; LLM live only with label)]
  G --> E2E[Playwright on preview URL\nmobile viewport, vi locale]
  E2E --> OK[ready to merge]
  OK --> M[merge to main] --> PM[migrate production] --> D[Vercel production deploy]
```

- Implemented so far (SA-003, `.github/workflows/ci.yml`): lint, typecheck, unit tests, build, the `NEXT_PUBLIC_` secret-name check (`scripts/check-public-env.sh`), `pnpm audit --prod --audit-level high`, and a gitleaks secret scan. Neon branch, migrations, RLS, golden set and e2e jobs are added with SA-002, SA-104, SA-403 and SA-507.
- Migrations run in Actions before the production deploy is promoted, and are never run at function start.
- Required checks: lint, typecheck, unit, RLS, golden (engine), e2e smoke, `pnpm audit` (high/critical), secret scan, and `PR description` (`.github/workflows/pr-description.yml`: fails when `## What changed` is empty).
- Actions pinned by commit SHA; Dependabot for npm and actions.

## Observability (NFR-OBS)

| Signal | Tool | Content |
| --- | --- | --- |
| Logs | Vercel logs (structured JSON via a small logger) | `request_id`, `shop_id`, route, latency, outcome; never bodies |
| Errors | Error tracking (Sentry or equivalent; ADR needed before adding) | Stack traces with PII scrubbing |
| LLM | `app.llm_call` table + a simple internal page | Cost/day, p95 latency, validation failure rate, fallback rate |
| Jobs | `app.job` + an internal page | Backlog, failures, retries |
| Business KPIs | SQL views over `recommendation`, `outcome`, `upload` | The success-metric set from discovery |
| Uptime | External HTTP check on `/api/health` (DB ping) | 99.5% target (NFR-AVAIL) |

Alerts (email to the operator at first): job dead-lettered, LLM fallback rate > 20% in a day, DSR within 3 days of its deadline, unknown export headers seen, `PII_SUSPECTED` rejection (always alert).

## Open infrastructure decisions

| ID | Decision | Options | Lean |
| --- | --- | --- | --- |
| Q-I1 | Vercel plan | Hobby (dev only) vs Pro | Pro before beta |
| Q-I2 | Email provider | Resend, Amazon SES `ap-southeast-1`, Postmark | SES in Singapore keeps C2 in the same region as Neon; Resend is the simplest to set up |
| Q-I3 | Error tracking | Sentry, Vercel's built-in, none in alpha | Start with structured logs; add Sentry with PII scrubbing before beta |
| Q-I4 | VN cloud fallback quote (R1) | Viettel IDC, VNPT, FPT Smart Cloud, CMC managed Postgres | Get one quote in M0; storage swap plan in ADR-002 |
