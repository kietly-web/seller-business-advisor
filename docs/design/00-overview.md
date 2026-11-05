# System Design Pack — Overview

Status: Draft v0.1 · 2026-11-04 · Follows the BA Discovery Pack (3 Nov 2026)

The MVP is one Next.js app on Vercel (Singapore) with one Neon Postgres database (Singapore). Seller files are parsed and stripped of buyer data in the browser. A deterministic rules engine produces recommendations, and Claude only phrases them. The design keeps three things replaceable: the storage location (risk R1), the export parsers (risk R2), and the LLM provider.

## What this pack answers

| Doc | Question it answers |
| --- | --- |
| [01-architecture.md](01-architecture.md) | What are the components, how do requests flow, and where does the code live? |
| [02-data-model.md](02-data-model.md) | What is the canonical schema, and how does RLS isolate shops? |
| [03-security-privacy.md](03-security-privacy.md) | What are the threats and controls, and how do we meet the Vietnamese privacy and AI rules? |
| [04-ingestion-parser.md](04-ingestion-parser.md) | How does an export file become trusted rows without buyer data ever leaving the browser? |
| [05-recommendation-engine.md](05-recommendation-engine.md) | How do metrics become ranked actions, and how are outcomes measured? |
| [06-llm-integration.md](06-llm-integration.md) | How is Claude called, and how do we guarantee it cannot invent numbers? |
| [07-infrastructure.md](07-infrastructure.md) | How are Vercel, Neon, CI/CD, environments, cron and observability set up? |
| [08-delivery-plan.md](08-delivery-plan.md) | In what order do we build, who (which sub-agent) owns what, and what counts as done? |
| [09-traceability.md](09-traceability.md) | Which design section and test covers each FR and user story? |
| [../adr/](../adr/) | Why each significant decision was made |

## Design principles

1. **Compute, then explain.** Numbers come from SQL and TypeScript, and text comes from the LLM. The two meet only through named placeholders.
2. **Minimise at the edge.** Data the product does not need never leaves the seller's device.
3. **Isolation in the database.** RLS on every tenant table, plus tests that try to break it.
4. **Provenance everywhere.** Every metric traces to an upload and a source row, and every recommendation cites its metrics and rule version.
5. **Boring infrastructure.** One app, one database, a Postgres job table, and as few sub-processors as possible, because each one is a cross-border transfer to disclose.
6. **Swappable edges.** Parsers, the storage location and the LLM provider each sit behind an interface.

## Key decisions

| ADR | Decision |
| --- | --- |
| [ADR-001](../adr/ADR-001-modular-monolith-nextjs.md) | Modular monolith: Next.js App Router + pnpm workspace packages |
| [ADR-002](../adr/ADR-002-neon-singapore-swappable-storage.md) | Neon Postgres in Singapore, behind a repository layer, with a Vietnamese-cloud exit path |
| [ADR-003](../adr/ADR-003-browser-side-parsing.md) | Parse and strip PII in the browser; shared isomorphic parser package |
| [ADR-004](../adr/ADR-004-rules-first-llm-explains.md) | Rules decide; the LLM explains through placeholders only |
| [ADR-005](../adr/ADR-005-claude-llm-provider.md) | Claude (Anthropic) as LLM provider behind an `LlmClient` interface |
| [ADR-006](../adr/ADR-006-drizzle-orm-rls.md) | Drizzle ORM + SQL-defined RLS with per-transaction session context |
| [ADR-007](../adr/ADR-007-better-auth.md) | Better Auth, self-hosted in our database |
| [ADR-008](../adr/ADR-008-postgres-job-queue.md) | Postgres-backed job queue drained by Vercel Cron, with no queue vendor |
| [ADR-009](../adr/ADR-009-ses-email-and-hibp.md) | Amazon SES Singapore for email; Have I Been Pwned range check for passwords |

## Out of scope for this pack

Pricing and billing, the TikTok Shop adapter, the agency multi-shop view, the Zalo digest, and the Phase 2 Open Platform adapter beyond its interface. They are noted where they shape an interface.

## Open items that can change the design

| ID | Item | Design impact if answered "yes" |
| --- | --- | --- |
| Q-L1 | Localisation applies to us | Move the primary DB to a VN cloud before beta (ADR-002 exit path) |
| Q-L3 | AI Law medium tier once chat ships | Classification dossier + notice to the Ministry of Science and Technology before FR-13 ships |
| Q-D1 | Real export columns | Replace assumed column maps in `packages/parsers` (format registry v1 → v2) |
| Q-T2 | Claude processing location and retention terms | Sub-processor register, privacy policy text, TIA |
| Q-I1 | Vercel plan | Per-minute cron and commercial use need Pro (see 07) |
