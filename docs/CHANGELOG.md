# Changelog

Completed or historical changes belong here. Keep `docs/LAUNCH-BLOCKERS.md` and `docs/BACKLOG.md` focused on open work only.

## 2026-06-26

### Grilling Session — 4-Tier Extraction & Classification (ADR 0012)

- **ADR 0012 created** — 7 architectural decisions for 4-tier extraction & classification architecture, superseding ADR 0011's extraction portions.
- **Key decisions**: T1 Deterministic Tokenizer (phrase/pattern matching, zero-cost, zero-latency, ~40-60% coverage); T2 LLM Data Mapper (strict schema alignment, Zod-gated, cheap-first escalation); T3 Vector Memory Bank (pgvector on Neon, cross-client semantic caching, feedback loop to T1); T4 Client Ambiguity Dashboard (Define/Exclude/Flag workflow, shifts legal risk from platform to client, premium compliance product).
- **ADR 0011** marked SUPERSEDED for extraction decisions (D2, D3, D4); taxonomy discovery (D5, D6, Phase 2) and temperature gap (Phase 0) remain valid.
- **Sequencing**: Phase 0 (temp gap, ADR 0011) → Phase 1 (T1 Tokenizer) → Phase 2 (T2+T3) → Phase 3 (T4 Dashboard) → Phase 4 (Taxonomy discovery).
- **`plan.md`** updated — Wave E redesigned as Wave F with 4-phase extraction rollout.
- **`docs/BACKLOG.md`** updated — extraction items replaced with ADR 0012 tiered phases.

### Grilling Session — Extraction & Taxonomy Pipeline (ADR 0011)

- **ADR 0011 created** — 6 architectural decisions for AI extraction + taxonomy discovery.
- **Key decisions**: Temperature gap closure first (deterministic, Phase 0) → AI extractor (Phase 1) → Taxonomy discovery (Phase 2); degrade pattern for model strategy (works with whatever LLM key is available); manual extraction trigger (staff-initiated, never on upload); separate "Suggested Rules" review panel with source evidence; `taxonomy_admin` as boolean capability flag (not role enum); upload-to-extraction decoupled (client uploads, staff extracts).
- **`docs/BACKLOG.md`** updated — Extraction pipeline items reorganized into 3 phases under Taxonomy Discovery section.
- **`plan.md`** updated — Wave E roster added (design complete, not yet deployed).

### Grilling Session — Portal Compliance Architecture (ADR 0009)

- **ADR 0009 created** — 9 architectural decisions for client-facing governance platform.
- **Key decisions**: Dual-tab Dashboard (Recovery + Compliance); 5 governance KPIs (Uninsured Exposure, SOP Compliance, Carrier Authorization, Signature Compliance, Gateway Readiness); Coverage Gap Feed as primary detail view; Warehouse Scorecard as secondary panel; Gateway Readiness "What You Would Have Saved" summary with simulation toggle (Advisory/Require Approval/Block); hybrid data layer (Recovery on AirTable, Compliance on SQL via `portalDataLoader()`); Attestation panel with review→sign-off workflow; multi-type document Upload (5 types); Dashboard as dual-tab page with no new sidebar items.
- **CONTEXT.md** updated — 8 new portal governance terms added to glossary.
- **`docs/portal.md`** updated — Compliance tab design spec with KPI row, Coverage Gap Feed, Warehouse Scorecard, Gateway Readiness panel, Attestation panel, and multi-type Upload page.
- **`plan.md`** updated — Wave C engineer roster: E4 (Phase 0 shell + Phase 2 Upload), E5 (KPIs + Feed + Scorecard), E6 (Gateway + Attestation).
- **`docs/BACKLOG.md`** updated — Grilling session items marked done; Wave C portal compliance items added.

### Grilling Session — Domain Model Formalization

- **4 ADRs created (0004–0007)** plus **ADR 0008** (schema migration contract).
- **CONTEXT.md** created — 24 canonical terms across core entities + resolved terminology.
- **Key decisions**: shipment as product grain; "Policy" split into Rule / Contract / Document / Ruleset; Gateway as evaluator mode not service; dispute state machine; scalar `client_id` migration.
- **Files**: `CONTEXT.md` created, 5 ADRs in `docs/adr/`.

