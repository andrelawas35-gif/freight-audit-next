# Policy Intelligence — Schema

> All policy / gateway / insurance tables in one place. Moved here from
> `../data-layer.md`, which now points back. The authoritative definition is
> [`db/schema.ts`](../../db/schema.ts) (Drizzle); migrations in
> [`db/migrations/`](../../db/migrations/). Follow the migration pattern in
> [`../data-layer.md`](../data-layer.md#migration-pattern) for any change here.

Migrations: `0004_gateway_insurance_intelligence.sql` (gateway columns, behavioral tags,
insurance tables) and `0005_policy_intelligence_mvp.sql` (policy workflow tables). Must be
applied to each target database before audit/policy writes can persist.

Referential integrity was hardened in Wave 2:
- **0015** — 18 FK constraints across policy/gateway/insurance tables (see §D).
- **0016** — 9 CHECK constraints on status/type/source columns (see §E).
- **0017** — `policy_attestations` canonical attestation table (see §F).

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
| `status` | `draft`, `client_attested`, `active`, `archived` |
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

---

## D. Foreign Key Constraints (migration 0015)

Applied by E4 Wave 2. All use `DO $$ ... IF NOT EXISTS` guards.

| FK constraint | From | To | ON DELETE |
|---|---|---|---|
| `fk_policy_rules_ruleset` | `policy_rules.ruleset_id` | `policy_rulesets.id` | CASCADE |
| `fk_policy_rules_policy` | `policy_rules.policy_id` | `client_policies.id` | SET NULL |
| `fk_policy_rules_document` | `policy_rules.document_id` | `policy_documents.id` | SET NULL |
| `fk_backtest_results_run` | `policy_backtest_results.backtest_run_id` | `policy_backtest_runs.id` | CASCADE |
| `fk_backtest_results_rule` | `policy_backtest_results.rule_id` | `policy_rules.id` | CASCADE |
| `fk_backtest_results_audit` | `policy_backtest_results.audit_result_id` | `"Audit Results".id` | SET NULL |
| `fk_gateway_tags_audit` | `gateway_behavioral_tags.audit_result_id` | `"Audit Results".id` | SET NULL |
| `fk_scope_exclusions_client` | `policy_scope_exclusions.client_id` | `"Clients".id` | CASCADE |
| `fk_scope_exclusions_ruleset` | `policy_scope_exclusions.ruleset_id` | `policy_rulesets.id` | SET NULL |
| `fk_scope_exclusions_policy` | `policy_scope_exclusions.policy_id` | `client_policies.id` | SET NULL |
| `fk_backtest_runs_ruleset` | `policy_backtest_runs.ruleset_id` | `policy_rulesets.id` | CASCADE |
| `fk_backtest_runs_client` | `policy_backtest_runs.client_id` | `"Clients".id` | CASCADE |
| `fk_audit_jobs_run` | `audit_jobs.run_id` | `audit_runs.id` | SET NULL |
| `fk_dispute_outcomes_dispute` | `dispute_outcomes.dispute_id` | `"Disputes".id` | CASCADE |
| `fk_insurance_rules_policy` | `insurance_policy_rules.policy_id` | `client_insurance_policies.id` | CASCADE |
| `fk_insurance_audit_result` | `shipment_insurance_audit_results.audit_result_id` | `"Audit Results".id` | SET NULL |
| `fk_insurance_audit_policy` | `shipment_insurance_audit_results.policy_id` | `client_insurance_policies.id` | SET NULL |
| `fk_insurance_audit_policy_rule` | `shipment_insurance_audit_results.policy_rule_id` | `insurance_policy_rules.id` | SET NULL |

**Not added** (blocked by data model):
- `disputes.audit_result_id` → `"Audit Results".id` — Disputes uses `"Audit result"` text[] array, not a scalar FK target.
- `gateway_behavioral_tags.gateway_decision_id` → `gateway_decisions.id` — column does not exist on `gateway_behavioral_tags`.

---

## E. CHECK Enum Constraints (migration 0016)

Applied by E4 Wave 2. All use `NOT VALID` to avoid table scans.

| Constraint | Table.Column | Valid values |
|---|---|---|
| `chk_policy_rulesets_status` | `policy_rulesets.status` | `draft`, `client_attested`, `active`, `archived` |
| `chk_scope_exclusions_status` | `policy_scope_exclusions.status` | `pending_review`, `staff_approved`, `staff_rejected`, `excluded`, `defined` |
| `chk_scope_exclusions_type` | `policy_scope_exclusions.exclusion_type` | `exclude`, `define`, `flag` |
| `chk_gateway_decisions_decision` | `gateway_decisions.decision` | `ADVISORY`, `REQUIRE_APPROVAL`, `BLOCK` |
| `chk_audit_jobs_status` | `audit_jobs.status` | `queued`, `running`, `completed`, `failed` |
| `chk_policy_rules_signal_source` | `policy_rules.signal_source` | `TOKENIZER`, `LLM_MAPPER`, `VECTOR_MATCH`, `CLIENT_DEFINED`, `MANUAL` |
| `chk_gateway_tags_review_status` | `gateway_behavioral_tags.review_status` | `pending`, `confirmed`, `dismissed` |
| `chk_gateway_tags_signal_source` | `gateway_behavioral_tags.signal_source` | `RULE_DEFAULT`, `ANALYST_REVIEW`, `AI_SUGGESTED` |
| `chk_audit_results_signal_source` | `"Audit Results"."Gateway signal source"` | `RULE_DEFAULT`, `ANALYST_REVIEW`, `AI_SUGGESTED` |

`chk_policy_rulesets_status` **replaced** the original constraint from 0005 (which lacked `client_attested`).

Already constrained by prior migrations (not duplicated): `policy_documents.extraction_status`,
`policy_rules.severity`, `policy_rules.status`, `policy_backtest_runs.status`,
`policy_backtest_results.decision`, `gateway_readiness_assessments.status`, `rulebook.scope`,
`learned_mappings.mapping_type`, `ingestion_exceptions.status`, `"Disputes"."Status"`.

---

## F. policy_attestations — Canonical Attestation Authority (migration 0017)

Created by E4 Wave 2 as the single attestation authority (G2 + O4). Distinct from
`policy_rulesets.status='client_attested'` which is a workflow state, not an audit record.

| Column | Purpose |
|--------|---------|
| `id` | PK, `'att_' || replace(gen_random_uuid()::text, '-', '')` |
| `client_id` | FK → `"Clients".id` ON DELETE CASCADE |
| `ruleset_id` | FK → `policy_rulesets.id` ON DELETE CASCADE |
| `attested_by` | `app_users.id` of attesting user (NOT NULL) |
| `attested_at` | When attestation was recorded |
| `scope_statement` | Free-text: what the client is attesting to |
| `valid_until` | Optional expiry; NULL = indefinite |
| `created_at` | Row creation timestamp |

**UNIQUE(client_id, ruleset_id)** — one attestation per client-ruleset pair.
Re-attestation upserts (the server action uses `ON CONFLICT ... DO UPDATE`).

**Relationship to policy_rulesets:** Migration 0006 added `attested_by`, `attested_at`,
and `scope_statement` columns directly on `policy_rulesets`. These were a DG1 placeholder.
`policy_attestations` is now the canonical authority. The `policy_rulesets` columns remain
for backward compatibility but should be treated as derived/snapshot data.

**Server actions** in `lib/portal/attestation.ts`:
- `getAttestationData(clientId)` — current attestations + pending count
- `getLatestAttestation(clientId)` — most recent single attestation
- `attestRuleset(clientId, rulesetId, scopeStatement?)` — record or overwrite attestation
