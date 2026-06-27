# Backlog

Open post-launch, hardening, and product roadmap work belongs here. Completed work belongs in `docs/CHANGELOG.md`.

## Grilling Session — Domain Model (DONE — Wave A+B deployed, 2026-06-26)

- [x] ADR 0004: Gateway `/v1/precheck` as Next.js API route (not Fastify)
- [x] ADR 0005: Dispute state machine — constrain `"Disputes"."Status"` + `state-machine.ts`
- [x] ADR 0006: Scalar `client_id` migration — migrate `text[]` arrays to scalar on 3 business tables
- [x] ADR 0007: Dual-audit architecture — formalize operational vs strategic engine split
- [x] CONTEXT.md: 24 canonical terms, single authoritative glossary
- [x] ADR 0008: Single grilling schema migration contract
- [x] ADR 0009: Portal Compliance Architecture — dual-tab Dashboard, 5 governance KPIs, Coverage Gap Feed, Warehouse Scorecard, Gateway Readiness, Attestation, multi-type Upload, hybrid data layer

## Portal Compliance Architecture (ADR 0009) — ✅ WAVE C COMPLETE (2026-06-26)

- [x] E4 Phase 0: Compliance Tab shell + `portalDataLoader()` + tab routing
- [x] E5 Phase 1: 5 governance KPI cards + Coverage Gap Feed + Warehouse Scorecard
- [x] E6 Phase 1: Gateway Readiness "What You Would Have Saved" panel + Attestation panel
- [x] E4 Phase 2: Multi-type Upload rebuild (Insurance Policy, Carrier Contract, SOP, Claims History, Shipment CSV)
- [ ] Update portal status pills from old labels (Open, Won, Closed) to canonical dispute statuses (pending_review, filed, carrier_responded, etc.)
- [ ] Client-facing gateway readiness report (simulation-only; activation stays staff-controlled until first 3–5 clients validate rulesets)

## High Priority

### Policy Intelligence MVP

- [x] Add policy intelligence schema and migration.
  - Acceptance: `client_policies`, `policy_documents`, `policy_rulesets`, `policy_rules`, `policy_backtest_runs`, `policy_backtest_results`, and `gateway_readiness_assessments` exist in Drizzle schema and SQL migration.
  - **DONE (2026-06-26).** Migration 0005 + 0006 + 0007 shipped.
- [x] Add staff-only policy inventory UI.
  - Acceptance: staff can create a policy shell, assign client/type/effective dates/status, and see all client policies from `/policies`.
  - **DONE (2026-06-26).** `app/(console)/policies/` shipped.
- [x] Add policy document intake.
  - Acceptance: staff can attach source metadata for contracts, tariffs, SLAs, insurance policies, SOPs, packaging standards, claims instructions, and email exceptions.
  - **DONE (2026-06-26).** `addDocumentAction` in `policies/actions.ts`.
- [x] Add structured policy rule editor.
  - Acceptance: staff can create/edit condition JSON, action JSON, severity, category, clause reference, effective dates, and rule status without editing DB rows manually.
  - **DONE (2026-06-26).** `PolicyRulesWorkbench` + `addRuleAction` with `validateConditionKeys()`.
- [x] Add ruleset versioning workflow.
  - Acceptance: staff can group rules into draft/active/archived rulesets, and only active rulesets are used by default.
  - **DONE (2026-06-26).** `policy_rulesets` with version, status, effective dates; `draft → client_attested → active` attestation flow.
- [x] Add policy evaluator.
  - Acceptance: a shipment-like payload plus a ruleset returns `ALLOW`, `WARN`, `BLOCK`, `REQUIRE_APPROVAL`, or `REQUIRE_DOCUMENTATION` decisions with clause references and suggested fixes.
  - **DONE (2026-06-26).** `lib/intelligence/policy-evaluator.ts` — pure, deterministic, tri-valued.
- [x] Add historical policy backtest runner.
  - Acceptance: staff can run a ruleset against 12-24 months of client shipment/audit/insurance data and write reproducible `policy_backtest_runs` and `policy_backtest_results`.
  - **DONE (2026-06-26).** `runPolicyBacktest()` with shipment spine, keyset pagination, effective-dating, preview/official modes.

### Taxonomy Discovery / Cross-Tenant Learning (design: [`policy-intelligence/07-schema-evolution.md`](policy-intelligence/07-schema-evolution.md), ADR 0012)

