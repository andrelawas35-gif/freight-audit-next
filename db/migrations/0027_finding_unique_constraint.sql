-- Migration: 0027_finding_unique_constraint
-- Purpose: Add UNIQUE(subject_type, subject_id, "Detected by") to
--          "Audit Results" to close the duplicate-findings race.
--          Together with ON CONFLICT DO NOTHING in the audit engines
--          (ADR 0017), this makes suite 2 (concurrency) go green.
-- Dependencies: 0026 (subject_type + subject_id columns + backfill)
-- Owner: H4 (Wave 3).

-- 1. Clean up any surviving duplicate rows before adding the constraint.
--    Duplicates are rows that share the same (subject_type, subject_id,
--    "Detected by") tuple. Keep the earliest row by id (UUIDv7 time-sortable).
--    "Audit Results" has no created_at; the surrogate id encodes creation order.
DELETE FROM "Audit Results" a
 USING "Audit Results" b
WHERE a.subject_type = b.subject_type
  AND a.subject_id = b.subject_id
  AND a."Detected by" = b."Detected by"
  AND a.id > b.id;

-- 2. Add the unique constraint (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = '"Audit Results"'::regclass
       AND conname = 'audit_results_subject_rule_unique'
  ) THEN
    ALTER TABLE "Audit Results"
      ADD CONSTRAINT audit_results_subject_rule_unique
      UNIQUE (subject_type, subject_id, "Detected by");
  END IF;
END $$;
