-- Migration 0028: Vision Attempt Records
-- Appends an append-only extraction attempt history table.
-- One row per extract() call. The document's current extracted_fields
-- is derived from the latest attempt — provenance is preserved, not overwritten.
--
-- Part of ADR 0020 (Vision Validation & Exception Architecture).
-- Allocated in Wave 0 keystone; write surface owned by V2 in Wave 2.

CREATE TABLE IF NOT EXISTS vision_attempt_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  field_outcomes JSONB NOT NULL,
  document_status TEXT NOT NULL,
  per_reason_rollup JSONB NOT NULL DEFAULT '{}',
  latency_ms INTEGER NOT NULL,
  cost_estimate DOUBLE PRECISION,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Look up all attempts for a document, most recent first
CREATE INDEX IF NOT EXISTS idx_vision_attempts_document
  ON vision_attempt_records (document_id, attempted_at DESC);

-- Find non-clean extractions by model (degradation detection, ADR 0020 §6)
CREATE INDEX IF NOT EXISTS idx_vision_attempts_model_status
  ON vision_attempt_records (model_id, document_status)
  WHERE document_status != 'extracted';