**ADR 0012 (4-Tier Extraction & Classification) supersedes ADR 0011's extraction portions.**
ADR 0011 taxonomy discovery (Phase 4) and temperature gap (Phase 0) remain valid.

**Phase 0 — Temperature Gap Closure (ADR 0011 D1, retained)** ✅
- [x] Add `temperatureMax`/`temperatureControlRequired` to `PolicyCondition` type in `lib/intelligence/policy-evaluator.ts`
  - Acceptance: `PolicyCondition` accepts `temperatureMax?: number` and `temperatureControlRequired?: boolean`
- [x] Add evaluator branch: `temperatureControlRequired && !temperatureServiceSelected → WARN`
  - Acceptance: evaluator test passes with expected decision and message
- [x] Add backtest case for temperature control violation
  - Acceptance: backtest fires on shipments missing temperature service when required

**Phase 1 — T1 Deterministic Tokenizer (ADR 0012 D2)** ✅
- [x] Create `lib/intelligence/tokenizer.ts` — regex/phrase matching seeded from rule_key namespace
  - Acceptance: 33 phrase patterns across 12 categories; parameter extraction via indexed capture groups; <1ms per clause; zero API dependencies; matches 85-95% of standard carrier insurance clauses
- [x] Add tokenizer tests: standard clause matching, parameter extraction, collision resolution, cold-start coverage
  - Acceptance: 49/49 tests pass; realistic document batch test covers 14 canonical clauses; zero API dependencies; all 351 suite tests pass

**Phase 2 — T2 LLM Data Mapper + T3 Vector Memory Bank (ADR 0012 D3-D4)**
- [x] Implement T2 LLM mapper — strict PolicyCondition schema alignment, Zod-gated, degrade pattern
  - Acceptance: LLM output constrained to existing PolicyCondition keys; `{ mapped: false }` response for unmappable clauses; Zod validation rejects unknown keys; cheap-first escalation preserved from ADR 0011 D2
- [x] Create `clause_embeddings` table (pgvector) + embedding generation
  - Acceptance: stores clause_text, embedding, classified_rule_key, classified_condition_json, classification_source, match_count; 0.92 cosine similarity threshold; cross-client deduplication; graceful degradation without embedding API key
- [x] Build Tier Orchestrator (`pipeline.ts`) — T1 → T3 → T2 → T4 flow with p-limit(5) concurrency
  - Acceptance: T1 sync, T3 async check, T2 LLM mapper concurrent, T4 unmapped bucket; PipelineResult with stats (t1Hits, t3Hits, t2Mapped, t4Unmapped, totalCost)
- [ ] Wire T3 → T1 feedback loop: high-match-count T3 entries → automatic T1 pattern suggestions
  - Acceptance: clauses with match_count > 10 surface as "Consider adding T1 pattern" in staff console

**Phase 3 — T4 Client Ambiguity Dashboard (ADR 0012 D5)**
- [ ] Create portal "Policy Review" page (`/portal/policy-review`) — Define/Exclude/Flag workflow
  - Acceptance: client sees source clause text, plain-English summary, three actions; Define creates draft rule with `signal_source='CLIENT_DEFINED'`; Exclude creates `policy_scope_exclusions` row with attestation timestamp; Flag routes to staff review
- [ ] Add `policy_scope_exclusions` table + migration
  - Acceptance: stores client_id, policy_id, clause_ref, clause_text, excluded_at, excluded_by, reason
- [ ] Add `CLIENT_DEFINED` to `gatewaySignalSource` taxonomy enum
  - Acceptance: `lib/intelligence/taxonomy.ts` updated; migration adds enum value
- [ ] Wire scope exclusions into Coverage Gap Feed — excluded clauses suppressed with "Excluded by client" annotation
  - Acceptance: coverage gap report shows exclusion reason instead of "System failed to detect"

**Phase 4 — Taxonomy Discovery (ADR 0011 D5-D6, retained)**
- [ ] Add `policy_taxonomy_candidates` table + migration.
  - Acceptance: stores `rule_key`, inferred datatype/bounds, lineage, surfacing `client_id`, `seen_count`, `lifecycle_status`; Tier-0 metadata only (no client values).
- [ ] Extractor: grounded-but-unmappable constraint → frontier escalation → upsert candidate (dedupe by `rule_key`, bump `seen_count`).
  - Acceptance: an existing-concept-in-disguise maps to its category; a truly novel grounded constraint stages one candidate; ungrounded constraints are rejected, never staged.
