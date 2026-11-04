# ADR-001 Modular monolith: Next.js App Router + workspace packages

Status: Accepted · 2026-11-04

## Context

A small team (one person plus sub-agents) is building an MVP whose main flows are upload → compute → recommend → measure. Discovery fixed Next.js on Vercel. The domain has clear seams: parsing, which runs in the browser and on the server, the engine (pure logic), the LLM adapter, and data access.

## Decision

One Next.js App Router app (`apps/web`) plus pnpm workspace packages `db`, `parsers`, `engine`, `llm`, `shared`. Packages enforce the seams and give each sub-agent a clear area of ownership. `engine` and `parsers` have no I/O.

## Consequences

- One deploy, one runtime, one set of logs.
- The engine is unit-testable and reusable by the what-if simulator and the golden set.
- The parser package ships to the browser, so its dependencies must stay small and audited.
- Splitting out a service later (for example a VN-hosted data service, per ADR-002) is possible along package lines.

## Alternatives considered

- Separate API service (NestJS/Fastify) + Next.js front end: two deploys and more infrastructure for no MVP benefit.
- Single package with folders: seams erode, and sub-agent ownership blurs.
