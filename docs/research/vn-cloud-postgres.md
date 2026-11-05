# Vietnamese cloud Postgres: options and exit runbook (SA-006)

Status: Research · as of 04/11/2026 · owner: founder · traces R1, Q-L1, ADR-002

This prices and plans the ADR-002 exit path for the case where counsel answers Q-L1 with "user data must be stored in Vietnam". It does not perform the move. Prices are copied from provider pages on the as-of date, in VND per month **excluding VAT**. Anything a page does not state is marked "not stated" and becomes a quote question.

## 1. Provider comparison

Target size: about 2 vCPU, 4 GB RAM, 50 GB storage, Postgres 17 (what `docs/design/07-infrastructure.md` assumes on Neon).

| | Viettel IDC vDBS | VNPT PostgreSQL | FPT Relational Database Engine | CMC Cloud RDS |
| --- | --- | --- | --- | --- |
| Postgres version | 12.0 and 15.0 (brochure) | Not stated | Not stated | Not stated (engine listed) |
| Backups / PITR | Scheduled backups (daily, monthly, quarterly) and restore from backup; PITR not stated | Scheduled backups (daily, weekly, monthly) and PITR "to the exact moment of the failure" | "Restore and backup by point in time"; backups are periodic; retention not stated | Scheduled and manual backups, incremental backup/restore; PITR not stated |
| HA | "Replication" mode for Postgres; "Cluster" coming soon | Cluster with auto-failover, sync or async replication | Fails over to a standby node | Primary–replica cluster, replicas across availability zones |
| Region | Not stated for vDBS | Not stated (VNPT cites 8 Tier III data centres) | Not stated | Not stated |
| Connection pooling | Not stated | Not stated | Not stated | Not stated |
| Encryption at rest | Not stated | Yes, at rest and in transit | Not stated | Not stated |
| Public endpoint | Private and public access | Private and public access | Not stated | Not stated |
| Closest published price | None | `ci.large` 2 vCPU / 4 GB / **20 GB** per node: **498.400 ₫**. First tier with ≥ 50 GB: `mi.large` 2 vCPU / 8 GB / 150 GB: 1.200.500 ₫ | None | "C6 Large 2 DB" 2 vCPU / 4 GB / 50 GB system disk: **735.000 ₫** |
| Pricing | Quote only | Public list price; custom configurations by quote | Quote only | Public list price |

