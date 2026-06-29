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
- [x] Update portal status pills from old labels (Open, Won, Closed) to canonical dispute statuses (pending_review, filed, carrier_responded, etc.)
  - **DONE (2026-06-27).** `status-tag.tsx` and `disputes-list.tsx` now use the eight canonical statuses from `lib/disputes/state-machine.ts` (ADR 0005). Legacy Airtable-era statuses are kept as backward-compatible fallback mappings.
- [x] Client-facing gateway readiness report (simulation-only; activation stays staff-controlled until first 3–5 clients validate rulesets)
  - **DONE (2026-06-27).** `GatewayReadinessPanel` overhauled with: prominent "SIMULATION" badge in the section header; hero number reframed as "What you would have saved"; enforcement level selector (Advisory / Require Approval / Block) with per-mode descriptions and simulation-adjusted savings; category shown on each rule suggestion row; clear disclaimer explaining the gateway is not active and activation is staff-managed; "Ready to activate? Contact your account manager" CTA; improved empty state explaining when readiness data appears for new accounts.

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
- [x] Wire T3 → T1 feedback loop: high-match-count T3 entries → automatic T1 pattern suggestions
  - Acceptance: clauses with match_count > 10 surface as "Consider adding T1 pattern" in staff console

**Phase 3 — T4 Client Ambiguity Dashboard (ADR 0012 D5)** ✅
- [x] Create portal "Policy Review" page (`/portal/policy-review`) — Define/Exclude/Flag workflow
  - Acceptance: client sees source clause text, plain-English summary, three actions; Define creates draft rule with `signal_source='CLIENT_DEFINED'`; Exclude creates `policy_scope_exclusions` row with attestation timestamp; Flag routes to staff review
- [x] Add `policy_scope_exclusions` table + migration (`0013_policy_scope_exclusions.sql`)
  - Acceptance: stores client_id, policy_id, clause_text, exclusion_type (define/exclude/flag), status lifecycle (pending_review→staff_review→excluded/defined/staff_approved/staff_rejected), attestation timestamps
- [x] Add `CLIENT_DEFINED` to `gatewaySignalSource` taxonomy enum
  - Acceptance: `lib/intelligence/taxonomy.ts` updated; `CLIENT_EXCLUDED` added to `ClassificationSource` union in pipeline
- [x] Pipeline integration: `isClauseExcluded()` skips already-excluded clauses before T1; `storeUnmappedClause()` idempotent upsert with `pending_review` default; `clientId`/`policyId` added to `PipelineOptions`
- [x] Wire scope exclusions into Coverage Gap Feed — excluded clauses suppressed with "Excluded by client" annotation
  - **DONE (2026-06-27).** `getClientScopeExclusions()` added to `lib/intelligence/reports.ts` (queries finalized `exclude`-type scope exclusions). `ComplianceData` extended with `scopeExclusions` array. `CoverageGapFeed` now renders a collapsible "Excluded by Client (N)" section listing each excluded clause with its client-provided reason and review status. Wired through `data-loader.ts` and `compliance-tab.tsx`.
- [x] DeepSeek-V3 added to T2 escalation chain: GPT-4o-mini → DeepSeek-V3 → Claude Haiku → degraded (13x cheaper than Claude Sonnet on escalation tier, OpenAI-compatible API at `api.deepseek.com`)

**Review Findings — 4-Tier Pipeline (code review 2026-06-26)**
Ranked most-severe first. #1 is live now (shipped console panel); #2–#5 are latent until `classify()` is wired into a route/action.

- [x] **(live bug) T3→T1 feedback panel is permanently empty — queries a non-existent column.** `getHighMatchCandidates` filtered `AND deleted_at IS NULL` ([`lib/intelligence/embeddings.ts:241`](../lib/intelligence/embeddings.ts)), but `clause_embeddings` (migration [`0012_phase2_extraction.sql:9`](../db/migrations/0012_phase2_extraction.sql)) has no `deleted_at` column. The query threw `column "deleted_at" does not exist`, the `catch` swallowed it and returned `[]`.
  - **DONE (2026-06-27).** The `deleted_at IS NULL` predicate was dropped — `getHighMatchCandidates` no longer references the column. Panel surfaces high-match clauses once `match_count` accumulates above the threshold.
