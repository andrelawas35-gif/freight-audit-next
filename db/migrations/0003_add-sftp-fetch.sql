-- 0003_add-sftp-fetch.sql
-- SFTP configuration on Carriers + file-tracking table for Anti-VAN EDI ingestion.

-- Carrier SFTP connection config (credentials stored as env var name, not plaintext)
ALTER TABLE "Carriers"
  ADD COLUMN IF NOT EXISTS sftp_host text,
  ADD COLUMN IF NOT EXISTS sftp_port integer,
  ADD COLUMN IF NOT EXISTS sftp_user text,
  ADD COLUMN IF NOT EXISTS sftp_key_env text,
  ADD COLUMN IF NOT EXISTS sftp_inbox_dir text,
  ADD COLUMN IF NOT EXISTS sftp_archive_dir text,
  ADD COLUMN IF NOT EXISTS sftp_file_format text,
  ADD COLUMN IF NOT EXISTS sftp_enabled boolean NOT NULL DEFAULT false;

-- Track processed files to avoid re-ingesting
CREATE TABLE IF NOT EXISTS sftp_processed_files (
  id text PRIMARY KEY DEFAULT 'sf' || replace(gen_random_uuid()::text, '-', ''),
  carrier_scac text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  files_staged integer NOT NULL DEFAULT 0,
  errors text[] NOT NULL DEFAULT '{}'::text[],
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sftp_file
  ON sftp_processed_files (carrier_scac, file_name);

CREATE INDEX IF NOT EXISTS idx_sftp_processed_at
  ON sftp_processed_files (processed_at);
