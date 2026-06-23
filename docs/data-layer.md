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
| `gateway_behavioral_tags` | Normalized gateway-readiness tags linked to audit results |
| `client_insurance_policies` | Structured high-value shipper policy terms |
| `insurance_policy_rules` | Declarative policy rules with condition/action JSON |
| `shipment_insurance_audit_results` | Insurance compliance findings and exposure reporting |

## Policy Intelligence MVP Schema Direction

The current insurance tables are the foundation. To make policy intelligence a repeatable consulting product, add broader policy workflow tables next.

### `client_policies`

Use this as the umbrella policy object across insurance, carrier, 3PL, SOP, claims, packaging, and email-exception sources.

| Column | Purpose |
|--------|---------|
| `id`, `client_id` | Policy identity and client scope |
| `policy_type` | `carrier_contract`, `3pl_sla`, `insurance_policy`, `claims_policy`, `shipping_sop`, `packaging_standard`, `email_exception` |
| `name` | Human-readable policy name |
| `owner` | Client-side/business owner if known |
| `effective_from`, `effective_to` | Date validity |
| `status` | `draft`, `active`, `archived` |
| `notes` | Short analyst notes |
| `created_at`, `updated_at` | Audit timestamps |

### `policy_documents`

Tracks the messy source documents that produced structured rules.

| Column | Purpose |
|--------|---------|
| `id`, `client_id`, `policy_id` | Source identity |
| `document_type` | Contract, rider, SOP, email, tariff, claim instruction |
| `file_name`, `source_url` | Reference to stored file/source |
| `effective_from`, `effective_to` | Validity when known |
| `extraction_status` | `not_started`, `extracted`, `reviewed`, `needs_review` |
| `raw_text` | Extracted text when available |
| `summary` | Short analyst/AI summary |
| `uploaded_by`, `created_at` | Human traceability |

### `policy_rulesets`

Versioned configuration set for post-shipment backtesting and future gateway enforcement.

| Column | Purpose |
|--------|---------|
| `id`, `client_id` | Ruleset identity |
| `version` | Semver or incrementing version |
| `status` | `draft`, `active`, `archived` |
| `effective_from`, `effective_to` | Validity |
| `created_by`, `reviewed_by` | Human-in-loop controls |
| `activated_at`, `archived_at` | Lifecycle timestamps |

### `policy_rules`

Generalized rule table. `insurance_policy_rules` may remain as a specialized table, but the gateway should eventually evaluate this broader shape.

| Column | Purpose |
|--------|---------|
| `id`, `client_id`, `ruleset_id`, `policy_id`, `document_id` | Rule identity and lineage |
| `rule_key` | Stable machine key |
| `category` | Gateway or insurance category |
| `condition_json` | Declarative IF logic |
| `action_json` | Decision/message/fix |
| `severity` | `info`, `warn`, `block` |
| `clause_ref` | Contract/policy citation |
| `status` | `draft`, `active`, `archived` |
| `created_at`, `updated_at` | Timestamps |

### `policy_backtest_runs`

Runs a policy ruleset against historical data.

| Column | Purpose |
|--------|---------|
| `id`, `client_id`, `ruleset_id` | Backtest identity |
| `period_start`, `period_end` | Historical window |
| `status` | `queued`, `running`, `completed`, `failed` |
| `shipments_checked` | Count |
| `violations_found` | Count |
| `preventable_margin_loss` | Dollars |
| `uninsured_exposure` | Dollars |
| `error` | Failure message |
| `created_at`, `completed_at` | Timestamps |

### `policy_backtest_results`

One row per historical violation.

| Column | Purpose |
|--------|---------|
| `id`, `backtest_run_id`, `client_id`, `rule_id` | Result identity |
| `shipment_id`, `invoice_id`, `audit_result_id` | Source linkage |
| `decision` | `ALLOW`, `WARN`, `BLOCK`, `REQUIRE_APPROVAL`, `REQUIRE_DOCUMENTATION` |
| `category` | Violation category |
| `message`, `suggested_fix`, `clause_ref` | Explanation |
| `preventable_loss`, `uninsured_exposure` | Dollars |
| `created_at` | Timestamp |

### `gateway_readiness_assessments`

Consulting deliverable record.

| Column | Purpose |
|--------|---------|
| `id`, `client_id`, `ruleset_id`, `backtest_run_id` | Assessment identity |
| `period_start`, `period_end` | Report period |
| `preventable_margin_loss` | Dollars |
| `non_preventable_recovery` | Dollars |
| `uninsured_exposure` | Dollars |
| `top_categories` | JSON summary |
| `recommended_controls` | JSON summary |
| `status` | `draft`, `delivered`, `archived` |
| `created_at`, `delivered_at` | Lifecycle |

## Gateway Readiness Schema

The post-shipment audit must train the future pre-shipment gateway. Add this as structured data, not free text.

Implemented in `db/schema.ts` and `db/migrations/0004_gateway_insurance_intelligence.sql`.

### Columns on `"Audit Results"`

These fields are written by new parcel/LTL and 3PL audit findings using defaults from `lib/intelligence/taxonomy.ts`:

| Column | Type | Purpose |
|--------|------|---------|
| `"Gateway preventability"` | text | `PREVENTABLE_BY_GATEWAY`, `NON_PREVENTABLE_BY_GATEWAY`, `UNKNOWN` |
| `"Gateway category"` | text | Behavioral taxonomy category such as `DIM_WEIGHT_PADDING` |
| `"Gateway rule suggestion"` | text | Required when preventability is `PREVENTABLE_BY_GATEWAY` |
| `"Gateway estimated savings"` | numeric | Portion of variance the gateway could have prevented |
| `"Gateway confidence"` | numeric | 0-1 analyst/rule confidence |
| `"Gateway signal source"` | text | `RULE_DEFAULT`, `ANALYST_REVIEW`, `AI_SUGGESTED` |

Rule: a flagged result tagged `PREVENTABLE_BY_GATEWAY` must not be written without `"Gateway rule suggestion"`.

### `gateway_behavioral_tags`

Normalized follow-on table for reviewed or explicit behavioral tags:

| Column | Purpose |
|--------|---------|
| `id` | Primary key |
| `audit_result_id` | Source finding |
| `client_id` | Client scope |
| `carrier_scac` | Carrier scope |
| `invoice_id`, `shipment_id` | Optional lineage |
| `rule_code` | Audit rule that produced signal |
| `gateway_preventability` | Preventability enum |
| `gateway_category` | Behavioral category |
| `rule_suggestion` | Future gateway rule |
| `estimated_savings` | Preventable margin loss |
| `confidence` | 0-1 confidence |
| `review_status` | `pending`, `confirmed`, `dismissed` |
| `created_at`, `reviewed_by`, `reviewed_at` | Human-in-loop review trail |

## High-Value Insurance Schema

Jewelry shippers are the first likely vertical, but the schema should support high-value shippers generally: fine art, luxury goods, electronics, pharmaceuticals, medical devices, precious metals, regulated goods, wine/spirits, aerospace parts, event equipment, and sensitive documents. Capture policy rules in structured tables before building pre-shipment enforcement.

Implemented in `db/schema.ts` and `db/migrations/0004_gateway_insurance_intelligence.sql`. Onboarding UI and automated extraction are not implemented yet.

### `client_insurance_policies`

| Column | Purpose |
|--------|---------|
| `id`, `client_id` | Policy identity and client scope |
| `policy_name`, `insurer`, `broker` | Policy metadata |
| `effective_from`, `effective_to` | Date validity |
| `max_coverage_per_shipment`, `max_coverage_per_day`, `deductible` | Financial constraints |
| `covered_commodities`, `excluded_commodities` | Commodity coverage |
| `allowed_carriers`, `excluded_carriers` | Carrier eligibility |
| `allowed_services`, `excluded_services` | Service eligibility |
| `signature_required_above`, `adult_signature_required_above` | Signature thresholds |
| `third_party_insurance_required_above` | Third-party insurance threshold |
| `carrier_declared_value_allowed` | Whether carrier declared value is allowed |
| `destination_exclusions`, `high_risk_zip_rules` | Destination risk rules |
| `international_allowed` | International eligibility |
| `claim_window_days` | Claim deadline |
| `required_documents` | Invoice/photos/packing/chain-of-custody requirements |
| `packaging_requirements` | Tamper-evident/neutral packaging rules |
| `shipper_verticals` | Supported verticals such as jewelry, fine art, electronics, pharma |
| `temperature_control_rules` | Cold chain or heat-sensitive requirements |
| `regulated_item_rules` | Adult signature, hazmat, firearms, alcohol, medical/regulatory restrictions |
| `appraisal_required_above` | Appraisal threshold for art/collectibles/jewelry |
| `serial_number_required` | Serial capture requirement for electronics/devices |
| `policy_document_url`, `notes` | Reference |

### `insurance_policy_rules`

| Column | Purpose |
|--------|---------|
| `id`, `client_id`, `policy_id` | Rule identity |
| `rule_key` | e.g. `adult_signature_required`, `carrier_excluded` |
| `condition_json` | Declarative condition |
| `action_json` | `ALLOW`, `WARN`, `BLOCK`, `REQUIRE_APPROVAL`, `REQUIRE_DOCUMENTATION` |
| `severity` | `info`, `warn`, `block` |
| `clause_ref` | Policy clause citation |
| `effective_from`, `effective_to` | Date validity |

### `shipment_insurance_audit_results`

Implemented normalized insurance audit table:

- `shipper_vertical`
- `declared_value`
- `replacement_value`
- `commodity_type`
- `insurance_provider`
- `insurance_amount`
- `insurance_cost`
- `signature_type`
- `package_type`
- `packaging_certified`
- `policy_id_applied`
- `insurance_compliance_status`
- `insurance_risk_category`
- `insurance_rule_suggestion`
- `estimated_uninsured_exposure`
- `destination_risk_tier`
- `temperature_control_required`
- `special_handling_required`
- `chain_of_custody_required`
- `regulated_item_flag`
- `documentation_required`
- `documentation_received`

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