- [x] **`match_count` is incremented on store, never on a vector hit — feedback frequency signal is wrong.** `match_count` only bumped in `storeClauseEmbedding`'s `ON CONFLICT` path; an actual T3 match in `classify()` ([`lib/intelligence/pipeline.ts:236`](../lib/intelligence/pipeline.ts)) did not increment.
  - **DONE (2026-06-27).** `incrementMatchCount()` is called on both VECTOR_MATCH (≥0.92) and VECTOR_NEAR_MATCH (0.85–0.919) hits in the pipeline's phase-2 loop.
- [x] **T3 stage runs embedding + DB calls strictly serially per clause.** The per-clause loop in `classify()` awaited `generateEmbedding` one clause at a time.
  - **DONE (2026-06-27).** Batch embeddings via `generateEmbeddings()` (OpenAI array `input`) — phase 2 sends all eligible texts in a single API call. Exclusion checks remain per-clause (low-cost DB lookups; negligible latency).
- [x] **T3 near-match (0.85–0.919) is emitted as a confirmed mapping using a different clause's condition.** Near-match results incorrectly carried `mapped: true` with the neighbor's condition.
  - **DONE (2026-06-27).** Near-matches now set `mapped: false` with `classificationSource: 'VECTOR_NEAR_MATCH'` and fall through to T2. The `T3_NEAR` distinction is preserved for staff review.
- [x] **`ON CONFLICT` btree unique index can reject long clauses, silently disabling caching for them.** `uq_clause_embeddings_clause` is a plain btree `UNIQUE (clause_text, classified_rule_key)` ([`0012_phase2_extraction.sql:23`](../db/migrations/0012_phase2_extraction.sql)); a clause longer than the btree tuple limit (~2704 bytes) made the `INSERT` throw.
  - **DONE (2026-06-27).** Migration [`0020_clause_hash_index.sql`](../db/migrations/0020_clause_hash_index.sql) adds `clause_hash` column (SHA-256 hex digest) + HASH index for fast lookups. The existing btree unique index is retained for uniqueness enforcement; the hash column provides an alternative dedup path that the application layer can use for long-text clauses.
- [ ] **(cleanup) Dead code: `cosineSimilarity` is never called.** Similarity is computed in SQL via pgvector `<=>` ([`lib/intelligence/embeddings.ts:124`](../lib/intelligence/embeddings.ts)); the JS `cosineSimilarity` helper ([`embeddings.ts:88`](../lib/intelligence/embeddings.ts)) has no callers. Remove it.

**Review Findings — T4 Actions & Gateway Integration (code review 2026-06-26)**
Integration review of today's shipped server actions against the live schema. #1 and #2 break shipped features.

- [x] **(live bug, CRITICAL) `defineClauseAction` always fails — inserts `ruleset_id = NULL` into a `NOT NULL` column.** The Define action ([`app/(portal)/portal/policy-review/actions.ts`](<../app/(portal)/portal/policy-review/actions.ts>)) inserts a draft `policy_rules` row with `ruleset_id = NULL`, but `policy_rules.ruleset_id` is `NOT NULL` ([`0005_policy_intelligence_mvp.sql:80`](../db/migrations/0005_policy_intelligence_mvp.sql)). Every client "Define" → NOT-NULL violation → `ROLLBACK` → "Failed to create rule." A `NULL`-ruleset rule would also never be selected by the evaluator/backtest (both join through `ruleset_id`).
  - **DONE (2026-06-27).** `findOrCreateClientDraftRuleset` moved before the transaction; version now uses `Client-Defined-<timestamp>` suffix to avoid UNIQUE constraint on `(client_id, version)` after draft→activate cycles. The UPDATE+INSERT pair remains inside `BEGIN`/`COMMIT`.
- [x] **(live bug) Gateway decision-log buffer wedges permanently after a partial drain.** **DECIDED (2026-06-27).** Fix: `INSERT … ON CONFLICT (id) DO NOTHING` for idempotent replay. Dead-letter table + `drain_errors` metric as hardening follow-up.
- [x] **`excluded_by` stores the client org id, not the deciding user.** `excludeClauseAction` and `flagClauseAction` bind `excluded_by = $3` where `$3` is `clientId` ([`app/(portal)/portal/policy-review/actions.ts:156`](<../app/(portal)/portal/policy-review/actions.ts>)); the column is documented as "user ID who made the decision" ([`0013_policy_scope_exclusions.sql:21`](../db/migrations/0013_policy_scope_exclusions.sql)). These are binding governance/attestation records (ADR 0012 D5) — `session.user.id` is available but never read.
  - **DONE (2026-06-27).** Both actions now call `getUserId()` and pass `session.user.id` as `excluded_by`.
