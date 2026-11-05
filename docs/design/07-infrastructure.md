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
- Project settings: Root Directory `apps/web` (files outside it included, for the workspace packages), Node.js 24.x, no Output Directory override.
- `apps/web/vercel.json` (it lives in the Root Directory): `"framework": "nextjs"` so the preset can't drift to "Other", `"regions": ["sin1"]` so functions run next to Neon, plus the cron schedule below once SA-109 adds it.
- Fluid compute on. Long jobs get `export const maxDuration` per route (check the current plan limits when implementing).
- Request bodies are capped at 4.5 MB for functions, hence chunked ingest (see 04).
- Firewall: rate-limit rules on `/api/ingest/*` and the auth endpoints; bot protection on sign-up.
- Preview deployments protected by Vercel Authentication, so they are not public.

### Cron schedule (UTC in config, ICT = UTC+7)

| Path | Schedule (UTC) | ICT | Job |
| --- | --- | --- | --- |
| `/api/cron/drain` | `* * * * *` | every minute | Claim and run due jobs (≤ 50 s per invocation) |
| `/api/cron/weekly` | `0 18 * * 0` | Mon 01:00 | Enqueue `recommendations.weekly` per shop (deduplicated per week), then drain up to 20 jobs. **Registered** in `vercel.json`: a weekly cron fits the Hobby plan's once-a-day limit |
| `/api/cron/daily` | `0 19 * * *` | 02:00 | Enqueue `measure_outcomes`, `retention_purge`, `dsr_deadline_check`, `stale_upload_cleanup` |

Each cron route checks `Authorization: Bearer ${CRON_SECRET}`, which Vercel sends automatically when the env var is set.

As built (SA-109): `/api/cron/drain` calls `runDueJobs` (`packages/db/src/jobs.ts`) with the handler registry in `apps/web/server/jobs.ts`, and returns `401` unless `CRON_SECRET` is set and matches (constant-time compare). The schedule is **not registered yet**: the Vercel project is on the Hobby plan, which only allows daily cron jobs, so the every-minute drain waits for the Pro decision (Q-I1). Until then the route can be called manually with the secret.

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
- Connected through the Neon–Vercel integration (SA-002, 2026-11-04). It injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) for Development and Production, and creates a Neon branch plus its variables per preview deployment. Those URLs use the Neon owner role until SA-102 adds `sa_app` / `sa_worker`; from then on the runtime variables must point at the non-owner roles (see the table below), or RLS is bypassed in practice.
- The demo-data `seed` branch is created with the schema and demo seeding (SA-101, SA-209); until then preview branches fork the empty default branch.
- Preview branches are deleted when their PR closes (`.github/workflows/neon-preview-cleanup.yml`), because Neon caps branches per project and a full project leaves Vercel previews waiting on the integration. The workflow needs the `NEON_API_KEY` secret and the `NEON_PROJECT_ID` variable in GitHub. It looks up the branch by the integration's `preview/<git branch>` name and skips cleanly if none exists.

## Environment variables

| Name | Scope | Notes |
| --- | --- | --- |
| `DATABASE_URL` | all | `sa_app`, pooled |
| `DATABASE_URL_WORKER` | all | `sa_worker`, pooled; falls back to `DATABASE_URL` until separate LOGIN roles exist (the worker still runs as `sa_worker` via `SET LOCAL ROLE`) |
| `DATABASE_URL_MIGRATE` | CI only | `sa_owner`, direct; never in the Vercel runtime |
| `DATABASE_URL_UNPOOLED` | all (set by integration) | Owner role, direct. Not used by the app at runtime; remove or ignore once SA-102 lands |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | all | Different per environment |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | all | Separate OAuth clients for preview and production |
| `ANTHROPIC_API_KEY` | all | Separate keys and spend limits per environment |
| `LLM_MODEL_EXPLAIN`, `LLM_MODEL_CHAT` | all | Defaults `claude-opus-5-5` |
| `AWS_SES_REGION`, `EMAIL_FROM` | all | SES `ap-southeast-1` and the verified sender (ADR-009). Without them only local dev logs emails; elsewhere sign-up refuses to send |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | all | IAM user limited to `ses:SendEmail` from `EMAIL_FROM` |
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
- Migrations run in Actions (`.github/workflows/migrate.yml`, on pushes to `main` that change `packages/db/migrations/`, or manually), never at function start. Vercel deploys in parallel, so migrations must be backward compatible (expand → deploy → contract). The job needs the `DATABASE_URL_MIGRATE` secret in the GitHub `production` environment.
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
| Q-I2 | Email provider | Decided 05/11/2026: Amazon SES `ap-southeast-1` | ADR-009 |
| Q-I3 | Error tracking | Sentry, Vercel's built-in, none in alpha | Start with structured logs; add Sentry with PII scrubbing before beta |
| Q-I4 | VN cloud fallback quote (R1) | Viettel IDC, VNPT, FPT Smart Cloud, CMC managed Postgres | Get one quote in M0; storage swap plan in ADR-002 |
