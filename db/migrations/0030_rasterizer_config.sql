-- Migration 0030: Rasterizer Configuration
-- Per-document-type DPI configuration for the vision rasterizer (ADR 0018).
-- Optional at launch — the rasterizer uses a default DPI of 200 if no
-- config row exists for a document type. Add rows only when per-type DPI
-- tuning is needed based on legibility testing.
--
-- Part of ADR 0018 (Vision Input Rasterization).
-- Allocated in Wave 0; write surface owned by V1 in Wave 4.

CREATE TABLE IF NOT EXISTS rasterizer_config (
  document_type TEXT PRIMARY KEY,
  target_dpi INTEGER NOT NULL DEFAULT 200,
  max_pages INTEGER NOT NULL DEFAULT 50,
  timeout_ms INTEGER NOT NULL DEFAULT 30000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure only known document types can be configured
-- (loose check: the rasterizer module validates at runtime)
COMMENT ON TABLE rasterizer_config IS
  'Per-document-type rasterizer DPI configuration. Default DPI 200 if no row exists.';
