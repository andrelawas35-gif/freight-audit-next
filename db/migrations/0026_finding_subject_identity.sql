-- Migration: 0026_finding_subject_identity
-- Purpose: Add scalar subject_id + subject_type columns to "Audit Results"
--          as the natural-key columns the correctness oracle (H3) and the
--          unique constraint (H4) depend on.
-- Strategy: Best-effort backfill from existing columns; no UNIQUE constraint
--           yet so duplicates remain possible for H3's suite-2 red test.
-- Owner: H1 (Wave 0 keystone).

-- 1. Add columns (idempotent).
ALTER TABLE "Audit Results" ADD COLUMN IF NOT EXISTS subject_type text;
ALTER TABLE "Audit Results" ADD COLUMN IF NOT EXISTS subject_id text;

-- 2. Best-effort backfill for existing rows.
-- Parcel: look for a non-null "Invoice" array and take element [1] as subject_id.
UPDATE "Audit Results"
   SET subject_type = 'parcel',
       subject_id   = ("Invoice")[1]
 WHERE "Invoice" IS NOT NULL
   AND cardinality("Invoice") > 0
   AND subject_id IS NULL;

-- 3PL: everything else (no "Invoice" or empty "Invoice") tentatively marked 'tpl'.
-- The surrogate id is a fallback; near-zero pre-launch data so this is acceptable.
UPDATE "Audit Results"
   SET subject_type = 'tpl',
       subject_id   = id
 WHERE subject_id IS NULL;

-- NOTE: No UNIQUE constraint here. That lands in 0027 (H4, Wave 3) after the
-- harness reproduces duplicate findings.
