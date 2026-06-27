# Aurelian Collective - Freight Audit Platform

> Read this file first. Domain-specific docs live in `docs/`.

## What This Is

A freight billing audit platform evolving into a pre-shipment compliance gateway. The current product starts post-shipment: ingest carrier invoices + client shipment data -> rule-based audit engine detects overcharges -> dispute lifecycle -> recovery tracking. Every audit finding should also become a behavioral signal for the future gateway: what should have been prevented before label purchase, fulfillment, carrier selection, insurance selection, or shipment release?

Client portal supports self-serve uploads and status. Staff console supports ingestion, audit operations, disputes, rulebook management, and user administration.

## Stack

Next.js 15 (App Router, Server Components + Server Actions) | React 19 | Neon Serverless Postgres | Auth.js v5 (JWT, email+password) | Claude AI (dispute parsing + data clerk) | Recharts | Vercel (serverless + edge middleware)

## Architecture

```text
INGESTION -> NORMALIZATION -> AUDIT ENGINE -> FINDINGS QUEUE -> DISPUTES -> RECOVERY
    |              |              |               |              |
 Carrier APIs   stageInvoice()  Parcel engine   Staff review   Response parser
 EDI 210        stageShipment() 3PL engine      File/dismiss   Outcome learning
 SFTP auto      3PL staging     Rulebook        Bulk ops       Filing templates
 Client WMS     Code mapping    Job queue
 CSV upload     Data clerk AI
                                |
                                v
                    BEHAVIORAL TAGS -> GATEWAY READINESS -> PRE-SHIPMENT PRODUCT ROADMAP
```

## Key Invariants

1. **Audit completeness** - engines use keyset pagination (`fetchAllRecords`), never bounded `fetchRecords`. Financial processing must be complete or fail visibly.
2. **Run isolation** - `created_at <= run_started_at` cutoff prevents mid-run ingestion from being included. Sourced from `audit_jobs.started_at`.
3. **Transaction safety** - all financial write paths wrapped in `BEGIN`/`COMMIT`/`ROLLBACK`. `batchCreate({ inTransaction: true })` skips nested `BEGIN`.
4. **AI is suggest-only** - dispute parser and data clerk propose; humans confirm. Never auto-apply.
5. **Rulebook precedence** - contract (score 30) -> carrier (20) -> global (10). Service-specific +5. Do not change without business review.
6. **Client scoping** - portal queries always filter by `session.user.clientId`. No client selector exposed.
7. **Gateway taxonomy discipline** - every flagged audit result must carry gateway preventability metadata before it is analytically complete: `PREVENTABLE_BY_GATEWAY`, `NON_PREVENTABLE_BY_GATEWAY`, or `UNKNOWN`.
8. **Preventable findings require a rule suggestion** - if a finding is tagged `PREVENTABLE_BY_GATEWAY`, store a concrete `gateway_rule_suggestion` describing what the future pre-shipment gateway would warn, require, or block.
9. **Policy intelligence is structured data** - carrier contracts, 3PL SLAs, insurance policies, claims rules, SOPs, packaging standards, and client exceptions must be captured as queryable rules, not notes-only text.
10. **Policy activation is human-reviewed** - extraction can suggest clauses and rule JSON, but staff must confirm policy rules before they are active for backtests, readiness assessments, or future gateway enforcement.

## Conventions

- **Quoted column names** on business tables (`"Invoice number"`). Snake_case on platform tables. Do not mix.
- **Install**: `npm install --legacy-peer-deps` (next-auth beta peer conflicts; codified in `.npmrc`).
- **Auth config**: `trustHost: true` required for non-Vercel deployments.
- **DB access**: all modules import `getSql()` from `lib/db.ts` - single connection singleton.
- **Schema**: `db/schema.ts` (Drizzle) is authoritative. Raw SQL queries via `lib/db.ts` work alongside.
- **Job queue**: Postgres-backed (`audit_jobs` table), `FOR UPDATE SKIP LOCKED` claim pattern. No external deps.
- **Tests**: `npm test` (Vitest). Coverage exists for pagination/chunk boundaries.

## Route Groups

| Group | Path | Access | Purpose |
|-------|------|--------|---------|
| Console | `/(console)/*` | `staff` role | Audit ops, disputes, engine, ingestion, rulebook |
| Portal | `/(portal)/portal/*` | Any authenticated | Client dashboard, uploads, reports, disputes |
| Auth | `/(auth)/*` | Public | Login, signup |
| API | `/api/ingest/*` | `x-ingest-secret` | Carrier/EDI/WMS/3PL data ingestion |
| API | `/api/run-audit/*` | Staff session or secret | Job queue (enqueue, process, status) |
| API | `/api/cron/*` | `CRON_SECRET` | Scheduled jobs (SFTP fetch) |

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `NEXTAUTH_SECRET` | Yes | Auth.js JWT signing secret |
| `NEXTAUTH_URL` | Prod | Full app URL |
| `INGEST_SECRET` | Yes | Webhook auth header |
| `ANTHROPIC_API_KEY` | No | AI features (graceful degradation without) |
| `CRON_SECRET` | Prod | Vercel Cron auth token |
| `SFTP_KEY_<SCAC>` | Per carrier | SSH key; `sftp_key_env` column stores env var name |
| `SENTRY_DSN` | No | Server-side Sentry error reporting |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Client-side Sentry error reporting |
| `SENTRY_ORG` | Build | Sentry org for source map uploads |
| `SENTRY_PROJECT` | Build | Sentry project for source map uploads |
| `SENTRY_AUTH_TOKEN` | Build | Sentry auth token for source map uploads |

## Domain Docs

| Doc | When to load |
|-----|-------------|
| [`docs/data-layer.md`](docs/data-layer.md) | Touching DB schema, `lib/airtable.ts`, migrations, `lib/db.ts` |
| [`docs/ingestion.md`](docs/ingestion.md) | Ingestion pipeline, adapters, SFTP, normalization, code mapping |
| [`docs/audit-engine.md`](docs/audit-engine.md) | Audit engines, rules, rulebook, job queue, run history |
| [`docs/disputes.md`](docs/disputes.md) | Dispute pipeline, response parser, outcomes, templates |
| [`docs/portal.md`](docs/portal.md) | Client portal and staff console UI, density, components, scoping |
| [`docs/auth.md`](docs/auth.md) | Auth.js, middleware, roles, route protection |
| [`docs/data-protection.md`](docs/data-protection.md) | Tenant isolation, Row-Level Security, restricted DB roles, cross-tenant BI boundary (planning) |
| [`docs/policy-intelligence/`](docs/policy-intelligence/README.md) | Policy Intelligence concern (single source): pipeline, glossary, policy intake, extraction, taxonomy enums, backtest, readiness, schema. Start at the module README. (`docs/gateway-readiness.md` is now a redirect stub.) |
| [`docs/LAUNCH-BLOCKERS.md`](docs/LAUNCH-BLOCKERS.md) | Open launch blockers only |
| [`docs/observability.md`](docs/observability.md) | Sentry, structured logging, health checks, correlation IDs |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | Open post-launch and product buildout work only |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Completed/historical changes only; not an open task list |
