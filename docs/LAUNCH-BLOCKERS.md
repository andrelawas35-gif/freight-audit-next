# Launch Blockers

Only open items that block production launch belong here. Completed/historical items belong in `docs/CHANGELOG.md`. Product roadmap work belongs in `docs/BACKLOG.md`.

## AI Vision Extraction Engine — Implementation Defects (found: stabilization review 2026-06-29)

Docs [`policy-intelligence/10`](policy-intelligence/10-ai-extraction-engine.md)–[`12`](policy-intelligence/12-ai-extraction-engine-prd.md) marked Phase 1/2 "DEPLOYED ✅"; a code-vs-docs review found the vision path cannot extract its flagship document type as built. The **plan is viable** — these are implementation bugs, not design errors. Canonical input-handling fix recorded in [`adr/0018-vision-input-rasterization.md`](adr/0018-vision-input-rasterization.md) (the *input* fix); the *output validation & exception architecture* (structural/semantic split, re-ask decorator, per-field reason taxonomy, criticality-weighted routing, degradation alerting, shared exception contract) is [`adr/0020-vision-validation-and-exception-architecture.md`](adr/0020-vision-validation-and-exception-architecture.md) — it absorbs the confidence-gate and `extracted_fields` defects below and adds the silent-degradation safety net. Detail in [`11-...-plan.md → Known defects`](policy-intelligence/11-ai-extraction-engine-plan.md#known-defects-2026-06-29-stabilization-review). Fix in order.

- [ ] **🔴 CRITICAL — non-PNG inputs (incl. scanned PDF) are broken.** [`lib/intelligence/vision/gemini-backend.ts`](../lib/intelligence/vision/gemini-backend.ts) hardcodes `inlineData.mimeType: 'image/png'` for the real document and the few-shot examples, and `VisionExtractor.extract()` ([`lib/intelligence/vision/extractor-interface.ts`](../lib/intelligence/vision/extractor-interface.ts)) has **no `mimeType` parameter**, so the upload's real MIME type is discarded. Classification routes all PDFs/images to `scan` ([`classification.ts`](../lib/intelligence/vision/classification.ts)), so a scanned ACORD 25 PDF — the stated domain baseline — reaches Gemini mislabeled as PNG and fails end-to-end. JPEG/TIFF/WebP scans are mislabeled too.
  - **Fix (per ADR 0018):** rasterize-to-image at controlled DPI (WASM in-process; Modal fallback) is the canonical path. **Interim stopgap:** thread the real `mimeType` through `extract()` + the few-shot example type and send PDFs as `application/pdf`.
  - **Acceptance:** a scanned PDF COI uploaded via the policy detail page produces non-empty `extracted_fields`; the backend no longer hardcodes `image/png` for non-PNG inputs.
- [ ] **🔴 CRITICAL — production runs on an experimental model endpoint.** [`gemini-backend.ts:22`](../lib/intelligence/vision/gemini-backend.ts) uses `gemini-2.5-pro-exp-03-25`, an `-exp-` preview endpoint Google can retire without notice (docs say "Gemini 3.1 Pro"). When it is pulled, the whole vision path errors → graceful degradation marks everything `needs_review` → silent total feature failure.
  - **Acceptance:** model id is a stable GA model; no `-exp-`/preview id in any production extraction path. **Per ADR 0020:** even after pinning a GA model, add the aggregate degradation alert (reason-rate by `(documentType, modelId)`, threshold WARN) as the safety net — a silently retired/regressed endpoint otherwise surfaces only as a quiet `needs_review` spike.
- [ ] **🟠 Few-shot examples teach the wrong output shape.** The pipeline stores the **whole `ExtractionResult`** (modelId, latencyMs, costEstimate, …) in `extracted_fields` ([`pipeline.ts:132`](../lib/intelligence/vision/pipeline.ts)), and `fetchGoldenExamples` injects that entire envelope as the example's `expectedJson` ([`golden-examples.ts:38`](../lib/intelligence/vision/golden-examples.ts)) — a different schema than the prompt's `{ "fields": [...] }`, degrading context-injection quality.
  - **Acceptance:** `extracted_fields` stores `extraction.fields` only; golden `expectedJson` matches the prompt's `{ "fields": [...] }` shape; existing rows backfilled or migrated. **Per ADR 0020:** make each field `{key, value, confidence, status, reason}` in the same change (per-field outcome taxonomy + derived document rollup) — one coordinated schema change, not two.
- [ ] **🟠 Confidence safety gate trusts uncalibrated self-reports.** Unreadable/normal routing uses the model's **self-reported** per-field confidence ([`gemini-backend.ts:64`](../lib/intelligence/vision/gemini-backend.ts)) against **static** defaults (0.85/0.50) — not the "empirically calibrated per-field thresholds from a held-out test set" the PRD promises (Q30). A confidently-wrong field ($50,000 read as $5,000 at 0.97) sails through as high-confidence; the PRD's "staff aren't asked to confirm low-certainty extractions" guarantee is weaker than stated.
  - **Acceptance:** self-reported confidence is documented as advisory (not a safety guarantee) until real corrections exist; per-field calibration deferred to Phase 3 is explicitly noted in code. **Per ADR 0020:** confidence is demoted to an advisory prioritization signal; the safety property moves to **external semantic validators** (currency/date/range/cross-field, criticality-weighted) that run regardless of model confidence. The confirmed/corrected review stream becomes the calibration data source.

## Database Provisioning / Migration Toolchain (found: tech-stack review 2026-06-27)

- [x] **🔴 CRITICAL — no working command provisions a correct database.** `package.json` `db:migrate` → `drizzle-kit migrate`, but the Drizzle journal ([`db/migrations/meta/_journal.json`](../db/migrations/meta/_journal.json)) lists only `0000`–`0001` while **15** SQL migrations exist — so `drizzle-kit migrate` silently ignores `0002`–`0014` (RLS, the `app_tenant` role, soft-delete, all policy/gateway tables, CHECK constraints). `db:push` would create the tables from `schema.ts` but skip every raw-SQL-only object (RLS policies, `GRANT`s, `FORCE RLS`, SQL CHECKs, functions). A fresh production deploy following the documented commands gets an incomplete, incorrect schema; the live DB's true state is unknowable from the repo. (Runtime face of schema-review G3.)
  - **DONE (2026-06-27).** Replaced with a raw-SQL runner: [`db/migrate.ts`](../db/migrate.ts) applies all 20 migrations (`0000`–`0020`) in sort order, tracks applied migrations in an idempotent `_migrations` table, and auto-baselines existing databases. `package.json` `db:migrate` (aliased `db:provision`) → `npx tsx db/migrate.ts`. Supports `TEST_DATABASE_URL` for CI provisioning.

## Transaction Atomicity on Financial Write Paths (found: stabilization review 2026-06-29)

Decision recorded in [`adr/0017-batchcreate-transaction-composable-query-builder.md`](adr/0017-batchcreate-transaction-composable-query-builder.md) (grilling session). **Build owner: H4** in [`HEAVY-TESTING-BUILD-PLAN.md`](HEAVY-TESTING-BUILD-PLAN.md) — this realizes the still-open `sql.transaction()` work (v2-roster E4 shipped schema-integrity, not this) and lands together with the duplicate-findings constraint. Closes the gap where CLAUDE.md Invariant #3 ("all financial write paths use `sql.transaction([...])`") is **aspirational, not true** — three paths still fake transactions with raw `BEGIN`/`COMMIT` on the Neon HTTP driver (`getSql()`), where [`lib/db.ts`](../lib/db.ts) documents each `sql.query()` is an independent request with **no session continuity**. The "verified working via session pinning" comments are false.

- [ ] **🔴 CRITICAL — `batchCreate` and both audit engines are not actually atomic.** [`lib/db/records.ts:449`](../lib/db/records.ts) (`batchCreate`), [`lib/audit/engine.ts:122`](../lib/audit/engine.ts) (`runAudit`), and [`lib/audit/3pl-engine.ts:75`](../lib/audit/3pl-engine.ts) (`runThreePLAudit.persistPage`) wrap multi-statement writes in raw `sql.query('BEGIN')`/`'COMMIT'` on the HTTP driver, so `BEGIN`/`COMMIT` can hit different connections and provide no rollback. Failure modes: `runAudit` can commit findings without the `Clients."Last audit run"` update or partially write a findings batch (silent financial corruption); `persistPage` can leave 3PL lines `pending` with findings written → re-audited next run → **duplicate findings (duplicate recovery claims)**, or mark lines `audited` with findings lost (**dropped overcharges**).
  - **Fix (per ADR 0017):** invert `batchCreate` to a query builder (`insertQueries(txn, table, records)`), remove the `inTransaction` flag, and migrate both engines to `sql.transaction((txn) => [...insertQueries(...), txn.query(updateSql, params)])` — the pattern already proven in [`app/(portal)/portal/policy-review/actions.ts:122`](<../app/(portal)/portal/policy-review/actions.ts>).
  - **Call sites to migrate (only two beyond the definition):** [`lib/audit/3pl-engine.ts:79`](../lib/audit/3pl-engine.ts), [`lib/audit/engine.ts:139`](../lib/audit/engine.ts).
  - **Acceptance:** no raw `BEGIN`/`COMMIT` on `getSql()` in any financial write path; rollback tests prove a failing statement rolls back the whole array for both engines; the false "verified working" comments are removed.

## Duplicate Findings — No Unique Constraint Backs Finding Identity (found: heavy-testing grilling 2026-06-29)

> Build sequencing: [`HEAVY-TESTING-BUILD-PLAN.md`](HEAVY-TESTING-BUILD-PLAN.md) — H1 (identity columns, keystone) → H3 (suite 2 red test) → H4 (constraint + `ON CONFLICT`, turns it green).

Distinct from — but in the same family as — the atomicity blocker above. ADR 0017 makes each *single run* atomic, but **atomicity within one run does not prevent two runs from both inserting the same finding.** `"Audit Results"` ([`db/migrations/0000_baseline.sql:11`](../db/migrations/0000_baseline.sql)) has a surrogate `id` PK and **no unique constraint on any natural key**, and idempotency rests entirely on an in-memory read-then-skip in the parcel engine ([`lib/audit/engine.ts:71-97`](../lib/audit/engine.ts)) — a TOCTOU race. Concurrent runs, a cron firing mid-run, or an at-least-once job re-claim all produce duplicate financial findings (duplicate recovery claims) with no schema backstop. The 3PL engine has no app-level dedup at all. This is the *real* reason ADR 0017's "duplicate hazard closed by construction" is incomplete.

- [ ] **🔴 CRITICAL — finding identity has no unique constraint; duplicates are possible under concurrency.** The finding natural key is `(subject_type, subject_id, "Detected by")`, where **`subject_id` = the id of the record being audited** — the invoice record id for parcel, the **`tpl_*_lines` line id** for 3PL. Nothing enforces it today. The two engines write identity into *different* columns: parcel uses `"Invoice"` (`text[]`, [`engine.ts:128`](../lib/audit/engine.ts)); 3PL writes the **order id** into the scalar `"Invoice number"` ([`3pl-engine.ts:91`](../lib/audit/3pl-engine.ts)) — a latent semantic bug (an order id masquerading as an invoice number). **3PL must key on the line id, not `order_id`:** `TPL_DUPLICATE` fires once per duplicate billing cycle for the same order ([`3pl-engine.ts:163-167`](../lib/audit/3pl-engine.ts)), each a separate recoverable claim — an `order_id`-based unique key + `ON CONFLICT DO NOTHING` would silently suppress the 2nd+ and drop recovery dollars. The parcel app-level skip is also invoice-level, not finding-level, so a legitimately-new finding on an already-audited invoice is silently dropped ([`engine.ts:97`](../lib/audit/engine.ts)).
  - **Fix (one coordinated change, lands with ADR 0017):** migration adds scalar `subject_id` + `subject_type` ('parcel'|'tpl') columns + best-effort backfill + `UNIQUE(subject_type, subject_id, "Detected by")`; both engines populate `subject_id`/`subject_type` and add `ON CONFLICT DO NOTHING`; narrow the parcel skip to finding-level (it becomes a perf optimization, correctness lives in the constraint). Append-with-`run_id` history model deferred post-launch.
  - **Acceptance:** the `UNIQUE` constraint exists; two concurrent `runAudit` over one seeded invoice set produce exactly one finding per `(subject_type, subject_id, "Detected by")`; re-running an audit produces no new rows. This is the executable red test in [`heavy-system-testing.md`](heavy-system-testing.md) suite 2.

## Ingest Payload Validation (found: stabilization review 2026-06-29)

- [ ] **🟠 Carrier ingest validates the envelope but not the payload.** [`app/api/ingest/carrier/route.ts:19`](<../app/api/ingest/carrier/route.ts>) validates `{ carrier, invoice }` but types `invoice` as `z.record(z.unknown())` and casts it `as any` into the normalizer ([route.ts:48](<../app/api/ingest/carrier/route.ts>)). A malformed invoice (missing `totalNetCharge`, a string where a number belongs) throws deep in normalization or yields `NaN` in a financial field.
  - **Fix:** add a real Zod schema mirroring the `FedExApiInvoice` / `UpsApiInvoice` shapes in [`lib/ingestion/carriers/`](../lib/ingestion/carriers), validate **before** `normalize`. On failure, reject `400` **and** quarantine the raw payload to the existing `ingestion_exceptions` table (confirm its write contract first).
  - **Acceptance:** a malformed payload returns `400` with field-level detail, never reaches `stageInvoice`, and leaves a row in `ingestion_exceptions` for inspection without a redeploy.

## Deferred — Considered and Intentionally Not Launch-Blocking (stabilization review 2026-06-29)

Recorded so they are not re-raised as gaps. Each was evaluated against this codebase, not a generic checklist.

- **Job-queue DLQ with retry — deferred.** Record-level fault isolation already exists: per-record rule failures are caught and collected in `errors[]` without crashing the run ([`lib/audit/engine.ts:103`](../lib/audit/engine.ts)), and failed jobs already persist as inspectable `failed` rows in `audit_jobs`. A generic retry-then-dead-letter layer would add machinery for a failure mode already contained.
- **Circuit breaker on external calls — deferred.** No evidence of cascading external failure at launch volume (3–5 onboarding clients, zero pre-shipment throughput per ADR 0016). Revisit when real throughput exists.
- **Gateway taxonomy `default` fallthrough — RESOLVED (Wave 1, 2026-06-29).** `defaultGatewayTagForRule`'s `switch` was refactored to an explicit `Record<RuleCode, GatewayTag>` map (`GATEWAY_TAG_MAP`) in `lib/intelligence/taxonomy.ts`. A missing rule code now throws `Error` (structural error), not silent `UNKNOWN` fallthrough. The suite-1 rule-code registry guard enforces this. Fix: H5a in [`HEAVY-TESTING-BUILD-PLAN.md`](HEAVY-TESTING-BUILD-PLAN.md).
- **LLM `fetch`-abort leak — RESOLVED (Wave 2, 2026-06-29).** [`lib/llm/client.ts`](../lib/llm/client.ts) now passes `AbortController.signal` to `fetch()`, so the timeout actually aborts the socket rather than just resolving the race. The `withTimeout` wrapper also propagates caller-supplied `AbortSignal` for upstream cancellation. Fix: H5b in [`HEAVY-TESTING-BUILD-PLAN.md`](HEAVY-TESTING-BUILD-PLAN.md).

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
