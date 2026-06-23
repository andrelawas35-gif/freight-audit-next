# Backlog

Open post-launch, hardening, and product roadmap work belongs here. Completed work belongs in `docs/CHANGELOG.md`.

## High Priority

### Policy Intelligence MVP

- [ ] Add policy intelligence schema and migration.
  - Acceptance: `client_policies`, `policy_documents`, `policy_rulesets`, `policy_rules`, `policy_backtest_runs`, `policy_backtest_results`, and `gateway_readiness_assessments` exist in Drizzle schema and SQL migration.
- [ ] Add staff-only policy inventory UI.
  - Acceptance: staff can create a policy shell, assign client/type/effective dates/status, and see all client policies from `/policies`.
- [ ] Add policy document intake.
  - Acceptance: staff can attach source metadata for contracts, tariffs, SLAs, insurance policies, SOPs, packaging standards, claims instructions, and email exceptions.
- [ ] Add structured policy rule editor.
  - Acceptance: staff can create/edit condition JSON, action JSON, severity, category, clause reference, effective dates, and rule status without editing DB rows manually.
- [ ] Add ruleset versioning workflow.
  - Acceptance: staff can group rules into draft/active/archived rulesets, and only active rulesets are used by default.
- [ ] Add policy evaluator.
  - Acceptance: a shipment-like payload plus a ruleset returns `ALLOW`, `WARN`, `BLOCK`, `REQUIRE_APPROVAL`, or `REQUIRE_DOCUMENTATION` decisions with clause references and suggested fixes.
- [ ] Add historical policy backtest runner.
  - Acceptance: staff can run a ruleset against 12-24 months of client shipment/audit/insurance data and write reproducible `policy_backtest_runs` and `policy_backtest_results`.

### Backtest Correctness (ADR 0001)

Per [`adr/0001-backtest-shipment-context-model.md`](adr/0001-backtest-shipment-context-model.md)
and [`policy-intelligence/04-backtest.md`](policy-intelligence/04-backtest.md). The current
`runPolicyBacktest` / `loadBacktestContexts` predate these decisions.

- [ ] Rebuild `loadBacktestContexts` around the shipment spine.
  - Acceptance: one context per shipment, `"Shipments"` left-joined to invoices/audit-results and `shipment_insurance_audit_results`; an axis-crossing rule (`shipperVertical` + `declaredValueGte` + `carrierIn`) matches in a backtest.
- [ ] Replace `LIMIT 5000` reads with keyset pagination over `"Shipments"`.
  - Acceptance: a client with >5000 shipments is fully evaluated; no silent truncation.
- [ ] De-duplicate preventable loss by `audit_result_id`; attribute at shipment grain.
  - Acceptance: two rules matching one shipment do not double-count; `getGatewayAssessment` does not sum overlapping audit-ROI and backtest loss.
- [ ] Multi-shipment invoices roll to shipment only when 1:1, else `DATA_REQUIRED`.
  - Acceptance: no split/duplicated dollars; multi-shipment invoices are flagged, not silently attributed to `[0]`.
- [ ] Tri-valued condition evaluation (`pass`/`fail`/`unknown`).
  - Acceptance: a null input field yields `DATA_REQUIRED`, not a false violation or silent allow; readiness report separates uncertain-pending-data from preventable.
- [ ] Select ruleset by shipment `"Ship date"`; enforce non-overlapping active rulesets.
  - Acceptance: each shipment evaluated against the ruleset in force on its ship date; overlapping active rulesets for a client are rejected.
- [ ] Validate `condition_json` keys against `PolicyCondition` at write time.
  - Acceptance: an unknown/typo'd condition key is rejected in `addRuleAction`, not saved as a silently-dead active rule.
- [ ] Backtest `preview` vs `official` modes; snapshot inputs for reproducibility.
  - Acceptance: only `official` (active-rules-only) runs feed a client assessment; re-running an `official` run over the same period reproduces the numbers.
- [ ] Add Gateway Readiness Assessment UI.
  - Acceptance: staff can generate a client assessment combining policy drift, preventable audit loss, uninsured exposure, top rules, and recommended gateway controls.

### Policy Extraction Pipeline (ADR 0002)

