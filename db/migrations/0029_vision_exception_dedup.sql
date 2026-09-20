-- Migration 0029: Vision Exception Dedup
-- Creates the vision_exceptions table with dedup by (document_id, reason_hash).
-- One row per unique (document, reason); re-occurrences increment a counter.
--
-- Part of ADR 0020 (Vision Validation & Exception Architecture) Decision 7.
-- Allocated in Wave 0; write surface owned by V2 in Wave 2.

CREATE TABLE IF NOT EXISTS vision_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  reason_hash TEXT NOT NULL,
  field_key TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'dismissed')),
  occurrences INTEGER NOT NULL DEFAULT 1,
  resolver TEXT,
  resolved_at TIMESTAMPTZ,
  suggested_fix TEXT,
  resolver_confidence DOUBLE PRECISION,
  feedback_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedup: one row per (document, reason_hash)
CREATE UNIQUE INDEX IF NOT EXISTS uq_vision_exception_dedup
  ON vision_exceptions (document_id, reason_hash);

-- Find open exceptions, most recent first (staff review queue)
CREATE INDEX IF NOT EXISTS idx_vision_exceptions_status
  ON vision_exceptions (status, created_at DESC)
  WHERE status = 'open';
