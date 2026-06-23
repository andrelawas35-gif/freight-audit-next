CREATE TABLE IF NOT EXISTS client_policies (
  id text PRIMARY KEY DEFAULT ('cp' || replace(gen_random_uuid()::text, '-', '')),
  client_id text NOT NULL,
  policy_type text NOT NULL,
  name text NOT NULL,
  owner text,
  effective_from date,
  effective_to date,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_client_policies_type CHECK (
    policy_type IN (
      'carrier_contract',
      'carrier_tariff',
      '3pl_sla',
      'insurance_policy',
      'claims_policy',
      'shipping_sop',
      'packaging_standard',
      'email_exception'
    )
  ),
  CONSTRAINT chk_client_policies_status CHECK (status IN ('draft', 'active', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_client_policies_client
  ON client_policies (client_id, status, policy_type);
CREATE INDEX IF NOT EXISTS idx_client_policies_effective
  ON client_policies (effective_from, effective_to);

CREATE TABLE IF NOT EXISTS policy_documents (
  id text PRIMARY KEY DEFAULT ('pdoc' || replace(gen_random_uuid()::text, '-', '')),
  client_id text NOT NULL,
  policy_id text NOT NULL,
  document_type text NOT NULL,
  file_name text NOT NULL,
  source_url text,
  effective_from date,
  effective_to date,
  extraction_status text NOT NULL DEFAULT 'not_started',
  raw_text text,
  summary text,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_policy_documents_status CHECK (
    extraction_status IN ('not_started', 'extracted', 'needs_review', 'reviewed')
  )
);

CREATE INDEX IF NOT EXISTS idx_policy_documents_policy
  ON policy_documents (policy_id, extraction_status);
CREATE INDEX IF NOT EXISTS idx_policy_documents_client
  ON policy_documents (client_id, created_at);

CREATE TABLE IF NOT EXISTS policy_rulesets (
  id text PRIMARY KEY DEFAULT ('prs' || replace(gen_random_uuid()::text, '-', '')),
  client_id text NOT NULL,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  effective_from date,
  effective_to date,
  created_by text,
  reviewed_by text,
  activated_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_policy_rulesets_status CHECK (status IN ('draft', 'active', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_policy_ruleset_client_version
  ON policy_rulesets (client_id, version);
CREATE INDEX IF NOT EXISTS idx_policy_rulesets_client
  ON policy_rulesets (client_id, status);

CREATE TABLE IF NOT EXISTS policy_rules (
  id text PRIMARY KEY DEFAULT ('pr' || replace(gen_random_uuid()::text, '-', '')),
  client_id text NOT NULL,
  ruleset_id text NOT NULL,
  policy_id text,
  document_id text,
  rule_key text NOT NULL,
  category text NOT NULL,
  condition_json jsonb NOT NULL,
  action_json jsonb NOT NULL,
  severity text NOT NULL DEFAULT 'warn',
  clause_ref text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_policy_rules_severity CHECK (severity IN ('info', 'warn', 'block')),
  CONSTRAINT chk_policy_rules_status CHECK (status IN ('draft', 'active', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_policy_rules_ruleset
  ON policy_rules (ruleset_id, status);
CREATE INDEX IF NOT EXISTS idx_policy_rules_client_key
  ON policy_rules (client_id, rule_key);
CREATE INDEX IF NOT EXISTS idx_policy_rules_category
  ON policy_rules (category);

CREATE TABLE IF NOT EXISTS policy_backtest_runs (
  id text PRIMARY KEY DEFAULT ('pbt' || replace(gen_random_uuid()::text, '-', '')),
  client_id text NOT NULL,
  ruleset_id text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  shipments_checked integer NOT NULL DEFAULT 0,
  violations_found integer NOT NULL DEFAULT 0,
  preventable_margin_loss numeric NOT NULL DEFAULT 0,
  uninsured_exposure numeric NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT chk_policy_backtest_runs_status CHECK (status IN ('queued', 'running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_policy_backtest_runs_client
  ON policy_backtest_runs (client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_policy_backtest_runs_ruleset
  ON policy_backtest_runs (ruleset_id, status);

CREATE TABLE IF NOT EXISTS policy_backtest_results (
  id text PRIMARY KEY DEFAULT ('pbr' || replace(gen_random_uuid()::text, '-', '')),
  backtest_run_id text NOT NULL,
  client_id text NOT NULL,
  rule_id text NOT NULL,
  shipment_id text,
  invoice_id text,
  audit_result_id text,
  decision text NOT NULL,
  category text NOT NULL,
  message text NOT NULL,
  suggested_fix text,
  clause_ref text,
  preventable_loss numeric NOT NULL DEFAULT 0,
  uninsured_exposure numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_policy_backtest_results_decision CHECK (
    decision IN ('ALLOW', 'WARN', 'BLOCK', 'REQUIRE_APPROVAL', 'REQUIRE_DOCUMENTATION')
  )
);

CREATE INDEX IF NOT EXISTS idx_policy_backtest_results_run
  ON policy_backtest_results (backtest_run_id);
CREATE INDEX IF NOT EXISTS idx_policy_backtest_results_client
  ON policy_backtest_results (client_id, category);
CREATE INDEX IF NOT EXISTS idx_policy_backtest_results_rule
  ON policy_backtest_results (rule_id);

CREATE TABLE IF NOT EXISTS gateway_readiness_assessments (
  id text PRIMARY KEY DEFAULT ('gra' || replace(gen_random_uuid()::text, '-', '')),
  client_id text NOT NULL,
  ruleset_id text,
  backtest_run_id text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  preventable_margin_loss numeric NOT NULL DEFAULT 0,
  non_preventable_recovery numeric NOT NULL DEFAULT 0,
  uninsured_exposure numeric NOT NULL DEFAULT 0,
  top_categories jsonb,
  recommended_controls jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  CONSTRAINT chk_gateway_assessment_status CHECK (status IN ('draft', 'delivered', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_gateway_assessments_client
  ON gateway_readiness_assessments (client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gateway_assessments_backtest
  ON gateway_readiness_assessments (backtest_run_id);
