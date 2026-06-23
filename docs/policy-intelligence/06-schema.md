# Policy Intelligence — Schema

> All policy / gateway / insurance tables in one place. Moved here from
> `../data-layer.md`, which now points back. The authoritative definition is
> [`db/schema.ts`](../../db/schema.ts) (Drizzle); migrations in
> [`db/migrations/`](../../db/migrations/). Follow the migration pattern in
> [`../data-layer.md`](../data-layer.md#migration-pattern) for any change here.

Migrations: `0004_gateway_insurance_intelligence.sql` (gateway columns, behavioral tags,
insurance tables) and `0005_policy_intelligence_mvp.sql` (policy workflow tables). Must be
applied to each target database before audit/policy writes can persist.

## A. Policy workflow tables

### `client_policies` — umbrella container

| Column | Purpose |
|--------|---------|
| `id`, `client_id` | Policy identity and client scope |
| `policy_type` | `carrier_contract`, `3pl_sla`, `insurance_policy`, `claims_policy`, `shipping_sop`, `packaging_standard`, `email_exception` |
| `name` | Human-readable policy name |
| `owner` | Client-side business owner if known |
| `effective_from`, `effective_to` | Descriptive validity (not the evaluation authority — the ruleset is) |
| `status` | `draft`, `active`, `archived` |
| `notes` | Short analyst notes |
| `created_at`, `updated_at` | Timestamps |

### `policy_documents` — source evidence (append-only)

| Column | Purpose |
|--------|---------|
| `id`, `client_id`, `policy_id` | Source identity |
| `document_type` | Contract, rider, SOP, email, tariff, claim instruction |
| `file_name` | Original filename |
| `source_url` | External link when we did not take custody |
| `storage_key`, `checksum` | Stored blob reference + sha256 (intended; see [`01-ingestion.md`](01-ingestion.md#document-storage--keep-the-bytes)) |
| `effective_from`, `effective_to` | Validity when known |
| `extraction_status` | `not_started`, `extracted`, `reviewed`, `needs_review` |
| `raw_text` | Extracted text — derived cache, re-derivable from blob |
| `summary` | Analyst/AI summary |
| `uploaded_by`, `created_at` | Human traceability |

### `policy_rulesets` — the version unit

| Column | Purpose |
|--------|---------|
| `id`, `client_id` | Ruleset identity |
| `version` | Semver or incrementing version (`uq_policy_ruleset_client_version`) |
| `status` | `draft`, `active`, `archived` |
| `effective_from`, `effective_to` | **The authority on what is in force when.** Active rulesets must not overlap. |
| `created_by`, `reviewed_by` | Human-in-loop controls |
| `activated_at`, `archived_at` | Lifecycle timestamps |

### `policy_rules` — atomic IF/THEN

| Column | Purpose |
|--------|---------|
| `id`, `client_id`, `ruleset_id`, `policy_id`, `document_id` | Identity and lineage |
| `rule_key` | Stable machine key |
| `category` | Gateway or insurance category (see [`03-taxonomy.md`](03-taxonomy.md)) |
| `condition_json` | Declarative IF logic |
| `action_json` | Decision/message/fix |
| `severity` | `info`, `warn`, `block` |
| `clause_ref` | Contract/policy citation |
| `status` | `draft`, `active`, `archived` (AI extraction may only write `draft`) |
| `created_at`, `updated_at` | Timestamps |

### `policy_backtest_runs`

| Column | Purpose |
|--------|---------|
| `id`, `client_id`, `ruleset_id` | Backtest identity |
| `period_start`, `period_end` | Historical window |
| `status` | `queued`, `running`, `completed`, `failed` |
| `shipments_checked`, `violations_found` | Counts |
| `preventable_margin_loss`, `uninsured_exposure` | Dollars |
| `error` | Failure message |
| `created_at`, `completed_at` | Timestamps |

### `policy_backtest_results` — one row per violation

| Column | Purpose |
|--------|---------|
| `id`, `backtest_run_id`, `client_id`, `rule_id` | Result identity |
| `shipment_id`, `invoice_id`, `audit_result_id` | Source linkage |
| `decision` | Gateway action enum |
| `category` | Violation category |
| `message`, `suggested_fix`, `clause_ref` | Explanation |
| `preventable_loss`, `uninsured_exposure` | Dollars |
| `created_at` | Timestamp |

### `gateway_readiness_assessments` — consulting deliverable

| Column | Purpose |
|--------|---------|
| `id`, `client_id`, `ruleset_id`, `backtest_run_id` | Assessment identity |
| `period_start`, `period_end` | Report period |
| `preventable_margin_loss`, `non_preventable_recovery`, `uninsured_exposure` | Dollars |
| `top_categories`, `recommended_controls` | JSON summaries |
| `status` | `draft`, `delivered`, `archived` |
| `created_at`, `delivered_at` | Lifecycle |

## B. Gateway behavioral tagging

### Columns on `"Audit Results"`

Written by parcel/LTL and 3PL findings using defaults from `lib/intelligence/taxonomy.ts`:

| Column | Type | Purpose |
|--------|------|---------|
| `"Gateway preventability"` | text | `PREVENTABLE_BY_GATEWAY`, `NON_PREVENTABLE_BY_GATEWAY`, `UNKNOWN` |
| `"Gateway category"` | text | Behavioral category, e.g. `DIM_WEIGHT_PADDING` |
| `"Gateway rule suggestion"` | text | **Required** when preventability is `PREVENTABLE_BY_GATEWAY` |
| `"Gateway estimated savings"` | numeric | Portion of variance the gateway could have prevented |
| `"Gateway confidence"` | numeric | 0–1 analyst/rule confidence |
| `"Gateway signal source"` | text | `RULE_DEFAULT`, `ANALYST_REVIEW`, `AI_SUGGESTED` |

A DB check constraint enforces: a `PREVENTABLE_BY_GATEWAY` row must have a
`"Gateway rule suggestion"`.

### `gateway_behavioral_tags` — normalized review trail

| Column | Purpose |
|--------|---------|
| `id`, `audit_result_id`, `client_id`, `carrier_scac` | Identity and scope |
| `invoice_id`, `shipment_id` | Optional lineage |
| `rule_code` | Audit rule that produced the signal |
| `gateway_preventability`, `gateway_category`, `rule_suggestion` | Tag payload |
| `estimated_savings`, `confidence` | Dollars, 0–1 |
| `review_status` | `pending`, `confirmed`, `dismissed` |
| `created_at`, `reviewed_by`, `reviewed_at` | Human-in-loop review trail |

## C. High-value insurance tables

Built vertical-agnostic (see [`03-taxonomy.md`](03-taxonomy.md#high-value-shipper-verticals)).
On the relationship to `client_policies`, see [`00-glossary.md`](00-glossary.md#client_policies--client_insurance_policies).

### `client_insurance_policies`

`id`, `client_id`, `policy_name`, `insurer`, `broker`, `effective_from/to`,
`max_coverage_per_shipment`, `max_coverage_per_day`, `deductible`, `covered_commodities`,
`excluded_commodities`, `allowed_carriers`, `excluded_carriers`, `allowed_services`,
`excluded_services`, `signature_required_above`, `adult_signature_required_above`,
`third_party_insurance_required_above`, `carrier_declared_value_allowed`,
`destination_exclusions`, `high_risk_zip_rules`, `international_allowed`,
`claim_window_days`, `required_documents`, `packaging_requirements`, `shipper_verticals`,
`temperature_control_rules`, `regulated_item_rules`, `appraisal_required_above`,
`serial_number_required`, `policy_document_url`, `notes`.

### `insurance_policy_rules`

`id`, `client_id`, `policy_id`, `rule_key`, `condition_json`, `action_json`, `severity`,
`clause_ref`, `effective_from`, `effective_to`. The general `policy_rules` shape is the
long-term evaluation target; this specialized table is read alongside it.

### `shipment_insurance_audit_results`

`shipper_vertical`, `declared_value`, `replacement_value`, `commodity_type`,
`insurance_provider`, `insurance_amount`, `insurance_cost`, `signature_type`,
`package_type`, `packaging_certified`, `policy_id_applied`, `insurance_compliance_status`,
`insurance_risk_category`, `insurance_rule_suggestion`, `estimated_uninsured_exposure`,
`destination_risk_tier`, `temperature_control_required`, `special_handling_required`,
`chain_of_custody_required`, `regulated_item_flag`, `documentation_required`,
`documentation_received`.

## Index guidance

GIN indexes on linked arrays (`"Audit Results"."Client"`, `"Audit Results"."Invoice"`).
Index policy/reporting reads by client, month/date, preventability, category, carrier, and
audit-result lineage. Backtest results index `(backtest_run_id)`, `(client_id, category)`,
and `(rule_id)`.
