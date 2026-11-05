# Project status

Last updated: 05/11/2026 (Slice A) · Update this file in every slice PR (see `CLAUDE.md`, "How we work"). It is the hand-off note for any agent or person joining the work: read it after `CLAUDE.md` and before starting anything.

## Where we are

**Milestone M1 (data, auth, consent) is complete** once Slice A merges. Next milestone: M2 ingestion.

| Area | State |
| --- | --- |
| M0 Foundations (SA-001–006) | Done |
| Data layer: schema, RLS, roles, tenant-scoped keys, `withShopContext`, repositories, generated RLS suite (SA-101–104) | Done |
| Auth: email + password, verification email, TOTP 2FA, breach check, DB rate limits, 14-day sessions (SA-105) | Done. Google sign-in deferred; no 2FA UI yet |
| Slice A: sign-up with consents, sign-in, check-email, shop onboarding / demo shop, dashboard, consent settings, sign-out (SA-106, SA-107) | Done (PR for `SA-106-signup-onboarding-ui`) |
| Audit action catalogue (SA-108), job runner + `/api/cron/drain` (SA-109), compliance docs (SA-110) | Done |
| Process | Lean mode: slices, CI as gate, go-live checklist |

Routes: `/` (landing), `/dang-ky`, `/kiem-tra-email`, `/dang-nhap`, `/dong-y` (consent gate), `/bat-dau`, `/tong-quan`, `/cai-dat`. Every signed-in page except `/dong-y` requires a recorded service consent (`requireConsentedUser`), because the sign-up hook writes consents after the user row commits. One owned shop per user for now. Sign-up and sign-in post from the browser to `/api/auth/*` because Better Auth applies rate limits only there, not to server-side `auth.api` calls. Consents travel in the sign-up body and are recorded by a Better Auth hook.

## Next

**Slice B: parsers** (SA-201–204): parser registry, header normalisation and detection, PII allowlist and test, synthetic demo-shop generator with export writers, orders/income/cost/stock parsers with fixtures. Security review required (ingestion). Then Slice C (upload flow). Full slice list: `docs/design/08-delivery-plan.md`.

## Open PRs

| PR | What | Action |
| --- | --- | --- |
| #22 | Dependabot minor/patch group | Merge if CI is green |

## Waiting on the owner

| Item | Why it matters |
| --- | --- |
| GitHub: allow auto-merge; protect `main` with required checks | Until then Claude checks CI by hand before merging |
| Neon preview branches: switch the integration to one shared preview branch, or add `NEON_API_KEY` secret + `NEON_PROJECT_ID` variable | Per-PR branches hit Neon's cap and stall Vercel previews; the cleanup workflow fails without the secret |
| `DATABASE_URL_MIGRATE` secret in the GitHub `production` environment | No migration has ever been applied to Neon; `migrate.yml` fails until it exists |
| Production auth env in Vercel (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, SES settings) | Sign-up can't work on Vercel without them (go-live checklist) |

## Environment facts

- **Vercel** project `ai-learning12/seller-business-advisor`, Hobby plan: Framework Next.js, Root Directory `apps/web`, Node 24.x, functions `sin1`. Docs-only commits don't rebuild (nothing under `apps/web` changed); use `vercel redeploy` if a preview must rebuild.
- **Neon** via the Vercel integration: `DATABASE_URL` / `DATABASE_URL_UNPOOLED` use the owner role; preview deployments get their own branch. Region must be AWS Singapore (owner to confirm in the console).
- **GitHub secrets/variables:** none set yet.
- **Claude's CLI access:** `gh` and the Vercel CLI are signed in as `kietly-web` on the owner's Mac; there is no Neon access.

## Gotchas we've hit

- The shell is **zsh**: an unquoted `$var` holding several words is *not* split. Loop or use `xargs`.
- **pnpm 12** fails installs on unapproved build scripts; approvals live in `pnpm-workspace.yaml` (`allowBuilds`). It also holds back packages younger than its minimum release age; pick versions at least a week old.
- **drizzle-kit** can't serialise `bigint` defaults (use `sql\`0\``) and once emitted composite FKs before their unique keys; read every generated migration.
- The Drizzle migrator sends each `--> statement-breakpoint` chunk as one prepared statement: one statement per chunk.
- **Tests** use PGlite (in-process Postgres 18) via `@sa/db/testing`; no Docker needed.
- **gitleaks** flags secret-looking literals in tests; generate test secrets at runtime.
- If `git push` fails with `could not read Username`, push with gh's login for that command only: `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push`. Don't change the global git config.
- **`server-only`** throws when imported in Vitest; keep testable logic in modules that don't import it.
- **SEO is on** (owner's decision, 05/11/2026): public pages `/`, `/dang-ky`, `/dang-nhap` are indexable with `robots.txt` and `sitemap.xml`; signed-in pages carry `noindex` and are disallowed. Public pages render as signed-out when auth isn't configured (`getOptionalSessionUser`); signed-in pages still fail loudly.
- `smoke.yml` checks the production domain after every production deploy (`/`, `/dang-ky`, `/robots.txt`, `/sitemap.xml` must return 200). Previews are skipped until the Vercel bypass secret exists. CI's build passing doesn't prove pages render; this does.
- Sign-up/sign-in can't work on Vercel yet: production auth env isn't set, and `BETTER_AUTH_URL` must match each deployment's origin (Better Auth's origin check), so previews need their own value.
- Project agent files added mid-session aren't available until a new session starts; use a general-purpose agent pointed at the agent file instead.