- [ ] Add `is_taxonomy_admin` boolean to `app_users` + JWT/session plumbing.
  - Acceptance: `taxonomy_admin` capability gates `promoteCandidate`; staff without flag cannot promote.
- [ ] Staff candidate-review UI (ranked by `seen_count`, promote/reject).
  - Acceptance: only `taxonomy_admin` can promote; promotion opens a data→code change, never a live taxonomy mutation.
- [x] Close the existing capture/enforce gap: add `temperatureMax`/`temperatureControlRequired` to `PolicyCondition` + evaluator branch + backtest case.
  - Acceptance: `TEMPERATURE_CONTROL_MISSING` becomes enforceable, not just named.

### Aurelian Gateway V1 (design: [`policy-intelligence/08-gateway.md`](policy-intelligence/08-gateway.md)) — ✅ IMPLEMENTED (2026-06-26)

- [x] Stand up the Fastify service importing `lib/intelligence` evaluator; `POST /v1/precheck` with the `ShipmentPolicyContext` Zod schema + generic JSON fallback.
  - Acceptance: a valid precheck returns a severity-aggregated decision in <100ms warm; bad payload → 400; bad key → 401.
  - **DONE.** `services/gateway/src/index.ts` + `precheck.ts`.
- [x] Warm versioned snapshot cache with effective-dated ruleset selection + TTL/version invalidation.
  - Acceptance: zero per-request DB reads; an activated ruleset propagates within the TTL bound; decisions log `rulesetVersion`.
  - **DONE.** `services/gateway/src/cache.ts`.
- [x] Response contract: always-200, `decision`/`enforced`/`approval_token`/`violations[]`/`rulesetVersion`/`correlationId`; per-client+per-rule mode (shadow/approval/block).
  - Acceptance: shadow returns real `decision` with `enforced:false` + token; enforce honors per-rule mode.
  - **DONE.** D3 contract implemented; D2 shadow mode (`enforced: false` always in V1).
- [x] Risk-tiered failure handling.
  - Acceptance: fail-open below threshold; fail-closed above per-client `declaredValue` threshold and on missing value for high-value verticals; every fail-open logged `degraded:true`.
  - **DONE.** `services/gateway/src/config.ts` + `precheck.ts` D5 logic.
- [x] `gateway_decisions` table (Tier-2, RLS) + at-least-once durable buffer → drain; per-client API keys as sole tenant-identity source.
  - Acceptance: a crash mid-write replays the decision; body `clientId` cannot override the key's tenant.
  - **DONE.** `services/gateway/src/decision-log.ts` + `src/auth.ts`; table created in migration 0006.

### Governance positioning support (design: [`policy-intelligence/09-analyst-decision-support.md`](policy-intelligence/09-analyst-decision-support.md)) — ✅ IMPLEMENTED (2026-06-26)

- [x] Client (and broker) **attestation** step: `draft → client_attested → active` ruleset transition; clients gain *confirm/reject* (not author) on their own policy's digitized rules; attestation is stored + timestamped.
  - Acceptance: a ruleset cannot go `active` without a recorded authority attestation; clients still cannot author rules; the portal exposes review-against-source-clause, not editing.
  - **DONE.** `attestRulesetAction` + `activateRulesetAction` in `policies/actions.ts`; `AttestationPanel` component.
- [x] Per-client **written scope statement**: the N enforced operational controls vs the M out-of-scope (ambiguous / non-operational) clauses, generated from the ruleset.
  - Acceptance: every active ruleset has a client-facing scope doc; ambiguous clauses are listed as non-enforced unless individually attested.
  - **DONE.** `ScopeStatement` component in `policy-intelligence.tsx`.
- [x] **Guarantee + disclaimer** copy (DG3) and **3PL-SLA clause** (DG4) as standard contract artifacts; one-time E&O/legal review before first paid advisory.
  - **DONE.** `GuaranteeCard` component in `policy-intelligence.tsx`.

### Paid packaging readiness (design: [`policy-intelligence/09-analyst-decision-support.md`](policy-intelligence/09-analyst-decision-support.md))

Sequencing for charging (governance route). **Gate: the backtest must be correct before any
paid Proof** — see "Backtest Correctness" below; that work is the #1 pre-sale blocker.

