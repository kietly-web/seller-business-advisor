# ADR-006 Drizzle ORM with SQL-defined RLS and per-transaction context

Status: Accepted · 2026-11-04

## Context

NFR-SEC requires row-level security per tenant, enforced in the database. The app runs on serverless functions with Neon's pooled connections, so session state must not leak between requests.

## Decision

- Drizzle ORM for schema and queries; Drizzle Kit for table migrations; hand-written SQL migration files for roles, grants, RLS policies and functions.
- The app connects as `sa_app` and jobs as `sa_worker`, both `NOBYPASSRLS`. Tables are `FORCE ROW LEVEL SECURITY`.
- Every tenant query runs inside `withShopContext()`, which opens a transaction and calls `set_config('app.shop_id', …, true)` (transaction-local), using the Neon WebSocket `Pool` driver.
- Migrations run only from CI with `sa_owner`.

## Consequences

- A forgotten context yields zero rows instead of leaking data.
- Each request carries a small transaction overhead, which is acceptable at MVP scale.
- The HTTP driver can only be used for non-tenant queries such as the health check.
- A CI check makes sure every `shop_id` table has policies, and a generated test suite covers new tables automatically.

## Alternatives considered

- Prisma: RLS with session variables is awkward with its connection handling, and it adds a heavier client.
- Neon RLS with JWT (`pg_session_jwt`, Data API): ties the design to Neon-specific features, against ADR-002.
- App-level filtering only: fails NFR-SEC.
