# Launch Blockers

Only open items that block production launch belong here. Completed/historical items belong in `docs/CHANGELOG.md`. Product roadmap work belongs in `docs/BACKLOG.md`.

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

Design: [`data-protection.md`](data-protection.md). The app currently connects as the
table owner (`neondb_owner`), so RLS would be bypassed until a restricted role exists.

- [x] Restricted `app_tenant` Postgres role + `getTenantSql(clientId)` pooled connection helper.
  - Acceptance: protected reads run as a non-owner role with `app.current_tenant` set per checkout.
  - **DONE (2026-06-26).** Migration `0006_keystone_contract.sql` creates the role; `lib/db.ts` exports `getTenantSql()`.
- [x] RLS policies on Tier-2 tables (`"Invoices"`, `"Audit Results"`, `"Disputes"`, `client_insurance_policies`, `insurance_policy_rules`, `policy_rules`, `policy_documents`, `client_policies`), with `FORCE ROW LEVEL SECURITY`.
  - Acceptance: array-membership form for `text[]` tenancy, scalar form for `client_id`; comparisons are `text`, never `::uuid`.
  - **DONE (2026-06-26).** All 9 Phase-1 tables have RLS policies + FORCE RLS in the migration.
- [x] Negative isolation test in CI.
  - Acceptance: protected query with no tenant context returns 0 rows; tenant A cannot read tenant B's seeded row. Build fails if a policy is missing or broken.
  - **DONE (2026-06-26).** `lib/__tests__/rls-isolation.test.ts`: 51 tests parsing migration SQL + behavioral contract.

## UI Table Count Coverage

- [x] Add total-count queries and "showing X of Y" messaging to bounded UI tables.
  - Acceptance: bounded staff/portal tables disclose truncation and avoid implying completeness.
  - **DONE (verified 2026-06-26).** `components/ui/primitives.tsx` exports `TableCount` and `TableDollarSummary` with "Showing X of Y" and "Showing X of first Y" variants. Used in `components/action-queue.tsx` and `components/portal/disputes-list.tsx`.
