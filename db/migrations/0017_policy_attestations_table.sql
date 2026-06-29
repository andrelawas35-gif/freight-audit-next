-- Migration: 0017_policy_attestations_table
-- Purpose: Create the single attestation authority table (G2 + O4).
--          policy_attestations is the canonical record of client attestation —
--          it does NOT derive from policy_rulesets.status='client_attested'.
--          The UNIQUE(client_id, ruleset_id) ensures one active attestation per
--          client-ruleset pair (upsert on re-attestation).
-- Date: 2026-06-27
-- Part of: Launch Hardening Wave 2 · E4 Schema Integrity & Modeling

BEGIN;

-- ═══ policy_attestations — single attestation authority ═══
CREATE TABLE IF NOT EXISTS policy_attestations (
  id              TEXT PRIMARY KEY DEFAULT ('att_' || replace(gen_random_uuid()::text, '-', '')),
  client_id       TEXT NOT NULL,
  ruleset_id      TEXT NOT NULL,
  attested_by     TEXT NOT NULL,                    -- app_users.id of the attesting user
  attested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scope_statement TEXT,                             -- free-text: what the client is attesting to
  valid_until     TIMESTAMPTZ,                      -- optional expiry; NULL = indefinite
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_policy_attestations_client
    FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE,

  CONSTRAINT fk_policy_attestations_ruleset
    FOREIGN KEY (ruleset_id) REFERENCES policy_rulesets(id) ON DELETE CASCADE,

  CONSTRAINT uq_policy_attestations_client_ruleset
    UNIQUE (client_id, ruleset_id)
);

COMMENT ON TABLE policy_attestations IS
  'Canonical attestation authority. One row per client-ruleset pair. Re-attestation upserts (UNIQUE constraint). Distinct from policy_rulesets.status=''client_attested'' which is a workflow state, not an audit record.';

COMMENT ON COLUMN policy_attestations.attested_by IS
  'app_users.id of the user who attested. NOT NULL — anonymous attestation is not allowed.';

COMMENT ON COLUMN policy_attestations.scope_statement IS
  'Free-text description of what the client is attesting to (e.g., "All UPS Ground rules for Q3 2026").';

-- ═══ Indexes ═══
CREATE INDEX IF NOT EXISTS idx_policy_attestations_client
  ON policy_attestations (client_id, attested_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_attestations_ruleset
  ON policy_attestations (ruleset_id);

CREATE INDEX IF NOT EXISTS idx_policy_attestations_attested_at
  ON policy_attestations (attested_at DESC);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- TABLE SUMMARY
-- ═══════════════════════════════════════════════════════════════
-- policy_attestations
--   id              TEXT PK   ('att_' + uuid, no dashes)
--   client_id       TEXT NOT NULL → "Clients"(id) ON DELETE CASCADE
--   ruleset_id      TEXT NOT NULL → policy_rulesets(id) ON DELETE CASCADE
--   attested_by     TEXT NOT NULL (app_users.id)
--   attested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
--   scope_statement TEXT (nullable)
--   valid_until     TIMESTAMPTZ (nullable)
--   created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
--
-- UNIQUE(client_id, ruleset_id) — one attestation per client-ruleset
--
-- RELATIONSHIP TO policy_rulesets:
--   policy_rulesets has attested_by, attested_at, scope_statement columns
--   (added in migration 0006). These were a DG1 placeholder. policy_attestations
--   is now the canonical authority. The columns on policy_rulesets remain for
--   backward compatibility but should be considered derived/snapshot data.