### Backlog Sprint — High-Impact Items

Post Wave C backlog triage. Closed 8 additional items.

- **Gateway Readiness Assessment UI**: Verified existing page at `/gateway-readiness/[clientId]` with KPIs, monthly audit loss table, top gateway rule suggestions, insurance exposure, and backtest runs. Marked done.
- **Gateway Tag Analyst Review Workflow**: Built `/gateway-tags` page — staff can confirm, edit, or dismiss gateway preventability tags (PREVENTABLE_BY_GATEWAY / NON_PREVENTABLE_BY_GATEWAY / UNKNOWN) on audit findings. Filter chips, inline dropdown editing, expandable rule suggestion panel, bulk confirm action, KPI cards for preventable loss. Server actions with Zod validation + staff role check.
- **Airtable Copy Cleanup**: Scrubbed 11 files of user-facing Airtable references — console page comments, queue-view variable names (`airtableStatus` → `reviewStatus`, `mapToAirtableStatus` → `mapToStatus`), disputes `airtableRecordIdSchema` → `recordIdSchema`, queue actions, carriers, primitives, disputes type, clients comments.
- **`.env.local.example`**: Updated with organized sections, `GATEWAY_API_KEY_<clientId>` guidance, and production `NEXTAUTH_URL` notes for Vercel + non-Vercel hosting.
- **DB Error States**: All 12 console pages confirmed using `ConsoleErrorState` wrappers (already in place).
- **Gateway Readiness Backlog**: Marked UI filter + report items done — all covered by gateway-taxonomy and gateway-readiness pages.
- **`lib/airtable.ts` → `lib/db/records.ts`**: Created new canonical module at `lib/db/records.ts`. Updated 26 source + test import paths. Old file kept as re-export shim. All 295 tests pass, TypeScript clean.

### Backlog Sprint 2 — Data Integrity Foundations

- **Soft Deletes**: Added `deleted_at` (nullable timestamptz) to 11 business tables (Invoices, Shipments, Audit Results, Disputes, Clients, Carriers, rulebook, client_policies, policy_documents, policy_rulesets, policy_rules). Migration `0008_soft_delete`. `fetchRecords`, `fetchAllRecords`, `findByField` now filter `WHERE deleted_at IS NULL` by default. New `softDelete()` and `restoreRecord()` functions in `lib/db/records.ts`.
- **Audit Trail**: New `audit_trail` platform table with actor, table_name, record_id, action (INSERT/UPDATE/DELETE), changed_fields JSONB, changed_at. Migration `0009_audit_trail`. `createRecord`, `updateRecord`, `softDelete` accept optional `actor` parameter and auto-log audit events. `updateRecord` computes before/after diffs on changed fields.
- **Ingestion Lineage**: New `ingestion_batches` and `ingestion_records` tables with FK linkage. Migration `0010_ingestion_lineage`. Created `lib/ingestion/lineage.ts` with `startBatch`/`finishBatch`/`trackRecord` helpers. Wired into all 5 API ingest routes (carrier, edi, wms, 3pl, sftp-poll) and all console ingestion paths (file upload + manual paste for carrier_api, wms_webhook, edi_raw, ltl_csv, 3pl fulfillment/storage). Errors safely captured via try/catch → `finishBatch()`.
- **Recharts Dashboard**: Created `components/console/dashboard-charts.tsx` with three Recharts components — `RecoveryTrendChart` (area), `AuditFindingsChart` (horizontal bar by rule), `DisputePipelineChart` (stacked bar by month). Replaced static `Bars` + `RuleBreakdown` on console dashboard. Data computed server-side, passed as props. All charts gracefully handle empty data.
- **`TableName` type**: Expanded from 11 to 30 entries covering all platform tables (rulebook, policies, gateway tags, ingestion, audit trail, etc.).


Multi-phase build plan execution. All 6 engineers deployed; 4 phases complete, 1 deferred.

#### E2 Backtest Correctness (the revenue gate)

