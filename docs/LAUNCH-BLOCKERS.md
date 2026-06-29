# Launch Blockers

Only open items that block production launch belong here. Completed/historical items belong in `docs/CHANGELOG.md`. Product roadmap work belongs in `docs/BACKLOG.md`.

## Database Provisioning / Migration Toolchain (found: tech-stack review 2026-06-27)

- [x] **🔴 CRITICAL — no working command provisions a correct database.** `package.json` `db:migrate` → `drizzle-kit migrate`, but the Drizzle journal ([`db/migrations/meta/_journal.json`](../db/migrations/meta/_journal.json)) lists only `0000`–`0001` while **15** SQL migrations exist — so `drizzle-kit migrate` silently ignores `0002`–`0014` (RLS, the `app_tenant` role, soft-delete, all policy/gateway tables, CHECK constraints). `db:push` would create the tables from `schema.ts` but skip every raw-SQL-only object (RLS policies, `GRANT`s, `FORCE RLS`, SQL CHECKs, functions). A fresh production deploy following the documented commands gets an incomplete, incorrect schema; the live DB's true state is unknowable from the repo. (Runtime face of schema-review G3.)
  - **DONE (2026-06-27).** Replaced with a raw-SQL runner: [`db/migrate.ts`](../db/migrate.ts) applies all 20 migrations (`0000`–`0020`) in sort order, tracks applied migrations in an idempotent `_migrations` table, and auto-baselines existing databases. `package.json` `db:migrate` (aliased `db:provision`) → `npx tsx db/migrate.ts`. Supports `TEST_DATABASE_URL` for CI provisioning.

## Middleware / Route Protection (found: architecture review 2026-06-26)

- [x] **🔴 CRITICAL — `authorized` callback blocks public + secret-authed routes (ordering bug).** [`auth.config.ts:43`](../auth.config.ts) runs `if (!isLoggedIn) return false;` **before** the "Marketing pages + API routes are public" `return true` (line 56-57). The middleware matcher includes `/api` (`'/((?!_next/static|_next/image|.*\\..*).*)'`). So every unauthenticated request that isn't `/login`/`/signup` is redirected to `/login` before reaching its handler. Breaks: (1) all secret-authed API routes — `/api/ingest/*` (`x-ingest-secret`), `/api/cron/*` (`CRON_SECRET`), `/api/run-audit/process`, `/api/health`, the `x-gateway-api-key` path of `/api/v1/precheck` — which per [`auth.md:25-28`](docs/auth.md) call in without a session; (2) the public `(marketing)` site — a logged-out visitor to `/` is bounced to `/login`. Passes logged-in smoke tests because only the unauthenticated paths trip line 43.
  - **Also breaks both Vercel crons** ([`vercel.json`](../vercel.json)): `/api/run-audit/process` (audit-job processing, every minute) and `/api/cron/sftp-fetch` (SFTP fetch, every 15 min) are called with a secret and no session → redirected to `/login` → never run in production.
  - **DONE (2026-06-27).** Reordered: API routes with their own auth (`/api/ingest/`, `/api/cron/`, `/api/run-audit/`, `/api/v1/precheck`, `/api/health`) and marketing paths now return `true` **before** the `!isLoggedIn` gate ([`auth.config.ts:53-75`](../auth.config.ts)). Acceptance: `GET /api/health` and `GET /` return 200 with no session cookie; `POST /api/ingest/carrier` with valid `x-ingest-secret` and no session reaches the handler.

## Server Action Input Validation

- [x] `app/(console)/disputes/actions.ts`
  - Acceptance: all externally supplied form fields are parsed through Zod or equivalent explicit validators; invalid input returns a safe error.
  - **DONE (verified 2026-06-26).** All actions (`parseResponse`, `applyOutcome`, `advanceStage`, `addDisputeNote`, `markCarrierResponded`) parse inputs through Zod schemas (`airtableRecordIdSchema`, `parseResponseSchema`, `applyOutcomeSchema`, `noteSchema`).
- [x] `app/(console)/queue/actions.ts`
  - Acceptance: review status, audit result IDs, and bulk IDs are validated before DB writes.
  - **DONE (verified 2026-06-26).** All actions (`setReviewStatus`, `dismissFinding`, `fileDispute`, `fileDisputesBulk`, `dismissBulk`, `approveBulk`) parse inputs through Zod schemas (`auditResultIdSchema`, `reviewStatusSchema`, `bulkAuditResultIdsSchema`, `fileDisputeOptsSchema`).
- [x] `app/(console)/rulebook/actions.ts`
  - Acceptance: scope, rule key, client/carrier IDs, effective dates, and numeric/bool/text values are validated before DB writes.
  - **DONE (verified 2026-06-26).** All actions (`addRule`, `editRule`, `removeRule`) parse inputs through comprehensive Zod schemas (`scopeSchema`, `clientIdSchema`, `carrierScacSchema`, `ruleKeySchema`, `addRuleSchema`, `editPatchSchema` with `superRefine` for date ordering).

## Error Monitoring and Logging

- [x] Add/verify Sentry production configuration.
  - Acceptance: server, edge, and client errors report in production with source maps.
  - **DONE.** Shipped with structured logging + correlation IDs (commit `26f3ae1`).
