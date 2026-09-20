-- Migration 0032: policy_backtest_results.rule_id becomes nullable
--
-- A DATA_REQUIRED backtest row means "this shipment could not be evaluated",
-- not "a rule fired", so it has no rule to point at. The code used to write
-- the synthetic ids 'data_required' / 'default_allow', which are not rows in
-- policy_rules and therefore violated fk_backtest_results_rule (0015),
-- rejecting the whole backtest write.
--
-- fk_backtest_results_rule is intentionally left in place: a NULL passes an FK
-- check, a made-up non-NULL id still fails it, so real rule references stay
-- enforced.
--
-- Metadata-only change (no table rewrite). Idempotent.
-- Reverse only if no NULL rule_id rows exist:
--   ALTER TABLE policy_backtest_results ALTER COLUMN rule_id SET NOT NULL;
--
-- WO 2026-09-19-002. NOT applied to production: requires HC0 review.

ALTER TABLE policy_backtest_results
  ALTER COLUMN rule_id DROP NOT NULL;

COMMENT ON COLUMN policy_backtest_results.rule_id IS
  'policy_rules.id of the rule that fired. NULL for DATA_REQUIRED rows (shipment could not be evaluated).';
