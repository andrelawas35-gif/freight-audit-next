-- 0011_grilling_schema_contract: ADR 0005 + 0006 + Q1 shipment_id
-- ADR 0006: scalar client_id migration (text[] arrays → scalar, coexisting)
-- ADR 0005: dispute status CHECK constraint
-- Q1: shipment_id on Audit Results
-- All three changes bundled into one migration because they touch the same
-- three business tables; splitting would leave mid-deploy inconsistency.

-- 1. Add client_id columns
ALTER TABLE "Invoices" ADD COLUMN IF NOT EXISTS client_id text;
ALTER TABLE "Audit Results" ADD COLUMN IF NOT EXISTS client_id text;
ALTER TABLE "Disputes" ADD COLUMN IF NOT EXISTS client_id text;

-- 2. Add shipment_id on Audit Results (Q1)
ALTER TABLE "Audit Results" ADD COLUMN IF NOT EXISTS shipment_id text;

-- 3. Backfill client_id from first array element
UPDATE "Invoices" SET client_id = "Clients"[1] WHERE "Clients" IS NOT NULL AND cardinality("Clients") > 0;
UPDATE "Audit Results" SET client_id = "Client"[1] WHERE "Client" IS NOT NULL AND cardinality("Client") > 0;
UPDATE "Disputes" SET client_id = "Client"[1] WHERE "Client" IS NOT NULL AND cardinality("Client") > 0;

-- 4. CHECK constraints (not null after backfill)
ALTER TABLE "Invoices" ADD CONSTRAINT chk_invoices_client_id CHECK (client_id IS NOT NULL);
ALTER TABLE "Audit Results" ADD CONSTRAINT chk_audit_results_client_id CHECK (client_id IS NOT NULL);
ALTER TABLE "Disputes" ADD CONSTRAINT chk_disputes_client_id CHECK (client_id IS NOT NULL);

-- 5. Dispute status CHECK (ADR 0005)
ALTER TABLE "Disputes" ADD CONSTRAINT chk_disputes_status CHECK (
  "Status" IN ('pending_review','filed','carrier_responded','won','dismissed','partial','appealed','closed')
);

-- 6. B-tree indexes on client_id (replacing GIN on array lookups)
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON "Invoices"(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_results_client_id ON "Audit Results"(client_id);
CREATE INDEX IF NOT EXISTS idx_disputes_client_id ON "Disputes"(client_id);

-- 7. Index on shipment_id (supports Linked Audit joins per ADR 0001)
CREATE INDEX IF NOT EXISTS idx_audit_results_shipment_id ON "Audit Results"(shipment_id);
