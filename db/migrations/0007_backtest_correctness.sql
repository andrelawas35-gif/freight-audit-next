-- Migration: 0007_backtest_correctness
-- Purpose: Add mode, input_snapshot, data_required_count columns to policy_backtest_runs
--          for backtest correctness per ADR 0001 / 04-backtest.md.
-- Date: 2026-06-26
-- Part of: contracts-v1 (E2 backtest correctness)

BEGIN;

-- ── 1. Add mode column (preview | official) ──────────────────────────

ALTER TABLE policy_backtest_runs
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'preview';

COMMENT ON COLUMN policy_backtest_runs.mode IS
  'preview (include-draft, staff-only what-if) | official (active-rules-only, client-citable). Never feeds a Gateway Readiness Assessment from preview.';

-- ── 2. Add input_snapshot for reproducibility ───────────────────────

ALTER TABLE policy_backtest_runs
  ADD COLUMN IF NOT EXISTS input_snapshot jsonb;

COMMENT ON COLUMN policy_backtest_runs.input_snapshot IS
  'Snapshotted resolved ShipmentPolicyContext[] so re-running reproduces numbers.';

-- ── 3. Add data_required_count for tri-valued reporting ─────────────

ALTER TABLE policy_backtest_runs
  ADD COLUMN IF NOT EXISTS data_required_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN policy_backtest_runs.data_required_count IS
  'Number of shipments tagged DATA_REQUIRED (null fields prevented rule evaluation).';

-- ── 4. Index for mode-filtered queries ──────────────────────────────

CREATE INDEX IF NOT EXISTS idx_policy_backtest_runs_mode
  ON policy_backtest_runs (client_id, mode, created_at DESC);

COMMIT;