- Rebuilt `loadBacktestContexts` around the shipment spine — one context per shipment with billing + insurance axes joined via GIN-indexed multi-hop.
- Replaced `LIMIT 5000` with keyset pagination (`PAGE_SIZE=500`, iterates until exhausted) — no silent data loss.
- Added global dedup by `audit_result_id`; deduped results carry `preventableLoss: 0` with annotation.
- Multi-shipment invoices with >1 shipment entry zero the attributable loss as honest data gap.
- Tri-valued evaluation: `findUnresolvableFields()` detects null context fields rules reference; `ALLOW` reclassified as `DATA_REQUIRED`.
- Effective-dated ruleset matching: each shipment evaluated against the ruleset active on its `"Ship date"`.
- Condition key validation: `validateConditionKeys()` rejects unknown/typo'd keys at write time.
- Preview vs official backtest modes: `preview` includes drafts, `official` (active-only) snapshots inputs as JSONB.
- Added `db/migrations/0007_backtest_correctness.sql` — `mode`, `input_snapshot`, `data_required_count` columns.
- Added `lib/intelligence/__tests__/backtest-correctness.test.ts` — 19 tests covering all 8 correctness items.
- Verified: 295 tests passing, TypeScript clean.

#### E3 Aurelian Gateway V1 (shadow-first Fastify service)

- Built `services/gateway/` — standalone Fastify service with 6 source files.
- `src/index.ts`: server entry, `/health` probe, `POST /v1/precheck`, correlation ID propagation, structured logging, graceful shutdown.
- `src/precheck.ts`: Zod-validated `ShipmentPolicyContext` handler, severity aggregation (`BLOCK > REQUIRE_APPROVAL > REQUIRE_DOCUMENTATION > WARN > ALLOW`), always-200 D3 contract.
- `src/cache.ts`: Versioned snapshot cache — loads active rulesets at boot, effective-date filtering, TTL refresh, zero per-request DB reads.
- `src/auth.ts`: Per-client API key auth (`GATEWAY_API_KEY_<clientId>` env vars, `x-api-key` header), never from request body.
- `src/config.ts`: Env loading, API key scanning, per-client fail-closed thresholds, high-value vertical detection.
- `src/decision-log.ts`: At-least-once durable buffer — append-only JSONL file → periodic drain to `gateway_decisions`, crash replay, graceful shutdown flush.
- D2 shadow mode: `enforced: false` always in V1; real verdict + approval token returned.
- D5 fail handling: fail-open default, fail-closed above per-client `declaredValue` threshold.

#### E4 Policy UI / Attestation (governance model)

- Added `'client_attested'` to `POLICY_STATUSES` in `policy-evaluator.ts` — the one additive contract change.
- `attestRulesetAction`: Zod-validated server action. Staff records client authority attestation; transitions `draft → client_attested`.
- `activateRulesetAction`: Zod-validated server action. Transitions `client_attested → active` for both ruleset and all child rules.
- `AttestationPanel`: Per-ruleset ratification cards with attestation form (draft), activation button (client_attested), status display (active/archived).
- `ScopeStatement`: Read-only scope boundary — in-scope controls grouped by category, out-of-scope exclusions, effective period, attestation metadata.
- `GuaranteeCard`: Static governance guarantee with exact DG3 language + disclaimer.
- `StatusBadge` updated with `blue` for `client_attested` status.

#### Bug Fixes (Controller)

- Fixed missing `parseRuleValue()` destructure in `app/(console)/rulebook/actions.ts` — `numValue`/`boolValue`/`textValue` were used as shorthand properties but never extracted from the return value.
- Fixed duplicate tracking rule tests in `lib/audit/__tests__/parcel-rules.test.ts` — updated for new PRO/tracking-number-based rule behavior.
- Added `allShipments` to `RuleContext` type in `lib/audit/types.ts` — needed by `duplicateTrackingRule`.

### Policy Intelligence MVP

Schema, UI, document intake, rule editor, ruleset versioning, evaluator, and backtest runner all shipped and verified. See prior entries for initial implementation.

## 2026-06-23

### Policy Intelligence Doc Restructure (context engineering)

