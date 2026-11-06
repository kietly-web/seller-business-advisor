# Setup and open work register

The single list of everything **not done yet**: configuration and settings, security fixes, known gaps, remaining backlog, open questions and future enhancements. Any person, chat session or AI agent picking up the project reads [STATUS.md](STATUS.md), then this file.

How to use it:

- Pick an item, do it, tick it (`[x]`) and add the date, in the same PR. If only the owner can do it (a secret, a console click), say so in the PR and leave it unticked until the owner confirms.
- When you find a new unfinished setting, a gap or an idea for later, **add a row here in the same PR**. Don't leave it only in a PR description or a chat.
- Never write secret values here: only their names and where they go.

Last updated: 06/11/2026.

## 0. Security fixes on existing configuration (do first)

Audit of the Vercel project on 06/11/2026: it has 4 environment variables, all created by the Neon integration, no `NEXT_PUBLIC_*` names and no team-level shared variables.

| Name | Environments | Type | Problem |
| --- | --- | --- | --- |
| `DATABASE_URL` | Production, Development | Encrypted | Readable by anyone on the Vercel team; holds the Neon **owner** password |
| `DATABASE_URL_UNPOOLED` | Production, Development | Encrypted | Same |

Vercel refuses to switch integration-managed variables to Sensitive ("You cannot change the type of an integration Environment Variable to Sensitive"), so the fix happens in the Neon and Vercel consoles:

