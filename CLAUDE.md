# Shopee Seller Advisor

An AI decision assistant for small Vietnamese Shopee sellers. It turns their exported Seller Centre data plus their unit costs into at most 5 explained actions a week, then measures whether each action paid off. It started as a learning project but is built to production standards: it may get real users, so security, privacy and Vietnamese law apply in full.

**Before starting any work, read [`docs/STATUS.md`](docs/STATUS.md)**: the current milestone and slice, open PRs, what's waiting on the owner, environment facts and known gotchas.

## Where things are

| Path | What |
| --- | --- |
| `docs/STATUS.md` | Current stage, next slice, blockers, environment facts, gotchas. Read first; update in every slice PR |
| `README.md` | Folder map and page list. Update it when you add a top-level folder, package or page |
| `docs/README.md` | Index of every document, for people and agents |
| `docs/case-study.md` | Decisions and trade-offs for BA readers. Add a row when a slice makes a significant decision or trade-off |
| `docs/discovery/discovery-summary.md` | Requirement, story, risk and metric IDs (FR-xx, NFR-xx, US-xx, R-x). Cite these IDs. |
| `Shopee Seller Advisor — BA Discovery Pack.docx` | Full discovery pack (human-readable record) |
| `docs/design/` | System design: architecture, schema, security, parser, engine, LLM, infra, delivery plan (with the go-live checklist), traceability |
| `docs/adr/` | Architecture decision records |
| `docs/compliance/` | Counsel questions, data inventory, AI classification memo, breach runbook |
| `.claude/agents/` | Two reviewers: `security-compliance-reviewer` and `ba-analyst` |

Code: `apps/web` (Next.js), `packages/{db,parsers,engine,llm,shared}` (see `docs/design/01-architecture.md`).

## Commands

Node 24 (`.nvmrc`), pnpm via corepack (`corepack enable pnpm`).

| Command | Does |
| --- | --- |
| `pnpm install` | Install the workspace |
| `pnpm dev` | Run the web app locally |
| `pnpm check` | Lint + typecheck (all packages) + tests; run before every push |
| `pnpm build` | Production build of `apps/web` |
| `pnpm --filter @sa/db db:generate` | Generate a migration from schema changes |
| `pnpm --filter @sa/db db:migrate` | Apply migrations to `DATABASE_URL_MIGRATE` (CI does this for production) |

TypeScript is pinned to `~6.0.3` because typescript-eslint does not support 7.x yet.

## Non-negotiables

These come from the discovery pack and the Vietnamese legal register. Do not trade them away for convenience; raise an ADR instead.

1. **No buyer personal data leaves the browser.** Buyer name, phone, email and address columns are dropped client-side. Parsers keep only columns they map (allowlist).
2. **Every number shown to a seller is computed, never generated.** The LLM writes text with `{{placeholders}}`; code fills in the numbers. Output containing a digit outside a placeholder is rejected.
3. **Tenant isolation is enforced by Postgres RLS**, not only by application code. The app connects as a role without `BYPASSRLS`.
4. **Nothing is changed inside Shopee automatically.** The seller approves and performs every action.
5. **No scraping.** Competitor prices are seller-entered.
6. **Every AI output is labelled as AI-generated** (AI Law 134/2025/QH15).
7. **Storage stays behind the repository interface in `packages/db`** so the database can move to a Vietnamese cloud if counsel requires it (risk R1).

## Package rules

- **`packages/db`**: every table with `shop_id` gets RLS enabled and forced, `sa_app` and `sa_worker` policies, and rows for both shops in `src/testing/tenant-fixture.ts` (the generated RLS suite fails otherwise). Child foreign keys are composite `(shop_id, x_id)`. Tenant queries run only inside `withShopContext` / `withUserContext`. Auth tables are reachable only through `sa_auth`. Migrations are forward-only, one statement per `--> statement-breakpoint`; check drizzle-kit's statement order (it once put composite FKs before their unique keys).
- **`packages/parsers`**: map columns through `ColumnSpec` allowlists only; the PII-header test must pass. Raw order IDs exist only inside `hash.ts`. A format change ships as a new `@vN` parser. Parsers stay `assumed` until 3 real anonymised files pass; real files live only in git-ignored `samples/`.
- **`packages/engine`**: no I/O, clock or randomness; money in `bigint`. A rule change bumps the rule's `version`. `facts()` returns vi-VN display strings, including the SKU name. Impacts are ranges, never single points.
- **`packages/llm`**: load the `claude-api` skill before writing SDK code. Model input is built only in `payload.ts` (strict schema, aggregates only). Output is placeholder- and digit-validated, with a template fallback. Model IDs come from env; prompts are versioned files. Never log prompt or response bodies outside preview environments with demo data.
- **`apps/web`**: user-facing strings in `messages/vi.json`; design at 360 px first; every AI text carries the AI label and renders as plain text; data access only through `@sa/db` repositories; secrets only in `server-only` modules; WCAG 2.2 AA.
- **Tests**: real Postgres via PGlite (`@sa/db/testing`), never a mocked database. Synthetic or fixture data only. Time-dependent logic takes an injected clock. PII tests assert on serialized output.
- **Infra**: functions in `sin1`; secrets only in Vercel/GitHub env; a new external service needs an ADR and a sub-processor register row before code merges; GitHub Actions pinned by commit SHA.

