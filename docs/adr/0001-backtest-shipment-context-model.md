# ADR 0001 — Backtest evaluates a per-shipment context, not per-data-source streams

- Status: Accepted
- Date: 2026-06-23
- Deciders: Policy Intelligence grilling session

## Context

The policy backtest evaluates historical shipments against a ruleset to quantify
preventable loss and coverage violations (the "Linked Audit"). The implementation
(`lib/intelligence/policy-service.ts::loadBacktestContexts`) built **two disjoint context
streams** and concatenated them:

- insurance contexts from `shipment_insurance_audit_results` — carry vertical, declared
  value, documentation, but **no carrier / service / signature**;
- audit contexts from `"Audit Results"` — carry carrier and preventable loss, but **no
  declared value / vertical / signature**.

`matchesCondition` requires every specified clause to pass, and a null field reads as a
hard fail. Therefore any rule that spans the billing axis and the value/insurance axis —
e.g. the canonical `{ shipperVertical: "jewelry", declaredValueGte: 5000, carrierIn:
["FedEx","UPS"] }` — matches **nothing** in either stream. That axis-crossing rule *is*
the product moat, so the backtest was structurally incapable of evaluating its own
headline use case.

Linkage in the schema is multi-hop: `"Audit Results"` has no shipment id; it links to
`"Invoices"`, whose `"Shipment"` column is a `text[]`; `shipment_insurance_audit_results`
links to a shipment directly. No single source has one row per shipment.

## Decision

Rebuild the backtest around **one `ShipmentPolicyContext` per shipment**, with
`"Shipments"` as the spine, left-joining `"Invoices"` → `"Audit Results"` (billing axis)
and `shipment_insurance_audit_results` (coverage axis) so each context carries both axes
plus the ship date.

Supporting decisions:

- **Grain / attribution.** Aggregate audit findings onto the shipment, deduped by
  `audit_result_id`; preventable loss is a property of the shipment, not re-counted per
  matching rule. When an invoice fans out to multiple shipments, keep the loss at invoice
  grain and tag the shipment `DATA_REQUIRED` rather than splitting or duplicating.
- **Scope.** Evaluate every shipment in the period (coverage violations have no audit
  row), via keyset pagination over `"Shipments"` — no `LIMIT` truncation.
- **Unknown ≠ compliant.** Null inputs evaluate to `unknown` → `DATA_REQUIRED`, not a
  silent allow/violation.
- **Reproducibility.** Snapshot resolved input contexts into the run instead of
  re-reading mutable audit tables.
- **Effective dating.** Select the ruleset in force on each shipment's `"Ship date"` (now
  possible because the context carries a ship date).

## Consequences

- The Linked Audit becomes evaluable; the flagship rule can match.
- More compute: every shipment is evaluated and inputs are snapshotted. Acceptable for a
  periodic consulting deliverable; mitigated by keyset pagination.
- Multi-shipment invoices yield `DATA_REQUIRED` rather than precise per-shipment dollars —
  an honest gap surfaced to analysts, not hidden by an arbitrary split.
- Existing `runPolicyBacktest` must be rewritten; current rows produced by the old
  per-source logic are not comparable to new runs and should be re-run.

## Alternatives considered

- **Keep split streams, forbid axis-crossing rules.** Cheapest, but permanently kills the
  Linked Audit in backtests — rejected as self-defeating.
- **Materialize a `shipment_facts` table at ingestion.** Pre-joins billing + insurance +
  dates so the backtest (and the future gateway) read one surface. Heaviest upfront;
  deferred, but the spine join is designed to be replaceable by it later without changing
  the evaluator contract.
