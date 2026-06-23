# Data Layer

## Connection Pattern

- `@neondatabase/serverless` with `neon(DATABASE_URL)` is centralized in `lib/db.ts`.
- Raw parameterized SQL is used throughout the app. Drizzle ORM defines schema and can be used incrementally for query building.
- Custom type parsers: numeric (OID 1700) -> float, bigint (OID 20) -> int.
- Schema: `db/schema.ts` is authoritative.
- Migrations: `db/migrations/` contains SQL migrations. Add migrations for every schema change and keep Drizzle schema in sync.

## Naming Rules

- Legacy business tables use quoted Airtable-style names: `"Invoices"`, `"Audit Results"`, `"Invoice number"`.
- Platform tables use snake_case: `audit_jobs`, `rulebook`, `ingestion_exceptions`.
- Do not mix naming styles in a single table.
- Link fields copied from Airtable are text arrays. Query with `@>`, `&&`, or helpers in `lib/airtable.ts`.

## Business Tables

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `"Invoices"` | `id`, `"Invoice number"`, `"Amount billed"`, `"Status"`, `"Invoice date"`, `"Carrier"`, `"Shipment"` text[], `"Clients"` text[], `created_at` | Carrier billed side |
| `"Invoice Lines"` | `id` | Referenced in types, not heavily used yet |
| `"Shipments"` | `id`, `"PRO number"`, `"Tracking number"`, `"Actual L/W/H"`, `"Actual weight lbs"`, `"Ship date"`, `"Delivery date"`, `"Service level"`, `"Carrier"`, `"Destination zip"`, `"Address classification"` | Client expected side |
| `"Audit Results"` | `id`, `"Invoice"` text[], `"Outcome"`, `"Billed amount"`, `"Expected amount"`, `"Variance"`, `"Notes"`, `"Audited at"`, `"Detected by"`, `"Disputes"` text[], `"Review status"`, `"Client"`, `"Carrier SCAC"`, `"Invoice number"` | Findings queue source of truth |
| `"Disputes"` | `id`, `"Dispute ID"`, `"Invoice"` text[], `"Audit result"` text[], `"Status"`, `"Disputed amount"`, `"Recovery amount"`, dates, `"Resolution notes"`, `"Carrier (display)"`, `"Tracking number"`, `"Client"` text[] | Recovery workflow |
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

> **Policy Intelligence tables** (`client_policies`, `policy_documents`,
> `policy_rulesets`, `policy_rules`, `policy_backtest_runs`, `policy_backtest_results`,
> `gateway_readiness_assessments`, `gateway_behavioral_tags`, `client_insurance_policies`,
> `insurance_policy_rules`, `shipment_insurance_audit_results`) and the gateway columns on
> `"Audit Results"` are documented in
> [`policy-intelligence/06-schema.md`](policy-intelligence/06-schema.md). They remain part
> of this Postgres schema and follow the migration pattern below; they live in that module
> to keep the Policy Intelligence concern single-sourced.

## Data Access Layer (`lib/airtable.ts`)

Named for historical reasons; it is pure Postgres now.

Exports:

- `fetchRecords()` - bounded reads for UI. Never use for financial/audit completeness.
- `fetchAllRecords()` - keyset pagination (`id > cursor`) for complete audit processing. Supports `createdBefore`.
- `fetchRecordsByIds()` - chunked hydration.
- `fetchRecordsByLinkedIds()` - chunked linked-record lookup with de-duplication.
- `fetchRecord()` - single record by ID.
- `createRecord()` / `updateRecord()` / `batchCreate()` - write ops. `batchCreate({ inTransaction: true })` is transactional.
- `findByField()` - safe parameterized lookup bypassing formula translator.

## Formula Translator Warning

`lib/airtable.ts` contains a formula-to-SQL translator for Airtable-style `filterByFormula`. It is load-bearing. If you change query syntax, linked-field behavior, quoting, `RECORD_ID()`, `FIND`, `ARRAYJOIN`, `OR`, or `AND`, update tests in `lib/__tests__/formula-translator.test.ts`.

## Migration Pattern

1. Update `db/schema.ts`.
2. Add SQL migration under `db/migrations/`.
3. Add indexes for every new common filter/report dimension.
4. Backfill carefully for existing rows.
5. Update `docs/data-layer.md`.
6. Add or update tests for read/write behavior.

Current intelligence migration:

- `db/migrations/0004_gateway_insurance_intelligence.sql`
- Adds gateway columns, check constraints, indexes, gateway tag table, insurance policy tables, and insurance exposure table.
- Must be applied with `npm run db:migrate` for each target database before the new audit writes can persist gateway fields.

## Index Guidance

- GIN indexes on linked arrays such as `"Invoices"."Clients"`, `"Audit Results"."Invoice"`, and `"Audit Results"."Client"`.
- Composite indexes for staged 3PL scans: `(audit_status, client_id, invoice_cycle, id)`.
- Gateway/reporting additions should index client, month/date, preventability, category, carrier, and audit result lineage.

## Key Files

| File | Purpose |
|------|---------|
| `lib/db.ts` | DB singleton, type parsers |
| `lib/airtable.ts` | Record CRUD + formula translator |
| `lib/types.ts` | Domain types |
| `db/schema.ts` | Drizzle schema |
| `db/migrations/` | SQL migrations |
| `drizzle.config.ts` | Drizzle Kit config |
