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
- [ ] Add Gateway Readiness Assessment UI.
  - Acceptance: staff can generate a client assessment combining policy drift, preventable audit loss, uninsured exposure, top rules, and recommended gateway controls.

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
