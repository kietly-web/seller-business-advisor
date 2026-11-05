# ADR-010 Ingest through server actions, not REST routes

Status: Accepted · 2026-11-05

## Context

`04-ingestion-parser.md` specified four REST endpoints under `/api/ingest`. The only caller today is our own upload page, which already runs on Next.js. Cookie-authenticated JSON routes need their own CSRF and origin checks, and a body-size limit.

## Decision

The upload page calls four server actions (`startUpload`, `sendChunk`, `finishUpload`, `cancelUpload`). Each is a thin wrapper over `apps/web/server/ingest.ts`, which owns validation (zod, PII scan) and calls the `@sa/db` ingest repository. Chunks carry at most 1,000 records to stay under the 1 MB server-action body limit.

## Consequences

- Next.js checks the `Origin` header on server actions, so there is no separate CSRF code to get wrong.
- There's no public HTTP API. A future external client (the Phase 2 Open Platform adapter runs server-side) calls the service functions directly, or gets REST routes over the same service.
- Twice as many chunks as the 2,000-record design. That's acceptable: a 50,000-line export is 50 requests.

## Alternatives considered

- REST routes with a manual origin check and content-type gate: more code on the security boundary for no current caller.
