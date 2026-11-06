# Shopee Seller Advisor

An AI decision assistant for small Vietnamese Shopee sellers. A seller uploads their Seller Centre exports and unit costs. The app shows true profit per product each week and up to 5 explained actions, and later checks whether each action paid off. It started as a learning project to test how far Claude can take a full system, and it is built to production standards because real users may come.

## Where to start

| If you want to… | Read |
| --- | --- |
| Understand the business case and every major decision | [docs/case-study.md](docs/case-study.md) |
| Find any document | [docs/README.md](docs/README.md) |
| Know where the build is now and what's next | [docs/STATUS.md](docs/STATUS.md) |
| Pick up unfinished setup, gaps or future work | [docs/SETUP.md](docs/SETUP.md) |
| Work on the code (people or AI agents) | [CLAUDE.md](CLAUDE.md), then the folder map below |

## Folder map

```text
seller-business-advisor/
├── README.md                  You are here: what the project is and how the folders fit together
├── CLAUDE.md                  Rules for anyone changing the code: non-negotiables, package rules, how we work, merging
├── Shopee Seller Advisor — BA Discovery Pack.docx   The original business discovery (personas, requirements, legal register)
│
├── apps/
│   └── web/                   The only app: a Next.js website (Vietnamese UI), deployed on Vercel in Singapore
│       ├── app/               Pages and server actions, one folder per URL (see "Pages" below)
│       │   └── api/           Machine endpoints: sign-in (auth) and scheduled jobs (cron)
│       ├── server/            Server-only logic the pages call: sign-in, uploads, profit, weekly run, AI calls
│       ├── lib/               Small shared helpers: Vietnamese text lookup, site URLs, error messages
│       ├── messages/vi.json   Every piece of Vietnamese text shown to sellers
│       └── vercel.json        Hosting settings: Singapore region and the weekly cron schedule
│
├── packages/                  Building blocks the app uses; each has one job and clear limits
│   ├── db/                    The database: tables, migrations, row-level security, and every query (repositories)
│   │   ├── migrations/        Numbered SQL changes, applied in order, never edited after merge
│   │   └── src/
│   │       ├── schema/        Table definitions
│   │       ├── repositories/  All reads and writes, one file per area (uploads, costs, metrics, runs, …)
│   │       ├── rls/           Tests that try to read another shop's data and must fail
│   │       └── testing/       An in-memory Postgres for tests
│   ├── parsers/               Reads Shopee exports in the seller's browser and drops buyer data before upload
│   │   ├── src/parsers/       One file per export format, versioned (orders, income, unit costs, stock)
│   │   ├── src/synthetic/     A fake 12-month shop used for the demo and for tests
│   │   └── fixtures/          Small hand-made edge-case files
│   ├── engine/                The rules: weekly profit per product, the 7 recommendation rules, ranking
│   │   └── src/golden/        22 fixed scenarios with known right answers, run on every change
│   ├── llm/                   Claude integration: what we send, the prompt, and the checks on what comes back
│   │   ├── src/prompts/       Versioned prompts (explain.v1)
│   │   └── src/eval/          The paid live test, run only on request or nightly
│   └── shared/                Tiny helpers used everywhere: ID types, Vietnam dates and weeks, money formatting
│
├── docs/                      Everything written down (index: docs/README.md)
│   ├── case-study.md          Decisions and trade-offs for business analysts
│   ├── STATUS.md              Current stage and next slice
│   ├── SETUP.md               Everything not done yet: settings, secrets, gaps, backlog, future ideas
│   ├── discovery/             Requirement, story, metric and risk IDs (FR-xx, US-xx, R-x)
│   ├── design/                System design pack, 00–09 (architecture, data, security, parsers, engine, AI, infra, plan)
│   ├── adr/                   Decision records: one file per significant decision
│   ├── compliance/            Legal questions for counsel, data inventory, AI classification, breach runbook
│   └── research/              Background research (hosting in Vietnam)
│
├── .github/
│   ├── workflows/             Automated checks: CI, secret scan, migrations, AI eval, post-deploy smoke test
│   └── pull_request_template.md   Every PR must say what changed
├── .claude/agents/            Instructions for the AI reviewers (security and compliance, business analyst)
├── scripts/                   Small CI helper scripts
└── tests/                     Workspace-wide tests (package wiring)
```

Each `src/` folder keeps its tests next to the code (`*.test.ts`). Real seller files must go in a git-ignored `samples/` folder and are never committed.

### Pages

The site's URLs are Vietnamese. What each one is:

| URL | Page | Folder |
| --- | --- | --- |
| `/` | Landing page | `apps/web/app/page.tsx` |
| `/dang-ky`, `/dang-nhap` | Sign up, sign in | `app/dang-ky`, `app/dang-nhap` |
| `/kiem-tra-email`, `/dong-y` | Check your email; consent | `app/kiem-tra-email`, `app/dong-y` |
| `/bat-dau` | Create a shop or open the demo shop | `app/bat-dau` |
| `/tong-quan` | Dashboard | `app/tong-quan` |
| `/tai-len` | Upload Shopee exports and templates | `app/tai-len` |
| `/gia-von` | Unit costs | `app/gia-von` |
| `/loi-nhuan` | Weekly profit per product, with drill-down to source rows | `app/loi-nhuan` |
| `/hanh-dong` | This week's actions | `app/hanh-dong` |
| `/doi-thu` | Competitor prices | `app/doi-thu` |
| `/cai-dat` | Settings and consents | `app/cai-dat` |
| `/mau/gia-von`, `/mau/ton-kho` | Download cost and stock templates | `app/mau` |

### How the pieces depend on each other

```text
apps/web ──▶ engine, llm, parsers, db ──▶ shared
```

`engine`, `parsers` and `shared` do no input or output (no database, network or clock), so the same code runs in the browser, on the server and in tests. Only `db` talks to the database, and only `llm` talks to Claude.

## Run it locally

Node 24 and pnpm (via corepack):

```bash
corepack enable pnpm
```

```bash
pnpm install
```

```bash
pnpm check
```

`pnpm check` runs lint, type checks and all tests (they use an in-memory Postgres, so no database setup is needed). `pnpm dev` starts the site, but signing in and uploading need a database and auth settings in `apps/web/.env.local`; see [docs/STATUS.md](docs/STATUS.md#environment-facts).

## License

See [LICENSE](LICENSE).
