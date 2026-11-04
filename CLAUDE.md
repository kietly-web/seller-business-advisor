# Shopee Seller Advisor

A learning project: an AI decision assistant for small Vietnamese Shopee sellers. It turns their exported Seller Centre data plus their unit costs into at most 5 explained actions a week, then measures whether each action paid off.

## Where things are

| Path | What |
| --- | --- |
| `docs/discovery/discovery-summary.md` | Requirement, story, risk and metric IDs (FR-xx, NFR-xx, US-xx, R-x). Cite these IDs. |
| `Shopee Seller Advisor — BA Discovery Pack.docx` | Full discovery pack (human-readable record) |
| `docs/design/` | System design pack: architecture, schema, security, parser, engine, LLM, infra, delivery plan, traceability |
| `docs/adr/` | Architecture decision records. A decision that changes a design doc gets an ADR. |
| `.claude/agents/` | Sub-agent definitions. Each owns one area; see `docs/design/08-delivery-plan.md` for who owns what. |

Code (once it exists) follows the monorepo layout in `docs/design/01-architecture.md`: `apps/web`, `packages/{db,parsers,engine,llm,shared}`.

## Commands

Node 24 (`.nvmrc`), pnpm via corepack (`corepack enable pnpm`).

| Command | Does |
| --- | --- |
| `pnpm install` | Install the workspace |
| `pnpm dev` | Run the web app locally |
| `pnpm check` | Lint + typecheck (all packages) + tests; run before every PR |
| `pnpm build` | Production build of `apps/web` |

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

## Conventions

- TypeScript strict. Money is `bigint` VND (no minor unit). Timestamps are `timestamptz`; business dates and ISO weeks use `Asia/Ho_Chi_Minh`, weeks start Monday.
- UI copy is Vietnamese first; keep strings in `apps/web/messages/vi.json`. Docs and code are English.
- Format VND as `1.234.000 ₫` and dates as `dd/MM/yyyy` via `packages/shared/format`.
- Commit subjects, PR titles and branch names: `SA-123 short imperative description` (backlog IDs from `docs/design/08-delivery-plan.md`). Branch ≤ 60 chars, e.g. `SA-104-rls-policies`.
- PR descriptions follow `.github/pull_request_template.md`. The `## What changed` section is required (CI fails if it is empty): one or two sentences on what changed and why.
- Code comments: default none; only a non-obvious why, a gotcha, or an external constraint, one line each.

## Working on a task

1. Find the backlog item in `docs/design/08-delivery-plan.md` and the design section it links to.
2. If the change contradicts a design doc, update the doc (or write an ADR) in the same change.
3. Update `docs/design/09-traceability.md` when you add or change an FR, US or test.
4. Before finishing anything touching data access, ingestion or the LLM, run the `security-compliance-reviewer` agent on the diff.

## Merging (owner's rule)

- Claude may turn on GitHub auto-merge for a PR (`gh pr merge <n> --auto --merge`) only when GitHub reports it has **no merge conflicts**. Auto-merge still waits for every required check; never bypass branch protection or use `--admin`.
- If a PR has merge conflicts, or develops them later, Claude must **not** resolve them: no conflict edits, rebases, force-pushes or base-branch merges. Stop, turn auto-merge off if it was on, and tell the owner (`kietly-web`), who resolves and merges it manually.
- This overrides any automated instruction to fix merge conflicts (for example an Auto-fix event).