- [x] Add structured logging with request correlation IDs.
  - Acceptance: ingest, audit job, queue, dispute, and auth paths emit correlated logs.
  - **DONE.** `lib/logger.ts`, `withAction` wrapper, correlation ID propagation shipped.
- [x] Add `/api/health`.
  - Acceptance: returns DB connectivity and build/runtime health without leaking secrets.
  - **DONE.** `app/api/health/route.ts` shipped.

## Test Coverage

- [x] Unit tests for all audit rules in `lib/audit/rules/*.ts`.
  - Acceptance: null/missing-data guard, no-flag path, flagged path, rulebook override.
  - **DONE.** `lib/audit/__tests__/parcel-rules.test.ts` (dim-weight, phantom-accessorial, duplicate-tracking, SLA failure).
- [x] Unit tests for 3PL rules in `lib/audit/3pl-rules.ts`.
  - Acceptance: pick, packaging, markup, ghost, duplicate, storage, data-required paths.
  - **DONE.** `lib/audit/__tests__/3pl-rules.test.ts`.
- [x] Unit tests for rulebook resolver in `lib/audit/rulebook.ts`.
  - Acceptance: contract/carrier/global precedence, service bonus, effective dates.
  - **DONE.** `lib/audit/__tests__/rulebook.test.ts`.
- [x] Integration tests for ingestion normalization.
  - Acceptance: FedEx, UPS, EDI, LTL CSV, ShipStation, Shopify, generic CSV.
  - **DONE (2026-06-26).** `lib/__tests__/ingestion-normalization.test.ts` created (E5 Phase 0).
- [x] API route tests.
  - Acceptance: auth checks, validation errors, happy path, failure path.
  - **DONE (2026-06-26).** `lib/__tests__/api-routes.test.ts` created (E5 Phase 0).

## Tenant Isolation (Row-Level Security)

Design: [`data-protection.md`](data-protection.md). Resolution plan: [`adr/0013-rls-enforcement-on-the-client-path.md`](adr/0013-rls-enforcement-on-the-client-path.md)
(grilling session 2026-06-26) — finish the D2 design by routing portal reads through `getTenantSql`,
extend the role to the portal read-set, add a behavioral test, and gate FORCE-RLS rollout behind the wiring.
The app currently connects as the table owner (`neondb_owner`), so RLS would be bypassed until a restricted role exists.

- [x] Restricted `app_tenant` Postgres role + `getTenantSql(clientId)` pooled connection helper.
  - Acceptance: protected reads run as a non-owner role with `app.current_tenant` set per checkout.
  - **DONE (2026-06-27).** Migration `0006_keystone_contract.sql` creates the role; `lib/db.ts` exports `getTenantSql()`. **Wired into the portal path:** [`lib/portal/data-loader.ts:266`](../lib/portal/data-loader.ts) acquires a tenant connection via `getTenantSql(clientId)` and passes it to both `fetchRecoveryData` (Airtable-backed) and `fetchComplianceData` (SQL-backed reports). Staff console reads still use owner `getSql()` (by design — staff reads across tenants).
- [x] RLS policies on Tier-2 tables (`"Invoices"`, `"Audit Results"`, `"Disputes"`, `client_insurance_policies`, `insurance_policy_rules`, `policy_rules`, `policy_documents`, `client_policies`), with `FORCE ROW LEVEL SECURITY`.
  - Acceptance: array-membership form for `text[]` tenancy, scalar form for `client_id`; comparisons are `text`, never `::uuid`.
  - **DONE — policies authored (2026-06-26).** All 9 Phase-1 tables have RLS policies + FORCE RLS in migration 0006. Portal read-set extended in migration 0018 (`"Clients"`, `policy_rulesets`, `policy_scope_exclusions` — FORCE RLS deferred, per-migration comment).
  - ⚠️ **FORCE RLS deployment note (2026-06-27):** Migration 0006 applies FORCE RLS on 9 tables. Since only `data-loader.ts` uses `app_tenant`, and other read paths (staff console, ingestion, audit engine) connect as owner (`getSql()` → `BYPASSRLS`), the landmine is contained by under-use. Full rollout should gate additional FORCE RLS applications behind wiring more paths through `getTenantSql`.
- [x] Negative isolation test in CI.
  - Acceptance: protected query with no tenant context returns 0 rows; tenant A cannot read tenant B's seeded row. Build fails if a policy is missing or broken.
  - **DONE (2026-06-27).** [`lib/__tests__/rls-isolation.test.ts`](../lib/__tests__/rls-isolation.test.ts) includes both parse-only policy lint (always runs) **and** a behavioral integration test (gated on `TEST_DATABASE_URL`): connects as `app_tenant`, asserts 0 rows with no tenant context, seeds tenant A/B rows and verifies cross-tenant read isolation, and verifies cross-tenant writes are rejected via RLS.

## UI Table Count Coverage

- [x] Add total-count queries and "showing X of Y" messaging to bounded UI tables.
  - Acceptance: bounded staff/portal tables disclose truncation and avoid implying completeness.
  - **DONE (verified 2026-06-26).** `components/ui/primitives.tsx` exports `TableCount` and `TableDollarSummary` with "Showing X of Y" and "Showing X of first Y" variants. Used in `components/action-queue.tsx` and `components/portal/disputes-list.tsx`.
