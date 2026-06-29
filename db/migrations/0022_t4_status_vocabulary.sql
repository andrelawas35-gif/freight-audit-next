-- Migration: 0022_t4_status_vocabulary
-- Purpose: Add flagged_at/flagged_by columns for T4 client-flag workflow.
-- flagClauseAction keeps status = 'pending_review' (compatible with 0016 CHECK)
-- and sets flagged_at/flagged_by to record that the client requested staff attention.
-- Grilling decision (2026-06-27): never re-surface a decided clause.
-- Wave 1, E3: T4 Status Drift Fix.

ALTER TABLE policy_scope_exclusions ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ;
ALTER TABLE policy_scope_exclusions ADD COLUMN IF NOT EXISTS flagged_by TEXT;
