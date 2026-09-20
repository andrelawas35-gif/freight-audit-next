-- 0014_taxonomy_discovery.sql
-- Phase 4 — Taxonomy Discovery (ADR 0011 D5-D6)
-- Evolves the policy_taxonomy_candidates table (created in 0006) to the
-- full Phase 4 contract: discrete lineage columns, governance lifecycle,
-- soft deletes, rule_key uniqueness enforcement, and column renames.
-- Also adds taxonomy_admin capability to app_users.

-- ── 1. Add discrete lineage columns (complementing/replacing lineage JSONB) ──

ALTER TABLE policy_taxonomy_candidates
  ADD COLUMN IF NOT EXISTS source_clause  text DEFAULT '',
  ADD COLUMN IF NOT EXISTS description    text,
  ADD COLUMN IF NOT EXISTS document_id    text,
  ADD COLUMN IF NOT EXISTS clause_ref     text;

-- Backfill source_clause from lineage JSONB where available
UPDATE policy_taxonomy_candidates
  SET source_clause = COALESCE(lineage->>'clause_text', lineage->>'source', '')
  WHERE (source_clause IS NULL OR source_clause = '') AND lineage IS NOT NULL;

-- ── 2. Add governance lifecycle columns ────────────────────────────

ALTER TABLE policy_taxonomy_candidates
  ADD COLUMN IF NOT EXISTS promoted_by    text,
  ADD COLUMN IF NOT EXISTS promoted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by    text,
  ADD COLUMN IF NOT EXISTS rejected_at    timestamptz,
  ADD COLUMN IF NOT EXISTS reject_reason  text,
  ADD COLUMN IF NOT EXISTS deleted_at     timestamptz;

-- ── 3. Transition lifecycle_status default from 'candidate' to 'captured' ──

ALTER TABLE policy_taxonomy_candidates
  ALTER COLUMN lifecycle_status SET DEFAULT 'captured';

UPDATE policy_taxonomy_candidates
  SET lifecycle_status = 'captured'
  WHERE lifecycle_status = 'candidate';

-- ── 4. Rename inferred_datatype → inferred_type (if the old column exists) ──

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'policy_taxonomy_candidates' AND column_name = 'inferred_datatype'
  ) THEN
    ALTER TABLE policy_taxonomy_candidates RENAME COLUMN inferred_datatype TO inferred_type;
  END IF;
END $$;

ALTER TABLE policy_taxonomy_candidates
  ALTER COLUMN inferred_type SET DEFAULT 'string',
  ALTER COLUMN inferred_type SET NOT NULL;

-- ── 5. Rebuild indexes for Phase 4 ─────────────────────────────────

DROP INDEX IF EXISTS idx_taxonomy_candidates_status;

CREATE UNIQUE INDEX IF NOT EXISTS idx_taxonomy_candidates_rule_key
  ON policy_taxonomy_candidates (rule_key) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_taxonomy_candidates_seen_count
  ON policy_taxonomy_candidates (seen_count DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_taxonomy_candidates_status
  ON policy_taxonomy_candidates (lifecycle_status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_taxonomy_candidates_client
  ON policy_taxonomy_candidates (surfacing_client_id) WHERE deleted_at IS NULL;

-- ── 6. taxonomy_admin capability on app_users ──────────────────────

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS is_taxonomy_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN app_users.is_taxonomy_admin IS
  'Gates promotion of policy_taxonomy_candidates to extractable/enforceable. Distinct from staff role.';