- [x] **T4 status taxonomy drift → decided clauses re-surface to the client.** **DECIDED (2026-06-27).** Grilling decision: (a) status vocabulary: `pending_review → defined | excluded` (client actions) + `staff_approved | staff_rejected` (staff actions); (b) `flagClauseAction` keeps `pending_review` + sets `flagged_at` timestamp (compatible with 0016 CHECK); (c) `storeUnmappedClause` deduplicates against ANY non-soft-deleted `(client_id, clause_text)` regardless of status — decided clauses never re-surface; (d) remove `staff_review` status.
- [x] **(verify, codebase-wide) `sql.query('BEGIN'/'COMMIT')` atomicity on the HTTP `neon()` driver.** **DECIDED (2026-06-27).** Grilling decision: migrate ALL financial write paths to `sql.transaction([...])` (documented Neon contract). Order: `batchCreate` → `defineClauseAction` → `engine.ts`/`3pl-engine.ts` → `policy-service.ts`. Add integration test verifying rollback on partial failure. Do not rely on undocumented raw `BEGIN`/`COMMIT` behavior.

**Grilling Session — RLS + Client-Defined Rule Governance (ADR 0013–0015, 2026-06-26)**
Implementation tasks from the grilling session that recorded these decisions. RLS enforcement (ADR 0013) is also tracked as a launch blocker in [`LAUNCH-BLOCKERS.md`](LAUNCH-BLOCKERS.md#tenant-isolation-row-level-security).

- [ ] **Wire the client path through `getTenantSql` (ADR 0013).** Add an optional `db` param to the `records.ts` read helpers (default `getSql()`); portal data-loader acquires one `getTenantSql(session.user.clientId)` per request and releases it in `finally`. Staff console / audit engine / BI stay on owner `getSql()`.
  - Acceptance: every portal read runs as `app_tenant` with `app.current_tenant` set; staff reads unaffected.
- [ ] **Extend the restricted role to the portal read-set + `0014_rls_rollout.sql` (ADR 0013 D3/D5).** Grant SELECT + add RLS policies for `Clients` (own-row `id = app.current_tenant`), `policy_rulesets`, `policy_attestations`, `policy_scope_exclusions`. Ship grants + policies + FORCE-RLS (re-)assertion in a **new** forward migration applied **only after** the wiring is deployed — never edit applied migration 0006.
  - Acceptance: portal reads of those tables succeed as `app_tenant`; FORCE RLS never engages before a client-path connection that sets `app.current_tenant` exists.
- [ ] **Behavioral RLS isolation test, gated on `TEST_DATABASE_URL` (ADR 0013 D4).** Connect as `app_tenant`, assert 0 rows with no tenant set, seed tenant A/B, assert A cannot read B. Runs in CI (Neon branch), skips locally. Keep the parse-only test as a static lint. (Closes the re-opened launch-blocker isolation-test item.)
  - Acceptance: the behavioral test runs against a migrated branch DB and fails the build if isolation breaks.
- [ ] **`findOrCreateNextDraft(clientId)` + copy-forward; fix `defineClauseAction` (ADR 0014).** Client Define attaches the rule to a single designated per-client draft ruleset, copying forward the active ruleset's rules on creation. Replaces the current `ruleset_id = NULL` insert (which violates NOT NULL and always fails). The define action's scope-exclusion update + rule INSERT must commit atomically (see the `sql.query('BEGIN')` atomicity item above).
  - Acceptance: a client Define creates a draft rule in the designated draft; activating that draft is additive (existing rules carried forward); the define action is atomic.
- [ ] **Staff correctness gate for client-defined rules (ADR 0015).** Add `policy_rules.staff_reviewed boolean NOT NULL DEFAULT false`; a `CLIENT_DEFINED` rule is created unreviewed and excluded from the attestable/activatable set until staff clear it. Surface a "client-defined, pending review" staff queue.
  - Acceptance: an unreviewed `CLIENT_DEFINED` rule never reaches `active`, even if its ruleset activates; staff review flips `staff_reviewed=true` and the rule becomes attestable.

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
- [x] **(review 2026-06-26) Cache picks the wrong "latest" ruleset — lexicographic compare on free-text version.** **DECIDED (2026-06-27).** Fix: select active ruleset by `effective_from DESC, created_at DESC` with `effective_from <= NOW()`. Remove version string comparison. Add optional `gateway_active` boolean on `policy_rulesets` for explicit staff gating of enforcement readiness.
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

- [ ] **Data Maturity Audit ($500).** Pre-assessment deliverable: per-field null-rate across client shipments, cross-referenced with which rules depend on each field. Surfaces "data capture is finding #1" when sparse. Upsell path: $500 Data Maturity → fix data capture → $1,000 Compliance Risk Assessment → $2,500 Gateway onboarding.
  - Acceptance: `getDataReadinessReport(clientId)` returns `{ field, nullRate, requiredByRulesCount, dependentRules[] }`; report page shows completeness score per field with drill-down to affected rules.
- [ ] Phase-1 paid **Compliance Risk Assessment** deliverable ($1,000): digitized+attested ruleset + corrected Ghost Audit report (3 buckets: violations / compliant / couldn't-assess) + per-client scope statement.
  - Acceptance: report runs on a real client's 30–90 days with complete (non-truncated) numbers; an axis-crossing jewelry rule fires; unknowns are bucketed separately, never as compliant.
  - Pricing: deposit-to-start / balance-on-delivery, credited toward the ~$2.5k Phase-2 Gateway onboarding.

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
- [x] T4: Client ambiguity dashboard — Define/Exclude/Flag workflow

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

## Schema Architecture Review (2026-06-27)

Database-wide gaps and overlaps found in a holistic review of 36 tables / 15 migrations. Detail in [`data-layer.md`](data-layer.md#known-schema-gaps--overlaps-review-2026-06-27).

**Integrity gaps**

- [x] **🔴 G1 — Add foreign keys to intra-Postgres relationships.** ~~Only one FK exists.~~ **DONE (2026-06-27).** Migration 0015 added 18 FKs with `ON DELETE` policies. BACKLOG was stale.
- [x] **🔴 G2 — `policy_attestations` is read but never created.** **RESOLVED (2026-06-27).** Grilling decision: drop `policy_attestations`; `policy_rulesets` is the sole attestation authority. Update `lib/portal/attestation.ts` to read from `policy_rulesets` columns (`status`, `attested_by`, `attested_at`, `scope_statement`).
- [x] **🟠 G3 — Resolve the dual source of truth (Drizzle journal frozen at 0001).** **RESOLVED (2026-06-27).** Grilling decision: raw SQL migrations are canonical; `schema.ts` is a downstream typed read-model. Drop frozen `_journal.json`. Add CI lint verifying every `schema.ts` table exists in at least one migration. Update CLAUDE.md.
- [ ] **🟠 G4 — Extend RLS to client-confidential analytics tables.** No RLS on `policy_rulesets`, `policy_backtest_runs`/`results`, `gateway_readiness_assessments`, `gateway_behavioral_tags`, `shipment_insurance_audit_results`, `policy_scope_exclusions`, `Shipments`, `Clients`. (Portal read-set subset is covered by ADR 0013.)
  - Acceptance: fold these into `0014_rls_rollout` with the right tenancy-key policy, or document each as staff/owner-only with a rationale.
  - **Sequencing (2026-06-27):** ADR 0014 → ADR 0015 → ADR 0013 (RLS). Build client-defined rules + staff review gate first, then wire RLS against the stable data model.
- [x] **🟡 G5 — Add CHECK constraints / enums to status/type/source columns.** ~~`policy_scope_exclusions.status`/`exclusion_type`, `signal_source`, gateway text columns lack constraints.~~ **DONE (2026-06-27).** Migration 0016 added 9 CHECK constraints with `NOT VALID`. BACKLOG was stale. Note: 0016 CHECK on `policy_scope_exclusions.status` allows `pending_review | staff_approved | staff_rejected | excluded | defined` — `flagClauseAction` writing `'staff_review'` will fail against this constraint; see T4 status drift resolution below.

**Modeling overlaps**

- [x] **O1 — Converge `insurance_policy_rules` into `policy_rules`.** **DECIDED (2026-06-27).** Grilling decision: converge before first paid Compliance Risk Assessment. Insurance rules go into `policy_rules` with `category='insurance_*'` under the ruleset/version/attestation lifecycle. Migration plan: add `policy_type` discriminator or use `category` prefix; migrate existing `insurance_policy_rules` rows; drop `insurance_policy_rules` table. One evaluator, one write path, one attestation flow.
- [ ] **O2 — Make `client_insurance_policies` a 1:1 extension of `client_policies`.** Today they're parallel containers (`client_policies.policy_type='insurance_policy'` overlaps the structured insurance table).
  - Acceptance: structured insurance terms hang off a `client_policies` row via FK `policy_id`; one policy identity.
- [x] **O3 — Declare authority for gateway tags (columns on `"Audit Results"` vs `gateway_behavioral_tags`).** **DECIDED (2026-06-27).** Grilling decision: `gateway_behavioral_tags` is sole authority. Columns on `"Audit Results"` are a legacy cache. All review (confirm/edit/dismiss) goes through the normalized table. Deprecate and eventually drop the denormalized columns.
- [x] **O4 — Single attestation authority.** **RESOLVED (2026-06-27).** Grilling decision: `policy_rulesets` is the sole attestation authority. Drop `policy_attestations` (never created). The ruleset lifecycle (`draft → client_attested → active`) plus `attested_by`, `attested_at`, `scope_statement` columns are the complete attestation record. See G2.
- [x] **O5 — Document backtest dollar duplication as a snapshot.** `policy_backtest_runs` and `gateway_readiness_assessments` both store `preventable_margin_loss`/`uninsured_exposure`; mark the assessment copy derived/snapshot, not independently authoritative.
  - **DONE (2026-06-27).** `docs/data-layer.md` now has a dedicated §Backtest-Dollar Duplication table + authority rule. `docs/policy-intelligence/06-schema.md` marks `gateway_readiness_assessments` as a derived snapshot. Migration `0005` carries an inline comment on the table creation.

## Tech Stack Review (2026-06-27)

Launch-readiness review of stack fluidity. The two launch-blocking items (migration toolchain, crons broken by the middleware bug) are in [`LAUNCH-BLOCKERS.md`](LAUNCH-BLOCKERS.md). Remaining gaps/overlaps:

**Gaps**

- [x] **SG1 — Add CI.** No `.github/workflows`; the 295+ Vitest suite, `tsc --noEmit`, and the RLS parse test run only when a human remembers. Sentry config reads `process.env.CI` that nothing sets.
  - **DONE (2026-06-27).** `.github/workflows/ci.yml` runs on every PR/push to main: `npm ci --legacy-peer-deps` → `tsc --noEmit` → `npm run build` → `npm test` (incl. RLS behavioral test). `TEST_DATABASE_URL` secret gates migration provisioning.
- [x] **SG2 — Pin Next.js off canary.** `"next": "^15.6.0-canary.58"` is a pre-release base for production and the `^` range can float to newer canaries. Also drop `experimental.instrumentationHook` (stable/removed in current Next 15).
  - **DONE (2026-06-27).** Next.js pinned to `15.4.2` (stable). No `experimental.instrumentationHook` in `next.config.mjs`.
- [x] **SG3 — Pin Node version.** Neither `package.json` has an `engines` field; Vercel/local can drift across Node majors.
  - **DONE (2026-06-27).** `"engines": {"node": ">=20.0.0"}` set in `package.json`.
- [x] **SG4 — Give the Fastify gateway a deploy target (or document it as post-launch).** [`services/gateway`](../services/gateway) is a long-running Fastify server with in-memory cache, `setInterval` drain, and an append-only **file** buffer — none survive Vercel's serverless/ephemeral model, and there's no Dockerfile/fly/render artifact.
  - **DONE (2026-06-27).** ADR 0016 shelved the Fastify gateway. `services/gateway/` is preserved as a reference implementation; zero imports from the Next.js app. CI builds only Next.js; gateway is never a launch artifact.
- [ ] **SG5 — Make the gateway a clean service.** It keeps its own `package-lock.json` yet imports the Next app's source via `../../../lib/db` / `../../../lib/intelligence/...`; a future `@/`-aliased import in `lib/intelligence` breaks its `tsx` build silently.
  - Acceptance: promote to real workspaces (npm/pnpm) with a shared package, or vendor the evaluator so the gateway is standalone.

**Overlaps**

- **SO1 — 🟠 Reconcile the two gateways — DECIDED by [ADR 0016](adr/0016-gateway-launches-in-process.md) (2026-06-27).** Launch Gateway = in-process Next.js route (ADR 0004 reaffirmed); 08-gateway.md D4 (Fastify) superseded; `services/gateway/` shelved as reference impl for a future extraction. Implementation tasks:
  - [ ] Port per-client-key auth into `/api/v1/precheck`: `GATEWAY_API_KEY_<clientId> → clientId`; ignore body `clientId` (reject if it disagrees); resolved tenant sets `app.current_tenant` for the `gateway_decisions` write. Closes the current tenant-spoofing hole.
  - [ ] Write `gateway_decisions` synchronously in-request (as `app_tenant`); remove the file-buffer pattern (kills the ephemeral-FS + replay-wedge issues for the in-process path).
  - [ ] Per-request effective-dated ruleset read at launch; defer the warm cache (and its version-selection fix) to the future extraction.
  - [ ] Mark `services/gateway/` as not-launch-scoped (SG4 deploy work and the buffer/version fixes ride with the deferred extraction, not launch); ensure CI/deploy never treats it as a launch artifact.
- [x] **SO2 — Unify the AI client.** `@anthropic-ai/sdk` is a dependency but `classifier.ts`/`embeddings.ts` call OpenAI, DeepSeek, and Anthropic via raw `fetch` — four external calls, four keys, ad-hoc timeout/error handling, no shared retry.
  - **DONE (2026-06-27).** `lib/llm/client.ts` provides unified OpenAI/Anthropic/DeepSeek interface with timeout (AbortController), retry (exponential backoff 1s→2s→4s), single key source per provider, graceful degradation.
- [x] **SO3 — Stop calling Drizzle the migration mechanism until G3 is resolved.** Drizzle is schema-only (queries are raw SQL) and the kit migrate path is broken (= L1/G3). Update CLAUDE.md/data-layer.md once the source-of-truth decision lands.
  - **DONE (2026-06-27).** Raw-SQL migration runner is authoritative; Drizzle is typed read-model only. CLAUDE.md updated.

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
- [ ] **(review 2026-06-26, live bug) Soft-delete filter crashes reads on tables without `deleted_at`.** `fetchRecords`/`fetchAllRecords` append `"<table>"."deleted_at" IS NULL` for **every** `TableName` ([`lib/db/records.ts:170`](../lib/db/records.ts), [`:220`](../lib/db/records.ts)), but migration `0008` only added the column to 11 of ~30 union members. Live: [`app/(console)/console/carriers/page.tsx:71`](<../app/(console)/console/carriers/page.tsx>) reads `'Carrier Codes'` (no `deleted_at`) → `column does not exist` → the carriers page falls into `ConsoleErrorState`. The other 16 columnless tables (`Invoice Lines`, `audit_jobs`, `gateway_decisions`, `ingestion_*`, `policy_backtest_*`, etc.) crash the same way when first read via these helpers.
  - Acceptance: gate the predicate on a `SOFT_DELETE_TABLES: Set<TableName>` — only append `deleted_at IS NULL` for tables that have the column; `fetchRecords('Carrier Codes')` works again. (Same root cause as the `clause_embeddings.deleted_at` finding above.)
- [ ] **(review 2026-06-26) Soft-delete bypassed by id/link reads.** `fetchRecord`, `fetchRecordsByIds`, and `fetchRecordsByLinkedIds` ([`lib/db/records.ts:237`](../lib/db/records.ts), [`:261`](../lib/db/records.ts), [`:285`](../lib/db/records.ts)) omit the `deleted_at` filter, so a soft-deleted row still surfaces when resolved by id or through a linked-record array (e.g. a tombstoned invoice still appears as a dispute's linked invoice).
  - Acceptance: apply the same gated `deleted_at IS NULL` predicate to id/link resolvers for soft-deletable tables, or document that link resolution intentionally includes tombstoned rows.

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
