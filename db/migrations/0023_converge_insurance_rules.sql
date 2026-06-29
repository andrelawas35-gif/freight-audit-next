-- Migration: 0023_converge_insurance_rules
-- Purpose: Migrate insurance_policy_rules rows into policy_rules, then drop the old table.
-- Grilling decision (2026-06-27): converge before first paid Compliance Risk Assessment.
-- Wave 3, E5: Insurance Rules Convergence.
--
-- Insurance rules go into policy_rules with their existing category values
-- (e.g., DECLARED_VALUE_MISMATCH, UNDER_INSURED_SHIPMENT, etc.).
-- ruleset_id = NULL is intentional — these rules predate the ruleset system
-- and will be assigned during client onboarding. The evaluator handles
-- NULL ruleset_id for backtests that select by policy_id.

-- Step 1: Migrate data from insurance_policy_rules into policy_rules
INSERT INTO policy_rules (
  id, client_id, ruleset_id, policy_id, document_id,
  rule_key, category, condition_json, action_json, severity,
  clause_ref, status, created_at, updated_at
)
SELECT
  id, client_id, NULL as ruleset_id, policy_id, NULL as document_id,
  rule_key, category, condition_json, action_json, severity,
  clause_ref, 'active' as status,
  effective_from as created_at, effective_to as updated_at
FROM insurance_policy_rules
ON CONFLICT (id) DO NOTHING;

-- Step 2: Drop the old table. CASCADE handles dependent objects
-- (FKs from migration 0015, RLS policies from 0006/0018).
DROP TABLE IF EXISTS insurance_policy_rules CASCADE;
