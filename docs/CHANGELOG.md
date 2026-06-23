# Changelog

Completed or historical changes belong here. Keep `docs/LAUNCH-BLOCKERS.md` and `docs/BACKLOG.md` focused on open work only.

## 2026-06-23

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
