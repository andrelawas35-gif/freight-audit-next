-- 0013_policy_scope_exclusions
-- T4 Client Ambiguity Dashboard (ADR 0012 D5)
--
-- Stores client decisions on unmappable clauses: Define (creates draft rule),
-- Exclude (client chooses not to enforce), Flag (routes to staff review).
-- Each row is a binding governance record — excluded clauses are client
-- decisions, not platform oversights.

CREATE TABLE IF NOT EXISTS policy_scope_exclusions (
  id              TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL,
  policy_id       TEXT,
  ruleset_id      TEXT,
  clause_ref      TEXT,                               -- source document clause reference
  clause_text     TEXT NOT NULL,                       -- the ambiguous clause text
  exclusion_type  TEXT NOT NULL DEFAULT 'exclude',     -- 'define' | 'exclude' | 'flag'
  reason          TEXT,                                -- client-provided reason
  rule_key        TEXT,                                -- for 'define': the proposed rule key
  condition_json  JSONB,                               -- for 'define': the proposed condition
  status          TEXT NOT NULL DEFAULT 'pending_review', -- pending_review | staff_approved | staff_rejected | excluded | defined
  excluded_by     TEXT,                                -- user ID who made the decision
  excluded_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  reviewed_by     TEXT,                                -- staff user ID who reviewed
  reviewed_at     TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scope_exclusions_client
  ON policy_scope_exclusions (client_id, status);

CREATE INDEX IF NOT EXISTS idx_scope_exclusions_policy
  ON policy_scope_exclusions (policy_id, exclusion_type);

CREATE INDEX IF NOT EXISTS idx_scope_exclusions_clause
  ON policy_scope_exclusions (client_id, clause_text);

-- Partial index for 'defined' entries that become rules
CREATE INDEX IF NOT EXISTS idx_scope_exclusions_defined
  ON policy_scope_exclusions (client_id, rule_key)
  WHERE exclusion_type = 'define' AND status = 'staff_approved';
