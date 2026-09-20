-- Migration 0020: clause_hash column + hash index on clause_embeddings
--
-- The existing unique constraint on (clause_text, classified_rule_key) uses a btree
-- index on potentially long text values. Adding a hash column enables a faster
-- sha256-based uniqueness check without the btree text comparison cost.
--
-- We keep the existing unique index uq_clause_embeddings_clause for the actual
-- uniqueness enforcement; the hash index is an auxiliary lookup accelerator.

-- Add clause_hash column (sha256 hex digest)
ALTER TABLE clause_embeddings ADD COLUMN IF NOT EXISTS clause_hash TEXT;

-- Populate existing rows (sha256 via pgcrypto or raw digest)
-- Note: pgcrypto extension must be enabled on the database.
-- If pgcrypto is not available, this migration is idempotent — the column
-- will be populated on next write by the application layer.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
  ) THEN
    UPDATE clause_embeddings
    SET clause_hash = encode(digest(clause_text, 'sha256'), 'hex')
    WHERE clause_hash IS NULL;
  END IF;
END $$;

-- Hash index for fast clause_text lookups (better for long text than btree)
CREATE INDEX IF NOT EXISTS idx_clause_embeddings_hash
  ON clause_embeddings USING hash (clause_hash);