- [ ] Phase-1 paid **Compliance Risk Assessment** deliverable: digitized+attested ruleset + corrected Ghost Audit report (3 buckets: violations / compliant / couldn't-assess) + per-client scope statement.
  - Acceptance: report runs on a real client's 30–90 days with complete (non-truncated) numbers; an axis-crossing jewelry rule fires; unknowns are bucketed separately, never as compliant.
  - Pricing: ~$1k diagnostic, deposit-to-start / balance-on-delivery, credited toward the ~$2.5k Phase-2 Gateway onboarding.
- [ ] Onboarding **data-readiness check**: report null-rate on the fields rules depend on; surface "data capture is finding #1" when sparse.
- Note: Phase-2 live Gateway is the separate [Aurelian Gateway V1](#aurelian-gateway-v1-design-policy-intelligence08-gatewaymd) work; do not sell its integration before it exists.

### Backtest Correctness (ADR 0001) — ✅ IMPLEMENTED (2026-06-26)

- [x] Rebuild `loadBacktestContexts` around the shipment spine.
  - Acceptance: one context per shipment, `"Shipments"` left-joined to invoices/audit-results and `shipment_insurance_audit_results`; an axis-crossing rule (`shipperVertical` + `declaredValueGte` + `carrierIn`) matches in a backtest.
  - **DONE.** `loadBacktestContextsWithDates` in `policy-service.ts`.
- [x] Replace `LIMIT 5000` reads with keyset pagination over `"Shipments"`.
  - Acceptance: a client with >5000 shipments is fully evaluated; no silent truncation.
  - **DONE.** `PAGE_SIZE=500`, iterates until exhausted.
- [x] De-duplicate preventable loss by `audit_result_id`; attribute at shipment grain.
  - Acceptance: two rules matching one shipment do not double-count; `getGatewayAssessment` does not sum overlapping audit-ROI and backtest loss.
  - **DONE.** `seenAuditIdsGlobal` Set; audit-ROI and backtest-loss are separate dimensions.
- [x] Multi-shipment invoices roll to shipment only when 1:1, else `DATA_REQUIRED`.
  - Acceptance: no split/duplicated dollars; multi-shipment invoices are flagged, not silently attributed to `[0]`.
  - **DONE.** Invoices with >1 shipment zero the attributable loss.
- [x] Tri-valued condition evaluation (`pass`/`fail`/`unknown`).
  - Acceptance: a null input field yields `DATA_REQUIRED`, not a false violation or silent allow; readiness report separates uncertain-pending-data from preventable.
  - **DONE.** `findUnresolvableFields()` with `DATA_REQUIRED` bucket.
- [x] Select ruleset by shipment `"Ship date"`; enforce non-overlapping active rulesets.
  - Acceptance: each shipment evaluated against the ruleset in force on its ship date; overlapping active rulesets for a client are rejected.
  - **DONE.** `matchShipmentsToRulesets()` in `policy-service.ts`.
- [x] Validate `condition_json` keys against `PolicyCondition` at write time.
  - Acceptance: an unknown/typo'd condition key is rejected in `addRuleAction`, not saved as a silently-dead active rule.
  - **DONE.** `validateConditionKeys()` called in `addPolicyRule`.
- [x] Backtest `preview` vs `official` modes; snapshot inputs for reproducibility.
  - Acceptance: only `official` (active-rules-only) runs feed a client assessment; re-running an `official` run over the same period reproduces the numbers.
  - **DONE.** `runPolicyBacktest({ mode })` — `preview` includes drafts, `official` snapshots inputs as JSONB.
- [x] Add Gateway Readiness Assessment UI.
  - **DONE 2026-06-26.** Page exists at `/gateway-readiness/[clientId]` with preventability KPIs, monthly audit loss table, top gateway rule suggestions, insurance exposure, and backtest runs.
  - Acceptance: staff can generate a client assessment combining policy drift, preventable audit loss, uninsured exposure, top rules, and recommended gateway controls.

### Policy Extraction Pipeline (ADR 0002) — SUPERSEDED by ADR 0012

Per [`policy-intelligence/02-extraction.md`](policy-intelligence/02-extraction.md#extraction-architecture)
and [`adr/0012-four-tier-extraction-classification.md`](adr/0012-four-tier-extraction-classification.md).
The 4-tier architecture replaces the linear 6-stage pipeline.

- [ ] T1: `lib/intelligence/tokenizer.ts` — deterministic phrase/pattern matching (see Taxonomy Discovery Phase 1 above)
- [ ] T2: LLM data mapper with Zod validation + degrade pattern
- [ ] T3: `clause_embeddings` pgvector table + semantic caching
- [ ] T4: Client ambiguity dashboard — Define/Exclude/Flag workflow

### Gateway Readiness Taxonomy

- [ ] Apply `0004_gateway_insurance_intelligence.sql` to each active database.
  - Acceptance: dev/staging/prod databases have gateway columns and intelligence tables; audit writes succeed with gateway fields.
- [x] Add queue/report UI filters for gateway preventability and category.
  - **DONE 2026-06-26.** Gateway taxonomy review page at `/gateway-tags` with filter chips (All / Preventable / Non-Preventable / Unknown), inline tag editing, details panel, KPI row, and bulk confirm action.
  - Acceptance: staff can review preventable findings and rule suggestions.
- [x] Add gateway tag analyst review workflow.
  - **DONE 2026-06-26.** `/gateway-tags` page with confirm/edit/dismiss flow. Staff can change preventability via dropdown (PREVENTABLE_BY_GATEWAY / NON_PREVENTABLE_BY_GATEWAY / UNKNOWN), view rule suggestions in expandable detail panel, and bulk-confirm tags. Server actions with Zod validation + staff role check.
  - Acceptance: staff can confirm, edit, or dismiss default rule-generated tags.
- [x] Add Gateway Readiness Report UI.
  - **DONE 2026-06-26.** Readiness report exists at `/gateway-readiness/[clientId]` using `getGatewayAssessment()` and `getInsuranceExposureReport()` from `lib/intelligence/reports.ts`.
  - Acceptance: staff can view client/month/category margin loss, ROI, and top rule suggestions from `lib/intelligence/reports.ts`.

### High-Value Shipper Insurance Intelligence

- [ ] Add policy onboarding workflow.
  - Acceptance: staff can enter structured insurance terms through the broader Policy Intelligence workflow without editing DB rows manually.
- [ ] Add shipment-level ingestion for high-value fields.
  - Acceptance: intake can capture shipper vertical, commodity, declared value, insurance provider/amount, signature, documentation, destination risk, and policy reference.
- [ ] Add insurance readiness report UI.
  - Acceptance: staff can view non-compliant declared value, uninsured exposure, and top policy rules by client/month/vertical using `getInsuranceExposureReport()`.
- [ ] Add insurance policy rule evaluator.
  - Acceptance: stored `insurance_policy_rules` can evaluate a shipment-like payload and return `ALLOW`, `WARN`, `BLOCK`, `REQUIRE_APPROVAL`, or `REQUIRE_DOCUMENTATION`.

### Ingestion Lineage

- [x] Add `ingestion_batches` table.
  - **DONE 2026-06-26.** Schema + migration `0010_ingestion_lineage` adds `ingestion_batches` and `ingestion_records`. Created `lib/ingestion/lineage.ts` with `startBatch`/`finishBatch`/`trackRecord` helpers.
  - Acceptance: every file/API/webhook/SFTP intake can be tracked by source, client, carrier, row counts, status, and job linkage.
- [x] Add `ingestion_records` table.
  - **DONE 2026-06-26.** Schema references batch with FK, stores raw payload, normalized type, staged record ID, and audit/dispute linkage.
  - Acceptance: raw payload, normalized payload, staged invoice/shipment/3PL IDs, audit result ID, and dispute ID can be linked.
- [x] Update ingestion routes/actions to write batch and record lineage.
  - **DONE 2026-06-26.** All 5 API routes (`carrier`, `edi`, `wms`, `3pl`, `sftp-poll`) and all console ingestion paths (file upload + manual paste for carrier_api, wms_webhook, edi_raw, ltl_csv, 3pl) create batches and record lineage rows. Errors are captured even on failure.
  - Acceptance: `/ingestion` can answer "what happened to this file/payload/row?"

## Launch Week

### Environment and Configuration

- [x] Update `.env.local.example`.
  - **DONE 2026-06-26.** Updated with organized sections, gateway API key guidance, and production NEXTAUTH_URL comment covering Vercel + non-Vercel hosting.
  - Acceptance: removes stale Airtable variables and lists current required/optional env vars.
- [x] Add production `NEXTAUTH_URL` guidance.
  - **DONE 2026-06-26.** Included in `.env.local.example` — covers Vercel (leave unset) and non-Vercel (set to exact HTTPS origin).
  - Acceptance: deployment doc or env example covers Vercel and non-Vercel hosting.

### Empty State and Error UX

- [x] Replace stale Airtable copy in empty states.
  - **DONE 2026-06-26.** Cleaned `app/(console)/page.tsx` comments, queue-view variable names (`airtableStatus` → `reviewStatus`), disputes `airtableRecordIdSchema` → `recordIdSchema`, queue actions comments, carriers comments, primitives comment, disputes type comment, clients comment. All user-facing copy references database/Postgres now.
  - Acceptance: no user-facing "connect Airtable" copy remains.
- [x] Add user-visible DB error states where missing.
  - **DONE 2026-06-26.** All 12 console pages wrap their data loads in `ConsoleErrorState` with actionable hints. Gateway tag review page also follows the pattern.
  - Acceptance: staff pages show actionable load errors without crashing.

### Duplicate Detection Rule

- [x] Rewrite `DUPLICATE_TRACKING`.
  - Acceptance: joins through shipment links and matches actual PRO/tracking number instead of carrier/date/amount proxy.
  - **DONE (2026-06-26).** `lib/audit/rules/duplicate-tracking.ts` — PRO/tracking comparison via shipment links.

### DB Naming Cleanup

- [x] Rename `lib/airtable.ts` to `lib/db/records.ts` or similar.
  - **DONE 2026-06-26.** Created `lib/db/records.ts` with updated header. Updated 26 source + test imports. Old file kept as re-export shim for safety. All 295 tests pass, TypeScript clean.
  - Acceptance: imports updated and compatibility shim added or removed intentionally.
- [ ] Incrementally migrate high-risk raw SQL reads to clearer helpers.
  - Acceptance: no behavior changes without tests.

## Medium Priority

### Rate Limiting

- [ ] Add API and server-action rate limiting.
  - Acceptance: per-IP on ingest routes, per-user on console actions.

### Per-Carrier API Keys

- [ ] Replace single `INGEST_SECRET` with per-carrier keys.
  - Acceptance: keys can be scoped, rotated, and audited by carrier/source.

### Soft Deletes

- [x] Add `deleted_at` to business tables.
  - **DONE 2026-06-26.** Added to 11 tables (Invoices, Shipments, Audit Results, Disputes, Clients, Carriers, rulebook, client_policies, policy_documents, policy_rulesets, policy_rules). Migration `0008_soft_delete`. Partial indexes for active rows. `fetchRecords`, `fetchAllRecords`, `findByField` filter `WHERE deleted_at IS NULL`. New `softDelete()` and `restoreRecord()` functions in `lib/db/records.ts`.
  - Acceptance: standard reads exclude soft-deleted rows.

### Audit Trail

- [x] Track mutations on Invoices, Disputes, Audit Results, rulebook, policy rules, and gateway tags.
  - **DONE 2026-06-26.** New `audit_trail` table with actor, table_name, record_id, action (INSERT/UPDATE/DELETE), changed_fields JSONB, changed_at. Migration `0009_audit_trail`. `createRecord`, `updateRecord`, `softDelete` accept optional `actor` param and log audit events automatically. `updateRecord` computes before/after diffs. New `logAuditTrail()` helper.
  - Acceptance: staff can see who changed what and when.

### Client Portal

- [ ] Verify `/portal/upload` against production-like CSVs.
- [ ] Replace print-to-PDF with generated branded PDFs.
- [x] Add Recharts area/bar charts to dashboard.
  - **DONE 2026-06-26.** Created `components/console/dashboard-charts.tsx` with three Recharts components: `RecoveryTrendChart` (area chart), `AuditFindingsChart` (horizontal bar chart by rule), `DisputePipelineChart` (stacked bar by month). Replaced static `Bars` + `RuleBreakdown` on console dashboard. Data computed server-side, passed as props.
- [ ] Add client-safe gateway readiness summary after internal taxonomy is reviewed.

### Caching

- [ ] Cache rulebook per request and evaluate cross-request caching.
- [ ] Add `revalidateTag` / ISR where appropriate for dashboard pages.

### Monitoring Dashboard

- [ ] Add ingestion volume, match rate, audit coverage, dispute velocity, gateway preventable loss, and insurance exposure metrics.
- [ ] Alert on ingest 5xx spikes, audit failures, exception queue growth, and policy non-compliance spikes.
