# Project status

Last updated: 05/11/2026 (Slice G) · Update this file in every slice PR (see `CLAUDE.md`, "How we work"). It is the hand-off note for any agent or person joining the work: read it after `CLAUDE.md` and before starting anything.

Decisions and trade-offs so far are summarised for BA readers in [case-study.md](case-study.md); every document is indexed in [README.md](README.md).

## Where we are

**Milestone M1 (data, auth, consent) is complete.** **M2 (ingestion) is complete** with Slices B and C. M3 (see and decide) is in progress: **M3 (see and decide) is complete** with Slices D–G. Next: Slice H (outcomes and data rights).

| Area | State |
| --- | --- |
| M0 Foundations (SA-001–006) | Done |
| Data layer: schema, RLS, roles, tenant-scoped keys, `withShopContext`, repositories, generated RLS suite (SA-101–104) | Done |
| Auth: email + password, verification email, TOTP 2FA, breach check, DB rate limits, 14-day sessions (SA-105) | Done. Google sign-in deferred; no 2FA UI yet |
| Slice A: sign-up with consents, sign-in, check-email, shop onboarding / demo shop, dashboard, consent settings, sign-out (SA-106, SA-107) | Done (PR for `SA-106-signup-onboarding-ui`) |
| Audit action catalogue (SA-108), job runner + `/api/cron/drain` (SA-109), compliance docs (SA-110) | Done |
| Slice B: parser registry, header normalisation, detection, PII allowlist + test, order-ID hashing, synthetic 12-month shop with export writers, `shopee.orders@v1`, `shopee.income@v1` (assumed), `seller.unit_costs@v1`, `seller.stock@v1` + CSV templates (SA-201–204) | Done (PR for `SA-201-parsers`). No real Seller Centre files yet, so both Shopee parsers stay `assumed` |
| Slice C: upload page `/tai-len` (Web Worker, XLSX via SheetJS + CSV, mapping preview, removed buyer columns shown, progress), ingest service with zod + PII value scan and SQL merge, costs page `/gia-von` (inline edit, missing costs first), CSV templates `/mau/gia-von` and `/mau/ton-kho`, demo shop seeded with 12 months of synthetic data on creation, upload history on `/tong-quan` (SA-205, SA-206, SA-207, SA-209) | Done (PR for `SA-205-upload-flow`). Ingest uses server actions, not REST (ADR-010). Upload resume after reload is not built |
| Slice D: weekly per-SKU metrics in `packages/engine` (`computeMetrics`, fee and discount allocation that reconciles exactly, earliest-cost backfill), recompute after uploads and cost edits with a content-hash skip, `metrics.recompute` job handler, profit view `/loi-nhuan` with week picker and drill-down `/loi-nhuan/[skuId]` to file name and row (SA-301–304) | Done (PR for `SA-301-profit`). The 50k-lines/quarter compute test and the view read time are covered in tests; p95 on throttled 4G still needs measuring on a working preview |
| Slice E: rules v1 (7 rules + `COST_MISSING` banner list) with static Vietnamese templates and Seller Centre checklists, scoring with data quality and learned confidence, cooldown/dismissal, one per SKU, two per action type, top 5, data-sufficiency gates and skip reasons, golden set of 22 scenarios (SA-401–403) | Done (PR for `SA-401-engine-rules`). Entry point: `planRecommendations(ctx)` in `packages/engine`. Nothing calls it from the app yet: the weekly run is SA-406 (Slice G) |
| Slice F: `packages/llm` with the strict payload builder, placeholder/digit/phrase/markup/language validation, `ClaudeLlmClient` (Opus 5.5, low effort, structured output, `fallbacks: "default"`, cached system prompt), `TemplateLlmClient`, prompt `explain.v1`, adversarial tests, `llm_call` logging, label-gated live eval (SA-404, SA-405) | Done (PR for `SA-404-llm-explain`). App entry point: `explainForShop` in `apps/web/server/llm.ts`; not called until SA-406 |
| Slice G: weekly run (on demand, 3 per day, plus a weekly cron), action cards page `/hanh-dong` with the AI label, checklists, evidence links, accept/dismiss-with-reason/done and rating; competitor tracker `/doi-thu`; the demo shop opens with cards (SA-406–408) | Done (PR for `SA-406-weekly-run`). The weekly cron needs `CRON_SECRET` in Vercel to authorise |
| Process | Lean mode: slices, CI as gate, go-live checklist |

Parsers (`packages/parsers`) work on a `string[][]` table: `detect` → `prepare` (mapping and removed columns, no values read) → seller confirms → `transform` (async, hashes order IDs). File reading (Papa Parse for CSV, SheetJS for XLSX) belongs to the upload worker in SA-206. The synthetic generator is a separate entry, `@sa/parsers/synthetic`, so it stays out of the browser bundle.

