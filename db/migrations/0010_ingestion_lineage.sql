-- 0010_ingestion_lineage: Track every intake event.
-- Links raw payloads to staged records and eventual audit/dispute outcomes.
CREATE TABLE IF NOT EXISTS ingestion_batches (
  id           text PRIMARY KEY,
  source       text NOT NULL,
  carrier_scac text,
  client_id    text,
  file_name    text,
  file_size    integer,
  row_count    integer,
  staged_count integer,
  error_count  integer,
  status       text NOT NULL DEFAULT 'processing',
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ib_created_at    ON ingestion_batches (created_at);
CREATE INDEX IF NOT EXISTS idx_ib_source_client ON ingestion_batches (source, client_id, created_at);

CREATE TABLE IF NOT EXISTS ingestion_records (
  id               text PRIMARY KEY,
  batch_id         text NOT NULL REFERENCES ingestion_batches (id),
  raw_payload      jsonb,
  normalized_type  text,
  staged_record_id text,
  audit_result_id  text,
  dispute_id       text,
  status           text NOT NULL DEFAULT 'staged',
  errors           jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ir_batch_id ON ingestion_records (batch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ir_staged   ON ingestion_records (staged_record_id);
CREATE INDEX IF NOT EXISTS idx_ir_audit    ON ingestion_records (audit_result_id);
