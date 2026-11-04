# ADR-008 Postgres-backed job queue drained by Vercel Cron

Status: Accepted · 2026-11-04

## Context

Background work: weekly runs per shop, metric recomputes after an upload, outcome measurement, data exports, deletions and retention purges. Volume during beta is tens to hundreds of shops. Each queue vendor (Inngest, QStash, and others) would be another sub-processor.

## Decision

An `app.job` table claimed with `FOR UPDATE SKIP LOCKED`, drained every minute by a Vercel Cron route, with exponential backoff, a `dedupe_key` for idempotency, and dead-lettering after `max_attempts`. Handlers run inside `withShopContext(job.shop_id)` as `sa_worker`.

## Consequences

- No new sub-processor; jobs are transactional with the data they touch.
- Latency of up to a minute for background work, which is fine for these flows.
- Needs Vercel Pro for per-minute cron.
- `enqueue()` and the handler registry form an interface, so a queue service can replace the drainer later without touching handlers.

## Alternatives considered

- Inngest / Upstash QStash / Vercel Queues: better tooling, but an extra vendor and a cross-border disclosure for little MVP benefit.
- Doing the work inline in requests: the weekly run would hit function time limits and can't retry.