- Split the Policy Intelligence concern out of the layer docs into a single cohesive,
  lazily-loadable module: `docs/policy-intelligence/` (`README`, `00-glossary`,
  `01-ingestion`, `02-extraction`, `03-taxonomy`, `04-backtest`, `05-readiness`,
  `06-schema`).
- Removed duplicated enums: gateway categories, insurance risk categories, gateway
  actions, and high-value verticals were listed verbatim across `gateway-readiness.md`,
  `audit-engine.md`, `data-layer.md`, and `ingestion.md`. They are now single-sourced in
  `policy-intelligence/03-taxonomy.md`, which points at `lib/intelligence/taxonomy.ts` as
  the executable authority.
- Moved all 11 policy/gateway/insurance table schemas out of `data-layer.md` (320 → ~104
  lines) into `policy-intelligence/06-schema.md`; layer docs now hold one-line pointers.
- Converted `docs/gateway-readiness.md` into a redirect stub and repointed CLAUDE.md's
  domain-doc routing table to the module.
- Captured design decisions surfaced during the grilling session: keep document blobs
  (`storage_key`/`checksum`), the Ruleset as the effective-dating authority (with the
  current `runPolicyBacktest` non-honoring noted as a known gap), denied-claims as a
  first-class historical source, and the structural AI suggest-only trust boundary.

### Ingestion Control Panel

- Rebuilt `/ingestion` from a narrow monitor into a staff control panel.
- Added pipeline KPIs, job queue visibility, intake events, blockers, 3PL cycle overview, and recent staged invoice state.
- Added staff CSV staging for client WMS, 3PL fulfillment, and 3PL storage.
- Added typed/pasted manual intake for:
  - SFTP fetch queueing;
  - FedEx/UPS carrier API JSON;
  - ShipStation/Shopify webhook JSON;
  - raw EDI 210;
  - LTL CSV text.
- Kept ingestion human-in-the-loop: manual/staff control can stage data and queue jobs but does not auto-approve findings or auto-file disputes.

### Documentation Restructure

- Updated `CLAUDE.md` with the gateway-readiness direction and new invariants.
- Updated data-layer, ingestion, audit-engine, disputes, portal, and auth docs to include gateway and jewelry insurance considerations.
- Added `docs/gateway-readiness.md` as the canonical taxonomy and reporting reference.
- Reworked `docs/LAUNCH-BLOCKERS.md` to contain only open launch blockers with acceptance criteria.
- Reworked `docs/BACKLOG.md` to contain open roadmap/hardening work.

### Gateway and Insurance Intelligence Foundation

- Added gateway metadata columns to `"Audit Results"` in `db/schema.ts`.
- Added `db/migrations/0004_gateway_insurance_intelligence.sql`.
- Added `gateway_behavioral_tags`, `client_insurance_policies`, `insurance_policy_rules`, and `shipment_insurance_audit_results`.
- Added typed taxonomy helpers in `lib/intelligence/taxonomy.ts`.
- Added report helpers in `lib/intelligence/reports.ts`.
- Updated parcel/LTL and 3PL audit writes to attach default gateway metadata to new findings.
- Added taxonomy tests in `lib/intelligence/taxonomy.test.ts`.
- Verified with `npx tsc --noEmit` and `npm test` (126 tests passing).

### Policy Intelligence MVP Documentation

- Added Policy Intelligence MVP workflow to `docs/gateway-readiness.md`.
- Added policy workflow schema direction to `docs/data-layer.md`.
- Added policy document intake guidance to `docs/ingestion.md`.
- Added policy evaluator and historical backtest contract to `docs/audit-engine.md`.
- Added staff-only Policy Intelligence console route guidance to `docs/portal.md`.
- Added policy security controls to `docs/auth.md`.
- Added implementation backlog items for policy schema, rulesets, evaluator, backtests, and Gateway Readiness Assessments.

## Historical Baseline

- Next.js App Router console and client portal.
- Neon Postgres data layer replacing Airtable runtime dependency while preserving Airtable-style business table names.
- Auth.js role model with `staff` and `client`.
- Postgres-backed audit job queue.
- Parcel/LTL and 3PL audit engines.
- Disputes workflow with AI response parser as suggest-only.
- Mapping exceptions and data clerk suggestions as human-reviewed learning loop.
