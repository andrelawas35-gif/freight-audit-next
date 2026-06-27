-- Migration: 0015_foreign_key_constraints
-- Purpose: Add FK constraints on intra-Postgres relationships (G1).
--          Enforces referential integrity that is currently only convention.
-- Date: 2026-06-27
-- Part of: Launch Hardening Wave 2 · E4 Schema Integrity & Modeling

BEGIN;

-- ═══ policy_rules → policy_rulesets (ruleset_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_policy_rules_ruleset'
  ) THEN
    ALTER TABLE policy_rules
      ADD CONSTRAINT fk_policy_rules_ruleset
      FOREIGN KEY (ruleset_id) REFERENCES policy_rulesets(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ═══ policy_rules → client_policies (policy_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_policy_rules_policy'
  ) THEN
    ALTER TABLE policy_rules
      ADD CONSTRAINT fk_policy_rules_policy
      FOREIGN KEY (policy_id) REFERENCES client_policies(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══ policy_rules → policy_documents (document_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_policy_rules_document'
  ) THEN
    ALTER TABLE policy_rules
      ADD CONSTRAINT fk_policy_rules_document
      FOREIGN KEY (document_id) REFERENCES policy_documents(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══ policy_backtest_results → policy_backtest_runs (backtest_run_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_backtest_results_run'
  ) THEN
    ALTER TABLE policy_backtest_results
      ADD CONSTRAINT fk_backtest_results_run
      FOREIGN KEY (backtest_run_id) REFERENCES policy_backtest_runs(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ═══ policy_backtest_results → policy_rules (rule_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_backtest_results_rule'
  ) THEN
    ALTER TABLE policy_backtest_results
      ADD CONSTRAINT fk_backtest_results_rule
      FOREIGN KEY (rule_id) REFERENCES policy_rules(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ═══ policy_backtest_results → "Audit Results" (audit_result_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_backtest_results_audit'
  ) THEN
    ALTER TABLE policy_backtest_results
      ADD CONSTRAINT fk_backtest_results_audit
      FOREIGN KEY (audit_result_id) REFERENCES "Audit Results"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══ gateway_behavioral_tags → "Audit Results" (audit_result_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_gateway_tags_audit'
  ) THEN
    ALTER TABLE gateway_behavioral_tags
      ADD CONSTRAINT fk_gateway_tags_audit
      FOREIGN KEY (audit_result_id) REFERENCES "Audit Results"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══ policy_scope_exclusions → "Clients" (client_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_scope_exclusions_client'
  ) THEN
    ALTER TABLE policy_scope_exclusions
      ADD CONSTRAINT fk_scope_exclusions_client
      FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ═══ policy_scope_exclusions → policy_rulesets (ruleset_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_scope_exclusions_ruleset'
  ) THEN
    ALTER TABLE policy_scope_exclusions
      ADD CONSTRAINT fk_scope_exclusions_ruleset
      FOREIGN KEY (ruleset_id) REFERENCES policy_rulesets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══ policy_scope_exclusions → client_policies (policy_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_scope_exclusions_policy'
  ) THEN
    ALTER TABLE policy_scope_exclusions
      ADD CONSTRAINT fk_scope_exclusions_policy
      FOREIGN KEY (policy_id) REFERENCES client_policies(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══ policy_backtest_runs → policy_rulesets (ruleset_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_backtest_runs_ruleset'
  ) THEN
    ALTER TABLE policy_backtest_runs
      ADD CONSTRAINT fk_backtest_runs_ruleset
      FOREIGN KEY (ruleset_id) REFERENCES policy_rulesets(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ═══ policy_backtest_runs → "Clients" (client_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_backtest_runs_client'
  ) THEN
    ALTER TABLE policy_backtest_runs
      ADD CONSTRAINT fk_backtest_runs_client
      FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ═══ audit_jobs → audit_runs (run_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_jobs_run'
  ) THEN
    ALTER TABLE audit_jobs
      ADD CONSTRAINT fk_audit_jobs_run
      FOREIGN KEY (run_id) REFERENCES audit_runs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══ dispute_outcomes → "Disputes" (dispute_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_dispute_outcomes_dispute'
  ) THEN
    ALTER TABLE dispute_outcomes
      ADD CONSTRAINT fk_dispute_outcomes_dispute
      FOREIGN KEY (dispute_id) REFERENCES "Disputes"(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ═══ insurance_policy_rules → client_insurance_policies (policy_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_insurance_rules_policy'
  ) THEN
    ALTER TABLE insurance_policy_rules
      ADD CONSTRAINT fk_insurance_rules_policy
      FOREIGN KEY (policy_id) REFERENCES client_insurance_policies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ═══ shipment_insurance_audit_results → "Audit Results" (audit_result_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_insurance_audit_result'
  ) THEN
    ALTER TABLE shipment_insurance_audit_results
      ADD CONSTRAINT fk_insurance_audit_result
      FOREIGN KEY (audit_result_id) REFERENCES "Audit Results"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══ shipment_insurance_audit_results → client_insurance_policies (policy_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_insurance_audit_policy'
  ) THEN
    ALTER TABLE shipment_insurance_audit_results
      ADD CONSTRAINT fk_insurance_audit_policy
      FOREIGN KEY (policy_id) REFERENCES client_insurance_policies(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══ shipment_insurance_audit_results → insurance_policy_rules (policy_rule_id) ═══
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_insurance_audit_policy_rule'
  ) THEN
    ALTER TABLE shipment_insurance_audit_results
      ADD CONSTRAINT fk_insurance_audit_policy_rule
      FOREIGN KEY (policy_rule_id) REFERENCES insurance_policy_rules(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- FK SUMMARY (18 constraints added)
-- ═══════════════════════════════════════════════════════════════
-- policy_rules.ruleset_id            → policy_rulesets.id            CASCADE
-- policy_rules.policy_id             → client_policies.id            SET NULL
-- policy_rules.document_id           → policy_documents.id           SET NULL
-- backtest_results.backtest_run_id   → backtest_runs.id              CASCADE
-- backtest_results.rule_id           → policy_rules.id               CASCADE
-- backtest_results.audit_result_id   → "Audit Results".id            SET NULL
-- gateway_behavioral_tags.audit_result_id → "Audit Results".id      SET NULL
-- scope_exclusions.client_id         → "Clients".id                  CASCADE
-- scope_exclusions.ruleset_id        → policy_rulesets.id            SET NULL
-- scope_exclusions.policy_id         → client_policies.id            SET NULL
-- backtest_runs.ruleset_id           → policy_rulesets.id            CASCADE
-- backtest_runs.client_id            → "Clients".id                  CASCADE
-- audit_jobs.run_id                  → audit_runs.id                 SET NULL
-- dispute_outcomes.dispute_id        → "Disputes".id                 CASCADE
-- insurance_policy_rules.policy_id   → insurance_policies.id         CASCADE
-- insurance_audit_results.audit_result_id → "Audit Results".id      SET NULL
-- insurance_audit_results.policy_id  → insurance_policies.id         SET NULL
-- insurance_audit_results.policy_rule_id → insurance_policy_rules.id SET NULL
--
-- NOT ADDED (blocked by data model):
--   · disputes.audit_result_id → "Audit Results".id
--     Disputes."Audit result" is a text[] array, not a scalar FK target.
--     Requires schema change (add scalar audit_result_id column).
--   · gateway_behavioral_tags.gateway_decision_id → gateway_decisions.id
--     The gateway_decision_id column does not exist on gateway_behavioral_tags.
--     Requires schema change (add column before FK).
