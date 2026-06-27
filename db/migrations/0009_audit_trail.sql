-- 0009_audit_trail: app-level mutation logging.
-- Every INSERT / UPDATE / soft DELETE in lib/db/records.ts writes a row here.
CREATE TABLE IF NOT EXISTS audit_trail (
  id             text PRIMARY KEY,
  actor          text,
  table_name     text NOT NULL,
  record_id      text NOT NULL,
  action         text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_fields jsonb,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  metadata       jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_trail_table_record ON audit_trail (table_name, record_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_audit_trail_changed_at   ON audit_trail (changed_at);
CREATE INDEX IF NOT EXISTS idx_audit_trail_actor        ON audit_trail (actor, changed_at);