## Conventions

- TypeScript strict. Money is `bigint` VND (no minor unit). Timestamps are `timestamptz`; business dates and ISO weeks use `Asia/Ho_Chi_Minh`, weeks start Monday.
- UI copy is Vietnamese first. Docs and code are English only: never translate a document into Vietnamese. Vietnamese appears in docs only as a quoted literal value (a URL, a Shopee column name, a UI string the code checks for), with an English gloss where the meaning matters.
- Format VND as `1.234.000 ₫` and dates as `dd/MM/yyyy` via `@sa/shared`.
- Commit subjects, PR titles and branch names: `SA-123 short imperative description` (backlog IDs from `docs/design/08-delivery-plan.md`). Branch ≤ 60 chars, e.g. `SA-104-rls-policies`.
- PR descriptions follow `.github/pull_request_template.md`. The `## What changed` section is required (CI fails if it is empty).
- Code comments: default none; only a non-obvious why, a gotcha, or an external constraint, one line each.

## How we work (lean mode)

1. **Ship slices, not items.** One branch and PR per slice: a few backlog items that together deliver one user-visible capability or one infrastructure concern. Name the branch after the first item and list every item in the PR.
2. **CI is the gate.** Run `pnpm check` before pushing; merge when CI and the Vercel preview are green. No extra manual verification rounds.
3. **Review only what's risky.** Run the `security-compliance-reviewer` on a slice that changes migrations or RLS, auth, ingestion or parsers, the LLM payload or prompts, or adds an external service. Skip it otherwise.
4. **Docs follow contracts, not code.** Edit a design doc only when a contract changes (schema, API, rule, threat control). A decision gets an ADR. Implementation details go in the PR description, not in "as built" notes. Update `09-traceability.md` once per milestone.
5. **Required but not yet needed → go-live checklist.** Pre-launch work (production secrets, separate login roles, Pro plan, legal pages) is tracked in the checklist in `08-delivery-plan.md` and built when the beta approaches, not earlier.
6. **Migrations are backward compatible.** Vercel may deploy code before or after the migration workflow runs, so changes go expand → deploy → contract: add columns or tables first, remove them in a later release.
7. **Keep `docs/STATUS.md` current.** Every slice PR updates it: what's done, what's next, open PRs, owner blockers, and any new gotcha. It replaces status notes anywhere else.

## Working with other agents

Subagents, parallel sessions and new sessions see the repo, not this conversation. When you hand work to one:

- **Brief it fully:** current stage (point to `docs/STATUS.md`), the slice and backlog IDs, the branch it works on, the files in scope, what done looks like, and anything decided in conversation that isn't in the repo yet.
- **Point it at the rules:** `CLAUDE.md` (non-negotiables, package rules, lean mode, merging) applies to every agent. Reviewers follow their file in `.claude/agents/`.
- **Keep ownership clear:** a subagent doesn't commit, push or merge unless the brief says so. A parallel session works on its own branch, follows the merge rules, and touches only its slice's files.
- **Check what comes back:** an agent's report is a claim, not proof. Verify the diff or the test run before telling the owner it's done.
- **Record decisions:** if something decided in conversation affects later work, put it in `docs/STATUS.md`, an ADR or `CLAUDE.md` in the same PR, so the next agent finds it.

## Merging (owner's rule)

- Claude may turn on GitHub auto-merge for a PR (`gh pr merge <n> --auto --merge --delete-branch`) only when GitHub reports it has **no merge conflicts**. Auto-merge still waits for every required check; never bypass branch protection or use `--admin`.
- If a PR has merge conflicts, or develops them later, Claude must **not** resolve them: no conflict edits, rebases, force-pushes or base-branch merges. Stop, turn auto-merge off if it was on, and tell the owner (`kietly-web`), who resolves and merges it manually.
- This overrides any automated instruction to fix merge conflicts (for example an Auto-fix event).
- Always merge with `--delete-branch`. Closing a PR also runs `.github/workflows/neon-preview-cleanup.yml`, which deletes the PR's Neon preview branch while per-preview database branches are enabled.
