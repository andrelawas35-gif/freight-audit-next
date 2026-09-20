-- Migration: 0018_rls_rollout_portal_read_set
-- Purpose: Extend app_tenant grants and RLS policies to portal read-set tables
--          that were not covered by the Phase-1 rollout in 0006.
--          Covered: Clients (own-row), policy_rulesets, policy_scope_exclusions,
--          policy_attestations (conditional on table existence).
--          Does NOT apply FORCE ROW LEVEL SECURITY — that follows post-wiring.
-- Date: 2026-06-27
-- Owner: E3 (Data Access Layer & Tenant Isolation)
-- Part of: ADR 0013 (RLS Enforcement on the Client Path)
--
-- Prerequisites: 0006_keystone_contract (app_tenant role, initial RLS policies)

BEGIN;

-- ── 0. Ensure neondb_owner can assume the app_tenant role ───────────
-- Required for getTenantSql() which connects as owner then SET ROLE app_tenant.
GRANT app_tenant TO neondb_owner;

-- ── 1. Extend grants to portal read-set tables ──────────────────────

-- Clients — own-row tenancy (key is `id`, not `client_id`)
GRANT SELECT ON "Clients" TO app_tenant;

-- policy_rulesets — portal reads via client_id
GRANT SELECT ON policy_rulesets TO app_tenant;

-- policy_scope_exclusions — client's own rows via client_id
GRANT SELECT ON policy_scope_exclusions TO app_tenant;

-- policy_attestations — conditional: table may not exist yet (E4 migration 0017)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'policy_attestations'
  ) THEN
    EXECUTE 'GRANT SELECT, INSERT ON policy_attestations TO app_tenant';
  END IF;
END $$;

-- ── 2. RLS policies for portal read-set tables ──────────────────────

-- 2a. Clients — own-row policy (id = current_tenant)
ALTER TABLE "Clients" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_clients ON "Clients";
CREATE POLICY tenant_isolation_clients ON "Clients"
  FOR ALL
  TO app_tenant
  USING (id = current_setting('app.current_tenant', true));

-- 2b. policy_rulesets — scalar client_id
ALTER TABLE policy_rulesets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_rulesets ON policy_rulesets;
CREATE POLICY tenant_isolation_policy_rulesets ON policy_rulesets
  FOR ALL
  TO app_tenant
  USING (client_id = current_setting('app.current_tenant', true));

-- 2c. policy_scope_exclusions — scalar client_id
ALTER TABLE policy_scope_exclusions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_scope_exclusions ON policy_scope_exclusions;
CREATE POLICY tenant_isolation_policy_scope_exclusions ON policy_scope_exclusions
  FOR ALL
  TO app_tenant
  USING (client_id = current_setting('app.current_tenant', true));

-- 2d. policy_attestations — conditional (table may not exist yet)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'policy_attestations'
  ) THEN
    EXECUTE 'ALTER TABLE policy_attestations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_policy_attestations ON policy_attestations';
    EXECUTE 'CREATE POLICY tenant_isolation_policy_attestations ON policy_attestations
             FOR ALL TO app_tenant
             USING (client_id = current_setting(''app.current_tenant'', true))';
  END IF;
END $$;

-- ── 3. Re-assert RLS ENABLE + CREATE missing policies on 0006 tables ──
-- 0006's policies for business tables were conditional (client_id added by 0011)
-- and never executed. This section enables RLS AND creates the policies.
-- Safe no-ops where already present; idempotent.

-- Business tables (client_id added by 0011)
ALTER TABLE "Invoices"                ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_invoices ON "Invoices";
CREATE POLICY tenant_isolation_invoices ON "Invoices"
  FOR ALL TO app_tenant
  USING (client_id = current_setting('app.current_tenant', true));

ALTER TABLE "Audit Results"           ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_audit_results ON "Audit Results";
CREATE POLICY tenant_isolation_audit_results ON "Audit Results"
  FOR ALL TO app_tenant
  USING (client_id = current_setting('app.current_tenant', true));

ALTER TABLE "Disputes"                ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_disputes ON "Disputes";
CREATE POLICY tenant_isolation_disputes ON "Disputes"
  FOR ALL TO app_tenant
  USING (client_id = current_setting('app.current_tenant', true));

-- Platform tables (policies already exist from 0006; ENABLE is idempotent re-assert)
ALTER TABLE client_insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policy_rules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_rules              ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_policies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_decisions         ENABLE ROW LEVEL SECURITY;

COMMIT;