| Done | Step | Where | Who |
| --- | --- | --- | --- |
| [ ] | 1. Create a runtime login role that is **not** the owner: `CREATE ROLE sa_runtime LOGIN PASSWORD '<generated>'; GRANT sa_app, sa_worker, sa_auth TO sa_runtime;` (run after the migrations, so the group roles exist). The app switches into `sa_app` / `sa_worker` per transaction and can't bypass row-level security | Neon → SQL editor | Owner (Claude can review the SQL) |
| [ ] | 2. In the Vercel ↔ Neon integration settings, stop it writing `DATABASE_URL` / `DATABASE_URL_UNPOOLED` for Production and Development (or remove the integration from Production), so the variables below aren't overwritten | Vercel → Integrations → Neon | Owner |
| [ ] | 3. Add `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` for **Production and Preview** as **Sensitive**, using the `sa_runtime` connection strings | Vercel → Settings → Environment Variables → tick "Sensitive" | Owner |
| [ ] | 4. Remove the Development-target database variables. They give `vercel env pull` the production database; use a separate Neon dev branch for local work instead (section 1) | Vercel → Environment Variables | Owner |
| [ ] | 5. Reset the Neon owner role's password, because it has been readable in the dashboard. Then update `DATABASE_URL_MIGRATE` (GitHub secret) with the new owner URL | Neon → Roles → Reset password | Owner |
| [ ] | 6. Turn on the team policy so every new variable is Sensitive by default | Vercel → Team Settings → Security → Sensitive Environment Variable policy | Owner |
| [ ] | 7. Every secret added later (`BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, AWS keys) goes in as **Sensitive**, Production (and Preview only where noted), never with a `NEXT_PUBLIC_` prefix | Vercel | Owner |

Code-side checks already in place: CI fails if a secret-looking name is exposed through `NEXT_PUBLIC_` (`scripts/check-public-env.sh`); secrets are read only in `server-only` modules; gitleaks scans every PR.

## 1. Configuration not done yet

Priority: **P0** means production doesn't work without it. **P1** means a feature is degraded or a workflow fails. **P2** is needed before the first real seller.

| Done | Pri | Setting | Where | How / value | Unlocks | Who |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | P0 | `DATABASE_URL_MIGRATE` secret | GitHub → Settings → Environments → `production` | Neon connection string for a role that may run DDL (the owner role today; a dedicated migration role later) | `.github/workflows/migrate.yml`. **No migration has ever been applied**, so production has no tables | Owner |
| [ ] | P0 | Run the migrations once | GitHub → Actions → "migrate" → Run workflow | After the secret above | Every database feature in production | Owner, or Claude once the secret exists |
| [ ] | P0 | `BETTER_AUTH_SECRET` (Sensitive) | Vercel, Production | 32+ random characters (`openssl rand -hex 32`) | Sign-in | Owner |
| [ ] | P0 | `BETTER_AUTH_URL` | Vercel, Production | `https://seller-business-advisor.vercel.app` (must match the domain exactly) | Sign-in | Owner |
| [ ] | P0 | Google OAuth client | Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application) | Authorised redirect URI exactly `https://seller-business-advisor.vercel.app/api/auth/callback/google`. Scopes `openid`, `email`, `profile` only. Consent screen: app name, home page and privacy policy URLs, publishing status **In production** (testing mode caps it at 100 users). No wildcard redirects, so previews can't use Google sign-in | Google sign-in, the main sign-in method | Owner |
| [ ] | P0 | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Sensitive) | Vercel, **Production only** | From the OAuth client | The Google button on `/dang-nhap` and `/dang-ky` | Owner |
| [ ] | P1 | `CRON_SECRET` (Sensitive) | Vercel, Production | Random string; Vercel sends it to cron routes | Weekly cards every Monday 01:00 ICT (`/api/cron/weekly`); 401 without it | Owner |
| [ ] | P1 | `ANTHROPIC_API_KEY` (Sensitive), `LLM_MODEL_EXPLAIN` | Vercel, Production | Key from console.anthropic.com; model `claude-opus-5-5` | Claude writes card wording; templates otherwise | Owner |
| [ ] | P1 | `ANTHROPIC_API_KEY_EVAL` secret | GitHub → Settings → Secrets → Actions | A **separate** key with a monthly spend limit | `llm-eval.yml` (label `llm-eval`, nightly); fails until set | Owner |
| [ ] | P1 | Neon preview branches | Vercel → Integrations → Neon, or GitHub secret `NEON_API_KEY` + variable `NEON_PROJECT_ID` | One shared preview branch, or the key so `neon-preview-cleanup.yml` deletes each PR's branch | Previews stop stalling on Neon's branch limit | Owner |
| [ ] | P1 | Branch protection on `main` | GitHub → Settings → Branches | Require the CI checks; allow auto-merge | `gh pr merge --auto` waits for CI instead of merging at once | Owner |
| [ ] | P1 | Confirm Neon region | Neon → Project settings | AWS Singapore (`aws-ap-southeast-1`) | Data location matches the privacy statements (ADR-002) | Owner |
| [ ] | P2 | Email + password sign-in (optional) | Vercel: `AWS_SES_REGION=ap-southeast-1`, `EMAIL_FROM`, `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` (Sensitive; IAM user limited to `ses:SendEmail`). SES: verify the domain, SPF/DKIM/DMARC, request production access | — | Email + password next to Google (ADR-009); hidden in production without SES | Owner |
| [ ] | P2 | Dedicated migration role | Neon | A role for `DATABASE_URL_MIGRATE` instead of the owner | Least privilege (ADR-006) | Owner + Claude |
| [ ] | P2 | `SITE_URL` (only with a custom domain) | Vercel | `https://<your-domain>` | Canonical links, sitemap, robots | Owner |
| [ ] | P2 | Vercel Pro | Vercel → Billing | — | Commercial use; per-minute job drain; more cron routes; weekly run beyond about 4 minutes of shops | Owner |
| [ ] | P2 | Vercel Firewall rate rule | Vercel → Firewall | Rate-limit `/api/auth/sign-in/*` | Extra brute-force protection | Owner |
| [ ] | P2 | Preview smoke tests | Vercel → Deployment Protection → Protection Bypass for Automation; GitHub secret `VERCEL_AUTOMATION_BYPASS_SECRET` | — | `smoke.yml` can check previews before merge | Owner + Claude |
| [ ] | P2 | `PRODUCTION_URL` variable (only with a custom domain) | GitHub → Variables | Production URL | `smoke.yml` checks the right domain | Owner |
| [ ] | P2 | Error tracking | New service: ADR and sub-processor row first | — | Exceptions with PII scrubbed (NFR-OBS) | Claude, then owner |
| [ ] | P2 | Restore drill and breach tabletop | Neon point-in-time restore; [breach runbook](compliance/breach-runbook.md) | — | Proven recovery before real data | Owner |
| [ ] | P2 | Local development environment | `apps/web/.env.local` (git-ignored) pointing at a Neon **dev branch**, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://localhost:3000` | — | `pnpm dev` with real sign-in and uploads; today the UI is verified by tests, builds and previews only | Owner + Claude |

