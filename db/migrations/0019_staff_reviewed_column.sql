-- Migration 0019: staff_reviewed column (ADR 0015)
-- Adds staff correctness gate for CLIENT_DEFINED rules.
-- Staff must review and approve client-authored rules before they activate.
--
-- Per ADR 0015:
--   1. staff_reviewed = FALSE on creation (default)
--   2. Unreviewed CLIENT_DEFINED rules are skipped during activation
--   3. Staff review flips staff_reviewed = TRUE → rule enters attestable set

ALTER TABLE policy_rules ADD COLUMN IF NOT EXISTS staff_reviewed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE policy_rules ADD COLUMN IF NOT EXISTS reviewed_by TEXT;  -- app_users.id of staff reviewer
ALTER TABLE policy_rules ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Index for "unreviewed CLIENT_DEFINED rules" query on the staff console
CREATE INDEX IF NOT EXISTS idx_policy_rules_signal_reviewed
  ON policy_rules (signal_source, staff_reviewed)
  WHERE signal_source = 'CLIENT_DEFINED' AND staff_reviewed = FALSE;