Per [`policy-intelligence/02-extraction.md`](policy-intelligence/02-extraction.md#extraction-architecture)
and [`adr/0002-extraction-service-language-boundary.md`](adr/0002-extraction-service-language-boundary.md).
Default to all-TypeScript on the existing queue.

- [ ] Add `policy_extract` job type and worker.
  - Acceptance: a document enqueues an extraction job claimed via `FOR UPDATE SKIP LOCKED`; status tracked on `policy_documents.extraction_status`; no second orchestrator/state store.
- [ ] Wire LlamaParse (REST) for blob -> structured text.
  - Acceptance: stored blob parsed to `raw_text` + tables; failures retry/surface, do not block other ingestion.
- [ ] Cheap-model extraction with a shared Zod gate.
  - Acceptance: candidates validated against the taxonomy `category` enum and `PolicyCondition` keys by the same validator `addRuleAction` uses; emitted rules are `status='draft'`, `signal_source='AI_SUGGESTED'`, with `document_id`+`clause_ref` lineage.
- [ ] Mechanical escalation to Claude/OpenAI.
  - Acceptance: escalate on schema-validation failure, ungrounded `clause_ref`, low cross-pass agreement, or low confidence; record which model produced each draft for precision tracking.

### Gateway Readiness Taxonomy

- [ ] Apply `0004_gateway_insurance_intelligence.sql` to each active database.
  - Acceptance: dev/staging/prod databases have gateway columns and intelligence tables; audit writes succeed with gateway fields.
- [ ] Add queue/report UI filters for gateway preventability and category.
  - Acceptance: staff can review preventable findings and rule suggestions.
- [ ] Add gateway tag analyst review workflow.
  - Acceptance: staff can confirm, edit, or dismiss default rule-generated tags.
- [ ] Add Gateway Readiness Report UI.
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

- [ ] Add `ingestion_batches` table.
  - Acceptance: every file/API/webhook/SFTP intake can be tracked by source, client, carrier, row counts, status, and job linkage.
- [ ] Add `ingestion_records` table.
  - Acceptance: raw payload, normalized payload, staged invoice/shipment/3PL IDs, audit result ID, and dispute ID can be linked.
- [ ] Update ingestion routes/actions to write batch and record lineage.
  - Acceptance: `/ingestion` can answer "what happened to this file/payload/row?"

## Launch Week

### Environment and Configuration

- [ ] Update `.env.local.example`.
  - Acceptance: removes stale Airtable variables and lists current required/optional env vars.
- [ ] Add production `NEXTAUTH_URL` guidance.
  - Acceptance: deployment doc or env example covers Vercel and non-Vercel hosting.

### Empty State and Error UX

- [ ] Replace stale Airtable copy in empty states.
  - Acceptance: no user-facing "connect Airtable" copy remains.
- [ ] Add user-visible DB error states where missing.
  - Acceptance: staff pages show actionable load errors without crashing.

### Duplicate Detection Rule

- [ ] Rewrite `DUPLICATE_TRACKING`.
  - Acceptance: joins through shipment links and matches actual PRO/tracking number instead of carrier/date/amount proxy.

### DB Naming Cleanup

- [ ] Rename `lib/airtable.ts` to `lib/db/records.ts` or similar.
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

- [ ] Add `deleted_at` to business tables.
  - Acceptance: standard reads exclude soft-deleted rows.

### Audit Trail

- [ ] Track mutations on Invoices, Disputes, Audit Results, rulebook, policy rules, and gateway tags.
  - Acceptance: staff can see who changed what and when.

### Client Portal

- [ ] Verify `/portal/upload` against production-like CSVs.
- [ ] Replace print-to-PDF with generated branded PDFs.
- [ ] Add Recharts area/bar charts to dashboard.
- [ ] Add client-safe gateway readiness summary after internal taxonomy is reviewed.

### Caching

- [ ] Cache rulebook per request and evaluate cross-request caching.
- [ ] Add `revalidateTag` / ISR where appropriate for dashboard pages.

### Monitoring Dashboard

- [ ] Add ingestion volume, match rate, audit coverage, dispute velocity, gateway preventable loss, and insurance exposure metrics.
- [ ] Alert on ingest 5xx spikes, audit failures, exception queue growth, and policy non-compliance spikes.
