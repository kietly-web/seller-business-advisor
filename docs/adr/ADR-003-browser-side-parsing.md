# ADR-003 Parse and strip PII in the browser; store no files

Status: Accepted · 2026-11-04

## Context

Discovery requires buyer personal data to be stripped in the browser before upload (FR-04), and proposed deleting raw upload files within 7 days of parsing. Vercel functions cap request bodies at 4.5 MB, while exports can reach 20 MB (NFR-PERF).

## Decision

- Parse the whole file in a Web Worker on the seller's device: detect the format, map columns with an **allowlist**, hash order IDs with a per-shop salt, and validate.
- Send only canonical records, in chunks of ≤ 2,000 rows. The server re-validates with the same zod schemas and rejects unknown keys and PII-shaped values.
- **Store no file bytes at all**, neither raw nor stripped. Store the file's SHA-256 and the removed column names for provenance and dedupe.
- Parser code is isomorphic (`packages/parsers`), so the Phase 2 Open Platform adapter and server-side tests reuse it.

## Consequences

- This is stronger than the discovery retention rule: there is no file to retain or delete. **Deviation from the discovery pack, noted for the change log.**
- No object storage service, so one fewer sub-processor.
- Fixing a parser bug can't re-process old files server-side; the seller re-uploads. Acceptable, because exports are easy to re-download and fixtures catch regressions.
- Low-end phones do the parsing work, which is bounded by a 25 MB cap and a streaming CSV path.

## Alternatives considered

- Strip in the browser, upload the stripped file to object storage, parse on the server: adds a sub-processor and a retention job, and needs presigned uploads to get around the 4.5 MB limit.
- Server-side parsing of raw files: violates FR-04.
