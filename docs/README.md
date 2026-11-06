# Documentation index

Every project document, grouped by what you want to know. If you read one thing, read the [case study](case-study.md).

## Start here

| Document | Read it to learn |
| --- | --- |
| [Case study: decisions and trade-offs](case-study.md) | The business problem, every major decision with its trade-off, what's open, lessons learned |
| [Project status](STATUS.md) | Where the build is now and what's next |
| [Setup and open work register](SETUP.md) | Every setting, secret, security fix, gap, backlog item and future idea not done yet, with steps |
| [BA Discovery Pack (.docx)](../Shopee%20Seller%20Advisor%20—%20BA%20Discovery%20Pack.docx) | The original discovery record: personas, journeys, requirements with Gherkin criteria, legal register |
| [Discovery summary](discovery/discovery-summary.md) | The requirement, story, metric and risk IDs (FR, NFR, US, R) cited everywhere else |

## Business and compliance

| Document | Read it to learn |
| --- | --- |
| [Counsel questions](compliance/counsel-questions.md) | The legal questions for counsel, with product facts and design impact |
| [Data inventory](compliance/data-inventory.md) | What personal data is held, where, why, and for how long |
| [AI classification memo](compliance/ai-classification-memo.md) | How the product is classified under the AI Law, and why |
| [Breach runbook](compliance/breach-runbook.md) | What to do in the 72 hours after a data breach |
| [Vietnamese cloud research](research/vn-cloud-postgres.md) | The exit path if data must be hosted in Vietnam |

## System design

| Document | Read it to learn |
| --- | --- |
| [00 Overview](design/00-overview.md) | The design in one page and its principles |
| [01 Architecture](design/01-architecture.md) | Components, request flows, where the code lives |
| [02 Data model](design/02-data-model.md) | Tables and how shops are isolated |
| [03 Security and privacy](design/03-security-privacy.md) | Threats, controls, sub-processors, Vietnamese law |
| [04 Ingestion and parsers](design/04-ingestion-parser.md) | How an export becomes trusted data without buyer data leaving the browser |
| [05 Recommendation engine](design/05-recommendation-engine.md) | Profit metrics, rules, ranking, outcomes |
| [06 LLM integration](design/06-llm-integration.md) | How Claude writes card text and why it can't invent numbers |
| [07 Infrastructure](design/07-infrastructure.md) | Vercel, Neon, CI/CD, environments |
| [08 Delivery plan](design/08-delivery-plan.md) | Backlog and slices |
| [09 Traceability](design/09-traceability.md) | Which design section and test covers each requirement |

## Decision records (ADRs)

| ADR | Decision |
| --- | --- |
| [001](adr/ADR-001-modular-monolith-nextjs.md) | One Next.js app with internal packages |
| [002](adr/ADR-002-neon-singapore-swappable-storage.md) | Neon Postgres in Singapore, kept swappable |
| [003](adr/ADR-003-browser-side-parsing.md) | Parse and strip buyer data in the browser; store no files |
| [004](adr/ADR-004-rules-first-llm-explains.md) | Rules decide; the LLM only explains |
| [005](adr/ADR-005-claude-llm-provider.md) | Claude (Anthropic) as the LLM provider |
| [006](adr/ADR-006-drizzle-orm-rls.md) | Drizzle ORM with database row-level security |
| [007](adr/ADR-007-better-auth.md) | Better Auth in our own database |
| [008](adr/ADR-008-postgres-job-queue.md) | Background jobs in a Postgres table |
| [009](adr/ADR-009-ses-email-and-hibp.md) | Amazon SES email and breached-password checks |
| [010](adr/ADR-010-ingest-server-actions.md) | Uploads through server actions, not a public API |

## For contributors and agents

| Document | Read it to learn |
| --- | --- |
| [Folder map](../README.md#folder-map) | What each folder contains and which page lives where |
| [CLAUDE.md](../CLAUDE.md) | Project rules, non-negotiables, how we work, merging |
| [Agent definitions](../.claude/agents/) | The security reviewer and BA analyst agents |