## 2. Environment variable reference

| Name | Required | Where | Sensitive | Used by |
| --- | --- | --- | --- | --- |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Yes | Vercel | Yes (section 0) | `packages/db/src/client.ts` |
| `DATABASE_URL_WORKER` | No (falls back to `DATABASE_URL`) | Vercel | Yes | Jobs and cron |
| `DATABASE_URL_MIGRATE` | For migrations | GitHub `production` environment | GitHub secret | `migrate.yml`, `pnpm --filter @sa/db db:migrate` |
| `BETTER_AUTH_SECRET` | Yes in production | Vercel | Yes | `apps/web/server/auth-instance.ts` |
| `BETTER_AUTH_URL` | Yes in production | Vercel | No | `auth-instance.ts`, `auth-config.ts` |
| `GOOGLE_CLIENT_ID` | With Google sign-in | Vercel, Production | No | `auth-instance.ts`; presence checked in `auth-config.ts` |
| `GOOGLE_CLIENT_SECRET` | With Google sign-in | Vercel, Production | Yes | `auth-instance.ts` (server-only) |
| `AWS_SES_REGION`, `EMAIL_FROM` | For email + password | Vercel | No | `apps/web/server/email.ts` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | For email + password | Vercel | Yes | AWS SDK in `email.ts` |
| `CRON_SECRET` | For cron routes | Vercel | Yes | `apps/web/server/cron-auth.ts` |
| `ANTHROPIC_API_KEY` | No (templates otherwise) | Vercel | Yes | `apps/web/server/llm-config.ts` |
| `LLM_MODEL_EXPLAIN` | With the key above | Vercel; GitHub variable | No | `llm-config.ts`, `llm-eval.yml` |
| `ANTHROPIC_API_KEY_EVAL` | For the live eval | GitHub secret | — | `llm-eval.yml` |
| `NEON_API_KEY` / `NEON_PROJECT_ID` | For preview cleanup | GitHub secret / variable | — | `neon-preview-cleanup.yml` |
| `SITE_URL` | No | Vercel | No | `apps/web/lib/site.ts` |
| `PRODUCTION_URL` | No | GitHub variable | — | `smoke.yml` |

## 3. Known gaps (built, with a limitation)

| Done | Gap | Fix | Where |
| --- | --- | --- | --- |
| [ ] | If demo seeding fails or times out, the demo shop stays empty and isn't reseeded | Reseed an empty demo shop from the dashboard, or seed through a job | `apps/web/app/bat-dau/actions.ts` |
| [ ] | Very large order + SKU groups could overflow the merge's `int` sum (rolls back safely) | Cap quantities in the wire schema or sum as `bigint` | `packages/db/src/repositories/ingest.ts` |
| [ ] | Upload can't resume after a page reload | Keep hashed records in IndexedDB and resume from the last chunk (04 design) | `apps/web/app/tai-len/` |
| [ ] | `llm_call` doesn't store prompt version or fallback count; partial fallbacks are all `failed_placeholder` | Expand migration with the two columns, then the ">20% fallback in a day" alert | `packages/db`, SA-509 |
| [ ] | The weekly cron runs shops for at most about 4 minutes; the rest wait a week | Per-minute drain on Vercel Pro | `apps/web/app/api/cron/weekly/route.ts` |
| [ ] | Each upload recomputes the whole shop's metrics in memory | Scope by SKU, or move to a job once a cron drains the queue | `apps/web/server/metrics.ts` |
| [ ] | Signing in with Google skips TOTP 2FA on a linked account (Better Auth checks 2FA only on password sign-in) | Before a 2FA UI ships: require TOTP after the Google callback, or disable linking for 2FA users | `apps/web/server/auth.ts` |
| [ ] | Without SES in production, email + password is hidden, so password-only accounts can't sign in | Set up SES (section 1), or those users sign in with Google using the same email | `apps/web/server/auth-config.ts` |
| [ ] | Competitor median is computed at run time, not stored in `sku_week_metric.competitor_median_vnd` | Fill it during the metrics recompute if the profit view needs it | `packages/engine`, `packages/db` |
| [ ] | Shopee parsers are "assumed" (column names from memory) | 3 real anonymised exports per format (Q-D1), then mark `verified` | `packages/parsers` |
| [ ] | Throttled-4G p95 for the profit page is unmeasured | Measure on a working preview (NFR-PERF) | SA-304, SA-506 |

