-- 0002_add-indexes.sql
-- GIN indexes for linked-record array columns (used by chunked hydration),
-- composite indexes for 3PL pending-line keyset pagination, and
-- created_at column on Invoices for run-level source cutoffs.

-- Invoices: add created_at so parcel engine can apply run-started-at cutoff.
-- Existing rows get now(); new rows default to now() via column default.
ALTER TABLE "Invoices"
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Invoices: client membership lookups (audit engine filters by client)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoice_clients_gin
  ON "Invoices" USING gin ("Clients");

-- Audit Results: invoice-link overlap queries (fetchRecordsByLinkedIds)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_invoice_gin
  ON "Audit Results" USING gin ("Invoice");

-- Audit Results: client-scoped queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_client_gin
  ON "Audit Results" USING gin ("Client");

-- 3PL fulfillment: composite for pending-line page-claim queries
-- Covers WHERE audit_status='pending' AND client_id=X AND invoice_cycle=Y ORDER BY id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tplf_pending_scan
  ON tpl_fulfillment_lines (audit_status, client_id, invoice_cycle, id);

-- 3PL storage: same pattern
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tpls_pending_scan
  ON tpl_storage_lines (audit_status, client_id, invoice_cycle, id);
