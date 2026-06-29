# ADR 0007 — Dual-audit architecture: operational engines + strategic evaluator

- Status: Accepted
- Date: 2026-06-26
- Deciders: Freight-audit domain-modeling grilling session
- Related: [ADR 0001](0001-backtest-shipment-context-model.md) (shipment spine)

## Context

The platform runs two generations of audit logic:

- **Legacy engines** (`lib/audit/parcel-engine.ts`, `lib/audit/3pl-engine.ts`): produce
  `"Audit Results"` rows, use the `rulebook` table, run via `audit_jobs`. These drive
  carrier billing disputes and cash recovery — the operational product.
- **New evaluator** (`lib/intelligence/policy-evaluator.ts`): reads `policy_rules`,
  runs in `mode: 'backtest'` or `mode: 'pre_shipment'`, produces
  `policy_backtest_results`. This drives readiness assessments and the future gateway —
  the strategic product.

The same shipment can have findings from both engines, stored in different tables with
different schemas. The Linked Audit (ADR 0001) joins both via the shipment spine.

## Decision

**Two engines, two purposes, one spine. No merge.**

| Engine | Table | Purpose | Mode |
|---|---|---|---|
| Parcel / 3PL engines | `"Audit Results"` | Operational: carrier billing disputes, cash recovery | Post-shipment only |
| Policy evaluator | `policy_backtest_results` | Strategic: readiness assessments, gateway prevention | Backtest + pre-shipment |

- The parcel/3PL engines **continue operating** — they recover money today. They will
  not be ported to the new evaluator; their rulebook is stable and battle-tested.
- The policy evaluator **does not write to `"Audit Results"`** — it produces
  `policy_backtest_results` for the Compliance Intelligence Package. This keeps
  the consulting deliverable (readiness reports) cleanly separated from the
  operational product (billing disputes).
- The Linked Audit joins both via `"Shipments"` as the spine, producing a unified
  `ShipmentPolicyContext` (ADR 0001) that carries both billing-axis and coverage-axis data.
- The gateway precheck uses **only** the policy evaluator — it does not evaluate
  billing rules, because those are inherently post-shipment (you can't know the billed
  amount before the carrier invoices).

## Consequences

- Two engines are maintained indefinitely. This is intentional: the billing engines are
  stable, and the policy evaluator is where innovation happens.
- RLS / tenancy / soft-delete must be maintained on both output tables.
- The Linked Audit is the only place billing findings and policy findings are combined —
  it is explicitly a post-shipment analysis, not a real-time merge.
- If a future client wants pre-shipment billing estimates, that's a new evaluator mode,
  not a merge of the existing engines.

## Alternatives considered

- **Port parcel/3PL rules to policy_rules.** Unifies the evaluator, but risks breaking
  the billing dispute pipeline (cash recovery) for no immediate revenue gain. The
  parcel/3PL rulebook is stable — porting it is a cost with no upside.
- **Have the policy evaluator write to "Audit Results".** Mixes billing and strategic
  findings in one table, forcing a lowest-common-denominator schema. The insurance audit
  needs columns (declared_value, signature_type) that billing doesn't; billing needs
  columns (billed_amount, carrier_scac) that insurance doesn't. Separate tables are
  cleaner.
