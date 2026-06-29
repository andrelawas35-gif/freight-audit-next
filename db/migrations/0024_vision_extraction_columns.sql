-- Migration: 0024_vision_extraction_columns
-- Purpose: Add content classification routing, vision extraction output,
--          and document image storage for the AI Vision Extraction Engine.
-- Grilling session: 2026-06-28 (10 decisions, docs/10-ai-extraction-engine.md)
-- Phase 1: Gemini 3.1 Pro backend, staff upload via Vercel Blob.

-- Column 1: content_classification — routing tag for scan vs digital vs mixed
ALTER TABLE policy_documents
  ADD COLUMN IF NOT EXISTS content_classification text
  CHECK (content_classification IN ('digital', 'scan', 'mixed'));

COMMENT ON COLUMN policy_documents.content_classification IS
  'Routing tag: digital → text path, scan → vision path, mixed → split pages';

-- Column 2: extracted_fields — structured JSON from vision models
ALTER TABLE policy_documents
  ADD COLUMN IF NOT EXISTS extracted_fields jsonb;

COMMENT ON COLUMN policy_documents.extracted_fields IS
  'Structured JSON fields extracted by vision models. Parallel to raw_text for text path.';

-- Column 3: stored_image_url — blob storage reference for uploaded document images
ALTER TABLE policy_documents
  ADD COLUMN IF NOT EXISTS stored_image_url text;

COMMENT ON COLUMN policy_documents.stored_image_url IS
  'URL to uploaded document image in cloud blob storage (Vercel Blob). Source for vision extraction.';

-- Index for vision extraction pipeline queries (find documents awaiting extraction)
CREATE INDEX IF NOT EXISTS idx_policy_documents_vision
  ON policy_documents (content_classification, extraction_status)
  WHERE content_classification IN ('scan', 'mixed');
