# Changelog

Completed or historical changes belong here. Keep `docs/LAUNCH-BLOCKERS.md` and `docs/BACKLOG.md` focused on open work only.

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
