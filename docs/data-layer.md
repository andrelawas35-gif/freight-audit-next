# Data Layer

## Connection Pattern

Two connection paths, documented in `lib/db.ts`:

- **`getSql()`** — HTTP driver (`neon()`), connects as `neondb_owner`. For staff/console/aggregate BI work that legitimately reads across tenants. RLS does NOT apply to the table owner.
- **`getTenantSql(clientId)`** — Pooled wire connection (`Pool`), connects as the restricted `app_tenant` role. Sets `app.current_tenant` per checkout so RLS policies are active. For Tier-2 protected reads.

Full isolation design: [`data-protection.md`](data-protection.md). Frozen contract: [`CONTRACTS.md`](CONTRACTS.md) §5.

## Naming Rules

- Legacy business tables use quoted Airtable-style names: `"Invoices"`, `"Audit Results"`, `"Invoice number"`.
- Platform tables use snake_case: `audit_jobs`, `rulebook`, `ingestion_exceptions`.
- Do not mix naming styles in a single table.
- Link fields copied from Airtable are text arrays. Query with `@>`, `&&`, or helpers in `lib/airtable.ts`.

## Business Tables

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `"Invoices"` | `id`, `"Invoice number"`, `"Amount billed"`, `"Status"`, `"Invoice date"`, `"Carrier"`, `"Shipment"` text[], `"Clients"` text[], `client_id`, `created_at` | Carrier billed side. `client_id` being migrated from `"Clients"` text[] to scalar (ADR 0006). |
| `"Invoice Lines"` | `id` | Referenced in types, not heavily used yet |
| `"Shipments"` | `id`, `"PRO number"`, `"Tracking number"`, `"Actual L/W/H"`, `"Actual weight lbs"`, `"Ship date"`, `"Delivery date"`, `"Service level"`, `"Carrier"`, `"Destination zip"`, `"Address classification"` | Client expected side |
| `"Audit Results"` | `id`, `"Invoice"` text[], `"Outcome"`, `"Billed amount"`, `"Expected amount"`, `"Variance"`, `"Notes"`, `"Audited at"`, `"Detected by"`, `"Disputes"` text[], `"Review status"`, `"Client"` text[], `"Carrier SCAC"`, `"Invoice number"`, `client_id`, `shipment_id` | Findings queue source of truth. `client_id` + `shipment_id` are new scalar columns (ADR 0006 + Q1). `"Client"` text[] being migrated to scalar. |
| `"Disputes"` | `id`, `"Dispute ID"`, `"Invoice"` text[], `"Audit result"` text[], `"Status"`, `"Disputed amount"`, `"Recovery amount"`, dates, `"Resolution notes"`, `"Carrier (display)"`, `"Tracking number"`, `"Client"` text[], `client_id` | Recovery workflow. `client_id` being migrated from `"Client"` text[] to scalar (ADR 0006). `"Status"` is now CHECK-constrained per ADR 0005 dispute state machine. |
| `"Clients"` | `id`, `"Company name"`, `"Contract active"`, `"Gain share pct"`, `"Min invoice threshold"`, `"Last audit run"` | Client master |
| `"Carriers"` | `id`, `"Carrier name"`, `"SCAC"`, `"Contact email"`, SFTP config columns | Carrier master and SFTP config |
| `"SLA Guarantees"`, `"Carrier Codes"`, `"Audit Rules"`, `"Charge Types"`, `"DAS Zip Codes"` | Various | Listed in `TableName`; not all are actively queried |

## Platform Tables

| Table | Purpose |
|-------|---------|
| `app_users` | User accounts: email, password hash, role, client link |
| `audit_runs` | Run history: timestamps, stats, triggered_by |
| `audit_jobs` | Queue: status, job_type, client scope, result, cutoff timestamps |
| `rulebook` | Contract/carrier/global audit rules |
| `learned_mappings` | Code mapping knowledge base |
| `ingestion_exceptions` | Unmapped codes pending review; AI suggestions are suggest-only |
| `dispute_outcomes` | Confirmed carrier outcomes for learning |
| `upload_logs` | Client/staff upload tracking |
| `tpl_fulfillment_lines` | 3PL fulfillment line staging and audit state |
| `tpl_storage_lines` | 3PL storage line staging and audit state |
| `sftp_processed_files` | SFTP de-duplication by carrier/file |
| `gateway_decisions` | **New (contracts-v1).** Tier-2 forensic decision log for Gateway precheck. RLS-protected. |
| `policy_taxonomy_candidates` | **New (contracts-v1).** Tier-0 taxonomy discovery candidates. No RLS — structural metadata only. |

