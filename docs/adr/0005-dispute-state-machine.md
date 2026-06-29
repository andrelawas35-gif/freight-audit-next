# ADR 0005 — Dispute state machine: constrained transitions, not free-form text

- Status: Accepted
- Date: 2026-06-26
- Deciders: Freight-audit domain-modeling grilling session

## Context

The `"Disputes"."Status"` column is a free-form text field. The Recharts dashboard
already buckets disputes into "open / won / dismissed" for visualization, implying a
state machine that doesn't exist in the schema. Without constrained transitions,
disputes can enter impossible states (e.g., "won" without ever being "filed"), recovery
tracking is unreliable, and the audit trail has no state-change log.

Current scale is manageable: disputes are human-filed, carrier responses arrive slowly,
and volume is low (first 3-5 clients).

## Decision

Lock the dispute state machine to these canonical statuses and valid transitions:

```text
pending_review ──→ filed ──→ carrier_responded ──→ won
    │                 │              │              dismissed
    │                 │              │              partial ──→ won (accepted)
    │                 │              │              partial ──→ appealed
    │                 │              │                          
    │                 │              appealed ──→ carrier_responded
    │                 │                          
    └──→ closed        └──→ closed   └──→ closed
```

Rules:
- Any status can transition to `closed` (human override for abandoned/withdrawn disputes).
- `partial` means the carrier offered less than the disputed amount; it resolves to
  either `won` (analyst accepts the offer) or `appealed`.
- `appealed` loops back to `carrier_responded` (the carrier re-evaluates).
- A CHECK constraint on `"Disputes"."Status"` validates against the enum.
- Transition validation lives in application code (`lib/disputes/state-machine.ts`),
  not in a DB trigger — keeps the rules testable without requiring database-level
  trigger tests.

## Consequences

- `"Disputes"."Status"` becomes a constrained column. Existing free-form values must
  be migrated to canonical statuses (migration script required).
- The Recharts `DisputePipelineChart` (stacked bar: open/won/dismissed) now has a
  reliable source of truth.
- State transitions are auditable via the `audit_trail` table (already logging on
  `updateRecord`).
- Adding a new status requires a migration + state-machine update. Intentional
  friction — dispute workflows are financial and should change deliberately.

## Alternatives considered

- **Keep free-form text.** No migration cost, but impossible states, unreliable
  recovery tracking, and dashboard buckets that drift from ground truth. Rejected.
- **DB triggers for transition validation.** Keeps rules close to data, but harder
  to test and debug. Application-level validation is testable with Vitest.
