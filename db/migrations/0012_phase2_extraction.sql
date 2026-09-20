-- Migration 0012: Phase 2 — T2/T3/T4 extraction pipeline schema
-- Adds clause_embeddings (cross-tenant, outside RLS), policy_rules columns, partial unique index

-- ═══ clause_embeddings — T3 Vector Memory Bank (cross-tenant) ═══
-- pgvector extension must be enabled on Neon via Console or SQL editor:
--   CREATE EXTENSION IF NOT EXISTS vector;
-- This migration creates the table only — extension is database-level.

CREATE TABLE IF NOT EXISTS clause_embeddings (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  clause_text             TEXT NOT NULL,
  embedding               vector(1536),
  classified_rule_key     TEXT NOT NULL,
  classified_condition_json JSONB NOT NULL,
  classification_source   TEXT NOT NULL CHECK (classification_source IN ('tokenizer', 'llm_mapper')),
  match_count             INTEGER NOT NULL DEFAULT 1,
  first_seen_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_matched_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index: same clause text classified to same rule_key = upsert
CREATE UNIQUE INDEX IF NOT EXISTS uq_clause_embeddings_clause ON clause_embeddings (clause_text, classified_rule_key);

-- Index for similarity search (pgvector IVFFlat)
-- This should be recreated periodically after significant data growth.
-- Initial threshold: 0.92 cosine similarity for auto-match, 0.85 for near-match.
CREATE INDEX IF NOT EXISTS idx_clause_embeddings_vector ON clause_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- Index for match_count feedback loop (high-frequency clauses → T1 pattern suggestions)
CREATE INDEX IF NOT EXISTS idx_clause_embeddings_match_count ON clause_embeddings (match_count DESC);

-- NOTE: clause_embeddings intentionally has NO client_id column.
-- Clauses are language, not data — cross-tenant deduplication is the core value.
-- This table is owned by platform_admin role, outside RLS.

-- ═══ policy_rules — new pipeline columns ═══

ALTER TABLE policy_rules ADD COLUMN IF NOT EXISTS signal_source TEXT;
ALTER TABLE policy_rules ADD COLUMN IF NOT EXISTS source_clause_text TEXT;
ALTER TABLE policy_rules ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2);

-- Partial unique index: same policy + same clause text = no duplicate suggested rules
CREATE UNIQUE INDEX IF NOT EXISTS uq_policy_rules_suggested_clause
  ON policy_rules (policy_id, source_clause_text)
  WHERE status = 'suggested' AND deleted_at IS NULL;

COMMENT ON COLUMN policy_rules.signal_source IS 'Origin: TOKENIZER, LLM_MAPPER, VECTOR_MATCH, CLIENT_DEFINED, or MANUAL';
COMMENT ON COLUMN policy_rules.source_clause_text IS 'Original clause text from source document';
COMMENT ON COLUMN policy_rules.confidence IS 'Classification confidence: T1 0.85-0.95, T2 raw LLM confidence, T3 cosine similarity';