> **Policy Intelligence tables** (`client_policies`, `policy_documents`,
> `policy_rulesets`, `policy_rules`, `policy_backtest_runs`, `policy_backtest_results`,
> `gateway_readiness_assessments`, `gateway_behavioral_tags`, `client_insurance_policies`,
> `insurance_policy_rules`, `shipment_insurance_audit_results`) and the gateway columns on
> `"Audit Results"` are documented in
> [`policy-intelligence/06-schema.md`](policy-intelligence/06-schema.md). They remain part
> of this Postgres schema and follow the migration pattern below; they live in that module
> to keep the Policy Intelligence concern single-sourced.

## Tenant Isolation

Restricted-role pooled connection + Row-Level Security failsafe. Design: [`data-protection.md`](data-protection.md).
Migration 0006 created the `app_tenant` role + RLS policies on 9 tables, but the enforcement is **not yet
load-bearing** — `getTenantSql` has no callers, so reads currently run as the owner and rely on app-layer
`client_id` filters. Resolution plan: [`adr/0013-rls-enforcement-on-the-client-path.md`](adr/0013-rls-enforcement-on-the-client-path.md).
Load `data-protection.md` before adding RLS, a second connection helper, or any cross-tenant aggregate query.

## Known Schema Gaps & Overlaps (review 2026-06-27)

Tracked in [`BACKLOG.md`](BACKLOG.md#schema-architecture-review-2026-06-27). Summary:

- **Referential integrity** — only one FK exists schema-wide; policy/gateway/ingestion relationships are unenforced text refs (G1).
- **`policy_attestations`** is read by the portal but defined in no migration / schema.ts (G2).
- **Source of truth** — the Drizzle journal is frozen at `0001` while 15 SQL migrations exist; `schema.ts` is hand-maintained with no parity check, so it is not operationally "authoritative" (G3).
- **RLS coverage** — client-confidential analytics tables (rulesets, backtests, gateway/insurance tables, scope exclusions, Shipments, Clients) have no RLS (G4).
- **CHECK discipline** — several status/type/source columns lack constraints, allowing value drift (G5).
- **Overlaps** — `policy_rules`↔`insurance_policy_rules`, `client_policies`↔`client_insurance_policies`, gateway tag columns↔`gateway_behavioral_tags`, and dual attestation/backtest-dollar storage (O1–O5).

## Data Access Layer (`lib/db/records.ts`)

Named `lib/airtable.ts` historically; renamed to `lib/db/records.ts` (a re-export shim remains). Pure Postgres now.

Exports:

- `fetchRecords()` - bounded reads for UI. Never use for financial/audit completeness.
- `fetchAllRecords()` - keyset pagination (`id > cursor`) for complete audit processing. Supports `createdBefore`.
- `fetchRecordsByIds()` - chunked hydration.
- `fetchRecordsByLinkedIds()` - chunked linked-record lookup with de-duplication.
- `fetchRecord()` - single record by ID.
- `createRecord()` / `updateRecord()` / `batchCreate()` - write ops. `batchCreate({ inTransaction: true })` is transactional.
- `findByField()` - safe parameterized lookup bypassing formula translator.

## Formula Translator Warning

`lib/db/records.ts` contains a formula-to-SQL translator for Airtable-style `filterByFormula`. It is load-bearing. If you change query syntax, linked-field behavior, quoting, `RECORD_ID()`, `FIND`, `ARRAYJOIN`, `OR`, or `AND`, update tests in `lib/__tests__/formula-translator.test.ts`.

## Migration Pattern

1. Update `db/schema.ts`.
2. Add SQL migration under `db/migrations/`.
3. Add indexes for every new common filter/report dimension.
4. Backfill carefully for existing rows.
5. Update `docs/data-layer.md`.
6. Add or update tests for read/write behavior.

Migrations run `0000`–`0014` (see `db/migrations/`). Note the Drizzle journal is frozen at `0001` —
`0002`+ are hand-written SQL applied via `npm run db:migrate`, not generated by Drizzle Kit (see gap G3 above).
Each migration must be applied to every target database before code depending on its columns/tables runs.

## Index Guidance

- B-tree indexes on scalar `client_id` replacing GIN on array tenancy columns (ADR 0006).
- Composite indexes for staged 3PL scans: `(audit_status, client_id, invoice_cycle, id)`.
- Gateway/reporting additions should index client, month/date, preventability, category, carrier, and audit result lineage.

## Key Files

| File | Purpose |
|------|---------|
| `lib/db.ts` | DB singleton, type parsers |
| `lib/db/records.ts` | Record CRUD + formula translator (was `lib/airtable.ts`) |
| `lib/types.ts` | Domain types |
| `db/schema.ts` | Drizzle schema |
| `db/migrations/` | SQL migrations |
| `drizzle.config.ts` | Drizzle Kit config |
