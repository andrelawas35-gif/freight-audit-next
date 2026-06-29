# Freight Audit Console — Project Plan (Archive)

> **This file has been restructured.** The active documentation is now:
>
> - **[`CLAUDE.md`](CLAUDE.md)** — System overview, invariants, conventions (always loaded)
> - **[`docs/data-layer.md`](docs/data-layer.md)** — DB schema, data access, migrations
> - **[`docs/ingestion.md`](docs/ingestion.md)** — Ingestion pipeline, adapters, SFTP, code mapping
> - **[`docs/audit-engine.md`](docs/audit-engine.md)** — Audit engines, rules, rulebook, job queue
> - **[`docs/disputes.md`](docs/disputes.md)** — Dispute pipeline, response parser, outcomes
> - **[`docs/portal.md`](docs/portal.md)** — Client portal UI, design system, console pages
> - **[`docs/auth.md`](docs/auth.md)** — Authentication, authorization, route protection
> - **[`docs/LAUNCH-BLOCKERS.md`](docs/LAUNCH-BLOCKERS.md)** — Remaining launch blockers
> - **[`docs/BACKLOG.md`](docs/BACKLOG.md)** — Post-launch work items
>
> The original monolithic content is preserved below for reference.

---

## Completed Gaps (historical record)

### 9.1 Database Schema Management — COMPLETED ✓
Installed Drizzle ORM + `drizzle-kit`. Created `db/schema.ts` with all 16 tables + 37 indexes. Generated baseline migration.

### 9.2 Transaction Safety — COMPLETED ✓
All financial write paths wrapped in BEGIN/COMMIT/ROLLBACK: `batchCreate()`, `stageFulfillment()`, `stageStorage()`, both engines.

### 9.3 API Input Validation — COMPLETED ✓
Zod schemas with `safeParse()` on all 6 API routes. Server action validation remains (see LAUNCH-BLOCKERS).

### 9.4 `/api/run-audit` Auth + Concurrency — COMPLETED ✓
Auth + Zod. Concurrency via `audit_jobs` queue: one running job per scope, `FOR UPDATE SKIP LOCKED`.

### 9.5 Pagination — CORE COMPLETED ✓
Keyset pagination (`fetchAllRecords`), chunked hydration, `created_at <= run_started_at` cutoff, GIN + composite indexes. UI "showing X of Y" remains.

### 9.6 Background Jobs — COMPLETED ✓
Postgres job queue, Vercel Cron, enqueue → poll UI, `data_clerk` and `sftp_fetch` job types.

### 10.1 SQL Injection — COMPLETED ✓
Created `findByField()` bypassing formula translator for external input.

### 10.2 DB Connection — COMPLETED ✓
Single `lib/db.ts` singleton with centralized type parsers.

### 10.3 CSRF / Server Actions — COMPLETED ✓
`requireStaff()` guard on all queue server actions.
