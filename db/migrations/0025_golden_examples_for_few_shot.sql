-- Migration: 0025_golden_examples_for_few_shot
-- Purpose: Add few-shot context injection support for vision extraction.
-- Grilling session: 2026-06-28 (context injection vs fine-tuning pivot)
--
-- Decisions:
--   1. Sequence: context injection now, fine-tuning on standby
--   2. 3 golden examples per document type, stored in policy_documents
--   3. Static few-shot (not RAG) until 20+ examples accumulated
--   4. image_base64 cached at promotion time to avoid blob fetch latency

-- Column 1: is_golden_example — marks a document row as a few-shot example
ALTER TABLE policy_documents
  ADD COLUMN IF NOT EXISTS is_golden_example boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN policy_documents.is_golden_example IS
  'Whether this document is promoted as a golden few-shot example for vision extraction context injection.';

-- Column 2: image_base64 — pre-cached base64 image for few-shot injection
-- Populated at promotion time (fetched from stored_image_url blob).
-- Only non-null when is_golden_example = true.
ALTER TABLE policy_documents
  ADD COLUMN IF NOT EXISTS image_base64 text;

COMMENT ON COLUMN policy_documents.image_base64 IS
  'Pre-cached base64-encoded image for few-shot context injection. Populated at promotion time.';

-- Index for efficient golden example retrieval per document type
CREATE INDEX IF NOT EXISTS idx_policy_documents_golden
  ON policy_documents (document_type, is_golden_example)
  WHERE is_golden_example = true AND image_base64 IS NOT NULL;
