# ADR 0008 — Single migration bundling three grilling-outcome schema changes

- Status: Accepted
- Date: 2026-06-26
- Deciders: Freight-audit domain-modeling grilling session

## Context

The 2026-06-26 grilling session produced three schema decisions that all touch the
same three business tables (`"Invoices"`, `"Audit Results"`, `"Disputes"`):

- ADR 0005: Dispute status CHECK constraint
- ADR 0006: Scalar `client_id` migration (text[] → scalar, coexisting)
- Q1: Add `shipment_id` to `"Audit Results"`

Each of these independently would require ALTER TABLE + UPDATE + ALTER TABLE
sequences on the same tables. Executing them as separate migrations would leave
mid-deploy windows where one change is live but another isn't — for example,
`client_id` exists but isn't backfilled yet, or the dispute status CHECK exists
but `client_id` doesn't.

## Decision

All three changes ship in one migration file:
`db/migrations/0011_grilling_schema_contract.sql`.

Execution order within the single migration:
1. Add `client_id` columns (all three tables) — nullable during backfill
2. Add `shipment_id` on `"Audit Results"`
3. Backfill `client_id` from first array element
4. Add NOT NULL CHECK constraints on `client_id`
5. Add dispute status CHECK constraint (ADR 0005)
6. Add B-tree indexes on `client_id` columns
7. Add B-tree index on `shipment_id`

The array columns (`"Clients"`, `"Client"`) remain in place during transition
per ADR 0006 — the scalar and array coexist.

## Consequences

- One atomic unit of deployment: all three schema changes land together or
  none do. No partial-state window.
- The migration is idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
- Future work (ADR 0006 steps 5-7): update all queries from array operators to
  scalar equality, update RLS policies, drop array columns after deprecation
  window.
- Dispute status is now DB-constrained; application-level transition validation
  lives in `lib/disputes/state-machine.ts`.
- `shipment_id` on `"Audit Results"` enables direct shipment→finding joins
  without intermediary array unpacking, supporting the Linked Audit per ADR 0001.

## Alternatives considered

- **Three separate migrations.** Cleaner per-ADR trail, but the tables overlap
  completely — three ALTER/UPDATE/ALTER cycles on the same tables. Serializing
  them adds two extra deploy cycles with no benefit. Rejected.
- **Combine ADR 0005 + 0006 only, separate Q1.** Q1 (`shipment_id`) touches
  only `"Audit Results"`, which is already touched by 0006. An extra ALTER
  cycle for one column doesn't justify a separate migration. Rejected.
