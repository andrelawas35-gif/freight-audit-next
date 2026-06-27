-- Migration: 0016_check_constraints_and_enums
-- Purpose: Add CHECK constraints on status/type/source columns (G5).
--          Enforces valid enum values at the database level.
-- Date: 2026-06-27
-- Part of: Launch Hardening Wave 2 · E4 Schema Integrity & Modeling

BEGIN;

-- ═══ 1. policy_rulesets.status — add 'client_attested' ═══
-- Migration 0006 added attestation columns and documented 'client_attested' as a
-- valid transitional status between draft and active. The original CHECK from 0005
-- only allows draft/active/archived. Replace it.
DO $$ BEGIN
  ALTER TABLE policy_rulesets DROP CONSTRAINT IF EXISTS chk_policy_rulesets_status;
END $$;

ALTER TABLE policy_rulesets
  ADD CONSTRAINT chk_policy_rulesets_status
  CHECK (status IN ('draft', 'client_attested', 'active', 'archived')) NOT VALID;

COMMENT ON CONSTRAINT chk_policy_rulesets_status ON policy_rulesets IS
  'Valid statuses: draft → client_attested (ratification) → active; or archived at any point.';

-- ═══ 2. policy_scope_exclusions.status ═══
-- Migration 0013 created this table without a CHECK.
-- Valid values from migration 0013 DDL: pending_review, staff_approved, staff_rejected, excluded, defined.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_scope_exclusions_status'
  ) THEN
    ALTER TABLE policy_scope_exclusions
      ADD CONSTRAINT chk_scope_exclusions_status
      CHECK (status IN ('pending_review', 'staff_approved', 'staff_rejected', 'excluded', 'defined')) NOT VALID;
  END IF;
END $$;

-- ═══ 3. policy_scope_exclusions.exclusion_type ═══
-- Valid values from migration 0013 DDL: exclude, define, flag.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_scope_exclusions_type'
  ) THEN
    ALTER TABLE policy_scope_exclusions
      ADD CONSTRAINT chk_scope_exclusions_type
      CHECK (exclusion_type IN ('exclude', 'define', 'flag')) NOT VALID;
  END IF;
END $$;

-- ═══ 4. gateway_decisions.decision ═══
-- Migration 0006 created this table without a CHECK.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_gateway_decisions_decision'
  ) THEN
    ALTER TABLE gateway_decisions
      ADD CONSTRAINT chk_gateway_decisions_decision
      CHECK (decision IN ('ADVISORY', 'REQUIRE_APPROVAL', 'BLOCK')) NOT VALID;
  END IF;
END $$;

-- ═══ 5. audit_jobs.status ═══
-- Migration 0001 created this table without a CHECK.
-- Valid values: queued (initial) → running → completed | failed.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_audit_jobs_status'
  ) THEN
    ALTER TABLE audit_jobs
      ADD CONSTRAINT chk_audit_jobs_status
      CHECK (status IN ('queued', 'running', 'completed', 'failed')) NOT VALID;
  END IF;
END $$;

-- ═══ 6. policy_rules.signal_source ═══
-- Column added in migration 0012 without a CHECK.
-- Valid values from COMMENT on column: TOKENIZER, LLM_MAPPER, VECTOR_MATCH, CLIENT_DEFINED, MANUAL.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_policy_rules_signal_source'
  ) THEN
    ALTER TABLE policy_rules
      ADD CONSTRAINT chk_policy_rules_signal_source
      CHECK (signal_source IS NULL OR signal_source IN ('TOKENIZER', 'LLM_MAPPER', 'VECTOR_MATCH', 'CLIENT_DEFINED', 'MANUAL')) NOT VALID;
  END IF;
END $$;

-- ═══ 7. gateway_behavioral_tags.review_status ═══
-- Column from migration 0004 without a CHECK.
-- Valid values: pending, confirmed, dismissed (per docs/policy-intelligence/06-schema.md).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_gateway_tags_review_status'
  ) THEN
    ALTER TABLE gateway_behavioral_tags
      ADD CONSTRAINT chk_gateway_tags_review_status
      CHECK (review_status IN ('pending', 'confirmed', 'dismissed')) NOT VALID;
  END IF;
END $$;

-- ═══ 8. gateway_behavioral_tags.signal_source ═══
-- Column from migration 0004 without a CHECK.
-- Valid values per "Audit Results"."Gateway signal source" convention: RULE_DEFAULT, ANALYST_REVIEW, AI_SUGGESTED.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_gateway_tags_signal_source'
  ) THEN
    ALTER TABLE gateway_behavioral_tags
      ADD CONSTRAINT chk_gateway_tags_signal_source
      CHECK (signal_source IN ('RULE_DEFAULT', 'ANALYST_REVIEW', 'AI_SUGGESTED')) NOT VALID;
  END IF;
END $$;

-- ═══ 9. "Audit Results"."Gateway signal source" ═══
-- Column from migration 0004 without a CHECK.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_audit_results_signal_source'
      AND conrelid = '"Audit Results"'::regclass
  ) THEN
    ALTER TABLE "Audit Results"
      ADD CONSTRAINT chk_audit_results_signal_source
      CHECK ("Gateway signal source" IS NULL OR "Gateway signal source" IN ('RULE_DEFAULT', 'ANALYST_REVIEW', 'AI_SUGGESTED')) NOT VALID;
  END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- CHECK SUMMARY (9 constraints added, 1 replaced)
-- ═══════════════════════════════════════════════════════════════
-- policy_rulesets.status           draft | client_attested | active | archived
--   (REPLACED old constraint which lacked client_attested)
-- policy_scope_exclusions.status   pending_review | staff_approved | staff_rejected | excluded | defined
-- policy_scope_exclusions.exclusion_type  exclude | define | flag
-- gateway_decisions.decision       ADVISORY | REQUIRE_APPROVAL | BLOCK
-- audit_jobs.status                queued | running | completed | failed
-- policy_rules.signal_source       TOKENIZER | LLM_MAPPER | VECTOR_MATCH | CLIENT_DEFINED | MANUAL (nullable)
-- gateway_behavioral_tags.review_status   pending | confirmed | dismissed
-- gateway_behavioral_tags.signal_source   RULE_DEFAULT | ANALYST_REVIEW | AI_SUGGESTED
-- "Audit Results"."Gateway signal source"  RULE_DEFAULT | ANALYST_REVIEW | AI_SUGGESTED (nullable)
--
-- NOT ADDED (already constrained):
--   · "Disputes"."Status" — chk_disputes_status from migration 0011
--     (pending_review, filed, carrier_responded, won, dismissed, partial, appealed, closed)
--   · policy_documents.extraction_status — chk_policy_documents_status from 0005
--   · policy_rules.severity — chk_policy_rules_severity from 0005
--   · policy_rules.status — chk_policy_rules_status from 0005
--   · policy_backtest_runs.status — chk_policy_backtest_runs_status from 0005
--   · policy_backtest_results.decision — chk_policy_backtest_results_decision from 0005
--   · gateway_readiness_assessments.status — chk_gateway_assessment_status from 0005
--   · rulebook.scope — chk_rulebook_scope from 0005
--   · learned_mappings.mapping_type — from 0000 baseline
--   · ingestion_exceptions.status — from 0000 baseline
--
-- All constraints use NOT VALID to avoid table scans on existing data.
-- Run ALTER TABLE ... VALIDATE CONSTRAINT ... separately in a maintenance window.
