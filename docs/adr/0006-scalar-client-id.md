# ADR 0006 — Migrate tenancy from text[] arrays to scalar client_id

- Status: Accepted
- Date: 2026-06-26
- Deciders: Freight-audit domain-modeling grilling session
- Supersedes: data-protection.md § "Array-membership now, no schema migration" — this is the migration

## Context

Three business tables use `text[]` arrays for tenancy: `"Invoices"."Clients"`,
`"Audit Results"."Client"`, and `"Disputes"."Client"`. This is an Airtable linked-record
artifact, not a business requirement. Evidence:

- `docs/data-protection.md` (line 174): "Multi-client rows do not exist today."
- `lib/intelligence/reports.ts` already references `"Client"[1]` (assumes single client).
- All portal queries use `FIND(clientId, ARRAYJOIN({Client}))` — searching an array that
  always contains exactly one element.
- The data-protection plan already calls for `CHECK (cardinality(...) = 1)`.

The array pattern forces GIN indexes (slower than B-tree on scalar), requires array
operators in every RLS policy and query, and confuses the domain model (a finding
belongs to one client, period).

## Decision

Add a scalar `client_id` column to each of the three tables, backfill from the first
array element, and eventually drop the array columns:

1. **Add** `client_id text` to `"Invoices"`, `"Audit Results"`, `"Disputes"`.
2. **Backfill**: `UPDATE SET client_id = "Clients"[1]` (or `"Client"[1]`).
3. **Add CHECK**: `CHECK (client_id IS NOT NULL)` after backfill.
4. **Add B-tree indexes** on `client_id` (replacing GIN on arrays).
5. **Update all queries**: `FIND(id, ARRAYJOIN({Client}))` → `"Client" = $1`.
6. **Update RLS policies**: `ANY("Clients")` → `= client_id`.
7. **Drop the array columns** after a deprecation window (the array and scalar coexist
   during migration, with the scalar as the authority once populated).
8. **Update `TableName` and formula translator** to handle `"Clients"` → `client_id`
   in filter translation.

## Consequences

- Simpler RLS: `USING (client_id = current_setting('app.current_tenant'))` — no array
  operator, no GIN index needed for tenancy.
- Faster queries: B-tree on scalar beats GIN on `text[]` for equality lookups.
- Cleaner domain model: a row belongs to one client. The 3PL multi-client dashboard
  is a reporting concern (aggregate across clients), not a data model concern.
- Migration cost: every query touching these three tables changes. High immediate cost,
  but eliminates the perpetual cost of array tenancy in every future query.

## Alternatives considered

- **Keep arrays + add CHECK(cardinality = 1).** Freezes the problem at one element
  but keeps the array operators and GIN indexes forever. Deferred pain — every new
  engineer must learn the array tenancy pattern. Rejected.
- **Normalize to UUID.** Cleaner than text, but requires joining through `"Clients"`
  for display. Text `client_id` is simpler for the current scale and matches the
  existing `client_id` pattern on platform tables.
