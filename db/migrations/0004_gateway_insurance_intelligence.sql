-- Gateway readiness and high-value shipper insurance intelligence.

ALTER TABLE "Audit Results"
  ADD COLUMN IF NOT EXISTS "Gateway preventability" text,
  ADD COLUMN IF NOT EXISTS "Gateway category" text,
  ADD COLUMN IF NOT EXISTS "Gateway rule suggestion" text,
  ADD COLUMN IF NOT EXISTS "Gateway estimated savings" numeric,
  ADD COLUMN IF NOT EXISTS "Gateway confidence" numeric,
  ADD COLUMN IF NOT EXISTS "Gateway signal source" text;

ALTER TABLE "Audit Results"
  ADD CONSTRAINT audit_results_gateway_preventable_requires_suggestion
  CHECK (
    "Gateway preventability" IS DISTINCT FROM 'PREVENTABLE_BY_GATEWAY'
    OR NULLIF(BTRIM("Gateway rule suggestion"), '') IS NOT NULL
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_audit_gateway
  ON "Audit Results" ("Gateway preventability", "Gateway category");

CREATE TABLE IF NOT EXISTS gateway_behavioral_tags (
  id text PRIMARY KEY DEFAULT ('gbt' || replace(gen_random_uuid()::text, '-', '')),
  audit_result_id text NOT NULL,
  client_id text,
  carrier_scac text,
  invoice_id text,
  shipment_id text,
  rule_code text,
  gateway_preventability text NOT NULL,
  gateway_category text NOT NULL,
  rule_suggestion text,
  estimated_savings numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  signal_source text NOT NULL DEFAULT 'RULE_DEFAULT',
  review_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text,
  reviewed_at timestamptz,
  CONSTRAINT gateway_tags_preventable_requires_suggestion CHECK (
    gateway_preventability IS DISTINCT FROM 'PREVENTABLE_BY_GATEWAY'
    OR NULLIF(BTRIM(rule_suggestion), '') IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_gateway_tags_client
  ON gateway_behavioral_tags (client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gateway_tags_taxonomy
  ON gateway_behavioral_tags (gateway_preventability, gateway_category);
CREATE INDEX IF NOT EXISTS idx_gateway_tags_audit
  ON gateway_behavioral_tags (audit_result_id);

CREATE TABLE IF NOT EXISTS client_insurance_policies (
  id text PRIMARY KEY DEFAULT ('pol' || replace(gen_random_uuid()::text, '-', '')),
  client_id text NOT NULL,
  policy_name text NOT NULL,
  insurer text,
  broker text,
  effective_from date,
  effective_to date,
  max_coverage_per_shipment numeric,
  max_coverage_per_day numeric,
  deductible numeric,
  covered_commodities jsonb,
  excluded_commodities jsonb,
  allowed_carriers jsonb,
  excluded_carriers jsonb,
  allowed_services jsonb,
  excluded_services jsonb,
  signature_required_above numeric,
  adult_signature_required_above numeric,
  third_party_insurance_required_above numeric,
  carrier_declared_value_allowed boolean,
  destination_exclusions jsonb,
  high_risk_zip_rules jsonb,
  international_allowed boolean,
  claim_window_days integer,
  required_documents jsonb,
  packaging_requirements jsonb,
  shipper_verticals jsonb,
  temperature_control_rules jsonb,
  regulated_item_rules jsonb,
  appraisal_required_above numeric,
  serial_number_required boolean,
  policy_document_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_policy_client
  ON client_insurance_policies (client_id, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS insurance_policy_rules (
  id text PRIMARY KEY DEFAULT ('ipr' || replace(gen_random_uuid()::text, '-', '')),
  client_id text NOT NULL,
  policy_id text NOT NULL,
  rule_key text NOT NULL,
  condition_json jsonb NOT NULL,
  action_json jsonb NOT NULL,
  severity text NOT NULL DEFAULT 'warn',
  clause_ref text,
  effective_from date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_rules_policy
  ON insurance_policy_rules (policy_id);
CREATE INDEX IF NOT EXISTS idx_insurance_rules_client_key
  ON insurance_policy_rules (client_id, rule_key);

CREATE TABLE IF NOT EXISTS shipment_insurance_audit_results (
  id text PRIMARY KEY DEFAULT ('iar' || replace(gen_random_uuid()::text, '-', '')),
  client_id text NOT NULL,
  shipment_id text,
  audit_result_id text,
  policy_id text,
  policy_rule_id text,
  shipper_vertical text,
  commodity_type text,
  insurance_risk_category text NOT NULL,
  gateway_preventability text NOT NULL DEFAULT 'UNKNOWN',
  gateway_action text NOT NULL DEFAULT 'WARN',
  insurance_rule_suggestion text,
  declared_value numeric NOT NULL DEFAULT 0,
  replacement_value numeric,
  insured_value numeric,
  estimated_uninsured_exposure numeric NOT NULL DEFAULT 0,
  destination_risk_tier text,
  documentation_required jsonb,
  documentation_received jsonb,
  clause_ref text,
  confidence numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT insurance_audit_preventable_requires_suggestion CHECK (
    gateway_preventability IS DISTINCT FROM 'PREVENTABLE_BY_GATEWAY'
    OR NULLIF(BTRIM(insurance_rule_suggestion), '') IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_insurance_audit_client
  ON shipment_insurance_audit_results (client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_insurance_audit_taxonomy
  ON shipment_insurance_audit_results (gateway_preventability, insurance_risk_category);
CREATE INDEX IF NOT EXISTS idx_insurance_audit_policy
  ON shipment_insurance_audit_results (policy_id);
