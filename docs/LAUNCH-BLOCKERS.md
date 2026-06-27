# Launch Blockers

Only open items that block production launch belong here. Completed/historical items belong in `docs/CHANGELOG.md`. Product roadmap work belongs in `docs/BACKLOG.md`.

## Database Provisioning / Migration Toolchain (found: tech-stack review 2026-06-27)

- [ ] **🔴 CRITICAL — no working command provisions a correct database.** `package.json` `db:migrate` → `drizzle-kit migrate`, but the Drizzle journal ([`db/migrations/meta/_journal.json`](../db/migrations/meta/_journal.json)) lists only `0000`–`0001` while **15** SQL migrations exist — so `drizzle-kit migrate` silently ignores `0002`–`0014` (RLS, the `app_tenant` role, soft-delete, all policy/gateway tables, CHECK constraints). `db:push` would create the tables from `schema.ts` but skip every raw-SQL-only object (RLS policies, `GRANT`s, `FORCE RLS`, SQL CHECKs, functions). A fresh production deploy following the documented commands gets an incomplete, incorrect schema; the live DB's true state is unknowable from the repo. (Runtime face of schema-review G3.)
  - Acceptance: one documented command provisions a complete, correct schema on an empty database (re-baseline Drizzle from the live DB, or adopt a raw-SQL runner that applies `0000`–`0014` in order and tracks them); verified by standing up a fresh Neon branch and asserting all 36 tables + RLS policies + grants + constraints exist.

## Middleware / Route Protection (found: architecture review 2026-06-26)

- [ ] **🔴 CRITICAL — `authorized` callback blocks public + secret-authed routes (ordering bug).** [`auth.config.ts:43`](../auth.config.ts) runs `if (!isLoggedIn) return false;` **before** the "Marketing pages + API routes are public" `return true` (line 56-57). The middleware matcher includes `/api` (`'/((?!_next/static|_next/image|.*\\..*).*)'`). So every unauthenticated request that isn't `/login`/`/signup` is redirected to `/login` before reaching its handler. Breaks: (1) all secret-authed API routes — `/api/ingest/*` (`x-ingest-secret`), `/api/cron/*` (`CRON_SECRET`), `/api/run-audit/process`, `/api/health`, the `x-gateway-api-key` path of `/api/v1/precheck` — which per [`auth.md:25-28`](docs/auth.md) call in without a session; (2) the public `(marketing)` site — a logged-out visitor to `/` is bounced to `/login`. Passes logged-in smoke tests because only the unauthenticated paths trip line 43.
  - **Also breaks both Vercel crons** ([`vercel.json`](../vercel.json)): `/api/run-audit/process` (audit-job processing, every minute) and `/api/cron/sftp-fetch` (SFTP fetch, every 15 min) are called with a secret and no session → redirected to `/login` → never run in production.
  - Acceptance: `GET /api/health` and `GET /` return 200 with **no** session cookie; `POST /api/ingest/carrier` with a valid `x-ingest-secret` and no session reaches the handler; Vercel cron paths execute; a CI smoke test asserts all three. Fix: allow `/api` and marketing routes before the `!isLoggedIn` gate.

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
  - **PARTIAL (2026-06-26).** Migration `0006_keystone_contract.sql` creates the role; `lib/db.ts` exports `getTenantSql()`.
  - ⚠️ **(architecture review 2026-06-26) `getTenantSql` has ZERO callers.** Every read — including client-scoped portal reads ([`lib/portal/data-loader.ts`](../lib/portal/data-loader.ts) → `fetchRecords` → `getSql()`) — connects as the owner `neondb_owner`, which bypasses RLS. Runtime tenant isolation rests entirely on app-level `WHERE client_id` clauses; the DB-engine defense is not in the execution path.
- [x] RLS policies on Tier-2 tables (`"Invoices"`, `"Audit Results"`, `"Disputes"`, `client_insurance_policies`, `insurance_policy_rules`, `policy_rules`, `policy_documents`, `client_policies`), with `FORCE ROW LEVEL SECURITY`.
  - Acceptance: array-membership form for `text[]` tenancy, scalar form for `client_id`; comparisons are `text`, never `::uuid`.
  - **DONE — policies authored (2026-06-26).** All 9 Phase-1 tables have RLS policies + FORCE RLS in the migration.
  - ⚠️ **(architecture review 2026-06-26) `FORCE ROW LEVEL SECURITY` on shipped migration 0006 is a deployment landmine.** Policies are `TO app_tenant` only. Applying 0006 to a DB where the app connects as owner without `app.current_tenant` either silently does nothing (owner has `BYPASSRLS`) or default-denies → **zero rows on all 9 core tables → app-wide outage**. Move the FORCE-RLS + policy block into a separate rollout migration gated behind `getTenantSql` being wired, or pin the owner role's RLS attribute explicitly.
- [ ] Negative isolation test in CI. **(RE-OPENED — architecture review 2026-06-26)**
  - Acceptance: protected query with no tenant context returns 0 rows; tenant A cannot read tenant B's seeded row. Build fails if a policy is missing or broken.
  - ⚠️ **Acceptance NOT met.** `lib/__tests__/rls-isolation.test.ts` is parse-only — it `readFileSync`s migration 0006 and regex-matches policy text (its own header: *"the tests here parse the migration SQL"*). It never opens a connection, seeds tenants, or asserts 0-rows behavior, so it cannot catch that `getTenantSql` is unused or that isolation actually holds. Replace with a behavioral test: connect as `app_tenant`, assert 0 rows with no tenant set, set tenant A, assert it cannot read tenant B.

## UI Table Count Coverage

- [x] Add total-count queries and "showing X of Y" messaging to bounded UI tables.
  - Acceptance: bounded staff/portal tables disclose truncation and avoid implying completeness.
  - **DONE (verified 2026-06-26).** `components/ui/primitives.tsx` exports `TableCount` and `TableDollarSummary` with "Showing X of Y" and "Showing X of first Y" variants. Used in `components/action-queue.tsx` and `components/portal/disputes-list.tsx`.