Routes: `/` (landing), `/dang-ky`, `/kiem-tra-email`, `/dang-nhap`, `/dong-y` (consent gate), `/bat-dau`, `/tong-quan`, `/cai-dat`. Every signed-in page except `/dong-y` requires a recorded service consent (`requireConsentedUser`), because the sign-up hook writes consents after the user row commits. One owned shop per user for now. Sign-up and sign-in post from the browser to `/api/auth/*` because Better Auth applies rate limits only there, not to server-side `auth.api` calls. Consents travel in the sign-up body and are recorded by a Better Auth hook.

## Next

**Slice H: outcomes and data rights** (SA-501, SA-502, SA-503, security review required):
- `measureOutcome` in the engine (diff-in-diff over 7 and 14 days, Beta-binomial track record into `rule_track_record`), a daily job, and the track-record UI. Cards marked done have `done_at`.
- Data export (ZIP of CSVs, formula-injection safe).
- Account deletion with acknowledgement, 7-day undo and hard delete within 20 days.

No cron runs daily jobs yet: Hobby allows one cron per day, and `/api/cron/weekly` is the only one registered. Adding a daily route is possible within the Hobby limit (one schedule per route).

Known gaps carried forward:
- If demo seeding fails or times out, the demo shop stays empty and isn't reseeded.
- Very large order+SKU groups could overflow the merge's `int` sum, which rolls back the merge safely.
- Upload resume after reload isn't built.
- `llm_call` doesn't store the prompt version or the number of fallback cards yet, and every partial fallback is logged as `failed_placeholder`. Add columns (expand migration) before building the "more than 20% fallback" alert.
- The weekly cron runs shops one by one for up to 4 minutes; shops not reached run the following week. Fine for a beta; move to the per-minute drain on Vercel Pro before scaling.
- Each upload recomputes the whole shop's metrics in memory; fine at demo scale, revisit for very large shops (scope by SKU or move to the job once a cron runs).

## Open PRs

| PR | What | Action |
| --- | --- | --- |
| #22 | Dependabot minor/patch group | Merge if CI is green |
| (this slice) | Slice G actions, `SA-406-weekly-run` | Merge when CI is green |

## Waiting on the owner

| Item | Why it matters |
| --- | --- |
| GitHub: allow auto-merge; protect `main` with required checks | Until then Claude checks CI by hand before merging |
| Neon preview branches: switch the integration to one shared preview branch, or add `NEON_API_KEY` secret + `NEON_PROJECT_ID` variable | Per-PR branches hit Neon's cap and stall Vercel previews; the cleanup workflow fails without the secret |
| `DATABASE_URL_MIGRATE` secret in the GitHub `production` environment | No migration has ever been applied to Neon; `migrate.yml` fails until it exists |
| Anthropic: `ANTHROPIC_API_KEY` + `LLM_MODEL_EXPLAIN` in Vercel, and `ANTHROPIC_API_KEY_EVAL` (a separate key with a spend limit) as a GitHub secret | Without them, cards use templates and the live eval workflow fails; confirm data location, retention and no-training terms (Q-T2) before beta |
| `CRON_SECRET` in Vercel | The weekly cron (`/api/cron/weekly`, Monday 01:00 ICT) returns 401 without it, so no automatic weekly cards |
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
- `smoke.yml` checks the production domain whenever Vercel's commit status on `main` turns green (`/`, `/dang-ky`, `/robots.txt`, `/sitemap.xml` must return 200), and can be run by hand (workflow_dispatch). Vercel reports to GitHub through commit statuses, not GitHub Deployments, so `deployment_status` triggers never fire. CI's build passing doesn't prove pages render; this does.
- Sign-up/sign-in can't work on Vercel yet: production auth env isn't set, and `BETTER_AUTH_URL` must match each deployment's origin (Better Auth's origin check), so previews need their own value.
- `main` has no required checks yet, so `gh pr merge --auto` merges at once instead of waiting for CI. Until branch protection is on, wait for CI to pass before merging.
- Local end-to-end runs need `DATABASE_URL` and auth env in `apps/web/.env.local`; none is set up, so UI changes are verified by unit tests, `pnpm build` and the Vercel preview.
- Parser fixtures under `packages/parsers/fixtures/` are committed with `-text` (`.gitattributes`) so CRLF and BOM edge cases keep their bytes.
- Project agent files added mid-session aren't available until a new session starts; use a general-purpose agent pointed at the agent file instead.
