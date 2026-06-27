-- Migration: 0006_keystone_contract
-- Purpose: Phase-0 contract freeze — new tables (gateway_decisions, policy_taxonomy_candidates),
--          attestation columns on policy_rulesets, restricted app_tenant role, RLS policies,
--          CHECK constraints for array-tenancy data quality, FORCE ROW LEVEL SECURITY.
-- Date: 2026-06-26
-- Part of: contracts-v1 (Keystone Phase 0)

BEGIN;

-- ── 1. New tables ────────────────────────────────────────────────────

-- Tier-2: Forensic gateway decision log (08-gateway.md D6)
CREATE TABLE IF NOT EXISTS gateway_decisions (
  id                  text PRIMARY KEY DEFAULT 'gd' || replace(gen_random_uuid()::text, '-', ''),
  client_id           text NOT NULL,
  correlation_id      text NOT NULL,
  request_json        jsonb,
  decision            text NOT NULL,
  enforced            boolean NOT NULL DEFAULT false,
  violations          jsonb,
  ruleset_version     text,
  degraded            boolean NOT NULL DEFAULT false,
  ruleset_snapshot_id text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gateway_decisions_client
  ON gateway_decisions (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gateway_decisions_correlation
  ON gateway_decisions (correlation_id);

-- Tier-0: Taxonomy discovery candidates (07-schema-evolution.md)
-- Structural metadata only — no client_id (not a tenant table)
CREATE TABLE IF NOT EXISTS policy_taxonomy_candidates (
  id                  text PRIMARY KEY DEFAULT 'ptc' || replace(gen_random_uuid()::text, '-', ''),
  rule_key            text NOT NULL,
  inferred_datatype   text,
  inferred_bounds     jsonb,
  lineage             jsonb,
  surfacing_client_id text,
  seen_count          integer NOT NULL DEFAULT 1,
  lifecycle_status    text NOT NULL DEFAULT 'candidate',
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  reviewed_by         text,
  reviewed_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_taxonomy_candidates_status
  ON policy_taxonomy_candidates (lifecycle_status, seen_count DESC);

-- ── 2. Attestation columns on policy_rulesets (DG1) ──────────────────

ALTER TABLE policy_rulesets
  ADD COLUMN IF NOT EXISTS attested_by     text,
  ADD COLUMN IF NOT EXISTS attested_at     timestamptz,
  ADD COLUMN IF NOT EXISTS scope_statement text;

COMMENT ON COLUMN policy_rulesets.status IS
  'Valid values: draft, client_attested, active, archived. client_attested is the DG1 ratification state between draft and active.';

-- ── 3. Restricted app_tenant role ────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant WITH LOGIN PASSWORD NULL;
  END IF;
END $$;

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO app_tenant;

-- Grant table privileges on Phase-1 RLS-protected tables
-- (SELECT, INSERT, UPDATE — no DELETE, no DDL)
GRANT SELECT, INSERT, UPDATE ON "Invoices"                        TO app_tenant;
GRANT SELECT, INSERT, UPDATE ON "Audit Results"                   TO app_tenant;
GRANT SELECT, INSERT, UPDATE ON "Disputes"                        TO app_tenant;
GRANT SELECT, INSERT, UPDATE ON client_insurance_policies         TO app_tenant;
GRANT SELECT, INSERT, UPDATE ON insurance_policy_rules            TO app_tenant;
GRANT SELECT, INSERT, UPDATE ON policy_rules                      TO app_tenant;
GRANT SELECT, INSERT, UPDATE ON policy_documents                  TO app_tenant;
GRANT SELECT, INSERT, UPDATE ON client_policies                   TO app_tenant;
GRANT SELECT, INSERT, UPDATE ON gateway_decisions                 TO app_tenant;

-- ── 4. Row-Level Security policies (data-protection.md D5) ────────────
-- All comparisons are text, never ::uuid.
-- Array-membership form for text[] tenancy tables.
-- Scalar form for client_id tables.

-- 4a. Array-tenancy business tables

ALTER TABLE "Invoices" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_invoices ON "Invoices";
CREATE POLICY tenant_isolation_invoices ON "Invoices"
  FOR ALL
  TO app_tenant
  USING (current_setting('app.current_tenant', true) = ANY("Clients"));

ALTER TABLE "Audit Results" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_audit_results ON "Audit Results";
CREATE POLICY tenant_isolation_audit_results ON "Audit Results"
  FOR ALL
  TO app_tenant
  USING (current_setting('app.current_tenant', true) = ANY("Client"));

ALTER TABLE "Disputes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_disputes ON "Disputes";
CREATE POLICY tenant_isolation_disputes ON "Disputes"
  FOR ALL
  TO app_tenant
  USING (current_setting('app.current_tenant', true) = ANY("Client"));

-- 4b. Scalar client_id platform tables

ALTER TABLE client_insurance_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_client_insurance_policies ON client_insurance_policies;
CREATE POLICY tenant_isolation_client_insurance_policies ON client_insurance_policies
  FOR ALL
  TO app_tenant
  USING (client_id = current_setting('app.current_tenant', true));

ALTER TABLE insurance_policy_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_insurance_policy_rules ON insurance_policy_rules;
CREATE POLICY tenant_isolation_insurance_policy_rules ON insurance_policy_rules
  FOR ALL
  TO app_tenant
  USING (client_id = current_setting('app.current_tenant', true));

ALTER TABLE policy_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_rules ON policy_rules;
CREATE POLICY tenant_isolation_policy_rules ON policy_rules
  FOR ALL
  TO app_tenant
  USING (client_id = current_setting('app.current_tenant', true));

ALTER TABLE policy_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_documents ON policy_documents;
CREATE POLICY tenant_isolation_policy_documents ON policy_documents
  FOR ALL
  TO app_tenant
  USING (client_id = current_setting('app.current_tenant', true));

ALTER TABLE client_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_client_policies ON client_policies;
CREATE POLICY tenant_isolation_client_policies ON client_policies
  FOR ALL
  TO app_tenant
  USING (client_id = current_setting('app.current_tenant', true));

ALTER TABLE gateway_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_gateway_decisions ON gateway_decisions;
CREATE POLICY tenant_isolation_gateway_decisions ON gateway_decisions
  FOR ALL
  TO app_tenant
  USING (client_id = current_setting('app.current_tenant', true));

-- 4c. FORCE ROW LEVEL SECURITY — belt-and-suspenders so the table owner
--     is also subject to policies (data-protection.md D2)

ALTER TABLE "Invoices"                FORCE ROW LEVEL SECURITY;
ALTER TABLE "Audit Results"           FORCE ROW LEVEL SECURITY;
ALTER TABLE "Disputes"                FORCE ROW LEVEL SECURITY;
ALTER TABLE client_insurance_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE insurance_policy_rules    FORCE ROW LEVEL SECURITY;
ALTER TABLE policy_rules              FORCE ROW LEVEL SECURITY;
ALTER TABLE policy_documents          FORCE ROW LEVEL SECURITY;
ALTER TABLE client_policies           FORCE ROW LEVEL SECURITY;
ALTER TABLE gateway_decisions         FORCE ROW LEVEL SECURITY;

-- ── 5. Data-quality CHECK constraints (data-protection.md D4) ─────────
-- Enforce single-tenant rows on array-tenancy tables.
-- Wrapped in DO block to handle pre-existing constraint gracefully.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_invoices_single_client'
      AND conrelid = '"Invoices"'::regclass
  ) THEN
    ALTER TABLE "Invoices"
      ADD CONSTRAINT chk_invoices_single_client CHECK (cardinality("Clients") = 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_audit_results_single_client'
      AND conrelid = '"Audit Results"'::regclass
  ) THEN
    ALTER TABLE "Audit Results"
      ADD CONSTRAINT chk_audit_results_single_client CHECK (cardinality("Client") = 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_disputes_single_client'
      AND conrelid = '"Disputes"'::regclass
  ) THEN
    ALTER TABLE "Disputes"
      ADD CONSTRAINT chk_disputes_single_client CHECK (cardinality("Client") = 1);
  END IF;
END $$;

COMMIT;
