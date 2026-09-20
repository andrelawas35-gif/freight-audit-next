-- 0008_soft_delete: Add deleted_at to all business tables.
-- Soft deletes allow undo and audit trail without data loss.

ALTER TABLE "Invoices"         ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE "Shipments"        ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE "Audit Results"    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE "Disputes"         ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE "Clients"          ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE "Carriers"         ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE rulebook           ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE client_policies    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE policy_documents   ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE policy_rulesets    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE policy_rules       ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index so soft-deleted rows don't bloat standard queries
CREATE INDEX IF NOT EXISTS idx_invoices_active       ON "Invoices"      (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_active      ON "Shipments"     (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_results_active  ON "Audit Results" (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_disputes_active       ON "Disputes"      (id) WHERE deleted_at IS NULL;