Sources (all opened 04/11/2026):
- Viettel IDC: [vDBS product page](https://viettelidc.com.vn/viettel-database-service) (no price; "Nhận tư vấn") and [vDBS brochure PDF](https://viettelidc.com.vn/uploadimage/Root/root/VIETTEL-DATABASE-SERVICE2-3.pdf) (file modified 31/03/2025, so versions may be out of date).
- VNPT: [VNPT PostgreSQL](https://cloud.vnpt.vn/dich-vu/postgre-sql).
- FPT: [FPT Relational Database engine](https://fptcloud.com/product/fpt-relational-database-engine/) and [price list](https://fptcloud.com/bang-gia/) (database rows say "contact sales").
- CMC: [Relational Database Service](https://cmccloud.vn/dich-vu/relational-database-service) (the [RDS docs page](https://cmccloud.vn/document/relational-database-service) had no Vietnamese articles).

What the published prices do not answer: whether VNPT's per-node price doubles for an HA cluster, VNPT's price per extra GB, and whether CMC's price is one node or a primary plus replica and how its data disk is billed. No figure here should be read as a monthly total until a quote confirms it.

### Quote request (send to every provider, or at least the recommended one)

1. Postgres major versions offered. We need 17 (`pg_restore` cannot load into an older major version without rework). Upgrade policy and lead time for new majors.
2. Price per month for 2 vCPU / 4 GB / 50 GB, single node and HA (primary + standby), with VAT shown separately; price per extra GB of storage and of backup storage; egress charges.
3. Data-centre location for the instance and its backups (Hanoi or HCMC), stated in the contract. Backups must also stay in Vietnam.
4. PITR window and backup retention; can we restore into a separate instance for the monthly restore drill?
5. Built-in PgBouncer (or equivalent) and its pool mode.
6. Encryption at rest (and who holds the keys); TLS on the public endpoint with a CA we can pin.
7. Roles: can the admin role run `CREATE ROLE ... NOBYPASSRLS`, create policies, and does the admin role itself have `BYPASSRLS`? Is any role a superuser?
8. Extensions available: `pgcrypto`, `pg_stat_statements`.
9. Public endpoint with an IP allowlist; does it accept a /32 pair (Vercel Static IPs)?
10. SLA, support hours and language, invoicing for a foreign-owned or individual customer, minimum term.

## 2. Exit runbook outline

Preconditions: counsel's written answer to Q-L1; a signed quote; ADR-0NN recording the move (it changes ADR-002, `07-infrastructure.md` and the sub-processor list in `03-security-privacy.md`).

1. **Provision.** Create the instance in the region named in the quote, Postgres 17, HA if the quote allows it, PITR on, encryption at rest on, public endpoint restricted to Vercel's static egress IPs ([Vercel Static IPs](https://vercel.com/docs/connectivity/static-ips): Pro plan, USD 100 per month per project plus data transfer, as of 04/11/2026). Create a second small instance as staging.
2. **Driver change in `packages/db`.** The Neon serverless driver needs Neon's WebSocket proxy in front of Postgres ([Neon docs](https://neon.com/docs/serverless/serverless-driver)), so switch to `pg` over TCP with Drizzle's `node-postgres` adapter. Neon also accepts plain TCP, so make this change first and ship it while still on Neon. If the provider's pooler runs in transaction mode, `set_config(..., true)` in `withShopContext` still works because it is transaction-scoped; avoid named prepared statements.
3. **Roles and RLS.** Run the role and grant SQL (`sa_owner`, `sa_app`, `sa_worker` with `NOBYPASSRLS`, per `02-data-model.md`) on the new instance before restoring. Everything in the data path is standard Postgres (ADR-002), so `rls.sql`, `functions.sql` and `grants.sql` apply unchanged.
4. **Dry run.** Restore last night's dump into staging. Run the migration check, the RLS suite and the golden set against it. Record dump size and restore time; that sets the window. Because every tenant table uses `FORCE ROW LEVEL SECURITY`, `pg_dump` must run as a role with `BYPASSRLS` (check the Neon owner role has it), and the restore must run as a role that is not filtered by RLS. Confirm both in the dry run.
5. **Maintenance window.** Announce in Vietnamese at least 3 days ahead. At start: turn on maintenance mode (writes return 503), pause the cron drain, then take a custom-format dump: `pg_dump -Fc --no-owner` with a v17 client against the unpooled URL. Restore with `pg_restore --no-owner --role=sa_owner`, then re-run `grants.sql`. Compare per-table row counts and `max(updated_at)`.
6. **Switch.** Set `DATABASE_URL`, `DATABASE_URL_WORKER` (Vercel production) and `DATABASE_URL_MIGRATE` (GitHub Actions) to the new host. Redeploy, because Vercel reads env vars at deploy time. Run smoke tests and `/api/health`, then turn off maintenance mode and resume the cron drain.
7. **Latency.** Functions stay in `sin1`. WonderNetwork pings from Singapore over 21/10–04/11/2026 averaged 28–92 ms to [Ho Chi Minh City](https://wondernetwork.com/pings/Singapore/Ho%20Chi%20Minh%20City) and 37–65 ms to [Hanoi](https://wondernetwork.com/pings/Singapore/Hanoi), versus a same-region hop to Neon today. ADR-002's "~30–50 ms" is per round trip. A `withShopContext` transaction makes at least four (`begin`, `set_config`, the query, `commit`), so expect roughly 110–260 ms extra per request and longer Monday runs. Mitigations: send `set_config` together with the first query, batch reads in the weekly run, and keep the pool warm across invocations. Moving compute into Vietnam remains the next step if this is too slow.
8. **Previews and CI.** Keep Neon branch-per-PR for previews and CI. They hold only synthetic demo data (`07-infrastructure.md`), so no user data is involved; ask counsel to confirm this in the same Q-L1 answer. Add one CI job that runs migrations against the VN staging instance before production is migrated, because previews no longer run on the production engine.
9. **Rollback.** Keep the Neon production project untouched and read-only during the window. Before maintenance mode is turned off, rollback means reverting the env vars and redeploying, with no data loss. After writes reopen, rollback needs a reverse dump, so decide go/no-go before turning maintenance mode off. Once the move is accepted, delete the Neon production project (including its PITR history) within the period counsel sets, and update the sub-processor register and the transfer impact assessment.

## 3. Recommendation

Request a quote from **VNPT** first. It is the only provider whose public page states all three things we depend on: point-in-time recovery, HA with automatic failover, and encryption at rest. It also publishes a list price close to our size (`ci.large`, 498.400 ₫ per node, excluding VAT, for 20 GB) and offers extension management. Its gaps are the Postgres version, region, connection pooling, storage pricing beyond 20 GB, and HA pricing. Questions 1–5 of the quote request cover all of them. CMC is the fallback: it has a cheaper published price at the exact size (735.000 ₫), but its page does not state PITR or encryption at rest. Viettel's brochure lists Postgres 15 as the latest version, and both Viettel and FPT are quote-only, so neither is worth contacting first.