## 4. Remaining backlog (current requirements)

Descriptions in [08-delivery-plan.md](design/08-delivery-plan.md).

| Done | Item | What | Notes |
| --- | --- | --- | --- |
| [ ] | Slice H: SA-501 | Outcome measurement at 7 and 14 days, track record, learning (FR-09, US-06) | Needs a daily cron route (Hobby allows one run per route per day) |
| [ ] | Slice H: SA-502 | Data export: ZIP of CSVs, formula-injection safe (FR-11) | Security review |
| [ ] | Slice H: SA-503 | Account deletion: acknowledgement, 7-day undo, hard delete within 20 days (FR-11, US-08) | Security review |
| [ ] | SA-504 | Privacy policy, terms, complaint channel (Vietnamese UI pages) | Must be live before real sellers; public pages are already indexed |
| [ ] | SA-505 | Whole-app security pass: CSP, headers, ASVS L2 checklist | — |
| [ ] | SA-506 | Accessibility (WCAG 2.2 AA) and performance audits | — |
| [ ] | SA-507 | End-to-end tests of the full loop on a phone viewport | — |
| [ ] | SA-508 | Transfer impact assessment draft | Counsel |
| [ ] | SA-509 | Ops pages: jobs, LLM cost and fallback rate, KPIs, alerts; an admin role belongs here | Needs the `llm_call` columns (section 3) |
| [ ] | SA-208 | Parsers for product performance and mass-update exports | Unlocks the traffic rules (views, conversion) |
| [ ] | 2FA UI | TOTP enrolment and challenge pages (backend built) | Fix the Google + 2FA gap first (section 3) |

## 5. Open questions (not ours to decide alone)

| Done | Question | Who | Detail |
| --- | --- | --- | --- |
| [ ] | Q-L1 to Q-L6: data localisation, service classification, AI Law tier, transfer assessment, retention, household-business status | Counsel | [counsel-questions.md](compliance/counsel-questions.md) |
| [ ] | Do template-text cards also need the "AI-generated" label? | Counsel | [case study §4](case-study.md#4-whats-still-open) |
| [ ] | Anthropic: processing location, retention, no-training terms (Q-T2) | Owner | Must be in the privacy policy before beta |
| [ ] | Willingness to pay and pricing model (Q-B2) | Owner | Discovery |
| [ ] | Which Seller Centre exports exist, with which columns (Q-D1) | Owner, design partners | Real anonymised samples |

## 6. Future enhancements (beyond the MVP)

| Idea | Why | Notes |
| --- | --- | --- |
| Weekly email digest (SA-601, FR-15) | Sellers who don't open the app still see their actions | Needs SES |
| Discount what-if simulator (SA-602, FR-14) | Test a discount before a campaign | Reuses the engine's impact functions |
| Ask-your-data chat (SA-603, FR-13) | Questions answered from the shop's own data | Only after the AI Law re-assessment; strict query templates |
| Shopee Open Platform sync (FR-16, Phase 2) | No more manual exports | Needs ISV approval (Q-D2); same canonical model and PII allowlist |
| TikTok Shop and Lazada | Many sellers use more than one platform | Platform-agnostic model already in place |
| Agency multi-shop view | One login for several client shops | One owned shop per user today |
| Zalo digest | Sellers live in Zalo | "Could" in discovery |
| Claude Haiku 5.5 for card wording (risk R7) | About 30× cheaper | Only if the golden set and a 20-card human review show no quality drop |
| Category-default unit costs (risk R6) | Value before sellers enter costs | `unit_cost.source = 'category_default'` already allowed |
| Move data to a Vietnamese cloud (risk R1) | If counsel says localisation applies | Exit runbook in [research](research/vn-cloud-postgres.md) |
